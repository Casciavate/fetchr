"""Structured logging of every decision the system makes.

One append-only JSONL file per installation. Each line is a self-contained
record with a UTC timestamp, an event name and a payload, so the whole history
can be replayed with ``jq`` or loaded into a DataFrame without parsing prose.

What gets recorded, per the brief: every signal generated, every risk-gate
decision with its pass/block reasons, and every order sent, filled or rejected.
Approvals and rejections live in the approval store's own audit table, which is
transactional with the decision itself.
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

logger = logging.getLogger(__name__)


class DecisionLog:
    """Append-only structured journal."""

    def __init__(self, path: str | Path, *, clock=None) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    def record(self, event: str, payload: dict[str, Any] | None = None) -> dict:
        entry = {
            "ts": self._clock().isoformat(),
            "event": event,
            **(payload or {}),
        }
        line = json.dumps(entry, default=str, sort_keys=False)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")
        return entry

    def record_signals(self, signals: Iterable) -> None:
        for signal in signals:
            self.record(
                "signal",
                {
                    "symbol": signal.symbol,
                    "action": signal.action.value,
                    "strategy": signal.strategy,
                    "strength": signal.strength,
                    "reference_price": signal.reference_price,
                    "stop_price": signal.stop_price,
                    "rationale": signal.rationale,
                },
            )

    def record_risk_decision(self, decision) -> None:
        self.record(
            "risk_decision",
            {
                "approved": decision.approved,
                "order": decision.order.canonical_payload(),
                "fingerprint": decision.order.fingerprint(),
                "blocked_by": list(decision.failed_checks),
                "reasons": list(decision.blocking_reasons),
                "checks": [
                    {"name": c.name, "passed": c.passed, "detail": c.detail}
                    for c in decision.checks
                ],
            },
        )

    def read(self, limit: int | None = None) -> list[dict]:
        if not self.path.is_file():
            return []
        lines = self.path.read_text(encoding="utf-8").splitlines()
        if limit:
            lines = lines[-limit:]
        out = []
        for line in lines:
            if not line.strip():
                continue
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return out

    def events(self, name: str, limit: int | None = None) -> list[dict]:
        return [entry for entry in self.read(limit) if entry.get("event") == name]


def configure_logging(config) -> None:
    """Console plus a rotating file handler. Called once at process start."""
    log_dir = config.path_for(config.monitoring.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, config.monitoring.log_level.upper(), logging.INFO))
    # Reconfiguring in a long-lived process must not stack duplicate handlers.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)-8s %(name)-38s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)

    rotating = logging.handlers.RotatingFileHandler(
        log_dir / "trading_bot.log", maxBytes=10_000_000, backupCount=5, encoding="utf-8"
    )
    rotating.setFormatter(formatter)
    root.addHandler(rotating)
