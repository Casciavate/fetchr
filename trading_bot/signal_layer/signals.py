"""Signal value objects.

A ``Signal`` is an *opinion*, not an instruction. It carries no quantity, no
currency and no account context, because strategies must not be able to size
or route anything. Turning a signal into a ``ProposedOrder`` is the job of the
portfolio sizer, and turning that into a live order needs the risk gate and a
human approval on top.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class SignalAction(str, Enum):
    ENTER_LONG = "enter_long"
    EXIT_LONG = "exit_long"
    HOLD = "hold"


@dataclass(frozen=True)
class Signal:
    symbol: str
    action: SignalAction
    strategy: str
    as_of: datetime
    #: Ranking score. Comparable only within a single strategy, never across.
    strength: float
    reference_price: float
    stop_price: float | None = None
    rationale: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.reference_price <= 0:
            raise ValueError(f"{self.symbol}: reference_price must be positive")
        if self.stop_price is not None and self.stop_price <= 0:
            raise ValueError(f"{self.symbol}: stop_price must be positive")
        if (
            self.action is SignalAction.ENTER_LONG
            and self.stop_price is not None
            and self.stop_price >= self.reference_price
        ):
            raise ValueError(
                f"{self.symbol}: a long entry's stop ({self.stop_price}) must sit "
                f"below the entry price ({self.reference_price})"
            )

    @property
    def stop_distance_pct(self) -> float | None:
        if self.stop_price is None:
            return None
        return (self.reference_price - self.stop_price) / self.reference_price

    def describe(self) -> str:
        stop = "none" if self.stop_price is None else f"{self.stop_price:,.4f}"
        return (
            f"{self.action.value} {self.symbol} @{self.reference_price:,.4f} "
            f"stop={stop} strength={self.strength:.4f} [{self.strategy}] {self.rationale}"
        )
