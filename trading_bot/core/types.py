"""Immutable value objects shared across layers.

These types are deliberately dependency-free (no pandas, no broker SDK) so that
``risk_gate`` and ``signal_layer`` can be unit-tested without a live connection
or a heavyweight import graph.

All monetary fields whose name ends in ``_base`` are denominated in the
account's base currency. Fields named ``price`` are in the instrument's own
quote currency. Mixing the two is the single easiest way to get position
sizing catastrophically wrong, so the naming is enforced by convention here
and checked in ``risk_gate`` before any exposure maths.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Mapping


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

    @property
    def sign(self) -> int:
        return 1 if self is Side.BUY else -1


class OrderType(str, Enum):
    LIMIT = "LMT"
    MARKET = "MKT"


class OrderStatus(str, Enum):
    """Broker-side lifecycle. Local state is never trusted over the broker's."""

    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    REJECTED_BY_RISK = "rejected_by_risk"
    REJECTED_BY_HUMAN = "rejected_by_human"
    SUBMITTED = "submitted"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED_BY_BROKER = "rejected_by_broker"
    EXPIRED = "expired"

    @property
    def is_terminal(self) -> bool:
        return self in {
            OrderStatus.FILLED,
            OrderStatus.CANCELLED,
            OrderStatus.REJECTED_BY_RISK,
            OrderStatus.REJECTED_BY_HUMAN,
            OrderStatus.REJECTED_BY_BROKER,
            OrderStatus.EXPIRED,
        }


@dataclass(frozen=True)
class Instrument:
    symbol: str
    exchange: str
    currency: str
    asset_class: str = "STK"
    sector: str = "UNKNOWN"
    # IBKR contract id. Preferred over symbol for unambiguous routing; symbols
    # collide across exchanges (e.g. several listings named "WORLD").
    contract_id: int | None = None

    def key(self) -> str:
        return f"{self.symbol}@{self.exchange}"


@dataclass(frozen=True)
class Position:
    instrument: Instrument
    quantity: float
    avg_price: float
    market_price: float
    market_value_base: float
    unrealized_pnl_base: float = 0.0

    @property
    def symbol(self) -> str:
        return self.instrument.symbol

    @property
    def is_long(self) -> bool:
        return self.quantity > 0


