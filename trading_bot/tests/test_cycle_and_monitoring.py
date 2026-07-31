"""The proposal cycle and the monitoring layer.

The cycle is the autonomous half of the system. The property under test
throughout is that it produces *proposals* and nothing else - it has no
executor, no broker and no way to reach one.
"""

from __future__ import annotations

import json

import pytest

from trading_bot.approval_layer.service import ApprovalService, ProposalStatus
from trading_bot.config.settings import ConfigError
from trading_bot.cycle import ProposalCycle
from trading_bot.data_layer.providers import InMemoryBarProvider
from trading_bot.data_layer.synthetic import sample_universe
from trading_bot.monitoring.alerts import Alert, ConsoleAlerter, NullAlerter, build_alerter
from trading_bot.monitoring.dashboard import (
    build_daily_summary,
    render_daily_summary,
    render_dashboard,
    write_daily_summary,
)
from trading_bot.monitoring.journal import DecisionLog
from trading_bot.risk_gate import RiskGate
from trading_bot.signal_layer import build_enabled_strategies
from trading_bot.tests.conftest import make_position, make_snapshot

UNIVERSE_SYMBOLS = ["TRENDA", "TRENDB", "TRENDC", "REVERT", "BREAKOUT", "CHOPPY", "PENNY"]


@pytest.fixture
def cycle_config(make_config):
    return make_config(
        {
            "universe": {
                "candidates": UNIVERSE_SYMBOLS,
                "instruments": {
                    symbol: {
                        "exchange": "SMART",
                        "currency": "CHF",
                        "asset_class": "STK",
                        "sector": "BROAD_EQUITY",
                        "contract_id": 1000 + i,
                    }
                    for i, symbol in enumerate(UNIVERSE_SYMBOLS)
                },
                "core_holdings": [],
                "min_avg_daily_dollar_volume": 1_000_000.0,
            }
        }
    )


@pytest.fixture
def provider():
    return InMemoryBarProvider(sample_universe(700))


@pytest.fixture
def journal(tmp_path):
    return DecisionLog(tmp_path / "decisions.jsonl")


def build_cycle(config, provider, clock, journal, alerter=None):
    return ProposalCycle(
        config,
        provider,
        build_enabled_strategies(config),
        RiskGate(config, clock=clock, sector_map=config.sector_map()),
        ApprovalService(config, clock=clock),
        decision_log=journal,
        alerter=alerter or NullAlerter(),
    )


# ---------------------------------------------------------------------------
# The cycle proposes and stops
# ---------------------------------------------------------------------------


def test_cycle_produces_proposals_and_nothing_else(cycle_config, provider, clock, journal):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    snapshot = make_snapshot(equity=300_000.0, cash=200_000.0)
    result = cycle.run(snapshot, check_freshness=False)

    assert not result.halted
    assert result.universe is not None
    assert result.proposals, "expected the sample universe to produce proposals"
    assert all(
        p.status in {ProposalStatus.PENDING, ProposalStatus.BLOCKED} for p in result.proposals
    )


def test_cycle_has_no_route_to_the_broker(cycle_config, provider, clock, journal):
    """Structural: the cycle holds no executor and no broker reference."""
    cycle = build_cycle(cycle_config, provider, clock, journal)
    attributes = vars(cycle)
    assert "broker" not in attributes
    assert "executor" not in attributes
    assert not any(hasattr(value, "place_order") for value in attributes.values())


def test_illiquid_names_are_screened_out(cycle_config, provider, clock, journal):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    result = cycle.run(make_snapshot(cash=200_000.0), check_freshness=False)
    assert "PENNY" not in result.universe.eligible_symbols
    reasons = {r.symbol: r.reasons for r in result.universe.excluded}
    assert any("price" in r or "liquidity" in r for r in reasons["PENNY"])


def test_proposals_never_exceed_the_position_limit(cycle_config, provider, clock, journal):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    snapshot = make_snapshot(equity=300_000.0, cash=300_000.0)
    result = cycle.run(snapshot, check_freshness=False)

    cap = cycle_config.risk.max_position_pct * snapshot.equity
    for proposal in result.pending_proposals:
        order = next(d.order for d in result.decisions if d.order.fingerprint() == proposal.fingerprint)
        assert order.notional_base <= cap + 1e-6


def test_cycle_requires_a_defined_universe(make_config, provider, clock, journal):
    config = make_config({"universe": {"candidates": []}})
    cycle = build_cycle(config, provider, clock, journal)
    with pytest.raises(ConfigError, match="universe.candidates is empty"):
        cycle.run(make_snapshot(), check_freshness=False)


# ---------------------------------------------------------------------------
# The cycle refuses to run when blocked
# ---------------------------------------------------------------------------


def test_kill_switch_stops_the_cycle_before_any_work(cycle_config, provider, clock, journal):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    cycle.risk_gate.kill_switch.activate("test", actor="alice")

    result = cycle.run(make_snapshot(), check_freshness=False)
    assert result.halted
    assert "kill switch" in result.halt_reason
    assert result.proposals == ()


def test_latched_halt_stops_the_cycle(cycle_config, provider, clock, journal):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    cycle.risk_gate.halt_state.trip("max_drawdown", "drawdown breached")

    result = cycle.run(make_snapshot(), check_freshness=False)
    assert result.halted
    assert result.proposals == ()


