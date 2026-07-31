"""The only path from a proposed order to a transmitted one.

``IBKRExecutor.submit`` is the sole caller of ``BrokerClient.place_order`` in
the system, and it will not call it without, in order:

1. a ``RiskClearance`` freshly issued by the risk gate at submission time, and
2. a valid, unexpired, unconsumed ``ApprovalToken`` bound to this exact order.

Both are required. Neither can be produced by strategy code: the gate mints
clearances only after re-running every limit, and the approval service mints
tokens only from a recorded human decision. There is no ``force`` parameter and
no configuration flag that skips either step.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable, Sequence

from ..approval_layer.service import ApprovalService
from ..approval_layer.tokens import ApprovalError, ApprovalToken
from ..config.mode import TradingMode
from ..config.settings import Config
from ..core.types import AccountSnapshot, OrderStatus, Position, ProposedOrder
from ..risk_gate.gate import RiskClearance, RiskGate, RiskViolation
from .broker import BrokerClient, BrokerError, OrderAck

logger = logging.getLogger(__name__)


@dataclass
class TrackedOrder:
    order: ProposedOrder
    ack: OrderAck
    approval_token_id: str
    approver: str
    clearance_id: str
    mode: str
    updated_at: datetime

    @property
    def status(self) -> OrderStatus:
        return self.ack.status


@dataclass(frozen=True)
class PositionDrift:
    symbol: str
    local_quantity: float
    broker_quantity: float

    @property
    def delta(self) -> float:
        return self.broker_quantity - self.local_quantity


@dataclass(frozen=True)
class ReconciliationReport:
    checked_at: datetime
    drifts: tuple[PositionDrift, ...] = ()
    working_orders: tuple[OrderAck, ...] = ()
    unknown_broker_orders: tuple[str, ...] = ()

    @property
    def is_clean(self) -> bool:
        return not self.drifts and not self.unknown_broker_orders

    def describe(self) -> str:
        if self.is_clean:
            return f"reconciled clean at {self.checked_at.isoformat()}"
        parts = []
        for drift in self.drifts:
            parts.append(
                f"{drift.symbol}: local {drift.local_quantity:,.4f} vs broker "
                f"{drift.broker_quantity:,.4f} (delta {drift.delta:+,.4f})"
            )
        if self.unknown_broker_orders:
            parts.append(
                "orders at the broker this process did not send: "
                + ", ".join(self.unknown_broker_orders)
            )
        return "; ".join(parts)


class IBKRExecutor:
    """Submits approved, risk-cleared orders and tracks their state."""

    def __init__(
        self,
        config: Config,
        broker: BrokerClient,
        risk_gate: RiskGate,
        approval_service: ApprovalService,
        *,
        mode: TradingMode = TradingMode.PAPER,
        alerter=None,
        decision_log=None,
    ) -> None:
        self.config = config
        self.broker = broker
        self.risk_gate = risk_gate
        self.approvals = approval_service
        self.mode = mode
        self.alerter = alerter
        self.decision_log = decision_log
        self._tracked: dict[str, TrackedOrder] = {}

    # -- submission --------------------------------------------------------

    def submit(
        self,
        order: ProposedOrder,
        token: ApprovalToken,
        snapshot: AccountSnapshot,
    ) -> TrackedOrder:
        """Send one order. Raises rather than returning a failure flag.

        Raising is deliberate: a caller that forgets to inspect a returned
        status must not end up believing an order was suppressed when it was
        sent, or vice versa.
        """
        # 1. Risk, re-evaluated now - not at proposal time. State moves.
        try:
            clearance: RiskClearance = self.risk_gate.authorize_submission(
                order, snapshot, mode=self.mode.value
            )
        except RiskViolation as exc:
            self._record("risk_blocked_at_submission", order, detail=str(exc))
            self._alert("risk_block", f"Submission blocked: {exc}")
            raise

        # 2. Human approval, verified and burned. After this the token is dead.
        try:
            self.approvals.verify_and_consume(token, order)
        except ApprovalError as exc:
            self._record("approval_rejected", order, detail=str(exc))
            self._alert("order_rejected", f"Approval verification failed: {exc}")
            raise

        # 3. Belt and braces: the clearance must describe this same order.
        if clearance.order_fingerprint != order.fingerprint():
            raise RiskViolation(
                "Risk clearance does not match the order being submitted. "
                "Refusing to transmit."
            )

        self._record(
            "submitting",
            order,
            detail=f"approver={token.approver} clearance={clearance.clearance_id}",
        )

        try:
            ack = self.broker.place_order(order)
        except BrokerError as exc:
            self._record("broker_error", order, detail=str(exc))
            self._alert("order_rejected", f"Broker refused {order.describe()}: {exc}")
            raise

        tracked = TrackedOrder(
            order=order,
            ack=ack,
            approval_token_id=token.token_id,
            approver=token.approver,
            clearance_id=clearance.clearance_id,
            mode=self.mode.value,
            updated_at=datetime.now(timezone.utc),
        )
        self._tracked[ack.broker_order_id] = tracked

        self._record(
            "submitted",
            order,
            detail=f"broker_order_id={ack.broker_order_id} status={ack.status.value}",
        )
        if ack.status is OrderStatus.REJECTED_BY_BROKER:
            self._alert("order_rejected", f"IBKR rejected {order.describe()}: {ack.raw}")
        return tracked

    # -- state tracking ------------------------------------------------------

    def tracked_orders(self) -> list[TrackedOrder]:
        return list(self._tracked.values())

    def working_orders(self) -> list[TrackedOrder]:
        return [t for t in self._tracked.values() if t.ack.is_working]

    def refresh_order_state(self) -> list[TrackedOrder]:
        """Re-read order state from the broker. Local state is never authoritative."""
        by_id = {ack.broker_order_id: ack for ack in self.broker.open_orders()}
        now = datetime.now(timezone.utc)
        for order_id, tracked in self._tracked.items():
            if order_id in by_id:
                tracked.ack = by_id[order_id]
            elif tracked.ack.is_working:
                # It left the working set: the broker considers it done. Without
                # a fill report we mark it terminal rather than assume filled.
                tracked.ack = OrderAck(
                    broker_order_id=order_id,
                    status=OrderStatus.CANCELLED
                    if tracked.ack.filled_quantity == 0
                    else OrderStatus.FILLED,
                    filled_quantity=tracked.ack.filled_quantity,
                    remaining_quantity=0.0,
                    avg_fill_price=tracked.ack.avg_fill_price,
                    submitted_at=tracked.ack.submitted_at,
                    raw={**tracked.ack.raw, "note": "no longer in broker open orders"},
                )
            tracked.updated_at = now
        return list(self._tracked.values())

    def reconcile(self, local_positions: dict[str, Position] | None = None) -> ReconciliationReport:
        """Compare local belief against broker-reported truth.

        Any mismatch beyond the configured tolerance is surfaced, not silently
        corrected: a position the system did not expect usually means a manual
        trade, a partial fill it missed, or a bug - all of which a human needs
        to see before the next cycle sizes anything.
        """
        broker_positions = self.broker.positions()
        local = local_positions if local_positions is not None else {}
        tolerance = self.config.execution.max_position_drift_tolerance

        drifts: list[PositionDrift] = []
        for symbol in sorted(set(local) | set(broker_positions)):
            local_qty = local[symbol].quantity if symbol in local else 0.0
            broker_qty = (
                broker_positions[symbol].quantity if symbol in broker_positions else 0.0
            )
            if abs(broker_qty - local_qty) > tolerance:
                drifts.append(PositionDrift(symbol, local_qty, broker_qty))

        known = set(self._tracked)
        unknown = tuple(
            ack.broker_order_id
            for ack in self.broker.open_orders()
            if ack.broker_order_id not in known
        )

        report = ReconciliationReport(
            checked_at=datetime.now(timezone.utc),
            drifts=tuple(drifts),
            working_orders=tuple(self.broker.open_orders()),
            unknown_broker_orders=unknown,
        )
        if not report.is_clean:
            self._alert("risk_block", f"Reconciliation mismatch: {report.describe()}")
        return report

    # -- kill switch ----------------------------------------------------------

    def enforce_kill_switch(self) -> int:
        """Cancel every working order if the kill switch is active.

        Returns the number of cancellations attempted. Safe to call on every
        cycle; a no-op when the switch is clear.
        """
        if not self.risk_gate.kill_switch.is_active():
            return 0

        cancelled = 0
        for ack in self.broker.open_orders():
            try:
                self.broker.cancel_order(ack.broker_order_id)
                cancelled += 1
            except BrokerError as exc:
                logger.error("Failed to cancel %s: %s", ack.broker_order_id, exc)

        self._alert(
            "kill_switch",
            f"Kill switch active: cancelled {cancelled} working order(s). "
            "No further orders will be accepted until it is cleared.",
        )
        return cancelled

    # -- plumbing --------------------------------------------------------------

    def _record(self, event: str, order: ProposedOrder, *, detail: str = "") -> None:
        if self.decision_log is not None:
            self.decision_log.record(
                event,
                {
                    "order": order.canonical_payload(),
                    "fingerprint": order.fingerprint(),
                    "mode": self.mode.value,
                    "detail": detail,
                },
            )
        logger.info("%s | %s | %s", event, order.describe(), detail)

    def _alert(self, kind: str, message: str) -> None:
        if self.alerter is not None:
            self.alerter.send(kind, message)
