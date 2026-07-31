"""Universe screening: which instruments are eligible to trade at all.

Screening runs before signal generation, so an illiquid or unpermissioned name
can never even be scored. Every exclusion is recorded with its reason, because
"why didn't it trade X?" is the most common question after a live session, and
reconstructing it from logs afterwards is otherwise guesswork.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping

import pandas as pd

from ..config.settings import Config
from ..core.types import Instrument
from ..signal_layer.indicators import average_dollar_volume, latest
from .providers import PriceHistory


@dataclass(frozen=True)
class ScreenResult:
    symbol: str
    eligible: bool
    reasons: tuple[str, ...] = ()
    metrics: dict[str, float] = field(default_factory=dict)

    def describe(self) -> str:
        verdict = "eligible" if self.eligible else "excluded"
        detail = "; ".join(self.reasons) if self.reasons else "all filters passed"
        return f"{self.symbol}: {verdict} - {detail}"


@dataclass(frozen=True)
class UniverseReport:
    results: tuple[ScreenResult, ...]

    @property
    def eligible_symbols(self) -> list[str]:
        return [r.symbol for r in self.results if r.eligible]

    @property
    def excluded(self) -> list[ScreenResult]:
        return [r for r in self.results if not r.eligible]

    def reason_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for result in self.excluded:
            for reason in result.reasons:
                key = reason.split(":")[0]
                counts[key] = counts.get(key, 0) + 1
        return counts

    def to_dict(self) -> dict:
        return {
            "eligible": self.eligible_symbols,
            "excluded": [
                {"symbol": r.symbol, "reasons": list(r.reasons), "metrics": r.metrics}
                for r in self.excluded
            ],
        }


class UniverseScreener:
    """Applies the ``universe`` config block to a set of candidate instruments."""

    def __init__(
        self,
        config: Config,
        *,
        instruments: Mapping[str, Instrument] | None = None,
        fx_rates: Mapping[str, float] | None = None,
    ) -> None:
        self.config = config
        self.universe = config.universe
        self.account = config.account
        self._instruments = dict(instruments or {})
        self._fx = {k.upper(): float(v) for k, v in (fx_rates or {}).items()}
        self._fx.setdefault(config.account.base_currency.upper(), 1.0)

    def _fx_rate(self, currency: str) -> float | None:
        return self._fx.get(currency.upper())

    def screen(self, history: PriceHistory) -> UniverseReport:
        results = [
            self._screen_one(symbol, frame) for symbol, frame in sorted(history.items())
        ]
        return UniverseReport(results=tuple(results))

    def _screen_one(self, symbol: str, frame: pd.DataFrame) -> ScreenResult:
        reasons: list[str] = []
        metrics: dict[str, float] = {}
        instrument = self._instruments.get(symbol)

        # --- explicit exclusions -------------------------------------------
        if symbol in self.universe.exclude_symbols:
            reasons.append("excluded: on universe.exclude_symbols")

        if symbol in self.universe.core_holdings and not self.universe.trade_core_holdings:
            reasons.append("core_holding: protected long-term holding, not traded by the bot")

        # --- permissions ----------------------------------------------------
        if instrument is not None:
            if instrument.asset_class not in self.account.permissioned_asset_classes:
                reasons.append(
                    f"permission: asset class {instrument.asset_class} is not permissioned "
                    f"on this account"
                )
            if instrument.asset_class not in self.universe.allowed_asset_classes:
                reasons.append(
                    f"asset_class: {instrument.asset_class} not in allowed_asset_classes"
                )
            if instrument.exchange not in self.universe.allowed_exchanges:
                reasons.append(f"exchange: {instrument.exchange} not in allowed_exchanges")
            if instrument.currency not in self.universe.allowed_currencies:
                reasons.append(f"currency: {instrument.currency} not in allowed_currencies")

        # --- history sufficiency ---------------------------------------------
        bars = len(frame)
        metrics["bars"] = float(bars)
        if bars < self.universe.min_history_days:
            reasons.append(
                f"history: {bars} bars available, {self.universe.min_history_days} required"
            )

        if bars == 0:
            return ScreenResult(symbol, False, tuple(reasons or ("history: no data",)), metrics)

        # --- price floor ------------------------------------------------------
        price = float(frame["close"].iloc[-1])
        metrics["price"] = price
        if price < self.universe.min_price:
            reasons.append(
                f"price: {price:,.2f} below the {self.universe.min_price:,.2f} floor "
                "(penny/illiquid exclusion)"
            )

        # --- liquidity ---------------------------------------------------------
        adv = latest(
            average_dollar_volume(frame, self.universe.avg_dollar_volume_lookback_days)
        )
        if adv is None:
            reasons.append("liquidity: unable to compute average traded value")
        else:
            currency = instrument.currency if instrument else self.account.base_currency
            rate = self._fx_rate(currency)
            if rate is None:
                reasons.append(
                    f"fx: no {currency}->{self.account.base_currency} rate, cannot compare "
                    "liquidity against a base-currency threshold"
                )
            else:
                adv_base = adv * rate
                metrics["avg_daily_value_base"] = adv_base
                if adv_base < self.universe.min_avg_daily_dollar_volume:
                    reasons.append(
                        f"liquidity: average daily traded value {adv_base:,.0f} below the "
                        f"{self.universe.min_avg_daily_dollar_volume:,.0f} minimum"
                    )

        return ScreenResult(symbol, not reasons, tuple(reasons), metrics)
