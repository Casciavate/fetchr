"""Market-data ingestion.

Providers are swappable behind ``BarProvider``. Tests and backtests use the
CSV/in-memory providers so the whole data and signal path runs with recorded
data and no broker connection. The IBKR provider is the only one that opens a
socket, and it is import-isolated so that ``ib_async`` is not required to run
the test suite.

A note on IBKR historical data, verified against IBKR's API documentation at
build time: ``reqHistoricalData`` is pacing-limited (roughly 60 requests per
10 minutes, with additional restrictions on identical repeated requests), the
available lookback varies by bar size and instrument, and sub-minute bars have
materially shorter retention than daily bars. For multi-year backtests, prefer
a dedicated history vendor and treat IBKR as the execution and live-quote path.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Mapping

import pandas as pd

from ..signal_layer.indicators import OHLCV_COLUMNS, validate_ohlcv

logger = logging.getLogger(__name__)

PriceHistory = dict[str, pd.DataFrame]


class DataError(RuntimeError):
    """Raised when market data is missing, stale or malformed."""


def to_naive_utc(value) -> pd.Timestamp:
    """Normalise any timestamp to tz-naive UTC.

    Daily bar indices are tz-naive while the system clock is tz-aware, and
    pandas raises on comparing the two. Normalising in one place keeps every
    caller from having to remember.
    """
    stamp = pd.Timestamp(value)
    if stamp.tz is not None:
        stamp = stamp.tz_convert("UTC").tz_localize(None)
    return stamp


def align_to_index(value, index: pd.DatetimeIndex) -> pd.Timestamp:
    """Return ``value`` as a Timestamp comparable with ``index``."""
    stamp = pd.Timestamp(value)
    index_tz = getattr(index, "tz", None)
    if index_tz is None:
        return to_naive_utc(stamp)
    return stamp.tz_localize("UTC") if stamp.tz is None else stamp.tz_convert(index_tz)


class BarProvider(ABC):
    """Source of daily OHLCV history, keyed by symbol."""

    @abstractmethod
    def history(
        self,
        symbols: Iterable[str],
        *,
        end: datetime | None = None,
        lookback_days: int = 400,
    ) -> PriceHistory:
        """Return validated OHLCV frames for ``symbols``, ending at ``end``."""

    @staticmethod
    def _finalise(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
        frame = frame.copy()
        frame.columns = [str(c).strip().lower() for c in frame.columns]
        missing = [c for c in OHLCV_COLUMNS if c not in frame.columns]
        if missing:
            raise DataError(f"{symbol}: price data is missing column(s) {missing}")
        frame = frame[list(OHLCV_COLUMNS)]
        frame = frame[~frame.index.duplicated(keep="last")].sort_index()
        frame = frame.dropna(subset=list(OHLCV_COLUMNS))
        validate_ohlcv(frame, symbol=symbol)
        return frame


class InMemoryBarProvider(BarProvider):
    """Replay provider backed by frames already in memory. Used by tests."""

    def __init__(self, frames: Mapping[str, pd.DataFrame]) -> None:
        self._frames = {s: self._finalise(f, s) for s, f in frames.items()}

    def symbols(self) -> list[str]:
        return sorted(self._frames)

    def history(
        self,
        symbols: Iterable[str],
        *,
        end: datetime | None = None,
        lookback_days: int = 400,
    ) -> PriceHistory:
        out: PriceHistory = {}
        for symbol in symbols:
            frame = self._frames.get(symbol)
            if frame is None:
                continue
            if end is not None:
                frame = frame.loc[frame.index <= align_to_index(end, frame.index)]
            if lookback_days:
                frame = frame.tail(lookback_days)
            if len(frame):
                out[symbol] = frame
        return out


class CsvBarProvider(BarProvider):
    """Reads ``<directory>/<SYMBOL>.csv`` with a date column plus OHLCV."""

    def __init__(self, directory: str | Path, *, date_column: str = "date") -> None:
        self.directory = Path(directory)
        self.date_column = date_column

    def available_symbols(self) -> list[str]:
        return sorted(p.stem.upper() for p in self.directory.glob("*.csv"))

    def history(
        self,
        symbols: Iterable[str],
        *,
        end: datetime | None = None,
        lookback_days: int = 400,
    ) -> PriceHistory:
        out: PriceHistory = {}
        for symbol in symbols:
            path = self.directory / f"{symbol}.csv"
            if not path.is_file():
                logger.warning("No CSV history for %s at %s", symbol, path)
                continue
            frame = pd.read_csv(path)
            frame.columns = [str(c).strip().lower() for c in frame.columns]
            if self.date_column not in frame.columns:
                raise DataError(f"{symbol}: CSV has no '{self.date_column}' column")
            frame[self.date_column] = pd.to_datetime(frame[self.date_column], utc=False)
            frame = frame.set_index(self.date_column)
            frame = self._finalise(frame, symbol)
            if end is not None:
                frame = frame.loc[frame.index <= align_to_index(end, frame.index)]
            if lookback_days:
                frame = frame.tail(lookback_days)
            if len(frame):
                out[symbol] = frame
        return out


class IBKRBarProvider(BarProvider):
    """Historical bars from IBKR via ``ib_async``.

    ``ib_async`` is the maintained successor to ``ib_insync`` (the original
    project ended when its author died in 2024; the fork lives at
    github.com/ib-api-reloaded/ib_async). It is imported lazily so that the
    rest of the system - and the entire test suite - runs without it installed.

    This provider is read-only. It calls ``reqHistoricalData`` and nothing else;
    there is no order-placing method on it by construction.
    """

    def __init__(self, ib_connection, *, what_to_show: str = "TRADES", use_rth: bool = True) -> None:
        self._ib = ib_connection
        self.what_to_show = what_to_show
        self.use_rth = use_rth

    def history(
        self,
        symbols: Iterable[str],
        *,
        end: datetime | None = None,
        lookback_days: int = 400,
    ) -> PriceHistory:
        try:
            from ib_async import Stock, util  # noqa: F401
        except ImportError as exc:  # pragma: no cover - exercised only with the SDK absent
            raise DataError(
                "ib_async is not installed. Install it with `pip install ib_async` "
                "(the maintained successor to ib_insync) to pull IBKR history."
            ) from exc

        from ib_async import util as ib_util

        end_stamp = end or datetime.now(timezone.utc)
        duration = f"{max(lookback_days, 1)} D"
        out: PriceHistory = {}

        for symbol, contract in self._resolve_contracts(symbols):
            bars = self._ib.reqHistoricalData(
                contract,
                endDateTime=end_stamp,
                durationStr=duration,
                barSizeSetting="1 day",
                whatToShow=self.what_to_show,
                useRTH=self.use_rth,
                formatDate=1,
            )
            if not bars:
                logger.warning("IBKR returned no bars for %s", symbol)
                continue
            frame = ib_util.df(bars)
            if frame is None or frame.empty:
                continue
            frame = frame.rename(columns={"date": "date"}).set_index("date")
            frame.index = pd.to_datetime(frame.index)
            out[symbol] = self._finalise(frame, symbol)
        return out

    def _resolve_contracts(self, symbols: Iterable[str]):
        from ib_async import Stock

        for symbol in symbols:
            # Qualification resolves ambiguous listings to a single contract id.
            contract = Stock(symbol, "SMART", "USD")
            qualified = self._ib.qualifyContracts(contract)
            if not qualified:
                logger.warning("Could not qualify a contract for %s; skipping", symbol)
                continue
            yield symbol, qualified[0]


class StaticFxProvider:
    """FX rates into the account's base currency.

    Rates must be supplied explicitly. There is deliberately no "assume 1.0"
    fallback: silently treating a GBP price as CHF would understate a position
    by tens of percent and corrupt every downstream risk calculation.
    """

    def __init__(self, base_currency: str, rates: Mapping[str, float] | None = None) -> None:
        self.base_currency = base_currency.upper()
        self._rates = {k.upper(): float(v) for k, v in (rates or {}).items()}
        self._rates[self.base_currency] = 1.0

    def rate(self, currency: str) -> float:
        key = currency.upper()
        if key not in self._rates:
            raise DataError(
                f"No FX rate available for {key}->{self.base_currency}. Supply one "
                "explicitly; the system will not guess a currency conversion."
            )
        rate = self._rates[key]
        if rate <= 0:
            raise DataError(f"FX rate for {key} must be positive, got {rate}")
        return rate

    def update(self, rates: Mapping[str, float]) -> None:
        for currency, value in rates.items():
            self._rates[currency.upper()] = float(value)

    def known_currencies(self) -> list[str]:
        return sorted(self._rates)


def assert_data_is_fresh(
    history: PriceHistory, *, as_of: datetime, max_staleness_days: int = 5
) -> None:
    """Fail loudly on stale history rather than trading on last week's prices."""
    cutoff = to_naive_utc(as_of) - timedelta(days=max_staleness_days)
    stale = {
        symbol: to_naive_utc(frame.index[-1])
        for symbol, frame in history.items()
        if len(frame) and to_naive_utc(frame.index[-1]) < cutoff
    }
    if stale:
        raise DataError(
            "Price history is stale for: "
            + ", ".join(f"{s} (last bar {d.date()})" for s, d in sorted(stale.items()))
        )
