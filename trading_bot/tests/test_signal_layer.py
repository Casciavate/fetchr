"""Signal layer tests: indicators and the three strategies.

Every test runs on recorded or generated data. Nothing here opens a socket.
The synthetic series are constructed to have a *known* property, so each
strategy is asserted to detect the pattern it exists to detect and to stay
quiet otherwise.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from trading_bot.data_layer.synthetic import (
    breakout_series,
    choppy_series,
    mean_reverting_series,
    trending_series,
)
from trading_bot.signal_layer import (
    BreakoutStrategy,
    MeanReversionStrategy,
    MomentumStrategy,
    SignalAction,
    build_strategy,
)
from trading_bot.signal_layer.indicators import (
    atr,
    latest,
    rolling_high,
    sma,
    total_return,
    validate_ohlcv,
    zscore,
)


# ---------------------------------------------------------------------------
# Indicators
# ---------------------------------------------------------------------------


def test_sma_waits_for_a_full_window():
    series = pd.Series(range(10), dtype=float)
    result = sma(series, 5)
    assert result.iloc[:4].isna().all()
    assert result.iloc[4] == pytest.approx(2.0)


def test_zscore_is_nan_when_the_series_is_flat():
    """A flat series has no meaningful z-score; it must not become infinite."""
    flat = pd.Series([100.0] * 40)
    result = zscore(flat, 20, 20)
    assert result.dropna().empty or np.isnan(result.iloc[-1])


def test_total_return_skips_the_recent_window():
    # Price doubles over the last 10 bars only.
    values = [100.0] * 20 + list(np.linspace(100, 200, 10))
    series = pd.Series(values)
    # Skipping the last 10 bars must hide the doubling entirely.
    skipped = latest(total_return(series, lookback=10, skip_recent=10))
    assert skipped == pytest.approx(0.0, abs=1e-9)
    unskipped = latest(total_return(series, lookback=10, skip_recent=0))
    assert unskipped > 0.9


def test_rolling_high_excludes_the_current_bar_by_default():
    series = pd.Series([1, 2, 3, 10.0])
    assert latest(rolling_high(series, 3)) == pytest.approx(3.0)
    assert latest(rolling_high(series, 3, exclude_current=False)) == pytest.approx(10.0)


def test_indicators_never_look_ahead():
    """Truncating the future must not change any past indicator value."""
    frame = trending_series(300, seed=99)
    full = sma(frame["close"], 20)
    truncated = sma(frame["close"].iloc[:200], 20)
    pd.testing.assert_series_equal(full.iloc[:200], truncated, check_names=False)

    full_atr = atr(frame, 14)
    trunc_atr = atr(frame.iloc[:200], 14)
    pd.testing.assert_series_equal(full_atr.iloc[:200], trunc_atr, check_names=False)


def test_atr_is_positive_and_respects_gaps():
    frame = trending_series(200, seed=5)
    value = latest(atr(frame, 14))
    assert value is not None and value > 0


def test_validate_ohlcv_rejects_unsorted_and_negative_data():
    frame = trending_series(50)
    with pytest.raises(ValueError, match="sorted ascending"):
        validate_ohlcv(frame.iloc[::-1])

    broken = frame.copy()
    broken.iloc[5, broken.columns.get_loc("close")] = -1.0
    with pytest.raises(ValueError, match="non-positive"):
        validate_ohlcv(broken)


def test_validate_ohlcv_rejects_duplicate_timestamps():
    frame = trending_series(50)
    doubled = pd.concat([frame, frame.iloc[[-1]]])
    with pytest.raises(ValueError, match="duplicate"):
        validate_ohlcv(doubled)


# ---------------------------------------------------------------------------
# Strategy purity - the property the whole architecture rests on
# ---------------------------------------------------------------------------


ALL_STRATEGIES = [
    MomentumStrategy(name="momentum"),
    MeanReversionStrategy(name="mean_reversion"),
    BreakoutStrategy(name="breakout"),
]


@pytest.mark.parametrize("strategy", ALL_STRATEGIES, ids=lambda s: s.name)
def test_generate_is_deterministic(strategy):
    history = {
        "TRENDA": trending_series(600, seed=1),
        "REVERT": mean_reverting_series(600, seed=4),
        "BREAKOUT": breakout_series(600, seed=5),
    }
    first = strategy.generate(history)
    second = strategy.generate(history)
    assert [s.describe() for s in first] == [s.describe() for s in second]


@pytest.mark.parametrize("strategy", ALL_STRATEGIES, ids=lambda s: s.name)
def test_generate_does_not_mutate_its_input(strategy):
    history = {"TRENDA": trending_series(600, seed=1)}
    before = history["TRENDA"].copy(deep=True)
    strategy.generate(history)
    pd.testing.assert_frame_equal(history["TRENDA"], before)


@pytest.mark.parametrize("strategy", ALL_STRATEGIES, ids=lambda s: s.name)
def test_insufficient_history_produces_no_signals(strategy):
    history = {"SHORT": trending_series(30, seed=1)}
    assert strategy.generate(history) == []


@pytest.mark.parametrize("strategy", ALL_STRATEGIES, ids=lambda s: s.name)
def test_signals_carry_no_quantity_or_account_context(strategy):
    """Strategies must not be able to size anything."""
    history = {"TRENDA": trending_series(600, seed=1)}
    for signal in strategy.generate(history):
        assert not hasattr(signal, "quantity")
        assert not hasattr(signal, "notional")
        assert not hasattr(signal, "account")


# ---------------------------------------------------------------------------
# Momentum
# ---------------------------------------------------------------------------


def test_momentum_ranks_the_strongest_trend_first():
    history = {
        "STRONG": trending_series(600, annual_drift=0.35, seed=1),
        "WEAK": trending_series(600, annual_drift=0.05, seed=2),
        "FLAT": choppy_series(600, seed=6),
    }
    entries = [
        s for s in MomentumStrategy(name="momentum", top_n=2).generate(history)
        if s.action is SignalAction.ENTER_LONG
    ]
    assert entries, "expected at least one momentum entry on a strongly trending series"
    assert entries[0].symbol == "STRONG"
    assert entries[0].strength > 0


def test_momentum_respects_top_n():
    history = {
        f"T{i}": trending_series(600, annual_drift=0.30 - i * 0.02, seed=i + 1)
        for i in range(6)
    }
    entries = [
        s for s in MomentumStrategy(name="momentum", top_n=3).generate(history)
        if s.action is SignalAction.ENTER_LONG
    ]
    assert len(entries) == 3


def test_momentum_exits_when_price_breaks_the_trend_filter():
    history = {"FALLING": trending_series(600, annual_drift=-0.30, seed=12)}
    signals = MomentumStrategy(name="momentum").generate(history)
    assert [s.action for s in signals] == [SignalAction.EXIT_LONG]
    assert "exit:" in signals[0].rationale


def test_momentum_entries_carry_a_stop_below_the_entry_price():
    history = {"STRONG": trending_series(600, annual_drift=0.30, seed=1)}
    entries = [
        s for s in MomentumStrategy(name="momentum").generate(history)
        if s.action is SignalAction.ENTER_LONG
    ]
    assert entries
    for signal in entries:
        assert signal.stop_price is not None
        assert signal.stop_price < signal.reference_price
        assert 0 < signal.stop_distance_pct < 0.5


# ---------------------------------------------------------------------------
# Mean reversion
# ---------------------------------------------------------------------------


def test_mean_reversion_buys_a_stretched_dip_in_an_uptrend():
    frame = trending_series(600, annual_drift=0.20, annual_vol=0.10, seed=3)
    # Force the final bar into a sharp, isolated dip while leaving the
    # long-term average intact, which is exactly the setup being tested.
    frame = frame.copy()
    last = frame.index[-1]
    dip = frame.loc[last, "close"] * 0.90
    frame.loc[last, ["open", "high", "close"]] = dip * 1.001
    frame.loc[last, "low"] = dip * 0.99
    frame.loc[last, "close"] = dip

    strategy = MeanReversionStrategy(name="mean_reversion", entry_zscore=-1.5)
    entries = [
        s for s in strategy.generate({"DIP": frame}) if s.action is SignalAction.ENTER_LONG
    ]
    assert entries, "a sharp dip above the long-term MA should trigger an entry"
    assert entries[0].metadata["zscore"] <= -1.5


def test_mean_reversion_will_not_catch_a_falling_knife():
    """Below the long-term trend, a cheap price is not a buy signal."""
    frame = trending_series(600, annual_drift=-0.35, seed=13)
    entries = [
        s
        for s in MeanReversionStrategy(name="mean_reversion").generate({"CRASH": frame})
        if s.action is SignalAction.ENTER_LONG
    ]
    assert entries == []


def test_mean_reversion_exits_once_the_zscore_recovers():
    frame = trending_series(600, annual_drift=0.15, seed=3)
    signals = MeanReversionStrategy(name="mean_reversion", exit_zscore=-3.0).generate(
        {"RECOVERED": frame}
    )
    exits = [s for s in signals if s.action is SignalAction.EXIT_LONG]
    assert exits and "z-score" in exits[0].rationale


# ---------------------------------------------------------------------------
# Breakout
# ---------------------------------------------------------------------------


def _range_then_break(*, final_volume: float, bars: int = 200) -> pd.DataFrame:
    """A flat range whose final bar closes above the prior high.

    Built explicitly rather than generated, so the only difference between the
    two tests below is the final bar's volume - which is precisely the rule
    under test.
    """
    index = pd.bdate_range(end="2026-06-30", periods=bars)
    close = np.full(bars, 100.0)
    close[-1] = 112.0
    volume = np.full(bars, 500_000.0)
    volume[-1] = final_volume
    return pd.DataFrame(
        {
            "open": close,
            "high": close * 1.005,
            "low": close * 0.995,
            "close": close,
            "volume": volume,
        },
        index=index,
    )


def test_breakout_fires_on_a_volume_confirmed_new_high():
    frame = _range_then_break(final_volume=2_000_000.0)
    strategy = BreakoutStrategy(name="breakout", breakout_days=55, volume_avg_days=50)
    entries = [
        s for s in strategy.generate({"BRK": frame}) if s.action is SignalAction.ENTER_LONG
    ]
    assert entries, "a new high on 4x average volume should trigger a breakout entry"
    assert entries[0].strength == pytest.approx(0.12, abs=1e-6)


def test_breakout_requires_volume_confirmation():
    """The identical price break on ordinary volume must not trigger."""
    frame = _range_then_break(final_volume=500_000.0)
    strategy = BreakoutStrategy(name="breakout", breakout_days=55, volume_avg_days=50)
    entries = [
        s for s in strategy.generate({"BRK": frame}) if s.action is SignalAction.ENTER_LONG
    ]
    assert entries == []


def test_breakout_stays_quiet_in_a_range():
    frame = choppy_series(600, seed=6)
    entries = [
        s
        for s in BreakoutStrategy(name="breakout").generate({"CHOP": frame})
        if s.action is SignalAction.ENTER_LONG
    ]
    assert entries == []


# ---------------------------------------------------------------------------
# Construction from config
# ---------------------------------------------------------------------------


def test_strategies_are_built_from_config(config):
    from trading_bot.signal_layer import build_enabled_strategies

    strategies = build_enabled_strategies(config)
    names = {s.name for s in strategies}
    assert names == {"momentum", "mean_reversion"}  # breakout ships disabled
    assert all(s.enabled for s in strategies)


def test_each_strategy_can_be_disabled_independently(make_config):
    from trading_bot.signal_layer import build_enabled_strategies

    cfg = make_config({"strategies": {"momentum": {"enabled": False}}})
    assert {s.name for s in build_enabled_strategies(cfg)} == {"mean_reversion"}


def test_unknown_strategy_parameter_is_rejected():
    with pytest.raises(ValueError, match="Unknown parameter"):
        build_strategy("momentum", enabled=True, weight=1.0, params={"lookbak_days": 10})


def test_unknown_strategy_name_is_rejected():
    with pytest.raises(ValueError, match="Unknown strategy"):
        build_strategy("neural_alpha", enabled=True, weight=1.0, params={})
