"""Backtest engine tests.

The engine's job is to be *pessimistic and honest*. These tests target the ways
a backtester most commonly lies: seeing future prices, filling at impossible
prices, ignoring costs, and spending money it does not have.
"""

from __future__ import annotations

import pandas as pd
import pytest

from trading_bot.backtest_engine import BacktestEngine
from trading_bot.data_layer.synthetic import sample_universe, trending_series
from trading_bot.signal_layer import MomentumStrategy, build_enabled_strategies


@pytest.fixture
def universe() -> dict[str, pd.DataFrame]:
    return sample_universe(700)


@pytest.fixture
def engine(config, universe) -> BacktestEngine:
    return BacktestEngine(
        config,
        build_enabled_strategies(config),
        initial_capital=100_000.0,
        benchmark_symbol="BENCH",
    )


def test_backtest_runs_and_reports_every_required_metric(engine, universe):
    report = engine.run(universe)
    summary = report.summary()
    for key in (
        "cagr",
        "max_drawdown",
        "sharpe",
        "sortino",
        "win_rate",
        "benchmark_cagr",
        "excess_cagr",
        "beats_benchmark",
    ):
        assert key in summary, f"report is missing {key}"
    assert len(report.equity_curve) > 100
    assert report.start < report.end


def test_report_flags_synthetic_data_as_not_reviewable(engine, universe):
    report = engine.run(universe)
    assert report.data_is_synthetic is True
    assert "SYNTHETIC DATA - NOT A VALID RESULT" in report.render()


def test_report_is_not_flagged_synthetic_for_real_frames(config):
    """A frame without the synthetic marker must not be labelled synthetic."""
    frames = {}
    for symbol in ("AAA", "BBB", "BENCH"):
        frame = trending_series(700, seed=hash(symbol) % 100)
        frame.attrs.clear()  # as loaded from a CSV or vendor feed
        frames[symbol] = frame
    engine = BacktestEngine(
        config, build_enabled_strategies(config), initial_capital=100_000.0,
        benchmark_symbol="BENCH",
    )
    assert engine.run(frames).data_is_synthetic is False


def test_report_records_the_config_checksum(engine, universe, config):
    """A report must be traceable to the exact limits it was produced under."""
    assert engine.run(universe).config_checksum == config.checksum


# ---------------------------------------------------------------------------
# The lies a backtester tells
# ---------------------------------------------------------------------------


def test_engine_cannot_see_future_bars(config, universe):
    """Truncating data after the test window must not change the result.

    If the engine peeked ahead, appending future bars would alter decisions
    made earlier and the two equity curves would diverge.
    """
    cutoff = pd.Timestamp("2026-01-30")
    truncated = {s: f.loc[f.index <= cutoff] for s, f in universe.items()}

    strategies = build_enabled_strategies(config)
    full = BacktestEngine(
        config, strategies, initial_capital=100_000.0, benchmark_symbol="BENCH"
    ).run(universe, end=cutoff)
    partial = BacktestEngine(
        config, strategies, initial_capital=100_000.0, benchmark_symbol="BENCH"
    ).run(truncated)

    pd.testing.assert_series_equal(full.equity_curve, partial.equity_curve)


def test_fills_never_happen_at_the_signal_bar_close(engine, universe):
    """Every fill price must be reachable from the bar it filled on."""
    report = engine.run(universe)
    assert report.fills, "expected the sample universe to produce trades"
    for fill in report.fills:
        bar = universe[fill.symbol].loc[fill.timestamp]
        # Fills happen at the open plus adverse slippage, so they can sit
        # slightly outside the bar's range - but never far outside it.
        assert fill.price > 0
        assert abs(fill.price - float(bar["open"])) <= float(bar["open"]) * 0.01


def test_costs_are_actually_charged(engine, universe):
    report = engine.run(universe)
    assert report.total_costs > 0
    assert all(f.commission > 0 for f in report.fills)
    assert all(f.slippage_cost > 0 for f in report.fills)


