"""Approval tokens: cryptographic proof that a human authorised one order.

A token is bound to a single order's ``fingerprint()``. Because the fingerprint
covers symbol, side, quantity, limit price and order type, an approval granted
for "buy 100 shares at 42.10" cannot be replayed to send "buy 10,000 shares at
market" - the fingerprints differ, and verification fails.

The signing key lives outside the repository tree in a 0600 file and is created
on first use. It is not a secret against a determined local attacker (anyone who
can run this code can read the key); it is a guard against *accidental* bypass -
a code path that constructs an order and tries to submit it without ever having
gone through the approval flow cannot produce a valid signature by mistake.
"""

from __future__ import annotations

import hmac
import json
import os
import secrets
import stat
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from pathlib import Path

KEY_FILENAME = "approval_signing.key"


class ApprovalError(RuntimeError):
    """Raised when an approval is missing, malformed, expired or already used."""


def load_or_create_signing_key(directory: str | Path) -> bytes:
    """Return the installation's signing key, creating it on first use."""
    path = Path(directory) / KEY_FILENAME
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file():
        key = path.read_bytes().strip()
        if len(key) < 32:
            raise ApprovalError(
                f"Approval signing key at {path} is too short to be trusted. "
                "Delete it to have a fresh key generated."
            )
        return key

    key = secrets.token_bytes(48)
    # Write with restrictive permissions from the start rather than chmod-ing
    # afterwards, which would leave a window where the key is world-readable.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(key)
    return key


@dataclass(frozen=True)
class ApprovalToken:
    """Single-use authorisation for exactly one order.

    Construct these only via ``ApprovalService.approve``. Building one directly
    is possible in Python but useless: without the signing key the signature
    will not verify, and the execution layer verifies before every submission.
    """

    token_id: str
    proposal_id: str
    order_fingerprint: str
    approver: str
    issued_at: datetime
    expires_at: datetime
    signature: str

    def payload(self) -> dict:
        return {
            "token_id": self.token_id,
            "proposal_id": self.proposal_id,
            "order_fingerprint": self.order_fingerprint,
            "approver": self.approver,
            "issued_at": self.issued_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
        }

    def is_expired(self, now: datetime | None = None) -> bool:
        return (now or datetime.now(timezone.utc)) > self.expires_at


def sign_payload(payload: dict, key: bytes) -> str:
    blob = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hmac.new(key, blob, sha256).hexdigest()


def mint_token(
    *,
    proposal_id: str,
    order_fingerprint: str,
    approver: str,
    key: bytes,
    ttl_minutes: int,
    now: datetime | None = None,
) -> ApprovalToken:
    issued = now or datetime.now(timezone.utc)
    partial = {
        "token_id": secrets.token_hex(16),
        "proposal_id": proposal_id,
        "order_fingerprint": order_fingerprint,
        "approver": approver,
        "issued_at": issued.isoformat(),
        "expires_at": (issued + timedelta(minutes=ttl_minutes)).isoformat(),
    }
    return ApprovalToken(
        token_id=partial["token_id"],
        proposal_id=partial["proposal_id"],
        order_fingerprint=partial["order_fingerprint"],
        approver=partial["approver"],
        issued_at=issued,
        expires_at=issued + timedelta(minutes=ttl_minutes),
        signature=sign_payload(partial, key),
    )


def verify_signature(token: ApprovalToken, key: bytes) -> bool:
    expected = sign_payload(token.payload(), key)
    # Constant-time comparison: signature checks should not leak via timing.
    return hmac.compare_digest(expected, token.signature)
