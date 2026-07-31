"""Deterministic synthetic price series.

**These are not market data.** They exist so the pipeline, the backtest engine
and the test suite can run end to end without a vendor subscription, and so
tests can construct a series with a *known* property (a clean uptrend, a
mean-reverting oscillation, a step breakout) and assert that the matching
strategy detects it.

Never interpret a backtest run on synthetic data as evidence a strategy works.
``backtest_engine`` refuses to mark a report as review-ready when its input is
synthetic - see ``BacktestReport.data_is_synthetic``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

SYNTHETIC_MARKER = "synthetic"


def _frame(index: pd.DatetimeIndex, close: np.ndarray, volume: np.ndarray) -> pd.DataFrame:
    close = np.maximum(close, 0.01)
    intraday = np.abs(np.diff(close, prepend=close[0])) + close * 0.002
    frame = pd.DataFrame(
        {
            "open": close - intraday * 0.25,
            "high": close + intraday * 0.6,
            "low": close - intraday * 0.6,
            "close": close,
            "volume": volume,
        },
        index=index,
    )
    frame["high"] = frame[["open", "high", "close"]].max(axis=1)
    frame["low"] = frame[["open", "low", "close"]].min(axis=1).clip(lower=0.01)
    frame.attrs[SYNTHETIC_MARKER] = True
    return frame


def business_days(periods: int, end: str = "2026-06-30") -> pd.DatetimeIndex:
    return pd.bdate_range(end=end, periods=periods)


def trending_series(
    periods: int = 500,
    *,
    start_price: float = 100.0,
    annual_drift: float = 0.20,
    annual_vol: float = 0.15,
    seed: int = 7,
    end: str = "2026-06-30",
) -> pd.DataFrame:
    """Geometric random walk with positive drift - a clean uptrend."""
    rng = np.random.default_rng(seed)
    index = business_days(periods, end)
    dt = 1 / 252
    shocks = rng.normal(
        (annual_drift - 0.5 * annual_vol**2) * dt, annual_vol * np.sqrt(dt), periods
    )
    close = start_price * np.exp(np.cumsum(shocks))
    volume = rng.integers(500_000, 1_500_000, periods).astype(float)
    return _frame(index, close, volume)


def mean_reverting_series(
    periods: int = 500,
    *,
    level: float = 100.0,
    reversion: float = 0.08,
    noise: float = 1.6,
    seed: int = 11,
    end: str = "2026-06-30",
) -> pd.DataFrame:
    """Ornstein-Uhlenbeck path around a gently rising level.

    The rising level matters: the mean-reversion strategy only buys dips that
    remain above the long-term moving average, so a flat oscillator would never
    trigger an entry.
    """
    rng = np.random.default_rng(seed)
    index = business_days(periods, end)
    drift = np.linspace(0, level * 0.35, periods)
    price = np.empty(periods)
    price[0] = level
    for i in range(1, periods):
        target = level + drift[i]
        price[i] = price[i - 1] + reversion * (target - price[i - 1]) + rng.normal(0, noise)
    volume = rng.integers(400_000, 900_000, periods).astype(float)
    return _frame(index, price, volume)


def breakout_series(
    periods: int = 500,
    *,
    base: float = 50.0,
    breakout_at: float = 0.7,
    jump: float = 0.18,
    seed: int = 23,
    end: str = "2026-06-30",
) -> pd.DataFrame:
    """A long range that resolves into a volume-confirmed upside break."""
    rng = np.random.default_rng(seed)
    index = business_days(periods, end)
    pivot = int(periods * breakout_at)
    close = np.empty(periods)
    close[:pivot] = base + rng.normal(0, base * 0.01, pivot)
    post = periods - pivot
    close[pivot:] = base * (1 + jump) + np.cumsum(rng.normal(base * 0.001, base * 0.008, post))
    volume = rng.integers(300_000, 600_000, periods).astype(float)
    volume[pivot : pivot + 5] *= 4.0  # the confirming volume surge
    return _frame(index, close, volume)


def choppy_series(
    periods: int = 500, *, level: float = 80.0, seed: int = 31, end: str = "2026-06-30"
) -> pd.DataFrame:
    """Directionless noise - should generate few or no entries."""
    rng = np.random.default_rng(seed)
    index = business_days(periods, end)
    close = level + np.cumsum(rng.normal(0, level * 0.006, periods))
    close = np.clip(close, level * 0.6, level * 1.4)
    volume = rng.integers(200_000, 400_000, periods).astype(float)
    return _frame(index, close, volume)


def illiquid_series(periods: int = 500, *, seed: int = 41, end: str = "2026-06-30") -> pd.DataFrame:
    """Low price and thin volume - must be screened out of the universe."""
    rng = np.random.default_rng(seed)
    index = business_days(periods, end)
    close = 1.2 + np.cumsum(rng.normal(0, 0.02, periods))
    close = np.clip(close, 0.4, 4.0)
    volume = rng.integers(500, 3_000, periods).astype(float)
    return _frame(index, close, volume)


def sample_universe(periods: int = 600, end: str = "2026-06-30") -> dict[str, pd.DataFrame]:
    """A small labelled synthetic universe used by the demo backtest and tests."""
    return {
        "TRENDA": trending_series(periods, annual_drift=0.25, seed=1, end=end),
        "TRENDB": trending_series(periods, annual_drift=0.14, start_price=60.0, seed=2, end=end),
        "TRENDC": trending_series(periods, annual_drift=0.08, start_price=140.0, seed=3, end=end),
        "REVERT": mean_reverting_series(periods, seed=4, end=end),
        "BREAKOUT": breakout_series(periods, seed=5, end=end),
        "CHOPPY": choppy_series(periods, seed=6, end=end),
        "PENNY": illiquid_series(periods, seed=8, end=end),
        "BENCH": trending_series(periods, annual_drift=0.10, annual_vol=0.13, seed=9, end=end),
    }


def is_synthetic(frame: pd.DataFrame) -> bool:
    return bool(frame.attrs.get(SYNTHETIC_MARKER, False))
