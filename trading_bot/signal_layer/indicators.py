"""Technical indicators. Pure functions over pandas objects, no I/O.

Every function here is deterministic and side-effect free, and none of them
peek at future data: each value at index *t* is computed only from data at or
before *t*. Lookahead bias is the most common way a backtest lies, so the
convention is enforced in one place rather than in each strategy.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

OHLCV_COLUMNS = ("open", "high", "low", "close", "volume")


def validate_ohlcv(frame: pd.DataFrame, *, symbol: str = "") -> None:
    """Raise if a price frame is malformed. Called at the data-layer boundary."""
    label = f" for {symbol}" if symbol else ""
    missing = [c for c in OHLCV_COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"Price frame{label} is missing column(s): {missing}")
    if not isinstance(frame.index, pd.DatetimeIndex):
        raise ValueError(f"Price frame{label} must be indexed by a DatetimeIndex")
    if not frame.index.is_monotonic_increasing:
        raise ValueError(f"Price frame{label} index must be sorted ascending")
    if frame.index.has_duplicates:
        raise ValueError(f"Price frame{label} has duplicate timestamps")
    if (frame[["open", "high", "low", "close"]] <= 0).to_numpy().any():
        raise ValueError(f"Price frame{label} contains non-positive prices")
    inverted = (frame["high"] < frame["low"]).sum()
    if inverted:
        raise ValueError(f"Price frame{label} has {inverted} bars where high < low")


def sma(series: pd.Series, window: int) -> pd.Series:
    """Simple moving average. Requires a full window before emitting a value."""
    return series.rolling(window=window, min_periods=window).mean()


def rolling_std(series: pd.Series, window: int) -> pd.Series:
    return series.rolling(window=window, min_periods=window).std(ddof=1)


def zscore(series: pd.Series, ma_window: int, std_window: int) -> pd.Series:
    """Standardised distance from the moving average.

    Returns NaN where the rolling standard deviation is zero rather than
    dividing by it - a flat price series has no meaningful z-score, and
    letting it become +/-inf would produce absurd position sizes downstream.
    """
    mean = sma(series, ma_window)
    std = rolling_std(series, std_window)
    std = std.where(std > 0)
    return (series - mean) / std


def true_range(frame: pd.DataFrame) -> pd.Series:
    """True range, using the prior close so gaps are not ignored."""
    prior_close = frame["close"].shift(1)
    spans = pd.concat(
        [
            frame["high"] - frame["low"],
            (frame["high"] - prior_close).abs(),
            (frame["low"] - prior_close).abs(),
        ],
        axis=1,
    )
    return spans.max(axis=1)


def atr(frame: pd.DataFrame, window: int = 14) -> pd.Series:
    """Average true range (Wilder smoothing)."""
    tr = true_range(frame)
    return tr.ewm(alpha=1.0 / window, adjust=False, min_periods=window).mean()


def total_return(series: pd.Series, lookback: int, skip_recent: int = 0) -> pd.Series:
    """Return over ``lookback`` bars ending ``skip_recent`` bars ago.

    The skip implements the classic 12-1 momentum construction: the most
    recent month is excluded because short-horizon returns tend to reverse.
    """
    if lookback <= 0:
        raise ValueError("lookback must be positive")
    if skip_recent < 0:
        raise ValueError("skip_recent must be non-negative")
    recent = series.shift(skip_recent)
    past = series.shift(skip_recent + lookback)
    return (recent / past) - 1.0


def rolling_high(series: pd.Series, window: int, *, exclude_current: bool = True) -> pd.Series:
    """Highest value over the trailing window.

    ``exclude_current`` shifts the window back one bar so that "today closed
    above the 55-day high" compares today against the *prior* 55 days rather
    than against a window that already contains today.
    """
    source = series.shift(1) if exclude_current else series
    return source.rolling(window=window, min_periods=window).max()


def rolling_low(series: pd.Series, window: int, *, exclude_current: bool = True) -> pd.Series:
    source = series.shift(1) if exclude_current else series
    return source.rolling(window=window, min_periods=window).min()


def realised_volatility(series: pd.Series, window: int = 20, periods_per_year: int = 252) -> pd.Series:
    """Annualised volatility of simple returns."""
    returns = series.pct_change()
    return returns.rolling(window=window, min_periods=window).std(ddof=1) * np.sqrt(
        periods_per_year
    )


def average_dollar_volume(frame: pd.DataFrame, window: int = 20) -> pd.Series:
    """Average traded value per bar, in the instrument's quote currency."""
    turnover = frame["close"] * frame["volume"]
    return turnover.rolling(window=window, min_periods=1).mean()


def latest(series: pd.Series) -> float | None:
    """Last non-NaN value, or None when the series has not warmed up."""
    if series.empty:
        return None
    cleaned = series.dropna()
    if cleaned.empty:
        return None
    value = float(cleaned.iloc[-1])
    return None if not np.isfinite(value) else value
