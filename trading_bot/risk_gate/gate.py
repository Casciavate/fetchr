"""The risk gate: hard limits that strategy code cannot bypass.

Design contract
---------------
* Strategies produce ``ProposedOrder`` objects. A ``ProposedOrder`` has no
  method that sends anything anywhere.
* The only way an order reaches the broker is via
  ``execution_layer.IBKRExecutor.submit``, which requires both a valid
  ``ApprovalToken`` and a ``RiskClearance`` issued here.
* A ``RiskClearance`` is issued only by ``authorize_submission``, which
  re-checks the kill switch, the latching halt, and the rate limiter *at the
  moment of submission* - not at proposal time. State can change between a
  human clicking approve and the order going out, and the later check wins.

Nothing in ``signal_layer`` imports this module, and nothing here imports
``signal_layer``; ``tests/test_layer_isolation.py`` enforces both directions
statically so the boundary cannot rot.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Mapping, Sequence

from ..config.settings import Config
from ..core.types import AccountSnapshot, OrderType, ProposedOrder, Side
from .state import (
    Clock,
    EquityTracker,
    HaltRecord,
    HaltState,
    KillSwitch,
    RateLimiter,
    utc_now,
)


class RiskViolation(RuntimeError):
    """Raised when submission is attempted without valid risk clearance."""


@dataclass(frozen=True)
class CheckResult:
    name: str
    passed: bool
    detail: str
    metric: float | None = None
    limit: float | None = None

    def describe(self) -> str:
        status = "PASS" if self.passed else "BLOCK"
        return f"[{status}] {self.name}: {self.detail}"


@dataclass(frozen=True)
class RiskDecision:
    approved: bool
    order: ProposedOrder
    checks: tuple[CheckResult, ...]
    evaluated_at: datetime
    halt: HaltRecord | None = None

    @property
    def blocking_reasons(self) -> tuple[str, ...]:
        return tuple(c.detail for c in self.checks if not c.passed)

    @property
    def failed_checks(self) -> tuple[str, ...]:
        return tuple(c.name for c in self.checks if not c.passed)

    def to_dict(self) -> dict:
        return {
            "approved": self.approved,
            "order": self.order.canonical_payload(),
            "order_fingerprint": self.order.fingerprint(),
            "evaluated_at": self.evaluated_at.isoformat(),
            "checks": [
                {
                    "name": c.name,
                    "passed": c.passed,
                    "detail": c.detail,
                    "metric": c.metric,
                    "limit": c.limit,
                }
                for c in self.checks
            ],
        }


@dataclass(frozen=True)
class RiskClearance:
    """Proof the gate authorised this exact order for immediate submission.

    Short-lived and single-order. The execution layer refuses to send without
    one, and verifies that its ``order_fingerprint`` matches the order it is
    about to transmit.
    """

    clearance_id: str
    order_fingerprint: str
    issued_at: datetime
    mode: str


@dataclass
class _PendingEffects:
    """Cumulative effect of orders already cleared earlier in the same batch.

    Without this, ten orders each individually sized at 8% of equity would each
    pass a "max 8% per position" check and collectively blow through every
    portfolio limit.
    """

    by_symbol: dict[str, float] = field(default_factory=dict)
    by_sector: dict[str, float] = field(default_factory=dict)
    gross_delta: float = 0.0
    cash_used: float = 0.0

    def apply(self, order: ProposedOrder, sector: str) -> None:
        delta = order.notional_base * order.side.sign
        self.by_symbol[order.instrument.symbol] = (
            self.by_symbol.get(order.instrument.symbol, 0.0) + delta
        )
        self.by_sector[sector] = self.by_sector.get(sector, 0.0) + delta
        self.gross_delta += delta
        if order.side is Side.BUY:
            self.cash_used += order.notional_base
        else:
            self.cash_used -= order.notional_base


class RiskGate:
    """Every order passes through here. No exceptions, no config toggle."""

    def __init__(
        self,
        config: Config,
        *,
        clock: Clock = utc_now,
        sector_map: Mapping[str, str] | None = None,
        kill_switch: KillSwitch | None = None,
        halt_state: HaltState | None = None,
        rate_limiter: RateLimiter | None = None,
        equity_tracker: EquityTracker | None = None,
    ) -> None:
        self.config = config
        self.risk = config.risk
        self._clock = clock
        self._sector_map = dict(sector_map or {})

        self.kill_switch = kill_switch or KillSwitch(
            config.path_for(self.risk.kill_switch_file), clock=clock
        )
        self.halt_state = halt_state or HaltState(
            config.path_for(self.risk.halt_state_file), clock=clock
        )
        self.rate_limiter = rate_limiter or RateLimiter(
            config.path_for(self.risk.rate_limit_state_file),
            per_minute=self.risk.max_orders_per_minute,
            per_hour=self.risk.max_orders_per_hour,
            per_day=self.risk.max_orders_per_day,
            clock=clock,
        )
        self.equity_tracker = equity_tracker or EquityTracker(
            config.path_for(self.risk.equity_peak_file), clock=clock
        )

    # -- helpers ---------------------------------------------------------

    def sector_for(self, order: ProposedOrder) -> str:
        return self._sector_map.get(
            order.instrument.symbol, order.instrument.sector or "UNKNOWN"
        )

    def _current_symbol_value(self, snapshot: AccountSnapshot, symbol: str) -> float:
        position = snapshot.position_for(symbol)
        return position.market_value_base if position else 0.0

    def _current_sector_value(self, snapshot: AccountSnapshot, sector: str) -> float:
        total = 0.0
        for position in snapshot.positions.values():
            pos_sector = self._sector_map.get(
                position.instrument.symbol, position.instrument.sector or "UNKNOWN"
            )
            if pos_sector == sector:
                total += position.market_value_base
        return total

    # -- circuit breakers -------------------------------------------------

    def check_circuit_breakers(self, snapshot: AccountSnapshot) -> list[CheckResult]:
        """Evaluate the loss breakers and latch a halt if either is breached.

        Called on every evaluation, so a breach is detected and latched even if
        no order is ultimately submitted.
        """
        results: list[CheckResult] = []

        day_start = snapshot.effective_day_start_equity
        loss_limit = self.risk.max_daily_loss_pct * day_start
        day_pnl = snapshot.day_pnl
        daily_breached = day_start > 0 and day_pnl <= -loss_limit
        if daily_breached:
            self.halt_state.trip(
                "max_daily_loss",
                (
                    f"Daily P&L {day_pnl:,.2f} breached the "
                    f"{self.risk.max_daily_loss_pct:.2%} limit "
                    f"({-loss_limit:,.2f}) on starting equity {day_start:,.2f}. "
                    f"Configured action: {self.risk.daily_loss_action}."
                ),
                metric=day_pnl,
                limit=-loss_limit,
            )
        results.append(
            CheckResult(
                name="max_daily_loss",
                passed=not daily_breached,
                detail=(
                    f"day P&L {day_pnl:,.2f} vs limit {-loss_limit:,.2f} "
                    f"({self.risk.max_daily_loss_pct:.2%} of {day_start:,.2f})"
                ),
                metric=day_pnl,
                limit=-loss_limit,
            )
        )

        drawdown = snapshot.drawdown_pct
        dd_breached = drawdown >= self.risk.max_drawdown_pct
        if dd_breached:
            self.halt_state.trip(
                "max_drawdown",
                (
                    f"Equity drawdown {drawdown:.2%} from peak "
                    f"{snapshot.effective_peak_equity:,.2f} breached the "
                    f"{self.risk.max_drawdown_pct:.2%} limit. "
                    "Trading halted pending manual review."
                ),
                metric=drawdown,
                limit=self.risk.max_drawdown_pct,
            )
        results.append(
            CheckResult(
                name="max_drawdown",
                passed=not dd_breached,
                detail=(
                    f"drawdown {drawdown:.2%} from peak "
                    f"{snapshot.effective_peak_equity:,.2f} vs limit "
                    f"{self.risk.max_drawdown_pct:.2%}"
                ),
                metric=drawdown,
                limit=self.risk.max_drawdown_pct,
            )
        )
        return results

    # -- per-order evaluation ---------------------------------------------

    def evaluate(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        *,
        pending: _PendingEffects | None = None,
    ) -> RiskDecision:
        """Run every check against one order. Never submits, never mutates the order."""
        checks: list[CheckResult] = []
        pending = pending or _PendingEffects()
        equity = snapshot.equity

        # --- global blocks ------------------------------------------------
        killed = self.kill_switch.is_active()
        checks.append(
            CheckResult(
                "kill_switch",
                not killed,
                "kill switch is ACTIVE - all submission blocked"
                if killed
                else "kill switch clear",
            )
        )

        halt = self.halt_state.read()
        checks.append(
            CheckResult("trading_halt", not halt.halted, halt.describe())
        )

        checks.extend(self.check_circuit_breakers(snapshot))

        # A halt latched by the breakers above must block this same evaluation.
        halt_after = self.halt_state.read()
        if halt_after.halted and not halt.halted:
            checks.append(
                CheckResult(
                    "trading_halt_latched",
                    False,
                    f"circuit breaker tripped during evaluation: {halt_after.describe()}",
                )
            )

        if equity <= 0:
            checks.append(
                CheckResult(
                    "account_equity",
                    False,
                    f"account equity is {equity:,.2f}; refusing to size any trade",
                    metric=equity,
                )
            )
            return self._decide(order, checks, halt_after)
        checks.append(
            CheckResult("account_equity", True, f"equity {equity:,.2f}", metric=equity)
        )

        # --- instrument permissions --------------------------------------
        asset_class = order.instrument.asset_class
        permissioned = asset_class in self.config.account.permissioned_asset_classes
        checks.append(
            CheckResult(
                "asset_class_permissioned",
                permissioned,
                f"{asset_class} "
                + (
                    "is permissioned"
                    if permissioned
                    else "is NOT in account.permissioned_asset_classes "
                    f"{self.config.account.permissioned_asset_classes}"
                ),
            )
        )

        symbol = order.instrument.symbol
        is_core = symbol in self.config.universe.core_holdings
        core_ok = self.config.universe.trade_core_holdings or not is_core
        checks.append(
            CheckResult(
                "core_holding_protected",
                core_ok,
                f"{symbol} is a protected core holding (universe.trade_core_holdings "
                "is false)"
                if not core_ok
                else "not a protected core holding",
            )
        )

        excluded = symbol in self.config.universe.exclude_symbols
        checks.append(
            CheckResult(
                "symbol_not_excluded",
                not excluded,
                f"{symbol} is on universe.exclude_symbols" if excluded else "not excluded",
            )
        )

        # --- order shape ---------------------------------------------------
        market_ok = (
            order.order_type is not OrderType.MARKET
            or self.config.execution.allow_market_orders
        )
        checks.append(
            CheckResult(
                "order_type_allowed",
                market_ok,
                "market orders are disabled (execution.allow_market_orders=false)"
                if not market_ok
                else f"{order.order_type.value} order permitted",
            )
        )

        checks.append(self._check_limit_price_sanity(order))

        notional = order.notional_base
        min_ok = notional >= self.risk.min_order_notional
        checks.append(
            CheckResult(
                "min_order_notional",
                min_ok,
                f"notional {notional:,.2f} vs minimum {self.risk.min_order_notional:,.2f}",
                metric=notional,
                limit=self.risk.min_order_notional,
            )
        )

        # An order that strictly reduces an existing position is exempt from
        # the per-order size cap. That cap exists to stop fat-finger and
        # runaway *risk-increasing* orders; applying it to exits would make a
        # large position impossible to liquidate, which is the opposite of
        # what a risk system should do.
        reducing = self._is_reducing(order, snapshot, pending)
        max_order_value = self.risk.max_order_notional_pct * equity
        checks.append(
            CheckResult(
                "max_order_notional",
                notional <= max_order_value or reducing,
                f"notional {notional:,.2f} vs cap {max_order_value:,.2f} "
                f"({self.risk.max_order_notional_pct:.2%} of equity)"
                + (" - exempt: order reduces an existing position" if reducing else ""),
                metric=notional,
                limit=max_order_value,
            )
        )

        # --- concentration --------------------------------------------------
        checks.append(self._check_position_concentration(order, snapshot, pending, equity))
        checks.append(self._check_sector_concentration(order, snapshot, pending, equity))
        checks.extend(self._check_exposure_and_leverage(order, snapshot, pending, equity))

        # --- cash / shorting -------------------------------------------------
        checks.append(self._check_buying_power(order, snapshot, pending))
        checks.append(self._check_no_naked_short(order, snapshot, pending))

        # --- rate limiting (peek only; consumed at submission) ---------------
        status = self.rate_limiter.peek()
        checks.append(
            CheckResult(
                "order_rate_limit",
                status.allowed,
                status.describe(),
                metric=float(status.used),
                limit=float(status.limit),
            )
        )

        return self._decide(order, checks, self.halt_state.read())

    def _decide(
        self,
        order: ProposedOrder,
        checks: Sequence[CheckResult],
        halt: HaltRecord | None,
    ) -> RiskDecision:
        return RiskDecision(
            approved=all(c.passed for c in checks),
            order=order,
            checks=tuple(checks),
            evaluated_at=self._clock(),
            halt=halt,
        )

    # -- individual checks --------------------------------------------------

    def _is_reducing(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
    ) -> bool:
        """True when the order strictly shrinks an existing position.

        A trade that flips a position from long to short is not "reducing" even
        if the resulting absolute size is smaller - it opens new risk in the
        opposite direction and must face the full set of limits.
        """
        symbol = order.instrument.symbol
        current = self._current_symbol_value(snapshot, symbol) + pending.by_symbol.get(
            symbol, 0.0
        )
        if abs(current) < 1e-9:
            return False
        projected = current + order.notional_base * order.side.sign
        flipped = abs(projected) > 1e-9 and (current > 0) != (projected > 0)
        if flipped:
            return False
        return abs(projected) < abs(current)

    def _check_limit_price_sanity(self, order: ProposedOrder) -> CheckResult:
        """Reject limits priced adversely far from the reference price.

        Only *adverse* deviation counts: a buy limit below the reference or a
        sell limit above it is conservative and allowed.
        """
        if order.limit_price is None:
            return CheckResult(
                "limit_price_sanity", True, "no limit price (market order)"
            )
        reference = order.reference_price
        deviation = (order.limit_price - reference) / reference
        adverse = deviation if order.side is Side.BUY else -deviation
        tolerance = self.config.execution.max_slippage_bps / 10_000.0
        passed = adverse <= tolerance
        return CheckResult(
            "limit_price_sanity",
            passed,
            f"limit {order.limit_price:,.4f} is {adverse * 10_000:,.1f}bps adverse to "
            f"reference {reference:,.4f}; tolerance "
            f"{self.config.execution.max_slippage_bps:,.1f}bps",
            metric=adverse * 10_000,
            limit=self.config.execution.max_slippage_bps,
        )

    def _check_position_concentration(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
        equity: float,
    ) -> CheckResult:
        symbol = order.instrument.symbol
        current = self._current_symbol_value(snapshot, symbol) + pending.by_symbol.get(
            symbol, 0.0
        )
        projected = current + order.notional_base * order.side.sign
        limit_value = self.risk.max_position_pct * equity

        # Trades that shrink an already-oversized position must stay possible.
        reduces = self._is_reducing(order, snapshot, pending)
        within_cap = abs(projected) <= limit_value
        return CheckResult(
            "max_position_size",
            within_cap or reduces,
            f"{symbol} projected {projected:,.2f} "
            f"({abs(projected) / equity:.2%} of equity) vs cap {limit_value:,.2f} "
            f"({self.risk.max_position_pct:.2%})"
            + ("" if within_cap else " - exempt: order reduces the position" if reduces else ""),
            metric=abs(projected),
            limit=limit_value,
        )

    def _check_sector_concentration(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
        equity: float,
    ) -> CheckResult:
        sector = self.sector_for(order)
        current = self._current_sector_value(snapshot, sector) + pending.by_sector.get(
            sector, 0.0
        )
        projected = current + order.notional_base * order.side.sign
        limit_value = self.risk.max_sector_pct * equity
        reduces = abs(projected) < abs(current)
        passed = abs(projected) <= limit_value or reduces
        return CheckResult(
            "max_sector_concentration",
            passed,
            f"sector {sector} projected {projected:,.2f} "
            f"({abs(projected) / equity:.2%}) vs cap {limit_value:,.2f} "
            f"({self.risk.max_sector_pct:.2%})",
            metric=abs(projected),
            limit=limit_value,
        )

    def _check_exposure_and_leverage(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
        equity: float,
    ) -> list[CheckResult]:
        current_gross = snapshot.gross_exposure + pending.gross_delta
        projected_gross = current_gross + order.notional_base * order.side.sign
        projected_gross = max(projected_gross, 0.0)

        gross_limit = self.risk.max_gross_exposure_pct * equity
        gross_reduces = projected_gross < current_gross
        gross_ok = projected_gross <= gross_limit or gross_reduces

        projected_leverage = projected_gross / equity
        lev_ok = projected_leverage <= self.risk.max_leverage or gross_reduces

        return [
            CheckResult(
                "max_gross_exposure",
                gross_ok,
                f"projected gross {projected_gross:,.2f} vs cap {gross_limit:,.2f} "
                f"({self.risk.max_gross_exposure_pct:.2%} of equity)",
                metric=projected_gross,
                limit=gross_limit,
            ),
            CheckResult(
                "max_leverage",
                lev_ok,
                f"projected leverage {projected_leverage:.2f}x vs cap "
                f"{self.risk.max_leverage:.2f}x",
                metric=projected_leverage,
                limit=self.risk.max_leverage,
            ),
        ]

    def _check_buying_power(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
    ) -> CheckResult:
        if order.side is Side.SELL:
            return CheckResult("buying_power", True, "sell order consumes no cash")

        available = (
            snapshot.settled_cash
            if self.config.account.enforce_settled_cash_only
            else snapshot.cash
        ) - pending.cash_used
        required = order.notional_base
        passed = required <= available
        basis = (
            "settled cash"
            if self.config.account.enforce_settled_cash_only
            else "total cash"
        )
        return CheckResult(
            "buying_power",
            passed,
            f"requires {required:,.2f}, {basis} available {available:,.2f}"
            + (
                " (cash account: unsettled proceeds are not reusable)"
                if self.config.account.account_type == "cash"
                else ""
            ),
            metric=required,
            limit=available,
        )

    def _check_no_naked_short(
        self,
        order: ProposedOrder,
        snapshot: AccountSnapshot,
        pending: _PendingEffects,
    ) -> CheckResult:
        if order.side is Side.BUY:
            return CheckResult("no_naked_short", True, "buy order")

        position = snapshot.position_for(order.instrument.symbol)
        held = position.quantity if position else 0.0
        projected = held - order.quantity
        # A cash account cannot borrow shares; a margin account may short only
        # if leverage headroom allows, which the leverage check already covers.
        if self.config.account.account_type != "cash":
            return CheckResult(
                "no_naked_short", True, "margin account: shorting governed by leverage cap"
            )
        passed = projected >= -1e-9
        return CheckResult(
            "no_naked_short",
            passed,
            f"selling {order.quantity:,.0f} of {order.instrument.symbol} against "
            f"{held:,.0f} held would leave {projected:,.0f}; cash accounts cannot short",
            metric=projected,
            limit=0.0,
        )

    # -- batch evaluation ---------------------------------------------------

    def evaluate_batch(
        self, orders: Iterable[ProposedOrder], snapshot: AccountSnapshot
    ) -> list[RiskDecision]:
        """Evaluate orders in sequence, accumulating the effect of each approval.

        Orders are processed largest-notional-first so that a marginal small
        order cannot consume the headroom a large, higher-conviction order
        needs. Rejected orders contribute nothing to the running totals.
        """
        pending = _PendingEffects()
        decisions: list[RiskDecision] = []
        ordered = sorted(orders, key=lambda o: o.notional_base, reverse=True)
        for order in ordered:
            decision = self.evaluate(order, snapshot, pending=pending)
            if decision.approved:
                pending.apply(order, self.sector_for(order))
            decisions.append(decision)
        return decisions

    # -- submission authorisation ------------------------------------------

    def authorize_submission(
        self, order: ProposedOrder, snapshot: AccountSnapshot, *, mode: str = "paper"
    ) -> RiskClearance:
        """Final gate immediately before transmission. Consumes rate budget.

        Raises ``RiskViolation`` rather than returning a flag: a caller that
        ignores a return value must not end up sending an order anyway.
        """
        if self.kill_switch.is_active():
            raise RiskViolation(
                f"Kill switch active: {self.kill_switch.details()}. Submission refused."
            )

        halt = self.halt_state.read()
        if halt.halted:
            raise RiskViolation(f"Trading halted: {halt.describe()}. Submission refused.")

        decision = self.evaluate(order, snapshot)
        if not decision.approved:
            raise RiskViolation(
                "Risk checks failed at submission time: "
                + "; ".join(decision.blocking_reasons)
            )

        status = self.rate_limiter.consume()
        if not status.allowed:
            raise RiskViolation(f"Submission refused: {status.describe()}")

        return RiskClearance(
            clearance_id=str(uuid.uuid4()),
            order_fingerprint=order.fingerprint(),
            issued_at=self._clock(),
            mode=mode,
        )

    # -- reporting ----------------------------------------------------------

    def headroom(self, snapshot: AccountSnapshot) -> dict[str, dict[str, float]]:
        """Current usage of each limit, for the dashboard and daily summary."""
        equity = max(snapshot.equity, 1e-9)
        day_start = snapshot.effective_day_start_equity
        largest = max(
            (abs(p.market_value_base) for p in snapshot.positions.values()), default=0.0
        )
        return {
            "gross_exposure": {
                "used": snapshot.gross_exposure,
                "limit": self.risk.max_gross_exposure_pct * equity,
                "pct_of_limit": snapshot.gross_exposure
                / max(self.risk.max_gross_exposure_pct * equity, 1e-9),
            },
            "leverage": {
                "used": snapshot.leverage,
                "limit": self.risk.max_leverage,
                "pct_of_limit": snapshot.leverage / max(self.risk.max_leverage, 1e-9),
            },
            "largest_position": {
                "used": largest,
                "limit": self.risk.max_position_pct * equity,
                "pct_of_limit": largest / max(self.risk.max_position_pct * equity, 1e-9),
            },
            "daily_loss": {
                "used": -min(snapshot.day_pnl, 0.0),
                "limit": self.risk.max_daily_loss_pct * day_start,
                "pct_of_limit": (-min(snapshot.day_pnl, 0.0))
                / max(self.risk.max_daily_loss_pct * day_start, 1e-9),
            },
            "drawdown": {
                "used": snapshot.drawdown_pct,
                "limit": self.risk.max_drawdown_pct,
                "pct_of_limit": snapshot.drawdown_pct
                / max(self.risk.max_drawdown_pct, 1e-9),
            },
        }
