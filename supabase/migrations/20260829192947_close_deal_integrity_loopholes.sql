-- Closes several ways either party to a match could unilaterally alter
-- deal terms or fake the other party's consent, bypassing the intended
-- "both sides must agree" flow entirely via a direct API call (not just
-- through the app's own UI, which only ever does the right thing).

-- 1. matches: negotiated terms (price/weight/shop fee/notes) may only
--    change while status='accepted' (the pre-agreement window), and any
--    such change forces both parties back to "not agreed" — so the other
--    party is always required to re-review and re-agree, they can never
--    be silently skipped. Once terms are agreed (or the deal has moved
--    further), these fields are frozen entirely.
--
--    Also: every party-specific "I confirm" flag (accepted/terms_agreed/
--    completed, per side) may only be flipped true by that exact party —
--    never by the other side pretending to be them. This is what stops a
--    traveler from directly setting shipper_completed=true on their own
--    match and then triggering capture_payment to release escrow without
--    the shipper ever having confirmed delivery.
create or replace function public.protect_match_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    new.payment_intent_id := old.payment_intent_id;
    new.escrow_amount := old.escrow_amount;
    new.refund_status := old.refund_status;
    new.match_score := old.match_score;

    if new.agreed_price_per_kg is distinct from old.agreed_price_per_kg
       or new.agreed_weight_kg is distinct from old.agreed_weight_kg
       or new.agreed_shop_fee is distinct from old.agreed_shop_fee
       or new.agreed_notes is distinct from old.agreed_notes then
      if old.status <> 'accepted' then
        new.agreed_price_per_kg := old.agreed_price_per_kg;
        new.agreed_weight_kg := old.agreed_weight_kg;
        new.agreed_shop_fee := old.agreed_shop_fee;
        new.agreed_notes := old.agreed_notes;
      else
        new.terms_agreed_traveler := false;
        new.terms_agreed_shipper := false;
        new.status := 'accepted';
        new.deal_stage := 'matched';
      end if;
    end if;

    if new.traveler_accepted and not old.traveler_accepted and auth.uid() <> old.traveler_id then
      new.traveler_accepted := old.traveler_accepted;
    end if;
    if new.shipper_accepted and not old.shipper_accepted and auth.uid() <> old.shipper_id then
      new.shipper_accepted := old.shipper_accepted;
    end if;
    if new.terms_agreed_traveler and not old.terms_agreed_traveler and auth.uid() <> old.traveler_id then
      new.terms_agreed_traveler := old.terms_agreed_traveler;
    end if;
    if new.terms_agreed_shipper and not old.terms_agreed_shipper and auth.uid() <> old.shipper_id then
      new.terms_agreed_shipper := old.terms_agreed_shipper;
    end if;
    if new.traveler_completed and not old.traveler_completed and auth.uid() <> old.traveler_id then
      new.traveler_completed := old.traveler_completed;
    end if;
    if new.shipper_completed and not old.shipper_completed and auth.uid() <> old.shipper_id then
      new.shipper_completed := old.shipper_completed;
    end if;
  end if;
  return new;
end;
$$;

-- 2. flights: price fields freeze once any match against this flight has
--    progressed past the pre-agreement stage, so a traveler can't inflate
--    price_per_kg/shop_and_ship_fee after a shipper has already agreed to
--    (or paid) the old numbers. (Downstream payout already reads a frozen
--    escrow_hold snapshot rather than recomputing live, per stripe-connect
--    — this closes the same hole at the source instead of relying only on
--    that mitigation.)
create or replace function public.protect_flight_price_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    if (new.price_per_kg is distinct from old.price_per_kg
        or new.shop_and_ship_fee is distinct from old.shop_and_ship_fee)
       and exists (
         select 1 from public.matches m
         where m.flight_id = old.id
           and m.status not in ('pending', 'rejected', 'accepted')
       ) then
      new.price_per_kg := old.price_per_kg;
      new.shop_and_ship_fee := old.shop_and_ship_fee;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_flight_price_trigger on public.flights;
create trigger protect_flight_price_trigger
before update on public.flights
for each row execute function public.protect_flight_price_columns();

-- 3. shipment_requests: purchase_price is never snapshotted into matches
--    (by design — it's the cost of the item itself, added on top of
--    fetchr's fee base), so it must freeze the same way once a match
--    against it is past the pre-agreement stage.
create or replace function public.protect_request_price_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    if new.purchase_price is distinct from old.purchase_price
       and exists (
         select 1 from public.matches m
         where m.request_id = old.id
           and m.status not in ('pending', 'rejected', 'accepted')
       ) then
      new.purchase_price := old.purchase_price;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_request_price_trigger on public.shipment_requests;
create trigger protect_request_price_trigger
before update on public.shipment_requests
for each row execute function public.protect_request_price_columns();

-- 4. cancellation_requests: a party could request cancellation and then
--    immediately approve their own request — including triggering an
--    actual Stripe refund — with no real consent from the other side.
--    Only the counterpart may move a request to 'agreed'.
create or replace function public.protect_cancellation_requests()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    if new.status = 'agreed' and old.requested_by = auth.uid() then
      raise exception 'Only the other party can agree to a cancellation request';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_cancellation_requests_trigger on public.cancellation_requests;
create trigger protect_cancellation_requests_trigger
before update on public.cancellation_requests
for each row execute function public.protect_cancellation_requests();
