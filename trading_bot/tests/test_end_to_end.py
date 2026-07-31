"""Full pipeline: screen -> signal -> size -> risk -> propose -> approve -> submit.

This is the integration counterpart to the unit suites. It wires the real
cycle, the real risk gate and the real approval service together against a fake
broker, and walks the whole path a live session would take - including the part
where it stops and waits for a human.
"""

from __future__ import annotations

import pytest

from trading_bot.approval_layer.service import ApprovalService, ProposalStatus
from trading_bot.config.mode import TradingMode
from trading_bot.core.types import OrderStatus
from trading_bot.cycle import ProposalCycle
from trading_bot.data_layer.providers import InMemoryBarProvider
from trading_bot.data_layer.synthetic import sample_universe
from trading_bot.execution_layer import FakeBroker, IBKRExecutor
from trading_bot.monitoring.alerts import NullAlerter
from trading_bot.monitoring.journal import DecisionLog
from trading_bot.risk_gate import RiskGate, RiskViolation
from trading_bot.signal_layer import build_enabled_strategies
from trading_bot.tests.conftest import make_snapshot

SYMBOLS = ["TRENDA", "TRENDB", "TRENDC", "REVERT", "BREAKOUT", "CHOPPY"]


@pytest.fixture
def e2e_config(make_config):
    return make_config(
        {
            "universe": {
                "candidates": SYMBOLS,
                "instruments": {
                    symbol: {
                        "exchange": "SMART",
                        "currency": "CHF",
                        "asset_class": "STK",
                        "sector": "BROAD_EQUITY",
                        "contract_id": 2000 + i,
                    }
                    for i, symbol in enumerate(SYMBOLS)
                },
                "core_holdings": [],
                "min_avg_daily_dollar_volume": 1_000_000.0,
            },
            # A single sector for everything makes the concentration cap bind,
            # which is realistic for a broad-equity sleeve.
            "risk": {"max_sector_pct": 0.25},
        }
    )


@pytest.fixture
def rig(e2e_config, clock, tmp_path):
    snapshot = make_snapshot(equity=300_000.0, cash=120_000.0, settled_cash=120_000.0)
    gate = RiskGate(e2e_config, clock=clock, sector_map=e2e_config.sector_map())
    approvals = ApprovalService(e2e_config, clock=clock)
    journal = DecisionLog(tmp_path / "decisions.jsonl")
    alerter = NullAlerter()
    broker = FakeBroker(snapshot)
    broker.connect()

    cycle = ProposalCycle(
        e2e_config,
        InMemoryBarProvider(sample_universe(700)),
        build_enabled_strategies(e2e_config),
        gate,
        approvals,
        decision_log=journal,
        alerter=alerter,
    )
    executor = IBKRExecutor(
        e2e_config,
        broker,
        gate,
        approvals,
        mode=TradingMode.PAPER,
        alerter=alerter,
        decision_log=journal,
    )
    return {
        "config": e2e_config,
        "snapshot": snapshot,
        "gate": gate,
        "approvals": approvals,
        "broker": broker,
        "cycle": cycle,
        "executor": executor,
        "journal": journal,
    }


def test_full_pipeline_stops_for_approval_then_executes(rig):
    cycle, approvals, executor, broker = (
        rig["cycle"], rig["approvals"], rig["executor"], rig["broker"]
    )
    snapshot = rig["snapshot"]

    # --- autonomous half -------------------------------------------------
    result = cycle.run(snapshot, check_freshness=False)
    assert not result.halted
    pending = result.pending_proposals
    assert pending, "expected at least one risk-cleared proposal"

    # The critical assertion: the autonomous half sent nothing.
    assert broker.placed == []

    # --- human half --------------------------------------------------------
    proposal = pending[0]
    token = approvals.approve(proposal.id, "alice", "reviewed on the dashboard")
    assert broker.placed == [], "approval alone must not transmit"

    order = approvals.rebuild_order(proposal.id)
    assert order.fingerprint() == proposal.fingerprint

    tracked = executor.submit(order, token, snapshot)

    assert len(broker.placed) == 1
    assert broker.placed[0].fingerprint() == order.fingerprint()
    assert tracked.status is OrderStatus.FILLED
    assert tracked.approver == "alice"

    # --- the audit trail tells the whole story ------------------------------
    events = [row["event"] for row in approvals.audit_trail()]
    assert "proposed" in events and "approved" in events and "token_consumed" in events

    journal_events = {entry["event"] for entry in rig["journal"].read()}
    assert {"universe_screened", "signal", "risk_decision", "submitted"} <= journal_events


def test_rejecting_a_proposal_sends_nothing(rig):
    cycle, approvals, broker = rig["cycle"], rig["approvals"], rig["broker"]
    result = cycle.run(rig["snapshot"], check_freshness=False)
    proposal = result.pending_proposals[0]

    approvals.reject(proposal.id, "alice", "not convinced by the setup")
    assert broker.placed == []
    assert approvals.get(proposal.id)["status"] == ProposalStatus.REJECTED


def test_ignoring_proposals_entirely_sends_nothing(rig):
    """The default outcome of walking away is that nothing happens."""
    cycle, broker = rig["cycle"], rig["broker"]
    for _ in range(3):
        cycle.run(rig["snapshot"], check_freshness=False)
    assert broker.placed == []


def test_kill_switch_mid_pipeline_stops_an_approved_order(rig):
    cycle, approvals, executor, broker, gate = (
        rig["cycle"], rig["approvals"], rig["executor"], rig["broker"], rig["gate"]
    )
    result = cycle.run(rig["snapshot"], check_freshness=False)
    proposal = result.pending_proposals[0]
    token = approvals.approve(proposal.id, "alice", "approved")
    order = approvals.rebuild_order(proposal.id)

    gate.kill_switch.activate("operator intervened", actor="alice")

    with pytest.raises(RiskViolation, match="Kill switch active"):
        executor.submit(order, token, rig["snapshot"])
    assert broker.placed == []


def test_proposals_respect_the_sector_cap_in_aggregate(rig):
    """Every proposal shares one sector, so the cap must bind across them."""
    result = rig["cycle"].run(rig["snapshot"], check_freshness=False)
    approved_notional = sum(
        d.order.notional_base for d in result.decisions if d.approved
    )
    cap = rig["config"].risk.max_sector_pct * rig["snapshot"].equity
    assert approved_notional <= cap + 1e-6


def test_second_cycle_after_a_fill_sees_the_new_position(rig):
    """Positions opened in cycle one must constrain cycle two."""
    cycle, approvals, executor, broker = (
        rig["cycle"], rig["approvals"], rig["executor"], rig["broker"]
    )
    result = cycle.run(rig["snapshot"], check_freshness=False)
    proposal = result.pending_proposals[0]
    token = approvals.approve(proposal.id, "alice", "ok")
    order = approvals.rebuild_order(proposal.id)
    executor.submit(order, token, rig["snapshot"])

    updated = broker.account_snapshot()
    assert order.instrument.symbol in updated.positions

    # The held name must not be proposed as a fresh entry again.
    second = cycle.run(updated, check_freshness=False)
    entries = [
        d.order
        for d in second.decisions
        if d.order.side.value == "BUY" and d.order.instrument.symbol == order.instrument.symbol
    ]
    assert entries == []
