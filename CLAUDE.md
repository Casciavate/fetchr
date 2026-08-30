# Fetchr — peer-to-peer social delivery marketplace

Travelers with spare luggage capacity carry items for shippers. Fetchr takes a
commission and holds funds in escrow until both parties confirm delivery.

- Live: https://fetchr-zeta.vercel.app
- Repo: https://github.com/Casciavate/fetchr
- Supabase project ref: `jvuzjmigkqolphkhzeei`
- Edge function URL: https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/stripe-connect

## Flight search (AddFlight) — no live schedule API, by design

`AddFlight.jsx` cannot call a real flight-schedule provider (AeroDataBox,
AviationStack, etc.) — the project is pre-revenue and that's an explicit
"no external API cost" decision, to revisit once there's a paying user base.
Until then, flight search runs entirely on two static datasets derived
from OpenFlights open data (openflights.org, public domain, ~2014 snapshot):

- `src/components/shared/airlines.js` — 965 airline name → IATA code
  entries (`AIRLINE_CODES`, `AIRLINES`, `CODE_TO_AIRLINE`), with a small
  `NAME_OVERRIDES` patch for carriers that rebranded/merged since the
  snapshot or hit a stale code collision. Bundled directly (~8.6KB gzip).
- `src/components/shared/routes.js` — direct-route coverage between the
  airports in `AddFlight.jsx`'s `AIRPORTS` list (`ROUTE_AIRLINES`,
  `AIRLINE_ROUTES`), used only for search suggestions, not live schedules.
  Loaded via dynamic `import()` inside `AddFlight.jsx` so it doesn't bloat
  the main bundle (~79KB gzip chunk, loads only when this screen opens).

Flight-number → airline detection is live (first 2 characters = IATA
code) and needs no network call. Route auto-fill from a flight number
still calls OpenSky Network (free, no key) opportunistically, but that
only has data for flights that already flew — it can't know about future
bookings, which is the normal case here. Don't expect it to work for a
future `flight_date`; that's not a bug, it's an inherent limitation of the
free data source. Both static files can be regenerated from a fresh
OpenFlights export the same way if the airport list grows.

## Stack

React + Tailwind (Create React App), Supabase (Postgres + Auth + Storage +
Realtime), Stripe (test mode), Vercel (auto-deploys on push to `main`).

Key paths:
- `src/components/` — all React components
- `supabase/functions/stripe-connect/index.ts` — Stripe edge function
- `.env` — `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`,
  `REACT_APP_STRIPE_PUBLISHABLE_KEY`

## Fee logic — authoritative, do not re-derive

Two-sided pricing: shipper and traveler each pay/lose a *different* fee,
on top of/deducted from a shared base. Purchase price is never
commissionable — fetchr never takes a cut of the item's own cost, only of
the service (moving it, and optionally buying it).

```
transportFee   = agreed_weight_kg × agreed_price_per_kg
shopFee        = matches.agreed_shop_fee (0 if not a shop & ship deal)
purchasePrice  = shipment_requests.purchase_price (0 if not a shop & ship deal)
commissionBase = transportFee + shopFee     // purchase price NEVER commissionable

shipperServiceFee   = commissionBase × 15%   // paid by shipper, ON TOP
travelerPlatformFee = commissionBase × 5%    // deducted from traveler payout
sourcingFee         = purchasePrice × 6%     // paid by shipper, ON TOP, 0 if no purchase

// Revenue floor $8.00 — shortfall added to the SHIPPER side only, never
// inflates the traveler's deduction:
baseRevenue = shipperServiceFee + travelerPlatformFee + sourcingFee
if (baseRevenue < 8.00) shipperServiceFee += (8.00 - baseRevenue)

shipperPays      = transportFee + shopFee + purchasePrice + shipperServiceFee + sourcingFee
travelerReceives = transportFee + shopFee + purchasePrice - travelerPlatformFee
fetchrRevenue    = shipperServiceFee + travelerPlatformFee + sourcingFee
escrowHeld       = shipperPays
```

**Invariant, checked at runtime in `calcFees()` itself** (throws in dev,
logs in prod/edge — never trust a caller to re-check this):
`shipperPays - travelerReceives === fetchrRevenue` (within 1 cent). If a
fee is ever charged to one side without landing somewhere, this is where
it gets caught.

**Minimum deal size $15.00** on `commissionBase` (not total deal value) —
escrow payment is blocked entirely below this, before the $8 floor logic
even runs.

