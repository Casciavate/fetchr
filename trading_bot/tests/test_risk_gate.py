"""Risk gate unit tests. No live connection, no network, fully deterministic."""

from __future__ import annotations

import pytest

from trading_bot.core.types import OrderType, Side
from trading_bot.risk_gate import RiskGate, RiskViolation
from trading_bot.tests.conftest import make_order, make_position, make_snapshot


def gate(config, clock, **kwargs) -> RiskGate:
    return RiskGate(config, clock=clock, **kwargs)


def failed(decision) -> set[str]:
    return set(decision.failed_checks)


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_ordinary_order_passes_every_check(config, clock, snapshot):
    decision = gate(config, clock).evaluate(make_order(quantity=50, price=100.0), snapshot)
    assert decision.approved, decision.blocking_reasons
    assert decision.failed_checks == ()


def test_decision_serialises_for_audit(config, clock, snapshot):
    decision = gate(config, clock).evaluate(make_order(), snapshot)
    payload = decision.to_dict()
    assert payload["order_fingerprint"] == decision.order.fingerprint()
    assert {c["name"] for c in payload["checks"]} >= {
        "kill_switch",
        "trading_halt",
        "max_position_size",
        "max_leverage",
        "buying_power",
    }


# ---------------------------------------------------------------------------
# Position / sector / exposure limits
# ---------------------------------------------------------------------------


def test_oversized_position_is_blocked(config, clock, snapshot):
    # 8% cap on 300k equity = 24k. A 30k order must be refused.
    decision = gate(config, clock).evaluate(
        make_order(quantity=300, price=100.0), snapshot
    )
    assert not decision.approved
    assert "max_position_size" in failed(decision)


def test_existing_holding_counts_toward_the_position_cap(config, clock):
    snap = make_snapshot(
        equity=300_000.0,
        cash=100_000.0,
        positions=[make_position("SPY", quantity=200, price=100.0)],  # 20k held
    )
    # 20k held + 10k new = 30k > 24k cap.
    decision = gate(config, clock).evaluate(make_order("SPY", quantity=100, price=100.0), snap)
    assert not decision.approved
    assert "max_position_size" in failed(decision)


def test_selling_down_an_oversized_position_is_allowed(config, clock):
    snap = make_snapshot(
        equity=300_000.0,
        cash=10_000.0,
        positions=[make_position("SPY", quantity=1000, price=100.0)],  # 100k, way over
    )
    decision = gate(config, clock).evaluate(
        make_order("SPY", side=Side.SELL, quantity=500, price=100.0), snap
    )
    assert decision.approved, decision.blocking_reasons


def test_sector_concentration_is_enforced_across_symbols(config, clock):
    # 25% sector cap on 300k = 75k. Two 40k tech holdings already sit at 80k.
    snap = make_snapshot(
        equity=300_000.0,
        cash=100_000.0,
        positions=[
            make_position("AAA", quantity=400, price=100.0, sector="TECH"),
            make_position("BBB", quantity=300, price=100.0, sector="TECH"),
        ],
    )
    decision = gate(config, clock).evaluate(
        make_order("CCC", quantity=100, price=100.0, sector="TECH"), snap
    )
    assert not decision.approved
    assert "max_sector_concentration" in failed(decision)


def test_sector_map_overrides_instrument_sector(config, clock):
    snap = make_snapshot(
        equity=300_000.0,
        cash=100_000.0,
        positions=[make_position("AAA", quantity=700, price=100.0, sector="IGNORED")],
    )
    g = gate(config, clock, sector_map={"AAA": "TECH", "CCC": "TECH"})
    decision = g.evaluate(make_order("CCC", quantity=100, price=100.0, sector="IGNORED"), snap)
    assert "max_sector_concentration" in failed(decision)


def test_leverage_cap_blocks_borrowing(config, clock):
    # Cash account, 1x cap: gross already equals equity, so any buy exceeds it.
    snap = make_snapshot(
        equity=100_000.0,
        cash=50_000.0,
        positions=[make_position("HELD", quantity=1000, price=100.0)],  # 100k gross
    )
    decision = gate(config, clock).evaluate(make_order("NEW", quantity=50, price=100.0), snap)
    assert not decision.approved
    assert {"max_leverage", "max_gross_exposure"} & failed(decision)


# ---------------------------------------------------------------------------
# Cash-account specific rules
# ---------------------------------------------------------------------------


