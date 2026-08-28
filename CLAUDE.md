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

```
transportFee   = weight_kg × price_per_kg
shopFee        = traveler's service fee for buying the item (matches.agreed_shop_fee)
purchasePrice  = cost of the item itself (shipment_requests.purchase_price)

fetchrBase     = transportFee + shopFee        // NEVER includes purchasePrice
fetchrPct      = <$20 → 12% | <$200 → 10% | <$500 → 8.5% | ≥$500 → 7%
fetchrFee      = fetchrBase × fetchrPct

shipperPays       = transportFee + shopFee + purchasePrice
travelerReceives  = transportFee + shopFee − fetchrFee + purchasePrice
fetchrRevenue     = fetchrFee
```

Worked example — transport $20, shop fee $40, item $200:
fetchrBase $60 → fee $6 (10%) → shipper pays $260, traveler receives $254.

A past bug applied the percentage to the $260 total (giving $22.10). That is wrong.

The canonical implementation is `calcFees()`, exported from
`src/components/EscrowPayment.jsx` and duplicated in the edge function.
If you change one, change both.

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

Revenue segregation is not yet implemented. For production this needs Stripe
Connect: travelers get Connected Accounts and `application_fee_amount` splits
the Fetchr fee to the platform account automatically. Today all funds land in
one account and the fee is tracked in `transactions.metadata`.

Withdrawals are simulated in test mode; real payouts need a verified account.

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

All previously tracked bugs below have been fixed and verified (2026-08-28):

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
