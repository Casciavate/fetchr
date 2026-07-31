"""Durable risk state: kill switch, latching halts, rate limiting, equity peak.

Everything here persists to disk. That is the point: a circuit breaker that
forgets it tripped when the process restarts is not a circuit breaker. A
runaway loop that restarts to clear its rate-limit budget is not rate limited.

File writes use an exclusive ``flock`` and a write-to-temp-then-rename, so two
processes racing on the same state file cannot interleave a partial write.
"""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterator

Clock = Callable[[], datetime]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@contextmanager
def _locked(path: Path) -> Iterator[None]:
    """Hold an exclusive advisory lock keyed on ``path`` for the block."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(path.suffix + ".lock")
    with open(lock_path, "w", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except (OSError, json.JSONDecodeError):
        # A corrupt state file must never be read as "no halt". Callers treat
        # an unreadable halt file as halted (fail closed) - see HaltState.
        return {"__unreadable__": True}


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, default=str)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


# ---------------------------------------------------------------------------
# Kill switch
# ---------------------------------------------------------------------------


class KillSwitch:
    """A single file whose existence blocks every order submission.

    Deliberately the crudest mechanism in the system: an operator can trip it
    with ``touch state/KILL_SWITCH`` from any shell, with no Python, no imports
    and no running process. ``is_active`` does one stat call, so it is cheap
    enough to check on every single order.
    """

    def __init__(self, path: str | Path, clock: Clock = utc_now) -> None:
        self.path = Path(path)
        self._clock = clock

    def is_active(self) -> bool:
        return self.path.exists()

    def activate(self, reason: str, actor: str = "unknown") -> None:
        payload = {
            "reason": reason,
            "actor": actor,
            "activated_at": self._clock().isoformat(),
        }
        with _locked(self.path):
            _write_json(self.path, payload)

    def deactivate(self, actor: str = "unknown") -> dict[str, Any]:
        """Remove the kill switch. Returns the record that was cleared."""
        with _locked(self.path):
            record = _read_json(self.path)
            self.path.unlink(missing_ok=True)
        record["deactivated_by"] = actor
        record["deactivated_at"] = self._clock().isoformat()
        return record

    def details(self) -> dict[str, Any]:
        return _read_json(self.path) if self.is_active() else {}


# ---------------------------------------------------------------------------
# Latching circuit-breaker halt
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class HaltRecord:
    halted: bool
    breaker: str = ""
    reason: str = ""
    tripped_at: str = ""
    metric: float | None = None
    limit: float | None = None

    def describe(self) -> str:
        if not self.halted:
            return "not halted"
        return f"HALTED by {self.breaker} at {self.tripped_at}: {self.reason}"


class HaltState:
    """Latching halt. Once tripped it stays tripped until a human clears it.

    There is intentionally no automatic expiry and no ``clear`` call anywhere
    in the strategy or execution path. Re-enabling trading after a breaker trip
    is an operator action (``python -m trading_bot.cli resume``), which is
    recorded with the operator's name and a free-text note.
    """

    def __init__(self, path: str | Path, clock: Clock = utc_now) -> None:
        self.path = Path(path)
        self._clock = clock

    def read(self) -> HaltRecord:
        data = _read_json(self.path)
        if data.get("__unreadable__"):
            # Fail closed: an unreadable halt file is treated as halted.
            return HaltRecord(
                halted=True,
                breaker="state_corruption",
                reason=f"Halt state file {self.path} is unreadable; failing closed.",
            )
        if not data:
            return HaltRecord(halted=False)
        return HaltRecord(
            halted=bool(data.get("halted", False)),
            breaker=str(data.get("breaker", "")),
            reason=str(data.get("reason", "")),
            tripped_at=str(data.get("tripped_at", "")),
            metric=data.get("metric"),
            limit=data.get("limit"),
        )

    def is_halted(self) -> bool:
        return self.read().halted

    def trip(
        self,
        breaker: str,
        reason: str,
        *,
        metric: float | None = None,
        limit: float | None = None,
    ) -> HaltRecord:
        """Latch a halt. Idempotent: the first trip's details are preserved."""
        with _locked(self.path):
            existing = self.read()
            if existing.halted:
                return existing
            record = HaltRecord(
                halted=True,
                breaker=breaker,
                reason=reason,
                tripped_at=self._clock().isoformat(),
                metric=metric,
                limit=limit,
            )
            _write_json(
                self.path,
                {
                    "halted": True,
                    "breaker": record.breaker,
                    "reason": record.reason,
                    "tripped_at": record.tripped_at,
                    "metric": record.metric,
                    "limit": record.limit,
                    "requires_manual_reset": True,
                },
            )
            return record

    def clear(self, actor: str, note: str) -> None:
        """Operator-only reset. ``actor`` and ``note`` are mandatory."""
        if not actor.strip():
            raise ValueError("Clearing a halt requires an identified operator.")
        if not note.strip():
            raise ValueError("Clearing a halt requires a note explaining why.")
        with _locked(self.path):
            previous = self.read()
            _write_json(
                self.path,
                {
                    "halted": False,
                    "cleared_by": actor,
                    "cleared_at": self._clock().isoformat(),
                    "note": note,
                    "previous": {
                        "breaker": previous.breaker,
                        "reason": previous.reason,
                        "tripped_at": previous.tripped_at,
                    },
                },
            )


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class RateLimitStatus:
    allowed: bool
    window: str = ""
    used: int = 0
    limit: int = 0

    def describe(self) -> str:
        if self.allowed:
            return "within rate limits"
        return f"rate limit exceeded: {self.used}/{self.limit} orders per {self.window}"


