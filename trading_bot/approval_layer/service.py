"""The human-in-the-loop boundary.

Flow, with no way around it:

    strategy -> ProposedOrder -> risk_gate.evaluate -> ApprovalService.propose
             -> [ a human runs `review` and types approve/reject ]
             -> ApprovalService.approve -> ApprovalToken
             -> execution_layer.submit(order, token, clearance)

``ApprovalService`` has exactly one method that mints a token, and it demands a
named approver and refuses proposals the risk gate blocked. There is no
``auto_approve``, no ``approve_all_pending``, and no config flag that skips the
step - by design, since the brief calls for an architectural boundary rather
than a toggle. ``tests/test_approval_layer.py`` asserts the absence of such a
path, so adding one later breaks the build.

Every proposal and every decision is written to SQLite before anything is
returned, so the audit trail survives a crash between approval and submission.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Sequence

from ..core.types import ProposedOrder
from ..risk_gate.gate import RiskDecision
from .tokens import (
    ApprovalError,
    ApprovalToken,
    load_or_create_signing_key,
    mint_token,
    verify_signature,
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS proposals (
    id            TEXT PRIMARY KEY,
    created_at    TEXT NOT NULL,
    expires_at    TEXT NOT NULL,
    fingerprint   TEXT NOT NULL,
    order_payload TEXT NOT NULL,
    risk_payload  TEXT NOT NULL,
    description   TEXT NOT NULL,
    status        TEXT NOT NULL,
    decided_at    TEXT,
    decided_by    TEXT,
    note          TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
    token_id     TEXT PRIMARY KEY,
    proposal_id  TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    approver     TEXT NOT NULL,
    issued_at    TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    signature    TEXT NOT NULL,
    consumed_at  TEXT,
    FOREIGN KEY (proposal_id) REFERENCES proposals(id)
);
CREATE TABLE IF NOT EXISTS audit (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    at        TEXT NOT NULL,
    event     TEXT NOT NULL,
    actor     TEXT,
    detail    TEXT
);
"""


class ProposalStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"
    BLOCKED = "blocked_by_risk"
    SUBMITTED = "submitted"


@dataclass(frozen=True)
class Proposal:
    id: str
    order: ProposedOrder
    fingerprint: str
    created_at: datetime
    expires_at: datetime
    description: str
    status: str
    risk_summary: dict
    decided_by: str | None = None
    decided_at: datetime | None = None
    note: str | None = None

    def is_expired(self, now: datetime | None = None) -> bool:
        return (now or datetime.now(timezone.utc)) > self.expires_at


def _parse(stamp: str | None) -> datetime | None:
    return datetime.fromisoformat(stamp) if stamp else None