def test_buy_beyond_settled_cash_is_blocked(config, clock):
    snap = make_snapshot(equity=300_000.0, cash=5_000.0, settled_cash=5_000.0)
    decision = gate(config, clock).evaluate(make_order(quantity=100, price=100.0), snap)
    assert not decision.approved
    assert "buying_power" in failed(decision)


def test_unsettled_cash_is_not_spendable(config, clock):
    # 20k total cash but only 1k settled: the buy must fail on settled cash.
    snap = make_snapshot(equity=300_000.0, cash=20_000.0, settled_cash=1_000.0)
    decision = gate(config, clock).evaluate(make_order(quantity=50, price=100.0), snap)
    assert "buying_power" in failed(decision)


def test_unsettled_cash_is_spendable_when_the_rule_is_disabled(config, clock, make_config):
    cfg = make_config({"account": {"enforce_settled_cash_only": False}})
    snap = make_snapshot(equity=300_000.0, cash=20_000.0, settled_cash=1_000.0)
    decision = gate(cfg, clock).evaluate(make_order(quantity=50, price=100.0), snap)
    assert decision.approved, decision.blocking_reasons


def test_cash_account_cannot_short(config, clock):
    snap = make_snapshot(equity=300_000.0, cash=50_000.0)
    decision = gate(config, clock).evaluate(
        make_order("SPY", side=Side.SELL, quantity=10, price=100.0), snap
    )
    assert not decision.approved
    assert "no_naked_short" in failed(decision)


def test_selling_only_what_is_held_is_allowed(config, clock):
    snap = make_snapshot(
        equity=300_000.0,
        cash=50_000.0,
        positions=[make_position("SPY", quantity=10, price=100.0)],
    )
    decision = gate(config, clock).evaluate(
        make_order("SPY", side=Side.SELL, quantity=10, price=100.0), snap
    )
    assert decision.approved, decision.blocking_reasons


# ---------------------------------------------------------------------------
# Permissions and order shape
# ---------------------------------------------------------------------------


def test_unpermissioned_asset_class_is_blocked(config, clock, snapshot):
    decision = gate(config, clock).evaluate(
        make_order("ESU6", asset_class="FUT", quantity=1, price=1000.0), snapshot
    )
    assert not decision.approved
    assert "asset_class_permissioned" in failed(decision)


def test_core_holdings_are_protected_from_the_bot(config, clock, snapshot):
    decision = gate(config, clock).evaluate(make_order("IWDC", quantity=10, price=90.0), snapshot)
    assert not decision.approved
    assert "core_holding_protected" in failed(decision)


def test_market_orders_are_blocked_by_default(config, clock, snapshot):
    order = make_order(quantity=10, price=100.0, order_type=OrderType.MARKET, limit_price=None)
    decision = gate(config, clock).evaluate(order, snapshot)
    assert not decision.approved
    assert "order_type_allowed" in failed(decision)


def test_limit_priced_far_through_the_market_is_blocked(config, clock, snapshot):
    # 25bps tolerance; a buy limit 5% above reference is grossly adverse.
    order = make_order(quantity=10, price=100.0, limit_price=105.0)
    decision = gate(config, clock).evaluate(order, snapshot)
    assert not decision.approved
    assert "limit_price_sanity" in failed(decision)


def test_conservative_limit_price_is_allowed(config, clock, snapshot):
    order = make_order(quantity=10, price=100.0, limit_price=95.0)
    decision = gate(config, clock).evaluate(order, snapshot)
    assert decision.approved, decision.blocking_reasons


def test_dust_orders_are_rejected(config, clock, snapshot):
    decision = gate(config, clock).evaluate(make_order(quantity=1, price=10.0), snapshot)
    assert not decision.approved
    assert "min_order_notional" in failed(decision)


def test_fx_conversion_is_applied_to_notional(config, clock):
    """A GBP order must be sized on its base-currency value, not its face value."""
    snap = make_snapshot(equity=300_000.0, cash=100_000.0)
    # 300 shares @ 100 GBP = 30,000 GBP -> 36,000 CHF at 1.2, over the 24k cap.
    decision = gate(config, clock).evaluate(
        make_order("GBPX", quantity=300, price=100.0, fx=1.2, currency="GBP"), snap
    )
    assert not decision.approved
    assert "max_position_size" in failed(decision)


# ---------------------------------------------------------------------------
# Circuit breakers
# ---------------------------------------------------------------------------


