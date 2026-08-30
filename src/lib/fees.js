// ── fetchr two-sided pricing model — THE single source of truth ──
// KEEP IN SYNC WITH supabase/functions/stripe-connect/index.ts's calcFees.
// The edge function can't import from src/, so its copy is a hand-kept,
// structurally identical mirror of this file. If you change the formula
// here, change it there too — same constants, same order of operations,
// same field names on the returned object.
//
// Every component that shows or acts on a deal's money (EscrowPayment,
// Messages' DealDetailsModal, Matches' match preview, Dashboard's hero
// card, ActiveDeals, Completed, Earnings) imports calcFees from here.
// There must never be a second implementation of this formula anywhere
// in src/ — that's exactly how the three drifted-apart copies this
// replaces came to disagree with each other.

export const MINIMUM_DEAL_SIZE = 15.00;   // commissionBase below this blocks escrow payment entirely
export const REVENUE_FLOOR = 8.00;        // minimum fetchr takes per deal; shortfall loads onto the shipper only
export const SHIPPER_SERVICE_FEE_PCT = 0.15;   // paid by shipper, on top of shipperPays
export const TRAVELER_PLATFORM_FEE_PCT = 0.05; // deducted from traveler's payout
export const SOURCING_FEE_PCT = 0.06;          // paid by shipper, on top, only when there's a purchase

/**
 * Computes the full two-sided fee breakdown for a match.
 *
 * `match` is expected in the same joined shape used throughout the app:
 * { agreed_price_per_kg, agreed_weight_kg, agreed_shop_fee,
 *   flight: { price_per_kg, shop_and_ship_fee },
 *   request: { weight_kg, requires_purchase, purchase_price } }
 * Agreed (locked-in) values win once terms are agreed; the flight/request
 * fallbacks only apply beforehand (pending-match previews).
 */
export function calcFees(match) {
  const pricePerKg = parseFloat(match.agreed_price_per_kg ?? match.flight?.price_per_kg ?? 0) || 0;
  const weightKg = parseFloat(match.agreed_weight_kg ?? match.request?.weight_kg ?? 0) || 0;
  const transportFee = pricePerKg * weightKg;

  const isPurchase = !!(match.request?.requires_purchase);
  const shopFee = isPurchase
    ? (parseFloat(match.agreed_shop_fee ?? match.flight?.shop_and_ship_fee ?? 0) || 0)
    : 0;
  const purchasePrice = isPurchase ? (parseFloat(match.request?.purchase_price) || 0) : 0;

  // Purchase price is never commissionable — fetchr takes a cut of the
  // service (moving + optionally buying the item), never of the item's
  // own cost.
  const commissionBase = transportFee + shopFee;

  let shipperServiceFee = commissionBase * SHIPPER_SERVICE_FEE_PCT;
  const travelerPlatformFee = commissionBase * TRAVELER_PLATFORM_FEE_PCT;
  const sourcingFee = purchasePrice * SOURCING_FEE_PCT;

  // Revenue floor: the shortfall is loaded onto the shipper's service fee
  // only — the traveler's deduction is never inflated to hit the floor.
  const baseRevenue = shipperServiceFee + travelerPlatformFee + sourcingFee;
  let floorApplied = false;
  if (baseRevenue > 0 && baseRevenue < REVENUE_FLOOR) {
    shipperServiceFee += (REVENUE_FLOOR - baseRevenue);
    floorApplied = true;
  }

  const shipperPays = transportFee + shopFee + purchasePrice + shipperServiceFee + sourcingFee;
  const travelerReceives = transportFee + shopFee + purchasePrice - travelerPlatformFee;
  const fetchrRevenue = shipperServiceFee + travelerPlatformFee + sourcingFee;

  // The invariant this whole shared module exists to guarantee: a fee
  // charged to one side must always land somewhere, in full. If this ever
  // throws, the bug is in the formula above, not in whatever called
  // calcFees() — no caller should ever need its own version of this check.
  const invariantDiff = shipperPays - travelerReceives - fetchrRevenue;
  if (Math.abs(invariantDiff) > 0.01) {
    const message = `calcFees invariant violated: shipperPays(${shipperPays.toFixed(2)}) - travelerReceives(${travelerReceives.toFixed(2)}) !== fetchrRevenue(${fetchrRevenue.toFixed(2)}), diff=${invariantDiff.toFixed(4)}`;
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
    console.error(message);
  }

  return {
    transportFee, shopFee, purchasePrice, isPurchase,
    commissionBase,
    shipperServiceFee, travelerPlatformFee, sourcingFee,
    floorApplied,
    shipperPays, travelerReceives, fetchrRevenue,
    belowMinimum: commissionBase < MINIMUM_DEAL_SIZE,
  };
}