Worked examples:
1. Plain carry, 4kg × $15/kg = $60 transport, no purchase: shipperServiceFee
   $9, travelerPlatformFee $3, sourcing $0 (floor not needed, revenue $12) →
   shipperPays $69.00, travelerReceives $57.00, fetchrRevenue $12.00.
2. Shop & ship, $20 transport + $40 shop fee + $200 item: base $60 →
   shipperServiceFee $9, travelerPlatformFee $3, sourcing $12 (revenue $24) →
   shipperPays $281.00, travelerReceives $257.00, fetchrRevenue $24.00.
3. Floor case, $15 transport, no purchase: base revenue $2.25 + $0.75 =
   $3.00, below $8 → shortfall $5.00 loaded onto shipperServiceFee ($7.25) →
   shipperPays $22.25, travelerReceives $14.25, fetchrRevenue $8.00.
4. $10 transport, no purchase: commissionBase $10 < $15 minimum → escrow
   payment rejected outright.

The canonical implementation is `calcFees()` in `src/lib/fees.js` —
**every** frontend component that touches deal money imports it from
there (EscrowPayment, Messages' DealDetailsModal, Matches' match preview,
Dashboard's hero card, ActiveDeals, Completed, Earnings, MyFlights'
potential-earnings estimate). There must never be a second
implementation of this formula in `src/`. The edge function keeps its
own hand-kept, structurally identical mirror (`supabase/functions/stripe-connect/index.ts`,
same constants and field names) since it can't import from `src/`. If
you change one, change both.

A flight offering hand luggage and check-in luggage at different prices
(`flights.luggage_options`) records which tranche a match/deal actually
draws from in `matches.luggage_type` (`'carry_on' | 'checkin' | null` —
null for legacy single-tranche flights). `calcFees()`'s pre-agreement
price fallback, and every display that shows a flight's price/kg before
`agreed_price_per_kg` is locked in, must resolve through
`resolveOptionPrice(flight, luggageType)` (also exported from
`src/lib/fees.js`, mirrored in the edge function) — never read
`flight.price_per_kg` directly, which is only correct for single-tranche
flights and is otherwise just whichever tranche happens to be first.

**UI rule — each side sees only what affects their own number.** Never
show the traveler the shipper's service fee or sourcing fee, and never
show the shipper the traveler's platform fee (this includes not showing
the other side's *total*, like "traveller receives $X", next to figures
the viewer already knows — the missing fee becomes trivially derivable by
subtraction). Shared chat messages (escrow secured, delivery released)
state neutral totals only, never a fee breakdown, since both parties read
the same thread.