class RateLimiter:
    """Persisted sliding-window limiter across minute / hour / day windows.

    Submission timestamps are stored on disk, so killing and restarting the
    process does not hand a runaway strategy a fresh budget. ``peek`` reports
    whether capacity exists; ``consume`` atomically takes it under a lock.
    """

    def __init__(
        self,
        path: str | Path,
        *,
        per_minute: int,
        per_hour: int,
        per_day: int,
        clock: Clock = utc_now,
    ) -> None:
        self.path = Path(path)
        self.per_minute = per_minute
        self.per_hour = per_hour
        self.per_day = per_day
        self._clock = clock

    def _windows(self) -> tuple[tuple[str, timedelta, int], ...]:
        return (
            ("minute", timedelta(minutes=1), self.per_minute),
            ("hour", timedelta(hours=1), self.per_hour),
            ("day", timedelta(days=1), self.per_day),
        )

    def _load(self) -> list[datetime]:
        data = _read_json(self.path)
        stamps: list[datetime] = []
        for raw in data.get("submissions", []):
            try:
                stamps.append(datetime.fromisoformat(raw))
            except (TypeError, ValueError):
                continue
        horizon = self._clock() - timedelta(days=1)
        return [s for s in stamps if s >= horizon]

    def _save(self, stamps: list[datetime]) -> None:
        _write_json(
            self.path,
            {
                "submissions": [s.isoformat() for s in stamps],
                "updated_at": self._clock().isoformat(),
            },
        )

    def _evaluate(self, stamps: list[datetime]) -> RateLimitStatus:
        now = self._clock()
        for name, span, limit in self._windows():
            used = sum(1 for s in stamps if s >= now - span)
            if used >= limit:
                return RateLimitStatus(False, window=name, used=used, limit=limit)
        return RateLimitStatus(True)

    def peek(self) -> RateLimitStatus:
        """Non-mutating check. Use for reporting, never as the sole gate."""
        return self._evaluate(self._load())

    def consume(self) -> RateLimitStatus:
        """Atomically take one unit of budget. Returns the outcome."""
        with _locked(self.path):
            stamps = self._load()
            status = self._evaluate(stamps)
            if not status.allowed:
                return status
            stamps.append(self._clock())
            self._save(stamps)
            return RateLimitStatus(True)

    def usage(self) -> dict[str, dict[str, int]]:
        stamps = self._load()
        now = self._clock()
        return {
            name: {
                "used": sum(1 for s in stamps if s >= now - span),
                "limit": limit,
            }
            for name, span, limit in self._windows()
        }

    def reset(self) -> None:
        with _locked(self.path):
            self._save([])


# ---------------------------------------------------------------------------
# Equity peak / day-start tracking
# ---------------------------------------------------------------------------


class EquityTracker:
    """Tracks peak equity and each session's starting equity.

    IBKR reports current net liquidation value but not "your peak equity" or
    "what you started the day with", and both are needed by the drawdown and
    daily-loss breakers. This keeps them on disk, monotonically for the peak.
    """

    def __init__(self, path: str | Path, clock: Clock = utc_now) -> None:
        self.path = Path(path)
        self._clock = clock

    def read(self) -> dict[str, Any]:
        data = _read_json(self.path)
        return {} if data.get("__unreadable__") else data

    def update(self, equity: float) -> dict[str, Any]:
        """Record current equity, rolling the day-start value over at UTC midnight."""
        now = self._clock()
        today = now.date().isoformat()
        with _locked(self.path):
            data = self.read()
            peak = max(float(data.get("peak_equity", equity)), equity)
            if data.get("day_start_date") != today:
                day_start = equity
            else:
                day_start = float(data.get("day_start_equity", equity))
            payload = {
                "peak_equity": peak,
                "day_start_equity": day_start,
                "day_start_date": today,
                "last_equity": equity,
                "updated_at": now.isoformat(),
            }
            _write_json(self.path, payload)
            return payload

    def enrich(self, snapshot):
        """Return a copy of ``snapshot`` with peak and day-start equity filled in."""
        from dataclasses import replace

        state = self.update(snapshot.equity)
        return replace(
            snapshot,
            peak_equity=state["peak_equity"],
            day_start_equity=state["day_start_equity"],
        )

    def reset(self, equity: float) -> None:
        with _locked(self.path):
            _write_json(
                self.path,
                {
                    "peak_equity": equity,
                    "day_start_equity": equity,
                    "day_start_date": self._clock().date().isoformat(),
                    "last_equity": equity,
                    "updated_at": self._clock().isoformat(),
                    "note": "manual reset",
                },
            )


def today_utc() -> date:
    return utc_now().date()