def test_daily_loss_breaker_trips_and_latches(config, clock, snapshot):
    g = gate(config, clock)
    losing = make_snapshot(equity=293_000.0, cash=50_000.0, day_start_equity=300_000.0)
    decision = g.evaluate(make_order(), losing)
    assert not decision.approved
    assert "max_daily_loss" in failed(decision)
    assert g.halt_state.is_halted()

    # The halt persists even once equity recovers - only a human clears it.
    recovered = make_snapshot(equity=301_000.0, cash=50_000.0, day_start_equity=300_000.0)
    assert not g.evaluate(make_order(), recovered).approved
    assert "trading_halt" in failed(g.evaluate(make_order(), recovered))


def test_drawdown_breaker_trips_and_latches(config, clock):
    g = gate(config, clock)
    # 12% cap: 300k peak -> 260k is a 13.3% drawdown.
    drawn = make_snapshot(
        equity=260_000.0, cash=50_000.0, day_start_equity=260_000.0, peak_equity=300_000.0
    )
    decision = g.evaluate(make_order(), drawn)
    assert not decision.approved
    assert "max_drawdown" in failed(decision)
    assert g.halt_state.read().breaker == "max_drawdown"


def test_halt_survives_a_new_gate_instance(config, clock):
    losing = make_snapshot(equity=290_000.0, cash=50_000.0, day_start_equity=300_000.0)
    gate(config, clock).evaluate(make_order(), losing)

    # A fresh process must still see the halt.
    fresh = gate(config, clock)
    assert fresh.halt_state.is_halted()
    assert not fresh.evaluate(make_order(), make_snapshot()).approved


def test_clearing_a_halt_requires_an_operator_and_a_note(config, clock):
    g = gate(config, clock)
    g.halt_state.trip("max_drawdown", "test")
    with pytest.raises(ValueError):
        g.halt_state.clear("", "note")
    with pytest.raises(ValueError):
        g.halt_state.clear("alice", "   ")
    g.halt_state.clear("alice", "reviewed drawdown, cause understood")
    assert not g.halt_state.is_halted()


def test_corrupt_halt_file_fails_closed(config, clock):
    g = gate(config, clock)
    g.halt_state.path.parent.mkdir(parents=True, exist_ok=True)
    g.halt_state.path.write_text("{ not json", encoding="utf-8")
    record = g.halt_state.read()
    assert record.halted
    assert record.breaker == "state_corruption"


def test_zero_equity_blocks_everything(config, clock):
    broke = make_snapshot(equity=0.0, cash=0.0, day_start_equity=0.0, peak_equity=0.0)
    decision = gate(config, clock).evaluate(make_order(), broke)
    assert not decision.approved
    assert "account_equity" in failed(decision)


# ---------------------------------------------------------------------------
# Kill switch
# ---------------------------------------------------------------------------


def test_kill_switch_blocks_evaluation_and_submission(config, clock, snapshot):
    g = gate(config, clock)
    g.kill_switch.activate("manual test", actor="alice")

    decision = g.evaluate(make_order(), snapshot)
    assert not decision.approved
    assert "kill_switch" in failed(decision)

    with pytest.raises(RiskViolation, match="Kill switch active"):
        g.authorize_submission(make_order(), snapshot)


def test_kill_switch_works_with_a_bare_file_touch(config, clock, snapshot):
    """An operator must be able to trip it from a shell with no Python."""
    g = gate(config, clock)
    g.kill_switch.path.parent.mkdir(parents=True, exist_ok=True)
    g.kill_switch.path.touch()
    assert g.kill_switch.is_active()
    assert not g.evaluate(make_order(), snapshot).approved


def test_kill_switch_can_be_cleared(config, clock, snapshot):
    g = gate(config, clock)
    g.kill_switch.activate("oops", actor="alice")
    record = g.kill_switch.deactivate(actor="alice")
    assert record["reason"] == "oops"
    assert not g.kill_switch.is_active()
    assert g.evaluate(make_order(), snapshot).approved


# ---------------------------------------------------------------------------
# Rate limiting / adversarial
# ---------------------------------------------------------------------------


def test_rate_limiter_caps_submissions_per_minute(config, clock, snapshot):
    g = gate(config, clock)
    limit = config.risk.max_orders_per_minute
    for _ in range(limit):
        g.authorize_submission(make_order(), snapshot)
    with pytest.raises(RiskViolation, match="rate limit"):
        g.authorize_submission(make_order(), snapshot)


def test_runaway_strategy_firing_1000_orders_is_contained(config, clock, snapshot):
    """Adversarial: a strategy loop tries to submit 1000 orders instantly."""
    g = gate(config, clock)
    accepted = 0
    refused = 0
    for _ in range(1000):
        try:
            g.authorize_submission(make_order(), snapshot)
            accepted += 1
        except RiskViolation:
            refused += 1

    assert accepted == config.risk.max_orders_per_minute
    assert refused == 1000 - accepted


