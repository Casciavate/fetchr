"""The proposal cycle: everything the system does without a human.

The cycle screens the universe, generates signals, sizes them, runs every one
through the risk gate, and records the survivors as proposals. Then it stops.

It has no reference to the executor and no way to submit anything - submission
is a separate, human-initiated command. That separation is the reason the
system cannot trade unattended even if this module has a bug or is called in a
loop by a scheduler.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Sequence

from .approval_layer.service import ApprovalService, Proposal
from .config.settings import Config, ConfigError
from .core.sizing import limit_price_for, size_position
from .core.types import AccountSnapshot, OrderType, ProposedOrder, Side
from .data_layer.providers import BarProvider, PriceHistory, assert_data_is_fresh
from .data_layer.universe import UniverseReport, UniverseScreener
from .risk_gate.gate import RiskDecision, RiskGate
from .signal_layer.indicators import realised_volatility
from .signal_layer.signals import Signal, SignalAction
from .signal_layer.strategies import Strategy

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CycleResult:
    ran_at: datetime
    halted: bool
    halt_reason: str = ""
    universe: UniverseReport | None = None
    signals: tuple[Signal, ...] = ()
    decisions: tuple[RiskDecision, ...] = ()
    proposals: tuple[Proposal, ...] = ()

    @property
    def pending_proposals(self) -> list[Proposal]:
        from .approval_layer.service import ProposalStatus

        return [p for p in self.proposals if p.status == ProposalStatus.PENDING]

    @property
    def blocked_decisions(self) -> list[RiskDecision]:
        return [d for d in self.decisions if not d.approved]

    def describe(self) -> str:
        if self.halted:
            return f"Cycle did not run: {self.halt_reason}"
        lines = [
            f"Cycle at {self.ran_at.isoformat()}",
            f"  universe eligible : {len(self.universe.eligible_symbols) if self.universe else 0}",
            f"  signals generated : {len(self.signals)}",
            f"  risk evaluated    : {len(self.decisions)}",
            f"  blocked by risk   : {len(self.blocked_decisions)}",
            f"  awaiting approval : {len(self.pending_proposals)}",
        ]
        for decision in self.blocked_decisions:
            lines.append(
                f"    BLOCKED {decision.order.describe()} -> "
                + "; ".join(decision.blocking_reasons)
            )
        for proposal in self.pending_proposals:
            lines.append(f"    PENDING {proposal.id[:8]}  {proposal.description}")
        if self.pending_proposals:
            lines.append("")
            lines.append(
                "  Nothing has been sent. Run `python -m trading_bot.cli review` "
                "to approve or reject."
            )
        return "\n".join(lines)


class ProposalCycle:
    """Runs the autonomous half of the system, up to (not including) execution."""

    def __init__(
        self,
        config: Config,
        provider: BarProvider,
        strategies: Sequence[Strategy],
        risk_gate: RiskGate,
        approvals: ApprovalService,
        *,
        decision_log=None,
        alerter=None,
    ) -> None:
        self.config = config
        self.provider = provider
        self.strategies = list(strategies)
        self.risk_gate = risk_gate
        self.approvals = approvals
        self.decision_log = decision_log
        self.alerter = alerter

    # -- main entry point ---------------------------------------------------

    def run(
        self,
        snapshot: AccountSnapshot,
        *,
        as_of: datetime | None = None,
        check_freshness: bool = True,
    ) -> CycleResult:
        now = as_of or datetime.now(timezone.utc)

        # 1. Refuse to do anything while blocked. Checked first so a halted
        #    system does not even burn data-provider quota.
        if self.risk_gate.kill_switch.is_active():
            return self._halted("kill switch is active", now)

        halt = self.risk_gate.halt_state.read()
        if halt.halted:
            return self._halted(halt.describe(), now)

        # Evaluate the loss breakers against the current snapshot, so a breach
        # latches even on a cycle that ends up proposing nothing.
        breaker_results = self.risk_gate.check_circuit_breakers(snapshot)
        tripped = [c for c in breaker_results if not c.passed]
        if tripped:
            reason = "; ".join(c.detail for c in tripped)
            self._alert("circuit_breaker", f"Circuit breaker tripped: {reason}")
            return self._halted(f"circuit breaker tripped: {reason}", now)

        candidates = list(self.config.universe.candidates)
        if not candidates:
            raise ConfigError(
                "universe.candidates is empty, so there is nothing to screen. "
                "Populate it with contracts you have verified against the "
                "account's trading permissions and market-data subscriptions."
            )

        # 2. Data.
        lookback = max(
            [s.min_history() for s in self.strategies]
            + [self.config.universe.min_history_days]
        ) + 10
        history: PriceHistory = self.provider.history(
            candidates, end=now, lookback_days=lookback
        )
        if not history:
            raise RuntimeError(
                f"No price history returned for any of {len(candidates)} candidates."
            )
        if check_freshness:
            assert_data_is_fresh(history, as_of=now)

        # 3. Screen.
        screener = UniverseScreener(
            self.config,
            instruments={
                s: self.config.instrument_for(s)
                for s in history
                if s in self.config.universe.instruments
            },
            fx_rates=self.config.account.fx_rates,
        )
        universe = screener.screen(history)
        eligible = {s: history[s] for s in universe.eligible_symbols if s in history}
        self._record("universe_screened", universe.to_dict())

        # 4. Signals. Exits are generated over everything held, not just what
        #    is currently eligible - an instrument that fell out of the
        #    universe still needs to be exitable.
        held = set(snapshot.positions)
        exit_scope = {s: history[s] for s in history if s in held}
        signal_input = {**eligible, **exit_scope}

        signals: list[Signal] = []
        for strategy in self.strategies:
            produced = strategy.generate(signal_input, as_of=now)
            logger.info("%s produced %d signal(s)", strategy.name, len(produced))
            signals.extend(produced)
        if self.decision_log is not None:
            self.decision_log.record_signals(signals)

        # 5. Turn signals into sized orders.
        orders = self._build_orders(signals, snapshot, history, eligible)

        # 6. Risk, evaluated as a batch so the orders cannot collectively
        #    breach a portfolio limit that none of them breaches alone.
        decisions = self.risk_gate.evaluate_batch(orders, snapshot)
        for decision in decisions:
            if self.decision_log is not None:
                self.decision_log.record_risk_decision(decision)
            if not decision.approved:
                self._alert(
                    "risk_block",
                    f"Blocked {decision.order.describe()}: "
                    + "; ".join(decision.blocking_reasons),
                )

        # 7. Record proposals and stop. No submission happens here, ever.
        proposals = self.approvals.propose_all(
            (decision.order, decision) for decision in decisions
        )

        return CycleResult(
            ran_at=now,
            halted=False,
            universe=universe,
            signals=tuple(signals),
            decisions=tuple(decisions),
            proposals=tuple(proposals),
        )

    # -- order construction --------------------------------------------------

    def _build_orders(
        self,
        signals: Sequence[Signal],
        snapshot: AccountSnapshot,
        history: PriceHistory,
        eligible: PriceHistory,
    ) -> list[ProposedOrder]:
        orders: list[ProposedOrder] = []
        seen: set[str] = set()

        # Exits first: they free capital and reduce risk, so they should never
        # be crowded out by entries competing for the same limits.
        for signal in signals:
            if signal.action is not SignalAction.EXIT_LONG:
                continue
            position = snapshot.position_for(signal.symbol)
            if position is None or position.quantity <= 0:
                continue
            if signal.symbol in seen:
                continue
            order = self._order_from(signal, quantity=position.quantity, side=Side.SELL)
            if order is not None:
                orders.append(order)
                seen.add(signal.symbol)

        open_slots = self.config.portfolio.max_open_positions - len(snapshot.positions)
        entries = sorted(
            (
                s
                for s in signals
                if s.action is SignalAction.ENTER_LONG
                and s.symbol not in seen
                and s.symbol not in snapshot.positions
                and s.symbol in eligible
            ),
            key=lambda s: s.strength,
            reverse=True,
        )

        for signal in entries[: max(open_slots, 0)]:
            frame = history.get(signal.symbol)
            if frame is None:
                continue
            try:
                fx = self.config.fx_rate(self.config.instrument_for(signal.symbol).currency)
            except ConfigError as exc:
                logger.warning("Skipping %s: %s", signal.symbol, exc)
                continue

            vol = realised_volatility(frame["close"], 20).dropna()
            sized = size_position(
                price=signal.reference_price,
                fx_rate_to_base=fx,
                equity=snapshot.equity,
                sleeve_pct=self.config.portfolio.sleeve_pct_of_equity,
                max_positions=self.config.portfolio.max_open_positions,
                max_position_pct=self.config.risk.max_position_pct,
                target_volatility=self.config.portfolio.target_position_volatility,
                realised_volatility=float(vol.iloc[-1]) if len(vol) else None,
            )
            if not sized.is_tradeable:
                logger.info("Not sizing %s: %s", signal.symbol, sized.rationale)
                continue
            order = self._order_from(
                signal, quantity=sized.quantity, side=Side.BUY, rationale=sized.rationale
            )
            if order is not None:
                orders.append(order)
                seen.add(signal.symbol)

        return orders

    def _order_from(
        self,
        signal: Signal,
        *,
        quantity: float,
        side: Side,
        rationale: str = "",
    ) -> ProposedOrder | None:
        try:
            instrument = self.config.instrument_for(signal.symbol)
            fx = self.config.fx_rate(instrument.currency)
        except ConfigError as exc:
            logger.warning("Cannot build an order for %s: %s", signal.symbol, exc)
            return None

        if quantity <= 0:
            return None

        limit = limit_price_for(
            reference_price=signal.reference_price,
            side_is_buy=side is Side.BUY,
            offset_bps=self.config.execution.limit_offset_bps,
        )
        return ProposedOrder(
            instrument=instrument,
            side=side,
            quantity=quantity,
            limit_price=limit,
            order_type=OrderType.LIMIT,
            strategy=signal.strategy,
            fx_rate_to_base=fx,
            reference_price=signal.reference_price,
            reason=f"{signal.rationale} | {rationale}".strip(" |"),
        )

    # -- plumbing ------------------------------------------------------------

    def _halted(self, reason: str, now: datetime) -> CycleResult:
        logger.warning("Cycle aborted: %s", reason)
        self._record("cycle_halted", {"reason": reason})
        return CycleResult(ran_at=now, halted=True, halt_reason=reason)

    def _record(self, event: str, payload: dict) -> None:
        if self.decision_log is not None:
            self.decision_log.record(event, payload)

    def _alert(self, kind: str, message: str) -> None:
        if self.alerter is not None:
            self.alerter.send(kind, message)