class ApprovalService:
    """Records proposals, captures human decisions, issues single-use tokens."""

    def __init__(
        self,
        config,
        *,
        clock=None,
        store_path: str | Path | None = None,
    ) -> None:
        self.config = config
        self.approval_config = config.approval
        self._clock = clock or (lambda: datetime.now(timezone.utc))
        self.path = Path(store_path or config.path_for(self.approval_config.approval_store))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._key = load_or_create_signing_key(self.path.parent)
        with closing(self._connect()) as conn:
            conn.executescript(SCHEMA)
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _audit(self, conn: sqlite3.Connection, event: str, actor: str | None, detail: str) -> None:
        conn.execute(
            "INSERT INTO audit (at, event, actor, detail) VALUES (?, ?, ?, ?)",
            (self._clock().isoformat(), event, actor, detail),
        )

    # -- proposing ---------------------------------------------------------

    def propose(self, order: ProposedOrder, risk_decision: RiskDecision) -> Proposal:
        """Record a trade the system wants to make. Never returns a token."""
        now = self._clock()
        expires = now + timedelta(minutes=self.approval_config.proposal_ttl_minutes)
        status = (
            ProposalStatus.PENDING if risk_decision.approved else ProposalStatus.BLOCKED
        )
        proposal = Proposal(
            id=str(uuid.uuid4()),
            order=order,
            fingerprint=order.fingerprint(),
            created_at=now,
            expires_at=expires,
            description=order.describe(),
            status=status,
            risk_summary=risk_decision.to_dict(),
        )
        with closing(self._connect()) as conn:
            conn.execute(
                """INSERT INTO proposals
                   (id, created_at, expires_at, fingerprint, order_payload,
                    risk_payload, description, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    proposal.id,
                    now.isoformat(),
                    expires.isoformat(),
                    proposal.fingerprint,
                    json.dumps(order.to_storage()),
                    json.dumps(proposal.risk_summary, default=str),
                    proposal.description,
                    status,
                ),
            )
            self._audit(
                conn,
                "proposed" if risk_decision.approved else "blocked_by_risk",
                None,
                f"{proposal.id}: {proposal.description}",
            )
            conn.commit()
        return proposal

    def propose_all(
        self, pairs: Iterable[tuple[ProposedOrder, RiskDecision]]
    ) -> list[Proposal]:
        return [self.propose(order, decision) for order, decision in pairs]

    # -- reading -----------------------------------------------------------

    def _row_to_proposal(self, row: sqlite3.Row, order: ProposedOrder | None) -> Proposal:
        return Proposal(
            id=row["id"],
            order=order,  # type: ignore[arg-type]
            fingerprint=row["fingerprint"],
            created_at=_parse(row["created_at"]),  # type: ignore[arg-type]
            expires_at=_parse(row["expires_at"]),  # type: ignore[arg-type]
            description=row["description"],
            status=row["status"],
            risk_summary=json.loads(row["risk_payload"]),
            decided_by=row["decided_by"],
            decided_at=_parse(row["decided_at"]),
            note=row["note"],
        )

    def pending(self) -> list[dict]:
        """Pending proposals, expiring any that have aged out first."""
        self.expire_stale()
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM proposals WHERE status = ? ORDER BY created_at",
                (ProposalStatus.PENDING,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get(self, proposal_id: str) -> dict | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM proposals WHERE id = ?", (proposal_id,)
            ).fetchone()
        return dict(row) if row else None

    def history(self, limit: int = 100) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM proposals ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

    def audit_trail(self, limit: int = 200) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT * FROM audit ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

    def expire_stale(self) -> int:
        now = self._clock()
        with closing(self._connect()) as conn:
            cursor = conn.execute(
                "UPDATE proposals SET status = ?, decided_at = ? "
                "WHERE status = ? AND expires_at < ?",
                (ProposalStatus.EXPIRED, now.isoformat(), ProposalStatus.PENDING, now.isoformat()),
            )
            if cursor.rowcount:
                self._audit(conn, "expired", None, f"{cursor.rowcount} stale proposal(s)")
            conn.commit()
            return cursor.rowcount

    # -- deciding -----------------------------------------------------------

    def approve(self, proposal_id: str, approver: str, note: str = "") -> ApprovalToken:
        """Record a human approval and mint a single-use token.

        This is the only function in the system that produces an
        ``ApprovalToken``. It refuses anything that is not a live, pending,
        risk-cleared proposal, and it demands a named approver.
        """
        if not approver or not approver.strip():
            raise ApprovalError(
                "An approval must name the human granting it. Anonymous "
                "approvals defeat the purpose of the audit trail."
            )
        now = self._clock()

        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM proposals WHERE id = ?", (proposal_id,)
            ).fetchone()
            if row is None:
                raise ApprovalError(f"No such proposal: {proposal_id}")
            if row["status"] == ProposalStatus.BLOCKED:
                raise ApprovalError(
                    f"Proposal {proposal_id} was blocked by the risk gate and cannot "
                    "be approved. Fix the underlying breach instead."
                )
            if row["status"] != ProposalStatus.PENDING:
                raise ApprovalError(
                    f"Proposal {proposal_id} is {row['status']}, not pending."
                )
            if _parse(row["expires_at"]) < now:
                conn.execute(
                    "UPDATE proposals SET status = ?, decided_at = ? WHERE id = ?",
                    (ProposalStatus.EXPIRED, now.isoformat(), proposal_id),
                )
                conn.commit()
                raise ApprovalError(
                    f"Proposal {proposal_id} expired at {row['expires_at']}. Stale "
                    "signals must not be executed at a price that has moved on."
                )

            token = mint_token(
                proposal_id=proposal_id,
                order_fingerprint=row["fingerprint"],
                approver=approver.strip(),
                key=self._key,
                ttl_minutes=self.approval_config.token_ttl_minutes,
                now=now,
            )
            conn.execute(
                """INSERT INTO tokens
                   (token_id, proposal_id, fingerprint, approver, issued_at,
                    expires_at, signature)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    token.token_id,
                    token.proposal_id,
                    token.order_fingerprint,
                    token.approver,
                    token.issued_at.isoformat(),
                    token.expires_at.isoformat(),
                    token.signature,
                ),
            )
            conn.execute(
                "UPDATE proposals SET status = ?, decided_at = ?, decided_by = ?, note = ? "
                "WHERE id = ?",
                (ProposalStatus.APPROVED, now.isoformat(), approver.strip(), note, proposal_id),
            )
            self._audit(
                conn, "approved", approver.strip(), f"{proposal_id}: {row['description']} ({note})"
            )
            conn.commit()
        return token

    def reject(self, proposal_id: str, approver: str, note: str = "") -> None:
        if not approver or not approver.strip():
            raise ApprovalError("A rejection must name the human making it.")
        now = self._clock()
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM proposals WHERE id = ?", (proposal_id,)
            ).fetchone()
            if row is None:
                raise ApprovalError(f"No such proposal: {proposal_id}")
            conn.execute(
                "UPDATE proposals SET status = ?, decided_at = ?, decided_by = ?, note = ? "
                "WHERE id = ?",
                (ProposalStatus.REJECTED, now.isoformat(), approver.strip(), note, proposal_id),
            )
            self._audit(
                conn, "rejected", approver.strip(), f"{proposal_id}: {row['description']} ({note})"
            )
            conn.commit()

    def rebuild_order(self, proposal_id: str) -> ProposedOrder:
        """Reconstruct the exact order a proposal described."""
        row = self.get(proposal_id)
        if row is None:
            raise ApprovalError(f"No such proposal: {proposal_id}")
        order = ProposedOrder.from_storage(json.loads(row["order_payload"]))
        if order.fingerprint() != row["fingerprint"]:
            raise ApprovalError(
                f"Stored order for proposal {proposal_id} does not reproduce its "
                "recorded fingerprint. The approval store may be corrupt; refusing "
                "to act on it."
            )
        return order

    def live_tokens(self) -> list[dict]:
        """Approved, unexpired, unconsumed tokens awaiting submission."""
        now = self._clock()
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT t.*, p.description FROM tokens t "
                "JOIN proposals p ON p.id = t.proposal_id "
                "WHERE t.consumed_at IS NULL ORDER BY t.issued_at"
            ).fetchall()
        return [dict(r) for r in rows if _parse(r["expires_at"]) > now]

    def load_token(self, token_id: str) -> ApprovalToken:
        """Load a previously issued token so a later process can submit it.

        This does not weaken the control: a row exists in ``tokens`` only
        because ``approve`` recorded a named human's decision, and the token is
        still single-use and fingerprint-bound when it is verified.
        """
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM tokens WHERE token_id = ?", (token_id,)
            ).fetchone()
        if row is None:
            raise ApprovalError(f"No such approval token: {token_id}")
        if row["consumed_at"]:
            raise ApprovalError(
                f"Approval token {token_id} was already used at {row['consumed_at']}."
            )
        return ApprovalToken(
            token_id=row["token_id"],
            proposal_id=row["proposal_id"],
            order_fingerprint=row["fingerprint"],
            approver=row["approver"],
            issued_at=_parse(row["issued_at"]),  # type: ignore[arg-type]
            expires_at=_parse(row["expires_at"]),  # type: ignore[arg-type]
            signature=row["signature"],
        )

    # -- verification -------------------------------------------------------

    def verify_and_consume(self, token: ApprovalToken, order: ProposedOrder) -> None:
        """Validate a token against an order and burn it. Raises on any problem.

        Called by the execution layer immediately before transmission. The
        consume step is a conditional UPDATE, so two concurrent submissions
        racing on the same token cannot both win.
        """
        if not isinstance(token, ApprovalToken):
            raise ApprovalError(
                f"Expected an ApprovalToken, got {type(token).__name__}. Orders "
                "cannot be submitted without a recorded human approval."
            )
        if not verify_signature(token, self._key):
            raise ApprovalError(
                f"Approval token {token.token_id} has an invalid signature - it was "
                "not issued by this installation's approval service."
            )

        fingerprint = order.fingerprint()
        if token.order_fingerprint != fingerprint:
            raise ApprovalError(
                "Approval token does not match this order. The approved order was "
                f"{token.order_fingerprint[:12]}..., the order being submitted is "
                f"{fingerprint[:12]}.... An approval covers one exact order; a "
                "change of symbol, side, quantity or price voids it."
            )

        now = self._clock()
        if token.is_expired(now):
            raise ApprovalError(
                f"Approval token {token.token_id} expired at {token.expires_at.isoformat()}."
            )

        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM tokens WHERE token_id = ?", (token.token_id,)
            ).fetchone()
            if row is None:
                raise ApprovalError(
                    f"Approval token {token.token_id} is not in the approval store."
                )
            if row["consumed_at"]:
                raise ApprovalError(
                    f"Approval token {token.token_id} was already used at "
                    f"{row['consumed_at']}. Tokens authorise exactly one submission."
                )
            cursor = conn.execute(
                "UPDATE tokens SET consumed_at = ? WHERE token_id = ? AND consumed_at IS NULL",
                (now.isoformat(), token.token_id),
            )
            if cursor.rowcount != 1:
                raise ApprovalError(
                    f"Approval token {token.token_id} was consumed concurrently."
                )
            conn.execute(
                "UPDATE proposals SET status = ? WHERE id = ?",
                (ProposalStatus.SUBMITTED, token.proposal_id),
            )
            self._audit(
                conn, "token_consumed", token.approver, f"{token.proposal_id}: {order.describe()}"
            )
            conn.commit()

    # -- reporting ----------------------------------------------------------

    def counts(self) -> dict[str, int]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) AS n FROM proposals GROUP BY status"
            ).fetchall()
        return {row["status"]: row["n"] for row in rows}
