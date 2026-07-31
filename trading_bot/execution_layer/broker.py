"""IBKR connection and order transmission.

Library choice, verified at build time rather than assumed
----------------------------------------------------------
``ib_insync`` ended with its author's death in early 2024 and receives no
updates. The maintained continuation is ``ib_async`` (github.com/ib-api-reloaded
/ib_async, 2.1.0 released December 2025, requires Python >= 3.10), which keeps
the ``ib_insync`` API as a near drop-in replacement. IBKR also ships the
official ``ibapi`` and, more recently, a synchronous wrapper. This module
targets ``ib_async`` and imports it lazily, so nothing else in the system - and
no test - requires the SDK to be installed.

Port conventions, confirmed against IBKR's API documentation:

    TWS          live 7496   paper 7497
    IB Gateway   live 4001   paper 4002

``connect()`` refuses to dial a live port unless ``config.mode`` independently
resolved the process to LIVE, and it verifies after connecting that the account
the broker reports actually matches the mode requested. A paper session that
finds itself attached to a live account disconnects rather than proceeding.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol, Sequence

from ..config.mode import TradingMode
from ..config.settings import Config
from ..core.types import (
    AccountSnapshot,
    Instrument,
    OrderStatus,
    OrderType,
    Position,
    ProposedOrder,
    Side,
)

logger = logging.getLogger(__name__)


class BrokerError(RuntimeError):
    """Raised on connection, contract-resolution or transmission failure."""


@dataclass(frozen=True)
class OrderAck:
    """What the broker said back. Local state is reconciled against this."""

    broker_order_id: str
    status: OrderStatus
    filled_quantity: float
    remaining_quantity: float
    avg_fill_price: float | None
    submitted_at: datetime
    raw: dict[str, Any]

    @property
    def is_working(self) -> bool:
        return not self.status.is_terminal


class BrokerClient(Protocol):
    """The surface the executor needs. Implemented by IBKR and by the fake."""

    def connect(self) -> None: ...
    def disconnect(self) -> None: ...
    def is_connected(self) -> bool: ...
    def account_snapshot(self) -> AccountSnapshot: ...
    def place_order(self, order: ProposedOrder) -> OrderAck: ...
    def cancel_order(self, broker_order_id: str) -> None: ...
    def open_orders(self) -> Sequence[OrderAck]: ...
    def positions(self) -> dict[str, Position]: ...


class IBKRBroker:
    """Thin ``ib_async`` adapter. Holds no risk logic and no approval logic."""

    def __init__(self, config: Config, mode: TradingMode) -> None:
        self.config = config
        self.mode = mode
        self._ib = None
        self._connected = False

    # -- connection ------------------------------------------------------

    @property
    def port(self) -> int:
        conn = self.config.execution.connection
        if self.mode is TradingMode.LIVE:
            return conn.gateway_live_port if conn.use_gateway else conn.live_port
        return conn.gateway_paper_port if conn.use_gateway else conn.paper_port

    def connect(self) -> None:
        try:
            from ib_async import IB
        except ImportError as exc:  # pragma: no cover - only without the SDK
            raise BrokerError(
                "ib_async is not installed. `pip install ib_async` (the maintained "
                "successor to ib_insync) before connecting to IBKR."
            ) from exc

        conn = self.config.execution.connection
        self._ib = IB()
        logger.info(
            "Connecting to IBKR %s on %s:%s (clientId=%s)",
            self.mode.value.upper(),
            conn.host,
            self.port,
            conn.client_id,
        )
        try:
            self._ib.connect(
                conn.host,
                self.port,
                clientId=conn.client_id,
                timeout=conn.connect_timeout_seconds,
                readonly=self.mode is not TradingMode.LIVE and conn.readonly_probe_on_connect,
            )
        except Exception as exc:
            raise BrokerError(f"Could not connect to IBKR on port {self.port}: {exc}") from exc

        self._connected = True
        self._assert_account_matches_mode()

    def _assert_account_matches_mode(self) -> None:
        """Refuse to continue if the connected account contradicts the mode.

        IBKR paper accounts are prefixed ``DU``; live accounts are not. Getting
        this wrong is the single worst failure available to this system, so it
        is checked directly rather than trusted to the port number.
        """
        accounts = list(self._ib.managedAccounts() or [])
        if not accounts:
            logger.warning("IBKR reported no managed accounts; cannot verify paper/live")
            return

        looks_paper = all(str(a).upper().startswith("DU") for a in accounts)
        if self.mode is TradingMode.PAPER and not looks_paper:
            self.disconnect()
            raise BrokerError(
                f"Refusing to proceed: the process is in PAPER mode but IBKR reports "
                f"account(s) {accounts}, which are not paper accounts (paper accounts "
                "start with 'DU'). Check the port and the TWS/Gateway session."
            )
        if self.mode is TradingMode.LIVE and looks_paper:
            logger.warning(
                "LIVE mode requested but IBKR reports paper account(s) %s. "
                "Continuing against paper, which is the safe direction.",
                accounts,
            )

    def disconnect(self) -> None:
        if self._ib is not None and self._connected:
            self._ib.disconnect()
        self._connected = False

    def is_connected(self) -> bool:
        return bool(self._ib is not None and self._ib.isConnected())

    # -- state -------------------------------------------------------------

    def account_snapshot(self) -> AccountSnapshot:
        self._require_connection()
        values = {
            (row.tag, row.currency): row.value
            for row in self._ib.accountSummary()
        }
        base = self.config.account.base_currency

        def number(tag: str, default: float = 0.0) -> float:
            for key in ((tag, base), (tag, "BASE"), (tag, "")):
                if key in values:
                    try:
                        return float(values[key])
                    except (TypeError, ValueError):
                        continue
            return default

        return AccountSnapshot(
            timestamp=datetime.now(timezone.utc),
            base_currency=base,
            equity=number("NetLiquidation"),
            cash=number("TotalCashValue"),
            settled_cash=number("SettledCash", number("TotalCashValue")),
            positions=self.positions(),
            account_type=self.config.account.account_type,
        )

    def positions(self) -> dict[str, Position]:
        self._require_connection()
        out: dict[str, Position] = {}
        for item in self._ib.portfolio():
            contract = item.contract
            instrument = Instrument(
                symbol=contract.symbol,
                exchange=contract.exchange or contract.primaryExchange or "SMART",
                currency=contract.currency,
                asset_class=contract.secType,
                contract_id=contract.conId,
            )
            out[instrument.symbol] = Position(
                instrument=instrument,
                quantity=float(item.position),
                avg_price=float(item.averageCost),
                market_price=float(item.marketPrice),
                market_value_base=float(item.marketValue),
                unrealized_pnl_base=float(item.unrealizedPNL),
            )
        return out

    def open_orders(self) -> Sequence[OrderAck]:
        self._require_connection()
        return [self._to_ack(trade) for trade in self._ib.openTrades()]

    # -- transmission ---------------------------------------------------------

    def place_order(self, order: ProposedOrder) -> OrderAck:
        """Transmit one order. Called only by ``IBKRExecutor.submit``.

        This method performs no risk or approval checking of its own - by
        design, so that the checks live in exactly one place rather than being
        duplicated (and eventually diverging) here.
        """
        self._require_connection()
        from ib_async import LimitOrder, MarketOrder

        contract = self._resolve_contract(order.instrument)
        quantity = float(order.quantity)
        action = "BUY" if order.side is Side.BUY else "SELL"

        if order.order_type is OrderType.LIMIT:
            if order.limit_price is None:
                raise BrokerError("Limit order reached the broker without a limit price")
            ib_order = LimitOrder(action, quantity, float(order.limit_price))
        else:
            ib_order = MarketOrder(action, quantity)

        ib_order.tif = self.config.execution.time_in_force
        ib_order.outsideRth = self.config.execution.outside_rth
        if order.client_order_id:
            ib_order.orderRef = order.client_order_id

        trade = self._ib.placeOrder(contract, ib_order)
        self._ib.sleep(0)  # let ib_async process the first status callback
        return self._to_ack(trade)

    def cancel_order(self, broker_order_id: str) -> None:
        self._require_connection()
        for trade in self._ib.openTrades():
            if str(trade.order.orderId) == str(broker_order_id):
                self._ib.cancelOrder(trade.order)
                return
        logger.warning("No working order with id %s to cancel", broker_order_id)

    def cancel_all(self) -> int:
        """Cancel every working order. Used by the kill switch."""
        self._require_connection()
        trades = list(self._ib.openTrades())
        for trade in trades:
            self._ib.cancelOrder(trade.order)
        return len(trades)

    # -- helpers ---------------------------------------------------------------

    def _require_connection(self) -> None:
        if not self.is_connected():
            raise BrokerError("Not connected to IBKR")

    def _resolve_contract(self, instrument: Instrument):
        from ib_async import Contract, Stock

        if instrument.contract_id:
            # A contract id is unambiguous; symbols collide across venues.
            contract = Contract(conId=instrument.contract_id, exchange=instrument.exchange or "SMART")
            qualified = self._ib.qualifyContracts(contract)
            if qualified:
                return qualified[0]

        contract = Stock(instrument.symbol, instrument.exchange or "SMART", instrument.currency)
        qualified = self._ib.qualifyContracts(contract)
        if not qualified:
            raise BrokerError(
                f"IBKR could not resolve a contract for {instrument.key()} "
                f"({instrument.currency}). Refusing to guess."
            )
        if len(qualified) > 1:
            raise BrokerError(
                f"{instrument.key()} resolved to {len(qualified)} contracts. Specify a "
                "contract_id to disambiguate rather than risking the wrong listing."
            )
        return qualified[0]

    _STATUS_MAP = {
        "PendingSubmit": OrderStatus.SUBMITTED,
        "PreSubmitted": OrderStatus.SUBMITTED,
        "Submitted": OrderStatus.SUBMITTED,
        "ApiPending": OrderStatus.SUBMITTED,
        "Filled": OrderStatus.FILLED,
        "Cancelled": OrderStatus.CANCELLED,
        "ApiCancelled": OrderStatus.CANCELLED,
        "Inactive": OrderStatus.REJECTED_BY_BROKER,
    }

    def _to_ack(self, trade) -> OrderAck:
        status = trade.orderStatus
        filled = float(status.filled or 0.0)
        remaining = float(status.remaining or 0.0)
        mapped = self._STATUS_MAP.get(status.status, OrderStatus.SUBMITTED)
        if mapped is OrderStatus.SUBMITTED and filled > 0 and remaining > 0:
            mapped = OrderStatus.PARTIALLY_FILLED
        return OrderAck(
            broker_order_id=str(trade.order.orderId),
            status=mapped,
            filled_quantity=filled,
            remaining_quantity=remaining,
            avg_fill_price=float(status.avgFillPrice) if status.avgFillPrice else None,
            submitted_at=datetime.now(timezone.utc),
            raw={"ib_status": status.status, "why_held": getattr(status, "whyHeld", "")},
        )
