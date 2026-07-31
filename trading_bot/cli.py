"""Operator command line.

    python -m trading_bot.cli doctor      configuration and safety self-check
    python -m trading_bot.cli status      dashboard: positions, P&L, headroom
    python -m trading_bot.cli propose     run one cycle, record proposals, stop
    python -m trading_bot.cli review      approve or reject pending proposals
    python -m trading_bot.cli submit      send an approved order to IBKR
    python -m trading_bot.cli kill        activate the kill switch
    python -m trading_bot.cli unkill      clear the kill switch
    python -m trading_bot.cli resume      clear a latched circuit-breaker halt
    python -m trading_bot.cli backtest    run the backtest and print the report
    python -m trading_bot.cli summary     write and print the daily summary
    python -m trading_bot.cli audit       show the decision and approval trail

``review`` is the only command that records an approval, and ``submit`` is the
only command that transmits. Both require a human to run them; neither is
callable from strategy code.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .approval_layer.service import ApprovalService
from .approval_layer.tokens import ApprovalError
from .backtest_engine.engine import BacktestEngine
from .config.mode import TradingMode, describe_mode_requirements, resolve_trading_mode
from .config.settings import Config, ConfigError, load_config
from .core.types import AccountSnapshot
from .data_layer.providers import CsvBarProvider, InMemoryBarProvider
from .data_layer.synthetic import sample_universe
from .execution_layer.broker import BrokerError, IBKRBroker
from .execution_layer.executor import IBKRExecutor
from .execution_layer.fake_broker import FakeBroker
from .monitoring.alerts import build_alerter
from .monitoring.dashboard import (
    build_daily_summary,
    render_dashboard,
    render_daily_summary,
    write_daily_summary,
)
from .monitoring.journal import DecisionLog, configure_logging
from .risk_gate.gate import RiskGate, RiskViolation
from .signal_layer.strategies import build_enabled_strategies


# ---------------------------------------------------------------------------
# Wiring
# ---------------------------------------------------------------------------


def _context(args) -> tuple[Config, TradingMode, RiskGate, ApprovalService, DecisionLog]:
    config = load_config(args.config)
    configure_logging(config)
    mode = resolve_trading_mode()
    risk_gate = RiskGate(config, sector_map=config.sector_map())
    approvals = ApprovalService(config)
    journal = DecisionLog(config.path_for(config.monitoring.structured_log_file))
    return config, mode, risk_gate, approvals, journal


def _banner(mode: TradingMode) -> str:
    if mode is TradingMode.LIVE:
        return (
            "\n" + "!" * 70 + "\n"
            "  LIVE TRADING MODE - orders will reach a real money account.\n"
            + "!" * 70 + "\n"
        )
    return "\n[paper mode] Orders route to the IBKR paper account only.\n"


def _snapshot(config: Config, mode: TradingMode, *, offline: bool) -> tuple[AccountSnapshot, object]:
    """Fetch account state from IBKR, or synthesise it when offline."""
    if offline:
        snapshot = AccountSnapshot(
            timestamp=datetime.now(timezone.utc),
            base_currency=config.account.base_currency,
            equity=config.account.starting_equity,
            cash=config.account.starting_cash,
            settled_cash=config.account.starting_cash,
            positions={},
            account_type=config.account.account_type,
        )
        return snapshot, FakeBroker(snapshot)

    broker = IBKRBroker(config, mode)
    broker.connect()
    return broker.account_snapshot(), broker


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_doctor(args) -> int:
    """Check the configuration and every safety control without trading."""
    problems: list[str] = []
    try:
        config = load_config(args.config)
    except ConfigError as exc:
        print(f"FAIL  config: {exc}")
        return 1

    print(f"OK    config loaded from {config.source_path}")
    print(f"      checksum {config.checksum[:16]}")

    mode = resolve_trading_mode()
    print(f"{'WARN ' if mode is TradingMode.LIVE else 'OK   '} trading mode: {mode.value}")
    if mode is TradingMode.PAPER:
        print("      " + describe_mode_requirements().replace("\n", "\n      "))

    risk_gate = RiskGate(config, sector_map=config.sector_map())
    print(f"OK    kill switch file: {risk_gate.kill_switch.path}")
    print(f"      active: {risk_gate.kill_switch.is_active()}")
    halt = risk_gate.halt_state.read()
    print(f"OK    halt state: {halt.describe()}")

    print("      risk limits:")
    for field_name in (
        "max_position_pct",
        "max_sector_pct",
        "max_gross_exposure_pct",
        "max_leverage",
        "max_daily_loss_pct",
        "max_drawdown_pct",
        "max_orders_per_minute",
        "max_orders_per_day",
    ):
        print(f"        {field_name:<26}{getattr(config.risk, field_name)}")

    approvals = ApprovalService(config)
    print(f"OK    approval store: {approvals.path}")
    print(f"      proposals by status: {approvals.counts() or '{}'}")

    strategies = build_enabled_strategies(config)
    print(f"OK    enabled strategies: {[s.name for s in strategies]}")

    if not config.universe.candidates:
        problems.append(
            "universe.candidates is empty - `propose` will refuse to run until "
            "you define the tradeable universe."
        )
    missing_meta = [
        s for s in config.universe.candidates if s not in config.universe.instruments
    ]
    if missing_meta:
        problems.append(f"missing universe.instruments metadata for: {missing_meta}")

    try:
        import ib_async  # noqa: F401

        print("OK    ib_async is installed")
    except ImportError:
        problems.append(
            "ib_async is not installed - required only to connect to IBKR "
            "(`pip install ib_async`). Backtests and tests run without it."
        )

    print()
    if problems:
        for problem in problems:
            print(f"TODO  {problem}")
        return 1
    print("All checks passed.")
    return 0


def cmd_status(args) -> int:
    config, mode, risk_gate, approvals, _ = _context(args)
    print(_banner(mode))
    snapshot, broker = _snapshot(config, mode, offline=args.offline)
    snapshot = risk_gate.equity_tracker.enrich(snapshot)

    executor = None
    if not args.offline:
        executor = IBKRExecutor(config, broker, risk_gate, approvals, mode=mode)
        executor.refresh_order_state()

    print(
        render_dashboard(
            snapshot, risk_gate, approvals=approvals, executor=executor, mode=mode.value
        )
    )
    if not args.offline:
        broker.disconnect()
    return 0


def cmd_propose(args) -> int:
    from .cycle import ProposalCycle

    config, mode, risk_gate, approvals, journal = _context(args)
    print(_banner(mode))
    alerter = build_alerter(config)

    snapshot, broker = _snapshot(config, mode, offline=args.offline)
    snapshot = risk_gate.equity_tracker.enrich(snapshot)

    if args.data_dir:
        provider = CsvBarProvider(args.data_dir)
    else:
        provider = InMemoryBarProvider(sample_universe())
        print(
            "WARNING: no --data-dir given, so this cycle is running on SYNTHETIC "
            "data. Its proposals are meaningless. Point --data-dir at real "
            "history before acting on anything below.\n"
        )

    cycle = ProposalCycle(
        config,
        provider,
        build_enabled_strategies(config),
        risk_gate,
        approvals,
        decision_log=journal,
        alerter=alerter,
    )
    result = cycle.run(snapshot, check_freshness=not args.allow_stale)
    print(result.describe())

    if not args.offline:
        broker.disconnect()
    return 0


def cmd_review(args) -> int:
    """Present each pending proposal and record an explicit human decision."""
    config, mode, risk_gate, approvals, journal = _context(args)
    print(_banner(mode))

    pending = approvals.pending()
    if not pending:
        print("No proposals are awaiting approval.")
        return 0

    operator = args.operator
    if not operator:
        print("--operator is required: approvals must be attributable to a person.")
        return 2

    approved_tokens: list[str] = []
    for row in pending:
        risk = json.loads(row["risk_payload"])
        print("=" * 70)
        print(f"Proposal {row['id']}")
        print(f"  {row['description']}")
        print(f"  created {row['created_at']}   expires {row['expires_at']}")
        print("  risk checks:")
        for check in risk.get("checks", []):
            mark = "pass" if check["passed"] else "BLOCK"
            print(f"    [{mark:>5}] {check['name']}: {check['detail']}")
        print("=" * 70)

        answer = input("  approve / reject / skip ? ").strip().lower()
        if answer in {"a", "approve", "y", "yes"}:
            note = input("  note (why): ").strip()
            token = approvals.approve(row["id"], operator, note)
            approved_tokens.append(token.token_id)
            print(f"  APPROVED. Token {token.token_id} (expires {token.expires_at.isoformat()})")
            print(f"  Submit with: python -m trading_bot.cli submit --token {token.token_id}")
        elif answer in {"r", "reject", "n", "no"}:
            note = input("  note (why): ").strip()
            approvals.reject(row["id"], operator, note)
            print("  REJECTED.")
        else:
            print("  skipped (still pending)")
        print()

    print(f"{len(approved_tokens)} approval(s) issued. Nothing has been sent yet.")
    return 0


def cmd_submit(args) -> int:
    """Transmit one approved order. The only command that reaches the broker."""
    config, mode, risk_gate, approvals, journal = _context(args)
    print(_banner(mode))

    try:
        token = approvals.load_token(args.token)
        order = approvals.rebuild_order(token.proposal_id)
    except ApprovalError as exc:
        print(f"Refused: {exc}")
        return 1

    print(f"About to submit: {order.describe()}")
    print(f"  approved by {token.approver} at {token.issued_at.isoformat()}")

    if not args.yes:
        confirmation = input("Type the symbol to confirm: ").strip()
        if confirmation != order.instrument.symbol:
            print("Confirmation did not match. Nothing sent.")
            return 1

    snapshot, broker = _snapshot(config, mode, offline=args.offline)
    snapshot = risk_gate.equity_tracker.enrich(snapshot)
    if args.offline:
        broker.connect()

    executor = IBKRExecutor(
        config,
        broker,
        risk_gate,
        approvals,
        mode=mode,
        alerter=build_alerter(config),
        decision_log=journal,
    )
    try:
        tracked = executor.submit(order, token, snapshot)
    except (RiskViolation, ApprovalError, BrokerError) as exc:
        print(f"NOT SENT: {exc}")
        return 1
    finally:
        if not args.offline:
            broker.disconnect()

    print(
        f"Sent. broker_order_id={tracked.ack.broker_order_id} "
        f"status={tracked.status.value} filled={tracked.ack.filled_quantity:,.0f}"
    )
    return 0


def cmd_kill(args) -> int:
    config, _, risk_gate, approvals, journal = _context(args)
    risk_gate.kill_switch.activate(args.reason, actor=args.operator or "cli")
    journal.record("kill_switch_activated", {"reason": args.reason, "actor": args.operator})
    build_alerter(config).send("kill_switch", f"Kill switch ACTIVATED: {args.reason}")
    print(f"Kill switch ACTIVE at {risk_gate.kill_switch.path}")
    print("All order submission is now blocked.")

    if not args.offline:
        try:
            broker = IBKRBroker(config, resolve_trading_mode())
            broker.connect()
            executor = IBKRExecutor(config, broker, risk_gate, approvals)
            cancelled = executor.enforce_kill_switch()
            print(f"Cancelled {cancelled} working order(s) at the broker.")
            broker.disconnect()
        except BrokerError as exc:
            print(f"Could not reach IBKR to cancel working orders: {exc}")
            print("The submission block is still in force.")
            return 1
    return 0


def cmd_unkill(args) -> int:
    _, _, risk_gate, _, journal = _context(args)
    if not risk_gate.kill_switch.is_active():
        print("Kill switch is not active.")
        return 0
    record = risk_gate.kill_switch.deactivate(actor=args.operator or "cli")
    journal.record("kill_switch_cleared", record)
    print(f"Kill switch cleared. It had been active since {record.get('activated_at')}.")
    return 0


def cmd_resume(args) -> int:
    _, _, risk_gate, _, journal = _context(args)
    halt = risk_gate.halt_state.read()
    if not halt.halted:
        print("Trading is not halted.")
        return 0
    print(f"Currently: {halt.describe()}")
    risk_gate.halt_state.clear(args.operator, args.note)
    journal.record(
        "halt_cleared",
        {"operator": args.operator, "note": args.note, "previous_breaker": halt.breaker},
    )
    print("Halt cleared. Proposals will run again on the next cycle.")
    return 0


def cmd_backtest(args) -> int:
    config = load_config(args.config)
    configure_logging(config)

    if args.data_dir:
        provider = CsvBarProvider(args.data_dir)
        symbols = provider.available_symbols()
        history = provider.history(symbols, lookback_days=args.lookback)
    else:
        print(
            "No --data-dir given: running on SYNTHETIC data purely to exercise "
            "the engine. The numbers below are not evidence of anything.\n"
        )
        history = sample_universe(args.lookback)

    engine = BacktestEngine(
        config,
        build_enabled_strategies(config),
        initial_capital=args.capital or config.account.starting_equity,
        benchmark_symbol=args.benchmark,
    )
    report = engine.run(history)
    print(report.render())

    if args.out:
        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report.summary(), indent=2, default=str), encoding="utf-8")
        print(f"\nSummary written to {path}")
    return 0


def cmd_summary(args) -> int:
    config, mode, risk_gate, approvals, journal = _context(args)
    snapshot, broker = _snapshot(config, mode, offline=args.offline)
    snapshot = risk_gate.equity_tracker.enrich(snapshot)

    summary = build_daily_summary(
        snapshot, risk_gate, approvals=approvals, decision_log=journal
    )
    path = write_daily_summary(summary, config.path_for(config.monitoring.daily_summary_file))
    print(render_daily_summary(summary))
    print(f"\nAppended to {path}")

    if summary["halted"] or summary["kill_switch_active"]:
        build_alerter(config).send(
            "circuit_breaker",
            f"Daily summary: halted={summary['halted']} "
            f"kill_switch={summary['kill_switch_active']}",
        )
    if not args.offline:
        broker.disconnect()
    return 0


def cmd_audit(args) -> int:
    config, _, _, approvals, journal = _context(args)
    print("--- approval trail (most recent first) ---")
    for row in approvals.audit_trail(args.limit):
        print(f"  {row['at']}  {row['event']:<16} {row['actor'] or '-':<12} {row['detail']}")

    print("\n--- decision journal (most recent) ---")
    for entry in journal.read(args.limit)[-args.limit:]:
        print(f"  {entry.get('ts')}  {entry.get('event')}")
    return 0


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="trading_bot",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--config", help="path to a config YAML (defaults to the shipped one)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add(name, handler, help_text, *, offline=True):
        sub = subparsers.add_parser(name, help=help_text)
        sub.set_defaults(func=handler)
        if offline:
            sub.add_argument(
                "--offline",
                action="store_true",
                help="do not connect to IBKR; use configured account values",
            )
        return sub

    add("doctor", cmd_doctor, "check configuration and safety controls", offline=False)
    add("status", cmd_status, "show the dashboard")

    propose = add("propose", cmd_propose, "run one cycle and record proposals")
    propose.add_argument("--data-dir", help="directory of <SYMBOL>.csv daily history")
    propose.add_argument(
        "--allow-stale", action="store_true", help="proceed despite stale price data"
    )

    review = add("review", cmd_review, "approve or reject pending proposals", offline=False)
    review.add_argument("--operator", required=True, help="name of the human deciding")

    submit = add("submit", cmd_submit, "send one approved order to IBKR")
    submit.add_argument("--token", required=True, help="approval token id from `review`")
    submit.add_argument("--yes", action="store_true", help="skip the typed confirmation")

    kill = add("kill", cmd_kill, "activate the kill switch and cancel working orders")
    kill.add_argument("--reason", required=True)
    kill.add_argument("--operator")

    unkill = add("unkill", cmd_unkill, "clear the kill switch", offline=False)
    unkill.add_argument("--operator")

    resume = add("resume", cmd_resume, "clear a latched circuit-breaker halt", offline=False)
    resume.add_argument("--operator", required=True)
    resume.add_argument("--note", required=True, help="why it is safe to resume")

    backtest = add("backtest", cmd_backtest, "run a backtest", offline=False)
    backtest.add_argument("--data-dir", help="directory of <SYMBOL>.csv daily history")
    backtest.add_argument("--benchmark", help="symbol to buy and hold as the benchmark")
    backtest.add_argument("--capital", type=float, help="starting capital")
    backtest.add_argument("--lookback", type=int, default=1500, help="bars of history to use")
    backtest.add_argument("--out", help="write the summary JSON here")

    add("summary", cmd_summary, "write and print the daily summary")

    audit = add("audit", cmd_audit, "show the decision and approval trail", offline=False)
    audit.add_argument("--limit", type=int, default=40)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "offline"):
        args.offline = True
    try:
        return args.func(args)
    except (ConfigError, ApprovalError, BrokerError, RiskViolation) as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nInterrupted. Nothing was sent.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
