"""The three strategies. Each is a pure function of price history.

Contract for every strategy:

* ``generate(history, as_of)`` takes a mapping of symbol -> OHLCV DataFrame and
  returns a list of ``Signal``. It performs no I/O, reads no clock, consults no
  account state and holds no mutable state between calls.
* Entry, exit and stop rules are explicit and mechanical. There is no
  discretionary branch anywhere.
* Each emits EXIT_LONG signals for any symbol whose exit condition is met,
  independently of whether that symbol is currently held. The portfolio layer
  intersects exits with actual holdings; the strategy does not know holdings.
* Each can be disabled on its own via ``strategies.<name>.enabled`` in config.

Because ``generate`` is deterministic given its inputs, the same function is
used unchanged by the backtest engine and by the live proposal cycle. There is
no separate "live" code path that could drift from what was backtested.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Mapping

import pandas as pd

from .indicators import (
    atr,
    latest,
    rolling_high,
    rolling_low,
    sma,
    total_return,
    zscore,
)
from .signals import Signal, SignalAction

History = Mapping[str, pd.DataFrame]


def _as_of_from(history: History) -> datetime:
    """Latest timestamp present across the supplied frames."""
    stamps = [frame.index[-1] for frame in history.values() if len(frame)]
    if not stamps:
        return datetime.now(timezone.utc)
    return max(stamps).to_pydatetime()


@dataclass(frozen=True)
class Strategy(ABC):
    """Base class. Frozen: parameters are fixed at construction."""

    name: str
    enabled: bool = True
    weight: float = 1.0

    @abstractmethod
    def min_history(self) -> int:
        """Bars required before this strategy can emit anything."""

    @abstractmethod
    def generate(self, history: History, as_of: datetime | None = None) -> list[Signal]:
        """Pure: (price history) -> signals."""

    def _usable(self, frame: pd.DataFrame) -> bool:
        return len(frame) >= self.min_history()


@dataclass(frozen=True)
class MomentumStrategy(Strategy):
    """Cross-sectional relative-strength momentum.

    Entry:  the top ``top_n`` symbols by ``lookback_days`` return (skipping the
            most recent ``skip_recent_days``), provided the symbol trades above
            its ``trend_filter_ma_days`` moving average and its momentum clears
            ``min_momentum``.
    Exit:   momentum falls below ``min_momentum``, or price closes below the
            long-term moving average.
    Stop:   ``stop_loss_atr_mult`` ATRs below the entry price.
    """

    lookback_days: int = 126
    skip_recent_days: int = 21
    top_n: int = 5
    min_momentum: float = 0.0
    trend_filter_ma_days: int = 200
    stop_loss_atr_mult: float = 3.0
    atr_days: int = 14

    def min_history(self) -> int:
        return max(
            self.lookback_days + self.skip_recent_days + 1,
            self.trend_filter_ma_days + 1,
            self.atr_days + 1,
        )

    def generate(self, history: History, as_of: datetime | None = None) -> list[Signal]:
        stamp = as_of or _as_of_from(history)
        scored: list[tuple[str, float, float, float | None]] = []
        exits: list[Signal] = []

        for symbol, frame in history.items():
            if not self._usable(frame):
                continue
            close = frame["close"]
            momentum = latest(total_return(close, self.lookback_days, self.skip_recent_days))
            trend = latest(sma(close, self.trend_filter_ma_days))
            price = latest(close)
            atr_value = latest(atr(frame, self.atr_days))
            if momentum is None or trend is None or price is None:
                continue

            above_trend = price > trend
            strong_enough = momentum > self.min_momentum

            if not (above_trend and strong_enough):
                reason = (
                    "momentum "
                    f"{momentum:.2%} at or below floor {self.min_momentum:.2%}"
                    if not strong_enough
                    else f"price {price:,.4f} below {self.trend_filter_ma_days}d MA {trend:,.4f}"
                )
                exits.append(
                    Signal(
                        symbol=symbol,
                        action=SignalAction.EXIT_LONG,
                        strategy=self.name,
                        as_of=stamp,
                        strength=-(momentum or 0.0),
                        reference_price=price,
                        rationale=f"exit: {reason}",
                        metadata={"momentum": momentum, "trend_ma": trend},
                    )
                )
                continue

            scored.append((symbol, momentum, price, atr_value))

        scored.sort(key=lambda row: row[1], reverse=True)
        entries: list[Signal] = []
        for rank, (symbol, momentum, price, atr_value) in enumerate(scored[: self.top_n], 1):
            stop = (
                price - self.stop_loss_atr_mult * atr_value
                if atr_value is not None and price - self.stop_loss_atr_mult * atr_value > 0
                else None
            )
            entries.append(
                Signal(
                    symbol=symbol,
                    action=SignalAction.ENTER_LONG,
                    strategy=self.name,
                    as_of=stamp,
                    strength=momentum,
                    reference_price=price,
                    stop_price=stop,
                    rationale=(
                        f"rank {rank}/{self.top_n}: {self.lookback_days}d return "
                        f"{momentum:.2%} (skipping {self.skip_recent_days}d), above "
                        f"{self.trend_filter_ma_days}d MA"
                    ),
                    metadata={"rank": rank, "momentum": momentum, "atr": atr_value},
                )
            )

        # Symbols that qualified but missed the top_n cut are neither entries
        # nor exits: holding them is fine, adding to them is not.
        return entries + exits


@dataclass(frozen=True)
class MeanReversionStrategy(Strategy):
    """Buy statistically stretched pullbacks inside an established uptrend.

    Entry:  z-score of close vs its ``ma_days`` average falls to
            ``entry_zscore`` or below, while price remains above the
            ``trend_filter_ma_days`` average (dip-buying, not falling-knife).
    Exit:   z-score recovers to ``exit_zscore`` or above.
    Stop:   ``stop_loss_atr_mult`` ATRs below entry.
    """

    ma_days: int = 20
    zscore_days: int = 20
    entry_zscore: float = -2.0
    exit_zscore: float = -0.5
    trend_filter_ma_days: int = 200
    max_positions: int = 5
    stop_loss_atr_mult: float = 2.5
    atr_days: int = 14

    def min_history(self) -> int:
        return max(
            self.ma_days + 1, self.zscore_days + 1, self.trend_filter_ma_days + 1, self.atr_days + 1
        )

    def generate(self, history: History, as_of: datetime | None = None) -> list[Signal]:
        stamp = as_of or _as_of_from(history)
        candidates: list[tuple[str, float, float, float | None]] = []
        exits: list[Signal] = []

        for symbol, frame in history.items():
            if not self._usable(frame):
                continue
            close = frame["close"]
            z = latest(zscore(close, self.ma_days, self.zscore_days))
            trend = latest(sma(close, self.trend_filter_ma_days))
            price = latest(close)
            atr_value = latest(atr(frame, self.atr_days))
            if z is None or trend is None or price is None:
                continue

            if z >= self.exit_zscore:
                exits.append(
                    Signal(
                        symbol=symbol,
                        action=SignalAction.EXIT_LONG,
                        strategy=self.name,
                        as_of=stamp,
                        strength=z,
                        reference_price=price,
                        rationale=(
                            f"exit: z-score {z:.2f} recovered to the "
                            f"{self.exit_zscore:.2f} threshold"
                        ),
                        metadata={"zscore": z},
                    )
                )
                continue

            if z <= self.entry_zscore and price > trend:
                candidates.append((symbol, z, price, atr_value))

        # Most stretched first.
        candidates.sort(key=lambda row: row[1])
        entries: list[Signal] = []
        for symbol, z, price, atr_value in candidates[: self.max_positions]:
            stop = (
                price - self.stop_loss_atr_mult * atr_value
                if atr_value is not None and price - self.stop_loss_atr_mult * atr_value > 0
                else None
            )
            entries.append(
                Signal(
                    symbol=symbol,
                    action=SignalAction.ENTER_LONG,
                    strategy=self.name,
                    as_of=stamp,
                    strength=-z,
                    reference_price=price,
                    stop_price=stop,
                    rationale=(
                        f"z-score {z:.2f} at or below entry threshold "
                        f"{self.entry_zscore:.2f}, price above the "
                        f"{self.trend_filter_ma_days}d MA"
                    ),
                    metadata={"zscore": z, "atr": atr_value},
                )
            )
        return entries + exits


@dataclass(frozen=True)
class BreakoutStrategy(Strategy):
    """Donchian-style breakout with volume confirmation.

    Entry:  close exceeds the prior ``breakout_days`` high *and* volume is at
            least ``volume_confirm_mult`` times its ``volume_avg_days`` average.
    Exit:   close falls below the prior ``exit_days`` low.
    Stop:   ``stop_loss_atr_mult`` ATRs below entry.
    """

    breakout_days: int = 55
    exit_days: int = 20
    volume_confirm_mult: float = 1.5
    volume_avg_days: int = 50
    max_positions: int = 5
    stop_loss_atr_mult: float = 2.5
    atr_days: int = 14

    def min_history(self) -> int:
        return max(
            self.breakout_days + 2, self.exit_days + 2, self.volume_avg_days + 1, self.atr_days + 1
        )

    def generate(self, history: History, as_of: datetime | None = None) -> list[Signal]:
        stamp = as_of or _as_of_from(history)
        candidates: list[tuple[str, float, float, float | None]] = []
        exits: list[Signal] = []

        for symbol, frame in history.items():
            if not self._usable(frame):
                continue
            close = frame["close"]
            price = latest(close)
            high_n = latest(rolling_high(close, self.breakout_days))
            low_n = latest(rolling_low(close, self.exit_days))
            avg_volume = latest(sma(frame["volume"], self.volume_avg_days))
            volume_now = latest(frame["volume"])
            atr_value = latest(atr(frame, self.atr_days))
            if price is None or high_n is None or low_n is None:
                continue

            if price <= low_n:
                exits.append(
                    Signal(
                        symbol=symbol,
                        action=SignalAction.EXIT_LONG,
                        strategy=self.name,
                        as_of=stamp,
                        strength=(low_n - price) / low_n,
                        reference_price=price,
                        rationale=(
                            f"exit: close {price:,.4f} broke the {self.exit_days}d "
                            f"low {low_n:,.4f}"
                        ),
                        metadata={"exit_low": low_n},
                    )
                )
                continue

            if price <= high_n:
                continue
            if avg_volume is None or volume_now is None:
                continue
            if volume_now < self.volume_confirm_mult * avg_volume:
                continue

            candidates.append((symbol, (price / high_n) - 1.0, price, atr_value))

        candidates.sort(key=lambda row: row[1], reverse=True)
        entries: list[Signal] = []
        for symbol, extension, price, atr_value in candidates[: self.max_positions]:
            stop = (
                price - self.stop_loss_atr_mult * atr_value
                if atr_value is not None and price - self.stop_loss_atr_mult * atr_value > 0
                else None
            )
            entries.append(
                Signal(
                    symbol=symbol,
                    action=SignalAction.ENTER_LONG,
                    strategy=self.name,
                    as_of=stamp,
                    strength=extension,
                    reference_price=price,
                    stop_price=stop,
                    rationale=(
                        f"close {price:,.4f} cleared the {self.breakout_days}d high by "
                        f"{extension:.2%} on {self.volume_confirm_mult:.1f}x average volume"
                    ),
                    metadata={"breakout_high": price / (1 + extension), "atr": atr_value},
                )
            )
        return entries + exits


STRATEGY_TYPES: dict[str, type[Strategy]] = {
    "momentum": MomentumStrategy,
    "mean_reversion": MeanReversionStrategy,
    "breakout": BreakoutStrategy,
}


def build_strategy(name: str, *, enabled: bool, weight: float, params: Mapping) -> Strategy:
    """Instantiate one strategy from its config block."""
    if name not in STRATEGY_TYPES:
        raise ValueError(
            f"Unknown strategy {name!r}. Known strategies: {sorted(STRATEGY_TYPES)}"
        )
    cls = STRATEGY_TYPES[name]
    valid = {f for f in cls.__dataclass_fields__ if f not in {"name", "enabled", "weight"}}
    unknown = set(params) - valid
    if unknown:
        raise ValueError(
            f"Unknown parameter(s) for strategy {name!r}: {sorted(unknown)}. "
            f"Valid parameters: {sorted(valid)}"
        )
    return cls(name=name, enabled=enabled, weight=weight, **dict(params))


def build_enabled_strategies(config) -> list[Strategy]:
    """Build every enabled strategy declared in config, in declaration order."""
    return [
        build_strategy(
            name, enabled=block.enabled, weight=block.weight, params=block.params
        )
        for name, block in config.strategies.items()
        if block.enabled
    ]
