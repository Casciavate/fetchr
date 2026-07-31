"""Text dashboard and daily summary.

Deliberately a terminal view rather than a web app: it has no server, no port
to leave open, and it renders the three things that actually matter before you
approve anything - what you hold, what today has cost you, and how much room is
left under each risk limit.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from ..core.types import AccountSnapshot


def _bar(fraction: float, width: int = 24) -> str:
    """Render a usage bar. Over-limit shows as a full bar marked with '!'."""
    fraction = max(0.0, fraction)
    filled = min(width, int(round(fraction * width)))
    marker = "!" if fraction > 1.0 else " "
    return f"[{'#' * filled}{'.' * (width - filled)}]{marker}"


def render_dashboard(
    snapshot: AccountSnapshot,
    risk_gate,
    *,
    approvals=None,
    executor=None,
    mode: str = "paper",
) -> str:
    lines: list[str] = []
    add = lines.append

    halt = risk_gate.halt_state.read()
    killed = risk_gate.kill_switch.is_active()

    add("=" * 74)
    add(f"  TRADING DASHBOARD   mode={mode.upper()}   {snapshot.timestamp.isoformat()}")
    add("=" * 74)

    if killed:
        add("  *** KILL SWITCH ACTIVE - all order submission is blocked ***")
    if halt.halted:
        add(f"  *** {halt.describe()} ***")
        add("      Clear with: python -m trading_bot.cli resume --operator <name> --note <why>")
    if not killed and not halt.halted:
        add("  Status: trading enabled (proposals still require human approval)")
    add("-" * 74)

    # --- account ---------------------------------------------------------
    add("ACCOUNT")
    add(f"  Equity (net liq)   {snapshot.equity:>16,.2f} {snapshot.base_currency}")
    add(f"  Cash               {snapshot.cash:>16,.2f}   (settled {snapshot.settled_cash:,.2f})")
    add(f"  Gross exposure     {snapshot.gross_exposure:>16,.2f}")
    add(f"  Leverage           {snapshot.leverage:>16.2f}x")
    add(f"  Day P&L            {snapshot.day_pnl:>16,.2f}")
    add(f"  Unrealized P&L     {snapshot.unrealized_pnl:>16,.2f}")
    add(f"  Drawdown from peak {snapshot.drawdown_pct:>15.2%}   (peak {snapshot.effective_peak_equity:,.2f})")
    add("-" * 74)

    # --- positions -------------------------------------------------------
    add(f"POSITIONS ({len(snapshot.positions)})")
    if not snapshot.positions:
        add("  (none)")
    else:
        add(f"  {'SYMBOL':<10}{'QTY':>12}{'PRICE':>12}{'VALUE':>16}{'UNREAL P&L':>14}")
        for symbol, position in sorted(snapshot.positions.items()):
            add(
                f"  {symbol:<10}{position.quantity:>12,.0f}{position.market_price:>12,.4f}"
                f"{position.market_value_base:>16,.2f}{position.unrealized_pnl_base:>14,.2f}"
            )
    add("-" * 74)

    # --- risk headroom ---------------------------------------------------
    add("RISK LIMIT HEADROOM")
    for name, values in risk_gate.headroom(snapshot).items():
        fraction = values["pct_of_limit"]
        add(
            f"  {name:<18}{_bar(fraction)} {fraction:>7.1%} of limit"
            f"   ({values['used']:,.2f} / {values['limit']:,.2f})"
        )

    usage = risk_gate.rate_limiter.usage()
    add(
        "  order rate        "
        + ", ".join(f"{w}: {v['used']}/{v['limit']}" for w, v in usage.items())
    )
    add("-" * 74)

    # --- pending approvals ------------------------------------------------
    if approvals is not None:
        pending = approvals.pending()
        add(f"AWAITING YOUR APPROVAL ({len(pending)})")
        if not pending:
            add("  (none)")
        for row in pending:
            add(f"  {row['id'][:8]}  {row['description']}")
            add(f"            expires {row['expires_at']}")
        add("-" * 74)

    # --- working orders ----------------------------------------------------
    if executor is not None:
        working = executor.working_orders()
        add(f"WORKING ORDERS ({len(working)})")
        if not working:
            add("  (none)")
        for tracked in working:
            add(
                f"  #{tracked.ack.broker_order_id:<6} {tracked.order.describe()} "
                f"-> {tracked.status.value} "
                f"(filled {tracked.ack.filled_quantity:,.0f})"
            )
        add("-" * 74)

    add("Nothing here is sent to IBKR without an explicit human approval.")
    add("=" * 74)
    return "\n".join(lines)


def build_daily_summary(
    snapshot: AccountSnapshot,
    risk_gate,
    *,
    approvals=None,
    decision_log=None,
) -> dict:
    """Machine-readable end-of-day record, appended to the summary JSONL."""
    halt = risk_gate.halt_state.read()
    journal_events: dict[str, int] = {}
    if decision_log is not None:
        for entry in decision_log.read():
            name = entry.get("event", "unknown")
            journal_events[name] = journal_events.get(name, 0) + 1

    return {
        "date": snapshot.timestamp.date().isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "equity": snapshot.equity,
        "cash": snapshot.cash,
        "base_currency": snapshot.base_currency,
        "day_pnl": snapshot.day_pnl,
        "unrealized_pnl": snapshot.unrealized_pnl,
        "gross_exposure": snapshot.gross_exposure,
        "leverage": snapshot.leverage,
        "drawdown_pct": snapshot.drawdown_pct,
        "position_count": len(snapshot.positions),
        "positions": {
            symbol: {
                "quantity": p.quantity,
                "market_value_base": p.market_value_base,
                "unrealized_pnl_base": p.unrealized_pnl_base,
            }
            for symbol, p in snapshot.positions.items()
        },
        "risk_headroom": risk_gate.headroom(snapshot),
        "order_rate_usage": risk_gate.rate_limiter.usage(),
        "kill_switch_active": risk_gate.kill_switch.is_active(),
        "halted": halt.halted,
        "halt_reason": halt.reason,
        "halt_breaker": halt.breaker,
        "approval_counts": approvals.counts() if approvals is not None else {},
        "journal_event_counts": journal_events,
    }


def write_daily_summary(summary: dict, path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(summary, default=str) + "\n")
    return target


def render_daily_summary(summary: dict) -> str:
    lines = [
        "=" * 66,
        f"  DAILY SUMMARY  {summary['date']}",
        "=" * 66,
        f"  Equity          {summary['equity']:>16,.2f} {summary['base_currency']}",
        f"  Day P&L         {summary['day_pnl']:>16,.2f}",
        f"  Unrealized P&L  {summary['unrealized_pnl']:>16,.2f}",
        f"  Positions       {summary['position_count']:>16}",
        f"  Leverage        {summary['leverage']:>16.2f}x",
        f"  Drawdown        {summary['drawdown_pct']:>15.2%}",
        "-" * 66,
        f"  Kill switch     {'ACTIVE' if summary['kill_switch_active'] else 'clear'}",
        f"  Halted          {'YES - ' + summary['halt_breaker'] if summary['halted'] else 'no'}",
    ]
    if summary["halted"]:
        lines.append(f"  Reason          {summary['halt_reason']}")
    approvals = summary.get("approval_counts") or {}
    if approvals:
        lines.append("-" * 66)
        lines.append("  Proposals: " + ", ".join(f"{k}={v}" for k, v in sorted(approvals.items())))
    lines.append("=" * 66)
    return "\n".join(lines)
