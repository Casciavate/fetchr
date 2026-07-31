"""Position sizing. Pure, and shared by the backtest and the live cycle.

Using one sizer in both places is deliberate. If the backtest sized positions
differently from the live proposal cycle, the backtest would be testing a
strategy that never actually trades, and any divergence between paper results
and backtest expectations would be uninterpretable.

Sizing is volatility-targeted: a budget per slot, scaled down for instruments
more volatile than the target and up (within a cap) for calmer ones, then
truncated by the hard per-position limit. Note that the sizer's output is only
a *proposal* - the risk gate re-checks the resulting order independently and
does not trust this number.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class SizingResult:
    quantity: float
    notional_base: float
    rationale: str
    volatility_scalar: float = 1.0

    @property
    def is_tradeable(self) -> bool:
        return self.quantity > 0


#: Bounds on the volatility scalar. Without a floor, one turbulent instrument
#: would be sized to nearly nothing; without a ceiling, a temporarily quiet one
#: would be levered up on what is usually a measurement artefact.
MIN_VOL_SCALAR = 0.25
MAX_VOL_SCALAR = 1.50


def size_position(
    *,
    price: float,
    fx_rate_to_base: float,
    equity: float,
    sleeve_pct: float,
    max_positions: int,
    max_position_pct: float,
    target_volatility: float,
    realised_volatility: float | None = None,
    existing_notional_base: float = 0.0,
    lot_size: int = 1,
) -> SizingResult:
    """Return the quantity to buy for one new position.

    ``existing_notional_base`` is subtracted from the target so that topping up
    a partial position does not double it.
    """
    if price <= 0 or fx_rate_to_base <= 0:
        return SizingResult(0.0, 0.0, "invalid price or FX rate")
    if equity <= 0:
        return SizingResult(0.0, 0.0, "no equity to allocate")
    if max_positions < 1:
        return SizingResult(0.0, 0.0, "max_positions is below one")

    sleeve_capital = equity * sleeve_pct
    budget = sleeve_capital / max_positions

    scalar = 1.0
    if realised_volatility and realised_volatility > 0 and target_volatility > 0:
        scalar = min(
            MAX_VOL_SCALAR, max(MIN_VOL_SCALAR, target_volatility / realised_volatility)
        )

    target_notional = budget * scalar
    hard_cap = equity * max_position_pct
    target_notional = min(target_notional, hard_cap)

    remaining = target_notional - existing_notional_base
    if remaining <= 0:
        return SizingResult(
            0.0,
            0.0,
            f"position already at or above its {target_notional:,.2f} target",
            scalar,
        )

    unit_cost_base = price * fx_rate_to_base
    raw_quantity = remaining / unit_cost_base
    quantity = math.floor(raw_quantity / lot_size) * lot_size

    if quantity <= 0:
        return SizingResult(
            0.0,
            0.0,
            (
                f"budget {remaining:,.2f} buys less than one tradeable lot at "
                f"{unit_cost_base:,.2f} per share"
            ),
            scalar,
        )

    notional = quantity * unit_cost_base
    return SizingResult(
        quantity=float(quantity),
        notional_base=notional,
        rationale=(
            f"sleeve {sleeve_capital:,.0f} / {max_positions} slots = {budget:,.0f}, "
            f"vol scalar {scalar:.2f}, capped at {hard_cap:,.0f} "
            f"({max_position_pct:.1%} of equity) -> {quantity:,.0f} shares"
        ),
        volatility_scalar=scalar,
    )


def limit_price_for(
    *, reference_price: float, side_is_buy: bool, offset_bps: float
) -> float:
    """Price a marketable limit ``offset_bps`` through the reference.

    Buying, the limit sits above the reference; selling, below. The offset buys
    fill probability while still capping the worst price accepted - which a
    market order does not do.
    """
    if reference_price <= 0:
        raise ValueError("reference_price must be positive")
    offset = reference_price * (offset_bps / 10_000.0)
    price = reference_price + offset if side_is_buy else reference_price - offset
    return round(max(price, 0.01), 4)
