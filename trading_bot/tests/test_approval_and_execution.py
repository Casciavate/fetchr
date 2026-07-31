"""The human-approval boundary and the execution path.

The central assertion throughout: ``broker.placed`` stays empty unless a human
approval was recorded for that exact order. Every test that expects a refusal
checks the wire, not just the exception.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from trading_bot.approval_layer import ApprovalError, ApprovalService, ProposalStatus
from trading_bot.approval_layer.tokens import ApprovalToken, mint_token
from trading_bot.config.mode import TradingMode
from trading_bot.core.types import OrderStatus, Position
from trading_bot.execution_layer import FakeBroker, IBKRExecutor
from trading_bot.risk_gate import RiskGate, RiskViolation
from trading_bot.tests.conftest import make_instrument, make_order, make_position, make_snapshot

PACKAGE_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def approvals(config, clock) -> ApprovalService:
    return ApprovalService(config, clock=clock)


@pytest.fixture
def gate(config, clock) -> RiskGate:
    return RiskGate(config, clock=clock)


@pytest.fixture
def broker(snapshot) -> FakeBroker:
    fake = FakeBroker(snapshot)
    fake.connect()
    return fake


@pytest.fixture
def executor(config, broker, gate, approvals) -> IBKRExecutor:
    return IBKRExecutor(
        config, broker, gate, approvals, mode=TradingMode.PAPER
    )


def approve(approvals, gate, order, snapshot, approver="alice"):
    decision = gate.evaluate(order, snapshot)
    proposal = approvals.propose(order, decision)
    return approvals.approve(proposal.id, approver, "reviewed")


# ---------------------------------------------------------------------------
# The approval flow
# ---------------------------------------------------------------------------


def test_proposal_alone_never_produces_a_token(approvals, gate, snapshot):
    order = make_order()
    proposal = approvals.propose(order, gate.evaluate(order, snapshot))
    assert proposal.status == ProposalStatus.PENDING
    assert not hasattr(proposal, "token")
    assert approvals.pending()[0]["id"] == proposal.id


def test_approval_requires_a_named_human(approvals, gate, snapshot):
    order = make_order()
    proposal = approvals.propose(order, gate.evaluate(order, snapshot))
    for anonymous in ("", "   "):
        with pytest.raises(ApprovalError, match="name the human"):
            approvals.approve(proposal.id, anonymous)


def test_rejected_proposal_cannot_be_approved_afterwards(approvals, gate, snapshot):
    order = make_order()
    proposal = approvals.propose(order, gate.evaluate(order, snapshot))
    approvals.reject(proposal.id, "alice", "not now")
    with pytest.raises(ApprovalError, match="not pending"):
        approvals.approve(proposal.id, "alice")


def test_risk_blocked_proposal_cannot_be_approved(approvals, gate, snapshot):
    """A human must not be able to wave through a limit breach."""
    order = make_order(quantity=10_000, price=100.0)  # far over the position cap
    decision = gate.evaluate(order, snapshot)
    assert not decision.approved
    proposal = approvals.propose(order, decision)
    assert proposal.status == ProposalStatus.BLOCKED
    with pytest.raises(ApprovalError, match="blocked by the risk gate"):
        approvals.approve(proposal.id, "alice")


def test_expired_proposal_cannot_be_approved(config, clock, gate, snapshot):
    approvals = ApprovalService(config, clock=clock)
    order = make_order()
    proposal = approvals.propose(order, gate.evaluate(order, snapshot))
    clock.advance(minutes=config.approval.proposal_ttl_minutes + 1)
    with pytest.raises(ApprovalError, match="expired"):
        approvals.approve(proposal.id, "alice")


def test_decisions_are_recorded_in_the_audit_trail(approvals, gate, snapshot):
    first, second = make_order("AAA"), make_order("BBB")
    p1 = approvals.propose(first, gate.evaluate(first, snapshot))
    p2 = approvals.propose(second, gate.evaluate(second, snapshot))
    approvals.approve(p1.id, "alice", "looks good")
    approvals.reject(p2.id, "bob", "too concentrated")

    events = {(row["event"], row["actor"]) for row in approvals.audit_trail()}
    assert ("approved", "alice") in events
    assert ("rejected", "bob") in events
    assert approvals.counts()["approved"] == 1
    assert approvals.counts()["rejected"] == 1


# ---------------------------------------------------------------------------
# Token integrity
# ---------------------------------------------------------------------------


def test_token_is_bound_to_the_exact_order(approvals, gate, snapshot):
    order = make_order(quantity=50)
    token = approve(approvals, gate, order, snapshot)

    tampered = make_order(quantity=5_000)  # same symbol, far bigger
    with pytest.raises(ApprovalError, match="does not match this order"):
        approvals.verify_and_consume(token, tampered)


def test_token_cannot_be_reused(approvals, gate, snapshot):
    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    approvals.verify_and_consume(token, order)
    with pytest.raises(ApprovalError, match="already used"):
        approvals.verify_and_consume(token, order)


def test_token_expires(config, clock, gate, snapshot):
    approvals = ApprovalService(config, clock=clock)
    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    clock.advance(minutes=config.approval.token_ttl_minutes + 1)
    with pytest.raises(ApprovalError, match="expired"):
        approvals.verify_and_consume(token, order)


def test_forged_token_is_rejected(approvals, gate, snapshot):
    """A token minted with the wrong key must not verify."""
    order = make_order()
    forged = mint_token(
        proposal_id="made-up",
        order_fingerprint=order.fingerprint(),
        approver="attacker",
        key=b"x" * 48,
        ttl_minutes=30,
    )
    with pytest.raises(ApprovalError, match="invalid signature"):
        approvals.verify_and_consume(forged, order)


def test_token_with_edited_fields_is_rejected(approvals, gate, snapshot):
    """Changing the approver on a real token invalidates its signature."""
    from dataclasses import replace

    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    with pytest.raises(ApprovalError, match="invalid signature"):
        approvals.verify_and_consume(replace(token, approver="mallory"), order)


def test_unknown_token_not_in_the_store_is_rejected(config, clock, approvals, gate, snapshot):
    """A correctly signed token from a different store must still fail."""
    other = ApprovalService(config, clock=clock, store_path=approvals.path.parent / "other.db")
    order = make_order()
    token = approve(other, gate, order, snapshot)
    # Same signing key (same directory), but the token row lives in the other DB.
    with pytest.raises(ApprovalError, match="not in the approval store"):
        approvals.verify_and_consume(token, order)


# ---------------------------------------------------------------------------
# Execution: nothing reaches the wire without both gates
# ---------------------------------------------------------------------------


def test_approved_order_is_transmitted(executor, broker, approvals, gate, snapshot):
    order = make_order(quantity=50, price=100.0)
    token = approve(approvals, gate, order, snapshot)
    tracked = executor.submit(order, token, snapshot)

    assert broker.placed == [order]
    assert tracked.status is OrderStatus.FILLED
    assert tracked.approver == "alice"


def test_submission_without_a_token_sends_nothing(executor, broker, snapshot):
    order = make_order()
    with pytest.raises(ApprovalError, match="Expected an ApprovalToken"):
        executor.submit(order, None, snapshot)
    assert broker.placed == []


def test_submission_with_a_forged_token_sends_nothing(executor, broker, snapshot):
    order = make_order()
    forged = mint_token(
        proposal_id="fake",
        order_fingerprint=order.fingerprint(),
        approver="attacker",
        key=b"z" * 48,
        ttl_minutes=30,
    )
    with pytest.raises(ApprovalError):
        executor.submit(order, forged, snapshot)
    assert broker.placed == []


def test_swapping_the_order_after_approval_sends_nothing(
    executor, broker, approvals, gate, snapshot
):
    """The classic attack: approve something small, submit something large."""
    small = make_order(quantity=10, price=100.0)
    token = approve(approvals, gate, small, snapshot)

    large = make_order(quantity=200, price=100.0)
    with pytest.raises(ApprovalError, match="does not match this order"):
        executor.submit(large, token, snapshot)
    assert broker.placed == []


def test_kill_switch_beats_a_valid_approval(executor, broker, approvals, gate, snapshot):
    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    gate.kill_switch.activate("operator pulled the plug", actor="alice")

    with pytest.raises(RiskViolation, match="Kill switch active"):
        executor.submit(order, token, snapshot)
    assert broker.placed == []


def test_circuit_breaker_beats_a_valid_approval(executor, broker, approvals, gate, snapshot):
    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    gate.halt_state.trip("max_daily_loss", "loss limit breached after approval")

    with pytest.raises(RiskViolation, match="Trading halted"):
        executor.submit(order, token, snapshot)
    assert broker.placed == []


def test_state_moving_between_approval_and_submission_blocks_the_order(
    executor, broker, approvals, gate, snapshot
):
    """Approved when affordable, submitted when the cash is gone."""
    order = make_order(quantity=100, price=100.0)
    token = approve(approvals, gate, order, snapshot)

    poorer = make_snapshot(equity=300_000.0, cash=500.0, settled_cash=500.0)
    with pytest.raises(RiskViolation, match="Risk checks failed"):
        executor.submit(order, token, poorer)
    assert broker.placed == []


def test_rate_limit_blocks_a_flood_of_approved_orders(
    config, executor, broker, approvals, gate, snapshot
):
    """Even holding 30 genuine, individually valid approvals, the cap holds.

    Every approval is obtained first, while rate budget is untouched, so each
    token is legitimately signed and unexpired. The flood is then attempted in
    one burst - the scenario a runaway loop with a cooperative human produces.
    """
    approved = []
    for i in range(30):
        order = make_order(f"S{i}", quantity=10, price=100.0)
        approved.append((order, approve(approvals, gate, order, snapshot)))

    sent = 0
    for order, token in approved:
        try:
            executor.submit(order, token, snapshot)
            sent += 1
        except RiskViolation:
            pass

    assert sent == config.risk.max_orders_per_minute
    assert len(broker.placed) == sent


# ---------------------------------------------------------------------------
# Order state and reconciliation
# ---------------------------------------------------------------------------


def test_order_state_is_read_back_from_the_broker(config, gate, approvals, snapshot):
    broker = FakeBroker(snapshot, auto_fill=False)
    broker.connect()
    executor = IBKRExecutor(config, broker, gate, approvals, mode=TradingMode.PAPER)

    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    tracked = executor.submit(order, token, snapshot)
    assert tracked.status is OrderStatus.SUBMITTED
    assert executor.working_orders()

    broker.cancel_order(tracked.ack.broker_order_id)
    executor.refresh_order_state()
    assert executor.tracked_orders()[0].status is OrderStatus.CANCELLED


def test_broker_rejection_is_surfaced(config, gate, approvals, snapshot):
    broker = FakeBroker(snapshot, reject_all=True)
    broker.connect()
    executor = IBKRExecutor(config, broker, gate, approvals, mode=TradingMode.PAPER)

    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    tracked = executor.submit(order, token, snapshot)
    assert tracked.status is OrderStatus.REJECTED_BY_BROKER


def test_reconciliation_detects_a_position_the_system_did_not_open(executor, broker):
    """A manual trade in TWS must show up as drift, not be silently absorbed."""
    broker.set_position(make_position("SURPRISE", quantity=42, price=10.0))
    report = executor.reconcile(local_positions={})
    assert not report.is_clean
    assert [d.symbol for d in report.drifts] == ["SURPRISE"]
    assert report.drifts[0].delta == 42


def test_reconciliation_is_clean_when_state_agrees(executor, broker):
    position = make_position("IWDC", quantity=100, price=90.0)
    broker.set_position(position)
    report = executor.reconcile(local_positions={"IWDC": position})
    assert report.is_clean


def test_kill_switch_cancels_working_orders(config, gate, approvals, snapshot):
    broker = FakeBroker(snapshot, auto_fill=False)
    broker.connect()
    executor = IBKRExecutor(config, broker, gate, approvals, mode=TradingMode.PAPER)

    order = make_order()
    token = approve(approvals, gate, order, snapshot)
    executor.submit(order, token, snapshot)
    assert broker.open_orders()

    gate.kill_switch.activate("emergency", actor="alice")
    cancelled = executor.enforce_kill_switch()
    assert cancelled == 1
    assert not broker.open_orders()


def test_enforce_kill_switch_is_a_noop_when_clear(executor, broker):
    assert executor.enforce_kill_switch() == 0
    assert broker.cancelled == []


# ---------------------------------------------------------------------------
# Structural guarantees
# ---------------------------------------------------------------------------


def test_place_order_is_called_from_exactly_one_place():
    """Only the executor may transmit. Any other caller is a bypass."""
    callers = []
    for path in PACKAGE_ROOT.rglob("*.py"):
        relative = path.relative_to(PACKAGE_ROOT)
        if relative.parts[0] == "tests" or relative.name in {"broker.py", "fake_broker.py"}:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "place_order"
            ):
                callers.append(relative.as_posix())
    assert callers == ["execution_layer/executor.py"], (
        f"place_order is called from {callers}; it must only be called by "
        "IBKRExecutor.submit, which enforces risk clearance and human approval."
    )


def test_no_auto_approval_path_exists():
    """Guard against a future 'convenience' flag that skips the human.

    Matches on real identifiers (functions, attributes, parameters), not raw
    text, so prose in a docstring explaining that no such path exists does not
    itself trip the check.
    """
    banned = {
        "auto_approve",
        "autoapprove",
        "skip_approval",
        "approve_all",
        "approve_all_pending",
        "bypass_approval",
        "force_submit",
    }
    offenders = []
    for path in PACKAGE_ROOT.rglob("*.py"):
        if path.relative_to(PACKAGE_ROOT).parts[0] == "tests":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            name = None
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                name = node.name
            elif isinstance(node, ast.Attribute):
                name = node.attr
            elif isinstance(node, ast.Name):
                name = node.id
            elif isinstance(node, ast.arg):
                name = node.arg
            elif isinstance(node, ast.keyword):
                name = node.arg
            if name and name.lower() in banned:
                offenders.append((path.relative_to(PACKAGE_ROOT).as_posix(), name))
    assert not offenders, f"auto-approval affordance found: {offenders}"


def test_submit_signature_requires_a_token():
    """``submit`` must not gain a default that makes the token optional."""
    import inspect

    signature = inspect.signature(IBKRExecutor.submit)
    token_param = signature.parameters["token"]
    assert token_param.default is inspect.Parameter.empty, (
        "IBKRExecutor.submit must require an approval token explicitly"
    )
