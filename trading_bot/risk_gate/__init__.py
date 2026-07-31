"""Hard risk limits. Sits between signal generation and execution.

Import this layer from orchestration and execution code only. Strategy code
must not import it - strategies propose, the gate disposes.
"""

from .gate import (
    CheckResult,
    RiskClearance,
    RiskDecision,
    RiskGate,
    RiskViolation,
)
from .state import (
    EquityTracker,
    HaltRecord,
    HaltState,
    KillSwitch,
    RateLimiter,
    RateLimitStatus,
    utc_now,
)

__all__ = [
    "CheckResult",
    "EquityTracker",
    "HaltRecord",
    "HaltState",
    "KillSwitch",
    "RateLimitStatus",
    "RateLimiter",
    "RiskClearance",
    "RiskDecision",
    "RiskGate",
    "RiskViolation",
    "utc_now",
]