def test_realistic_costs_reduce_returns_versus_frictionless(config, make_config, universe):
    """A cheap-cost run must outperform an expensive one on identical signals."""
    cheap_cfg = make_config(
        {"costs": {"commission_bps": 0.1, "min_commission": 0.0, "slippage_bps": 0.1, "half_spread_bps": 0.1}}
    )
    dear_cfg = make_config(
        {"costs": {"commission_bps": 50.0, "min_commission": 10.0, "slippage_bps": 40.0, "half_spread_bps": 30.0}}
    )
    cheap = BacktestEngine(
        cheap_cfg, build_enabled_strategies(cheap_cfg), initial_capital=100_000.0
    ).run(universe)
    dear = BacktestEngine(
        dear_cfg, build_enabled_strategies(dear_cfg), initial_capital=100_000.0
    ).run(universe)

    assert dear.total_costs > cheap.total_costs
    assert dear.final_equity < cheap.final_equity


def test_engine_never_spends_more_cash_than_it_has(engine, universe):
    """Equity must stay positive and leverage must never appear."""
    report = engine.run(universe)
    assert (report.equity_curve > 0).all()
    # With a 10% sleeve and no borrowing, equity cannot fall to zero.
    assert report.max_drawdown < 1.0


def test_position_count_never_exceeds_the_configured_maximum(config, universe):
    report = BacktestEngine(
        config, build_enabled_strategies(config), initial_capital=100_000.0
    ).run(universe)

    open_positions: dict[str, float] = {}
    peak = 0
    for fill in report.fills:
        delta = fill.quantity if fill.side == "BUY" else -fill.quantity
        open_positions[fill.symbol] = open_positions.get(fill.symbol, 0.0) + delta
        if open_positions[fill.symbol] <= 1e-9:
            open_positions.pop(fill.symbol, None)
        peak = max(peak, len(open_positions))
    assert peak <= config.portfolio.max_open_positions


# ---------------------------------------------------------------------------
# Benchmark comparison
# ---------------------------------------------------------------------------


def test_benchmark_is_a_true_buy_and_hold(engine, universe):
    report = engine.run(universe)
    assert report.benchmark_curve is not None
    bench = universe["BENCH"]["close"]
    curve = report.benchmark_curve
    # Same shape as the underlying: the ratio of first to last must match.
    underlying_ratio = float(bench.loc[curve.index[-1]] / bench.loc[curve.index[0]])
    curve_ratio = float(curve.iloc[-1] / curve.iloc[0])
    assert curve_ratio == pytest.approx(underlying_ratio, rel=1e-6)


def test_benchmark_excess_is_reported_both_ways(engine, universe):
    report = engine.run(universe)
    assert report.excess_cagr == pytest.approx(report.cagr - report.benchmark_cagr)
    assert report.beats_benchmark == (report.excess_cagr > 0)


def test_missing_benchmark_reports_none_rather_than_guessing(config, universe):
    report = BacktestEngine(
        config, build_enabled_strategies(config), initial_capital=100_000.0
    ).run(universe)
    assert report.benchmark_curve is None
    assert report.benchmark_cagr is None
    assert report.beats_benchmark is None


# ---------------------------------------------------------------------------
# Guard rails
# ---------------------------------------------------------------------------


def test_empty_history_is_rejected(config):
    engine = BacktestEngine(config, build_enabled_strategies(config))
    with pytest.raises(ValueError, match="No price history"):
        engine.run({})


def test_too_little_history_is_rejected(config):
    engine = BacktestEngine(config, build_enabled_strategies(config))
    with pytest.raises(ValueError, match="Need more than"):
        engine.run({"A": trending_series(60)})


def test_a_backtest_needs_at_least_one_strategy(config):
    with pytest.raises(ValueError, match="at least one strategy"):
        BacktestEngine(config, [])


def test_single_strategy_can_be_backtested_alone(config, universe):
    """Each strategy must be independently testable."""
    report = BacktestEngine(
        config, [MomentumStrategy(name="momentum")], initial_capital=100_000.0
    ).run(universe)
    assert set(report.strategies) == {"momentum"}
    assert all(f.strategy == "momentum" for f in report.fills)