def test_rate_limit_budget_survives_process_restart(config, clock, snapshot):
    """Restarting must not hand a runaway loop a fresh budget."""
    limit = config.risk.max_orders_per_minute
    first = gate(config, clock)
    for _ in range(limit):
        first.authorize_submission(make_order(), snapshot)

    second = gate(config, clock)  # simulates a restart
    with pytest.raises(RiskViolation, match="rate limit"):
        second.authorize_submission(make_order(), snapshot)


def test_rate_limit_window_rolls_forward(config, clock, snapshot):
    g = gate(config, clock)
    for _ in range(config.risk.max_orders_per_minute):
        g.authorize_submission(make_order(), snapshot)
    clock.advance(minutes=2)
    g.authorize_submission(make_order(), snapshot)  # must not raise


def test_hourly_cap_binds_after_repeated_minutes(config, clock, snapshot, make_config):
    cfg = make_config(
        {"risk": {"max_orders_per_minute": 2, "max_orders_per_hour": 5, "max_orders_per_day": 50}}
    )
    g = gate(cfg, clock)
    accepted = 0
    for _ in range(10):
        for _ in range(3):
            try:
                g.authorize_submission(make_order(), snapshot)
                accepted += 1
            except RiskViolation:
                pass
        clock.advance(minutes=2)
    assert accepted == 5


def test_authorize_refuses_when_risk_checks_fail(config, clock, snapshot):
    g = gate(config, clock)
    with pytest.raises(RiskViolation, match="Risk checks failed"):
        g.authorize_submission(make_order(quantity=10_000, price=100.0), snapshot)


def test_failed_authorisation_does_not_consume_rate_budget(config, clock, snapshot):
    g = gate(config, clock)
    for _ in range(50):
        with pytest.raises(RiskViolation):
            g.authorize_submission(make_order(quantity=10_000, price=100.0), snapshot)
    # The budget is intact for legitimate orders.
    for _ in range(config.risk.max_orders_per_minute):
        g.authorize_submission(make_order(), snapshot)


def test_clearance_is_bound_to_the_exact_order(config, clock, snapshot):
    g = gate(config, clock)
    order = make_order()
    clearance = g.authorize_submission(order, snapshot)
    assert clearance.order_fingerprint == order.fingerprint()
    # A different quantity is a different order, hence a different fingerprint.
    assert clearance.order_fingerprint != make_order(quantity=11).fingerprint()


# ---------------------------------------------------------------------------
# Batch evaluation
# ---------------------------------------------------------------------------


def test_batch_orders_cannot_collectively_breach_the_portfolio(config, clock):
    """Ten individually-legal orders must not add up to an illegal book."""
    snap = make_snapshot(equity=300_000.0, cash=300_000.0)
    orders = [make_order(f"SYM{i}", quantity=200, price=100.0) for i in range(10)]
    decisions = gate(config, clock).evaluate_batch(orders, snap)

    approved = [d for d in decisions if d.approved]
    total = sum(d.order.notional_base for d in approved)
    assert total <= config.risk.max_gross_exposure_pct * snap.equity
    assert len(approved) < len(orders)


def test_batch_respects_the_sector_cap_cumulatively(config, clock):
    snap = make_snapshot(equity=300_000.0, cash=300_000.0)
    orders = [
        make_order(f"T{i}", quantity=200, price=100.0, sector="TECH") for i in range(6)
    ]
    decisions = gate(config, clock).evaluate_batch(orders, snap)
    approved_value = sum(d.order.notional_base for d in decisions if d.approved)
    assert approved_value <= config.risk.max_sector_pct * snap.equity


def test_batch_respects_cash_cumulatively(config, clock):
    snap = make_snapshot(equity=300_000.0, cash=25_000.0, settled_cash=25_000.0)
    orders = [make_order(f"S{i}", quantity=100, price=100.0) for i in range(5)]
    decisions = gate(config, clock).evaluate_batch(orders, snap)
    spend = sum(d.order.notional_base for d in decisions if d.approved)
    assert spend <= snap.settled_cash


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def test_headroom_reports_every_limit(config, clock, snapshot):
    head = gate(config, clock).headroom(snapshot)
    assert set(head) == {
        "gross_exposure",
        "leverage",
        "largest_position",
        "daily_loss",
        "drawdown",
    }
    assert all({"used", "limit", "pct_of_limit"} <= set(v) for v in head.values())