@dataclass(frozen=True)
class ProposedOrder:
    """A trade the system wants to make. Carries no authority to execute.

    A ``ProposedOrder`` becomes executable only when the approval layer issues
    an ``ApprovalToken`` bound to this order's ``fingerprint()``. There is no
    method on this class that submits anything.
    """

    instrument: Instrument
    side: Side
    quantity: float
    limit_price: float | None
    order_type: OrderType
    strategy: str
    # FX rate from the instrument's currency into the account base currency.
    fx_rate_to_base: float
    reference_price: float
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    reason: str = ""
    client_order_id: str = ""

    def __post_init__(self) -> None:
        if self.quantity <= 0:
            raise ValueError(
                "ProposedOrder.quantity must be positive; direction is carried "
                "by `side`, not by the sign of the quantity."
            )
        if self.fx_rate_to_base <= 0:
            raise ValueError("fx_rate_to_base must be positive")
        if self.reference_price <= 0:
            raise ValueError("reference_price must be positive")
        if self.order_type is OrderType.LIMIT and self.limit_price is None:
            raise ValueError("A limit order requires a limit_price")

    @property
    def effective_price(self) -> float:
        """Price used for exposure maths: the limit if set, else the reference."""
        return self.limit_price if self.limit_price is not None else self.reference_price

    @property
    def notional_base(self) -> float:
        """Absolute order value in the account's base currency."""
        return abs(self.quantity) * self.effective_price * self.fx_rate_to_base

    @property
    def signed_quantity(self) -> float:
        return self.quantity * self.side.sign

    def canonical_payload(self) -> dict:
        """Stable dict used for approval-token binding and audit hashing."""
        return {
            "symbol": self.instrument.symbol,
            "exchange": self.instrument.exchange,
            "currency": self.instrument.currency,
            "contract_id": self.instrument.contract_id,
            "asset_class": self.instrument.asset_class,
            "side": self.side.value,
            "quantity": round(float(self.quantity), 8),
            "limit_price": (
                None if self.limit_price is None else round(float(self.limit_price), 8)
            ),
            "order_type": self.order_type.value,
            "strategy": self.strategy,
            "client_order_id": self.client_order_id,
        }

    def fingerprint(self) -> str:
        """SHA-256 over the economically meaningful fields.

        Any change to symbol, side, quantity, price or order type produces a
        different fingerprint, which invalidates a previously issued approval.
        That is the mechanism preventing an approved small order from being
        swapped for a large one before submission.
        """
        blob = json.dumps(self.canonical_payload(), sort_keys=True).encode("utf-8")
        return hashlib.sha256(blob).hexdigest()

    def to_storage(self) -> dict:
        """Full serialisation, including fields outside the fingerprint.

        ``reference_price`` and ``fx_rate_to_base`` are needed to re-run risk
        checks in a later process, but are deliberately *not* part of the
        fingerprint: a refreshed reference price must not silently invalidate a
        human's approval of a specific quantity at a specific limit.
        """
        return {
            **self.canonical_payload(),
            "sector": self.instrument.sector,
            "fx_rate_to_base": self.fx_rate_to_base,
            "reference_price": self.reference_price,
            "created_at": self.created_at.isoformat(),
            "reason": self.reason,
        }

    @classmethod
    def from_storage(cls, data: dict) -> "ProposedOrder":
        """Rebuild an order such that ``fingerprint()`` is unchanged."""
        created = data.get("created_at")
        return cls(
            instrument=Instrument(
                symbol=data["symbol"],
                exchange=data["exchange"],
                currency=data["currency"],
                asset_class=data.get("asset_class", "STK"),
                sector=data.get("sector", "UNKNOWN"),
                contract_id=data.get("contract_id"),
            ),
            side=Side(data["side"]),
            quantity=float(data["quantity"]),
            limit_price=None if data.get("limit_price") is None else float(data["limit_price"]),
            order_type=OrderType(data["order_type"]),
            strategy=data.get("strategy", ""),
            fx_rate_to_base=float(data["fx_rate_to_base"]),
            reference_price=float(data["reference_price"]),
            created_at=(
                datetime.fromisoformat(created) if created else datetime.now(timezone.utc)
            ),
            reason=data.get("reason", ""),
            client_order_id=data.get("client_order_id", ""),
        )

    def describe(self) -> str:
        price = "MKT" if self.limit_price is None else f"{self.limit_price:,.4f}"
        return (
            f"{self.side.value} {self.quantity:,.0f} {self.instrument.symbol}"
            f" @{self.instrument.exchange} limit={price}"
            f" ({self.instrument.currency}) ~{self.notional_base:,.2f} base"
            f" [{self.strategy}]"
        )


@dataclass(frozen=True)
class AccountSnapshot:
    """Broker-reported account state. Always sourced from IBKR, never inferred.

    ``day_start_equity`` and ``peak_equity`` are tracked locally by the
    monitoring layer because IBKR does not expose them directly; everything
    else comes straight from the broker.
    """

    timestamp: datetime
    base_currency: str
    equity: float
    cash: float
    settled_cash: float
    positions: Mapping[str, Position] = field(default_factory=dict)
    day_start_equity: float | None = None
    peak_equity: float | None = None
    realized_pnl_today: float = 0.0
    account_type: str = "cash"

    @property
    def gross_exposure(self) -> float:
        return sum(abs(p.market_value_base) for p in self.positions.values())

    @property
    def net_exposure(self) -> float:
        return sum(p.market_value_base for p in self.positions.values())

    @property
    def unrealized_pnl(self) -> float:
        return sum(p.unrealized_pnl_base for p in self.positions.values())

    @property
    def leverage(self) -> float:
        if self.equity <= 0:
            return float("inf")
        return self.gross_exposure / self.equity

    @property
    def effective_day_start_equity(self) -> float:
        return self.day_start_equity if self.day_start_equity is not None else self.equity

    @property
    def effective_peak_equity(self) -> float:
        peak = self.peak_equity if self.peak_equity is not None else self.equity
        return max(peak, self.equity)

    @property
    def day_pnl(self) -> float:
        """Realized + unrealized P&L for the session, in base currency."""
        return self.equity - self.effective_day_start_equity

    @property
    def drawdown_pct(self) -> float:
        peak = self.effective_peak_equity
        if peak <= 0:
            return 0.0
        return max(0.0, (peak - self.equity) / peak)

    def position_for(self, symbol: str) -> Position | None:
        return self.positions.get(symbol)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["timestamp"] = self.timestamp.isoformat()
        return d