def test_daily_loss_breach_halts_the_cycle_and_alerts(cycle_config, provider, clock, journal):
    alerter = NullAlerter()
    cycle = build_cycle(cycle_config, provider, clock, journal, alerter=alerter)

    losing = make_snapshot(equity=290_000.0, cash=100_000.0, day_start_equity=300_000.0)
    result = cycle.run(losing, check_freshness=False)

    assert result.halted
    assert "circuit breaker" in result.halt_reason
    assert any(a.kind == "circuit_breaker" for a in alerter.sent)
    assert cycle.risk_gate.halt_state.is_halted()


def test_stale_data_is_refused(cycle_config, clock, journal):
    """Trading on last month's prices must fail loudly."""
    from trading_bot.data_layer.providers import DataError

    stale = InMemoryBarProvider(sample_universe(700, end="2025-01-31"))
    cycle = build_cycle(cycle_config, stale, clock, journal)
    with pytest.raises(DataError, match="stale"):
        cycle.run(make_snapshot(cash=200_000.0), check_freshness=True)


# ---------------------------------------------------------------------------
# Journalling
# ---------------------------------------------------------------------------


def test_every_signal_and_risk_decision_is_journalled(
    cycle_config, provider, clock, journal
):
    cycle = build_cycle(cycle_config, provider, clock, journal)
    result = cycle.run(make_snapshot(cash=200_000.0), check_freshness=False)

    events = journal.read()
    assert {"universe_screened", "signal", "risk_decision"} <= {e["event"] for e in events}
    assert len(journal.events("signal")) == len(result.signals)
    assert len(journal.events("risk_decision")) == len(result.decisions)

    for entry in journal.events("risk_decision"):
        assert "checks" in entry and entry["checks"]
        if not entry["approved"]:
            assert entry["reasons"], "a blocked decision must record why"


def test_journal_lines_are_valid_standalone_json(cycle_config, provider, clock, journal):
    build_cycle(cycle_config, provider, clock, journal).run(
        make_snapshot(cash=200_000.0), check_freshness=False
    )
    for line in journal.path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            assert "ts" in json.loads(line)


# ---------------------------------------------------------------------------
# Alerting
# ---------------------------------------------------------------------------


def test_alerter_only_fires_for_configured_kinds():
    alerter = NullAlerter(alert_on=["circuit_breaker", "kill_switch"])
    assert alerter.send("circuit_breaker", "tripped") is not None
    assert alerter.send("signal", "bought something") is None
    assert [a.kind for a in alerter.sent] == ["circuit_breaker"]


def test_alert_delivery_failure_does_not_propagate():
    """A broken alert channel must not take the trading process down."""

    class Exploding(NullAlerter):
        def _deliver(self, alert: Alert) -> None:
            raise RuntimeError("webhook is down")

    alerter = Exploding()
    assert alerter.send("kill_switch", "still recorded") is not None


def test_console_is_the_default_alert_channel(config):
    assert isinstance(build_alerter(config), ConsoleAlerter)


def test_slack_alerter_refuses_without_a_webhook(make_config, monkeypatch):
    from trading_bot.monitoring.alerts import SLACK_WEBHOOK_ENV

    monkeypatch.delenv(SLACK_WEBHOOK_ENV, raising=False)
    cfg = make_config({"monitoring": {"alerts": {"channel": "slack"}}})
    with pytest.raises(ValueError, match=SLACK_WEBHOOK_ENV):
        build_alerter(cfg)


# ---------------------------------------------------------------------------
# Dashboard and daily summary
# ---------------------------------------------------------------------------


def test_dashboard_shows_positions_pnl_and_headroom(config, clock):
    gate = RiskGate(config, clock=clock)
    snapshot = make_snapshot(
        equity=300_000.0,
        cash=30_000.0,
        positions=[make_position("IWDC", quantity=1226, price=92.28)],
        day_start_equity=302_000.0,
    )
    output = render_dashboard(snapshot, gate, mode="paper")

    assert "IWDC" in output
    assert "RISK LIMIT HEADROOM" in output
    assert "Day P&L" in output
    assert "human approval" in output


def test_dashboard_shouts_when_halted(config, clock):
    gate = RiskGate(config, clock=clock)
    gate.halt_state.trip("max_drawdown", "drawdown breached")
    gate.kill_switch.activate("manual", actor="alice")
    output = render_dashboard(make_snapshot(), gate)

    assert "KILL SWITCH ACTIVE" in output
    assert "HALTED by max_drawdown" in output


def test_daily_summary_captures_risk_state(config, clock, tmp_path, journal):
    gate = RiskGate(config, clock=clock)
    approvals = ApprovalService(config, clock=clock)
    snapshot = make_snapshot(
        equity=294_000.0,
        cash=30_000.0,
        day_start_equity=300_000.0,
        peak_equity=310_000.0,
        positions=[make_position("IWDC", quantity=100, price=92.0)],
    )
    summary = build_daily_summary(snapshot, gate, approvals=approvals, decision_log=journal)

    assert summary["day_pnl"] == pytest.approx(-6_000.0)
    assert summary["drawdown_pct"] == pytest.approx((310_000 - 294_000) / 310_000)
    assert summary["position_count"] == 1
    assert "risk_headroom" in summary and "daily_loss" in summary["risk_headroom"]

    path = write_daily_summary(summary, tmp_path / "daily.jsonl")
    assert json.loads(path.read_text(encoding="utf-8").strip())["date"] == summary["date"]
    assert "DAILY SUMMARY" in render_daily_summary(summary)
