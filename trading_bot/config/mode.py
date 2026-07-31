"""Trading-mode resolution: paper (default) vs live.

This module is the *only* place in the system that can decide the process is
allowed to talk to a live brokerage account. It is deliberately small and
dependency-free so it can be audited by reading it top to bottom.

Three independent conditions must hold to reach LIVE. Any one of them missing
falls back to PAPER:

1. Environment variable ``LIVE_TRADING`` is exactly ``"true"``.
2. A confirmation file, whose path is given by ``LIVE_TRADING_CONFIRM_FILE``,
   exists and contains the exact acknowledgement phrase. The path must be
   outside the repository so that a code change alone can never create it.
3. The call does not originate from a layer that is forbidden to make this
   decision (strategy/data/backtest code).

Condition 3 is enforced by inspecting the call stack. It is defence in depth,
not the primary control - the primary control is that ``signal_layer`` never
imports this module at all, which ``tests/test_layer_isolation.py`` asserts
statically.
"""

from __future__ import annotations

import inspect
import os
from enum import Enum
from pathlib import Path

LIVE_ENV_VAR = "LIVE_TRADING"
LIVE_CONFIRM_FILE_ENV = "LIVE_TRADING_CONFIRM_FILE"
REQUIRED_CONFIRM_PHRASE = "I ACCEPT LIVE TRADING RISK"

#: Package names that must never be able to resolve the trading mode.
FORBIDDEN_CALLER_PACKAGES = ("signal_layer", "backtest_engine", "data_layer")


class TradingMode(str, Enum):
    PAPER = "paper"
    LIVE = "live"

    @property
    def is_live(self) -> bool:
        return self is TradingMode.LIVE


class ForbiddenCallerError(RuntimeError):
    """Raised when a layer that must not choose the trading mode tries to."""


def _assert_caller_allowed() -> None:
    """Reject calls originating inside strategy/data/backtest packages."""
    for frame_info in inspect.stack()[1:]:
        module_path = Path(frame_info.filename)
        for package in FORBIDDEN_CALLER_PACKAGES:
            if package in module_path.parts:
                raise ForbiddenCallerError(
                    f"{package} is not permitted to resolve the trading mode. "
                    "Strategy, data and backtest code must remain unaware of "
                    "whether the process is connected to a live account."
                )


def _confirmation_file_valid() -> bool:
    raw_path = os.environ.get(LIVE_CONFIRM_FILE_ENV, "").strip()
    if not raw_path:
        return False

    path = Path(raw_path).expanduser()
    if not path.is_file():
        return False

    # The confirmation file must live outside the repo. If it sat inside the
    # working tree, a commit could enable live trading, which defeats the point.
    repo_root = Path(__file__).resolve().parents[2]
    try:
        path.resolve().relative_to(repo_root)
    except ValueError:
        pass  # Outside the repo - this is what we want.
    else:
        return False

    try:
        contents = path.read_text(encoding="utf-8")
    except OSError:
        return False

    return REQUIRED_CONFIRM_PHRASE in contents


def resolve_trading_mode() -> TradingMode:
    """Return the trading mode for this process. Defaults to PAPER."""
    _assert_caller_allowed()

    if os.environ.get(LIVE_ENV_VAR, "").strip().lower() != "true":
        return TradingMode.PAPER

    if not _confirmation_file_valid():
        return TradingMode.PAPER

    return TradingMode.LIVE


def describe_mode_requirements() -> str:
    """Human-readable explanation, used by the CLI banner and the runbook."""
    return (
        "Live trading requires ALL of:\n"
        f"  1. {LIVE_ENV_VAR}=true in the environment\n"
        f"  2. {LIVE_CONFIRM_FILE_ENV} pointing at a file OUTSIDE this repo\n"
        f"     containing the phrase: {REQUIRED_CONFIRM_PHRASE!r}\n"
        "  3. The caller not being strategy/data/backtest code\n"
        "Anything else resolves to PAPER."
    )