Stripe flow: the PaymentIntent amount equals `shipperPays` in cents,
converted from dollars exactly once, same as before. `capture_payment`
never recomputes fees from live match/flight/request data (those remain
editable pre-agreement) — it reads the full breakdown back from the
`escrow_hold` transaction's metadata, written once at escrow-creation
time by both `create_payment_intent` and `escrow_from_wallet` identically,
so an amendment made after payment can never desync what was charged from
what gets released. On capture, `transactions` gets an `escrow_release`
row (traveler, `travelerReceives`) and a `fetchr_revenue` row (the full
`fetchrRevenue`, not just one side's fee) — the old `fetchr_fee` type is
retired; anything reading transaction types (admin dashboard's revenue
query, `admin_user_stats()`, `admin_kpi_timeseries()`) needs the rename.

## Deal lifecycle

`matched → terms_agreed → in_escrow → proof_uploaded → completed`

- Both parties must accept a match before the chat opens.
- Both must "Agree Terms" to reach `terms_agreed`.
- **Only the shipper pays escrow.** The traveler sees a waiting notice.
- Only the traveler uploads delivery proof.
- Both must confirm delivery; capture then credits the traveler's wallet.

Amending deal terms resets both `terms_agreed_*` flags back to false.

## Stripe

Escrow uses `capture_method: 'manual'`. Payments therefore show as
**uncaptured** in the Stripe dashboard until both parties confirm delivery,
at which point `capture_payment` runs and the status becomes succeeded.
This is correct behaviour, not a bug.

Amounts are sent from the frontend in **dollars**. The edge function performs
the `× 100` conversion to cents exactly once. A past bug did it twice and
turned a $5 charge into $500.

Revenue segregation is still done in software, not via Stripe's own
`application_fee_amount` split — escrow charges land in the single platform
balance and the fee is tracked in `transactions.metadata`; the admin
dashboard's Overview tab derives revenue/escrow/wallet-liability numbers
from that ledger rather than from separate Stripe sub-accounts.

Traveler payouts, however, are real: each traveler gets a Stripe Connect
Express account (`stripe_connect_account_id`/`stripe_connect_payouts_enabled`
on `profiles`, created and onboarded via `create_connect_account` /
`create_connect_onboarding_link` in `stripe-connect`). `withdraw_to_bank`
calls `stripe.transfers.create()` to that account for real — it is no
longer simulated. A `/webhook` path on `stripe-connect` (Stripe's
`account.updated` event) keeps `stripe_connect_payouts_enabled` current;
that function is deployed with `--no-verify-jwt` so Stripe can call it
directly (each action still authenticates the caller itself via bearer
token, except the webhook path, which authenticates via Stripe's
signature instead).

The old `save_bank_account` action (raw account/routing numbers submitted
through fetchr's own form, tokenized directly via `stripe.tokens.create`)
was removed — collecting bank details that way is the kind of thing
Stripe restricts to specially-approved platforms. Connect's own hosted
onboarding does that KYC/bank-linking instead.

## Identity verification (Stripe Identity)

Full ID verification (government document + selfie) is optional, not
mandatory for every user — deliberately, to avoid the privacy/liability
burden of fetchr being the party a data breach would expose IDs from.
`profiles.verified` only ever flips to `true` via the `stripe-identity`
edge function's `/webhook` path (the `identity.verification_session.verified`
event), never from the client-side redirect after Stripe's hosted flow —
a user can land back on the return URL before Stripe has actually
finished reviewing the document. That function is also deployed with
`--no-verify-jwt` for the same reason as `stripe-connect`'s webhook.

Verification becomes mandatory, not optional, once a single deal's total
(`totalShipperPays`) reaches `HIGH_VALUE_THRESHOLD` ($500, matching the
top fee tier) — both `create_payment_intent` and `escrow_from_wallet` in
`stripe-connect` check `requireVerifiedForHighValue()` before allowing
escrow to be paid, and refuse if either party isn't verified yet.

## Deep links out to Stripe's hosted flows (Connect onboarding, Identity)

Both use the same pattern for opening an external URL from React, because
naive `window.open()` has two failure modes: it doesn't work at all in
Capacitor's bare iOS WKWebView (no native wiring for it), and on web it's
only reliably treated as user-initiated (bypassing the popup blocker) if
called synchronously inside the click handler — not after an awaited
fetch. The fix, used in both `Profile.jsx` and `Wallet.jsx`: branch on
`Capacitor.isNativePlatform()` — native opens the URL via `@capacitor/browser`'s
`Browser.open()` (a real in-app browser view); web opens a blank tab
synchronously on click (`window.open('', '_blank')`) and redirects it
(`tab.location.href = url`) once the async call returns the real URL.

## Debugging rules learned the hard way

1. **Check DB triggers before anything else** when an UPDATE appears to do
   nothing. Triggers on `matches` fire on every update and abort the whole
   transaction silently if they reference a column that doesn't exist.
   A `reset_match_on_accept()` trigger referencing a missing
   `payment_intent_id` blocked every match acceptance for an entire session.
   ```sql
   SELECT trigger_name, event_manipulation, action_statement
   FROM information_schema.triggers WHERE event_object_table = 'matches';
   ```
2. **Don't gate a data fetch behind a `count` pre-check.** Supabase returns
   `null` for a `head: true` count under some RLS configurations, which made
   `count === 0` true and short-circuited the loader into a blank screen.
3. **Trust `status`, not the boolean flags**, when deciding whether the other
   party has accepted. `status = 'awaiting_other'` is the reliable signal;
   `traveler_accepted` / `shipper_accepted` are not always both written.
4. Realtime needs `REPLICA IDENTITY FULL` and table membership in the
   `supabase_realtime` publication, or UPDATE events never arrive.

## Deploying

```bash
supabase functions deploy stripe-connect   # edge function
git add . && git commit -m "..." && git push   # Vercel auto-deploys frontend
```

SQL migrations are still applied by hand in the Supabase SQL Editor.

## Open bugs

All previously tracked bugs below have been fixed and verified (2026-08-30):

- ~~AddFlight vs MyFlights earnings mismatch~~ — `AddFlight.jsx` had a third,
  never-updated copy of the earnings calc (`getNetEarnings`, generic
  variable names so earlier greps for the old formula missed it) still
  running the pre-two-sided-model tiered percentages. Rewritten to delegate
  to shared `calcFees()`, exactly like the `MyFlights.jsx` fix before it.
- ~~iOS double-tap-to-zoom~~ — `touch-action: manipulation` added globally in
  `src/index.css`; kills the double-tap-zoom gesture while still allowing
  pinch-zoom.
- ~~Duplicate flight search results~~ — `flight-search` edge function's
  `by_route` (and defensively `by_number`) deduped on `flightNumber`, which
  AeroDataBox's `withCodeshared=true` breaks (same physical flight, multiple
  marketing numbers). Deduped on `${departureUtc}_${arrivalUtc}` instead.
