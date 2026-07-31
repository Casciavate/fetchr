"""In-memory broker used by tests and by ``--dry-run`` cycles.

It implements the same ``BrokerClient`` surface as ``IBKRBroker`` and records
every order it is asked to place, so a test can assert not just what was
rejected but that *nothing reached the wire*. ``placed`` staying empty is the
strongest assertion this suite makes about the approval boundary.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence

from ..core.types import AccountSnapshot, OrderStatus, Position, ProposedOrder, Side


class FakeBroker:
    """Deterministic broker double. Fills limit orders immediately by default."""

    def __init__(
        self,
        snapshot: AccountSnapshot,
        *,
        auto_fill: bool = True,
        reject_all: bool = False,
    ) -> None:
        self._snapshot = snapshot
        self._positions = dict(snapshot.positions)
        self.auto_fill = auto_fill
        self.reject_all = reject_all
        self.placed: list[ProposedOrder] = []
        self.cancelled: list[str] = []
        self._working: dict[str, "OrderAck"] = {}
        self._connected = False
        self._next_id = 1

    # -- connection ------------------------------------------------------

    def connect(self) -> None:
        self._connected = True

    def disconnect(self) -> None:
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected

    # -- state -----------------------------------------------------------

    def account_snapshot(self) -> AccountSnapshot:
        from dataclasses import replace

        return replace(self._snapshot, positions=dict(self._positions))

    def positions(self) -> dict[str, Position]:
        return dict(self._positions)

    def set_position(self, position: Position) -> None:
        """Simulate a position appearing outside this process (manual trade)."""
        self._positions[position.instrument.symbol] = position

    def open_orders(self) -> Sequence["OrderAck"]:
        return [ack for ack in self._working.values() if ack.is_working]

    # -- transmission -------------------------------------------------------

    def place_order(self, order: ProposedOrder) -> "OrderAck":
        from .broker import OrderAck

        self.placed.append(order)
        order_id = str(self._next_id)
        self._next_id += 1

        if self.reject_all:
            ack = OrderAck(
                broker_order_id=order_id,
                status=OrderStatus.REJECTED_BY_BROKER,
                filled_quantity=0.0,
                remaining_quantity=order.quantity,
                avg_fill_price=None,
                submitted_at=datetime.now(timezone.utc),
                raw={"ib_status": "Inactive", "why_held": "test rejection"},
            )
        elif self.auto_fill:
            price = order.effective_price
            self._apply_fill(order, price)
            ack = OrderAck(
                broker_order_id=order_id,
                status=OrderStatus.FILLED,
                filled_quantity=order.quantity,
                remaining_quantity=0.0,
                avg_fill_price=price,
                submitted_at=datetime.now(timezone.utc),
                raw={"ib_status": "Filled"},
            )
        else:
            ack = OrderAck(
                broker_order_id=order_id,
                status=OrderStatus.SUBMITTED,
                filled_quantity=0.0,
                remaining_quantity=order.quantity,
                avg_fill_price=None,
                submitted_at=datetime.now(timezone.utc),
                raw={"ib_status": "Submitted"},
            )

        self._working[order_id] = ack
        return ack

    def _apply_fill(self, order: ProposedOrder, price: float) -> None:
        from ..core.types import Position

        symbol = order.instrument.symbol
        existing = self._positions.get(symbol)
        delta = order.quantity * order.side.sign
        quantity = (existing.quantity if existing else 0.0) + delta
        if abs(quantity) < 1e-9:
            self._positions.pop(symbol, None)
            return
        self._positions[symbol] = Position(
            instrument=order.instrument,
            quantity=quantity,
            avg_price=price,
            market_price=price,
            market_value_base=quantity * price * order.fx_rate_to_base,
        )

    def cancel_order(self, broker_order_id: str) -> None:
        from .broker import OrderAck

        self.cancelled.append(broker_order_id)
        existing = self._working.get(broker_order_id)
        if existing is None:
            return
        self._working[broker_order_id] = OrderAck(
            broker_order_id=broker_order_id,
            status=OrderStatus.CANCELLED,
            filled_quantity=existing.filled_quantity,
            remaining_quantity=0.0,
            avg_fill_price=existing.avg_fill_price,
            submitted_at=existing.submitted_at,
            raw={"ib_status": "Cancelled"},
        )

    def cancel_all(self) -> int:
        working = [ack.broker_order_id for ack in self.open_orders()]
        for order_id in working:
            self.cancel_order(order_id)
        return len(working)