- ~~Unmatched shipment requests can only be deleted, not amended~~ —
  `MyRequests.jsx` now has a full edit form for `status='open'` requests
  with no active match; the existing `protect_request_price_columns`
  trigger already freezes price/weight once a real match exists, so no new
  migration was needed.
- ~~Home dashboard shows stacked matches instead of a swipeable carousel~~ —
  `Dashboard.jsx`'s "Coming up" section now uses `CardStack` with a new
  `renderComingUpCard` boarding-pass teaser (route, date, weight, other
  party, item — no fee breakdown) instead of a scrolling list; "Review
  match"/"View deal" navigates into the full Matches/Messages detail.
- ~~Hand luggage vs check-in luggage priced differently weren't matched or
  capacity-tracked independently~~ — a flight's flat `available_kg`/
  `booked_kg` pooled every tranche (e.g. 10kg check-in + 8kg carry-on read
  as one 18kg pool), so an 11kg request could look matchable even though no
  single tranche could hold it, and booking one tranche silently ate into
  the other's capacity. Added `matches.luggage_type`; `find_matches()` now
  evaluates each `luggage_options` tranche's own remaining capacity
  independently and offers the cheapest qualifying tranche (legacy flights
  with no `luggage_options` are unaffected, `luggage_type` stays null);
  `enforce_flight_capacity()`/`update_flight_capacity()` book/release
  against that specific tranche's own `booked_kg` (inside the
  `luggage_options` JSONB) while keeping the flat `booked_kg` column as a
  pooled aggregate for legacy display code. See `resolveOptionPrice()` note
  under Fee logic above for how price resolution follows the same tranche.

- ~~`AddFlight.jsx` airport dropdown wrong IATA code~~ — was already fixed by
  the Jun 7 `AddFlight` rewrite; reproduced with an RTL test against the live
  component and it stores the correct code in every scenario tested.
- ~~Airline logo not fetched/displayed~~ — `AddFlight.jsx`, `MyFlights.jsx`,
  and `Dashboard.jsx` each kept their own hand-maintained
  name→IATA-code map, and `Dashboard.jsx`'s copy only had 15 of 63 airlines,
  so most logos silently fell back to the placeholder icon. Consolidated
  into `src/components/shared/airlines.js` (`AIRLINES`, `AIRLINE_CODES`),
  imported by all three.
- ~~Delivery proof upload RLS violation~~ — root cause: `uploadProof`
  (`Messages.jsx`) and `ProofUploadModal` (`EscrowPayment.jsx`) uploaded to
  the `avatars` bucket at `proofs/<matchId>-...`, but that bucket's INSERT
  policy requires `auth.uid() = (storage.foldername(name))[1]` — the first
  path segment must be the uploader's user id. Fixed both to upload at
  `${session.user.id}/proofs/...`.
- ~~Chat doesn't sync in real time~~ — already fixed; `Messages.jsx`
  subscribes to `postgres_changes` on `matches`, `messages`, and
  `cancellation_requests`, and the DB has `REPLICA IDENTITY FULL` +
  `supabase_realtime` publication membership on both tables (verified live).
- ~~Matches list needs a "view full deal details" button~~ — already
  implemented (`fetchProfile` + profile modal in `Matches.jsx`).
- ~~Matches should flag expectation mismatches~~ — `find_matches()` RPC now
  subtracts 25 points when `shipment_requests.requires_purchase = true` and
  `flights.delivery_type != 'both'`; `Matches.jsx` shows an amber warning
  banner on mismatched cards.
- ~~Declining a match should hide it per-user~~ — `handleDecline` now upserts
  into `match_declines` instead of setting `matches.status = 'rejected'`;
  both match-list queries in `Matches.jsx` exclude the current user's
  declined match ids.
- ~~Duplicate "Fetchr revenue" line~~ — removed from both
  `EscrowPayment.jsx` and `Messages.jsx`; the "Fetchr fee" line above it
  already shows the commission.
