-- Bug found during audit, verified against live data: reset_cancelled_match()
-- silently rewrote a cancelled match's status from 'rejected' back to
-- 'pending' (clearing most flags but NOT payment_intent_id/escrow_amount),
-- so a deal that had a real Stripe escrow hold and was then cancelled sat
-- there looking like a brand-new pending match with stale escrow fields
-- attached — confirmed live on match 29a3b9df-73cd-4455-816d-e1c7a89989b1
-- (payment_intent_id='pi_3U9qT5Jl23xf7fMJ0AfxMv0N', escrow_amount=12,
-- status='pending'). This also directly broke this session's cancelled-
-- deal-history feature (Completed.jsx shows status IN ('completed',
-- 'rejected')) — a cancelled deal never actually reached 'rejected' long
-- enough to be recorded there; it just silently reappeared as an ordinary
-- active match for the same two parties to consider again.
--
-- The original intent ("so find_matches can surface it again") is already
-- preserved without any state rewrite: find_matches()'s own NOT EXISTS
-- guard only excludes existing matches with status != 'rejected', so a
-- genuinely-rejected match already allows a fresh match to be created
-- between the same flight/request pair.
create or replace function public.reset_cancelled_match()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if NEW.status = 'rejected' and OLD.status in ('accepted', 'awaiting_other', 'in_escrow', 'terms_agreed', 'proof_uploaded') then
    NEW.traveler_accepted := false;
    NEW.shipper_accepted := false;
    NEW.terms_agreed_traveler := false;
    NEW.terms_agreed_shipper := false;
    NEW.traveler_completed := false;
    NEW.shipper_completed := false;
    NEW.proof_photo_url := null;
    NEW.proof_uploaded_at := null;
    NEW.payment_intent_id := null;
    NEW.escrow_amount := null;
    NEW.agreed_price_per_kg := null;
    NEW.agreed_weight_kg := null;
    NEW.agreed_shop_fee := null;
    NEW.agreed_notes := null;
  end if;
  return NEW;
end;
$function$;

-- update_flight_capacity()'s release path only fired for
-- NEW.status='pending' and OLD.status='accepted' — capacity booked at
-- 'accepted' and never touched again until completion never got released
-- if a deal was cancelled from terms_agreed/in_escrow/proof_uploaded
-- instead (a real capacity leak: booked_kg would stay inflated forever).
-- Now matches the real transition the app performs on cancellation
-- (status -> 'rejected') and covers every stage capacity could have been
-- booked at.
create or replace function public.update_flight_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  wt numeric;
begin
  if NEW.status = 'accepted' and OLD.status != 'accepted' then
    select weight_kg into wt from public.shipment_requests where id = NEW.request_id;

    if NEW.luggage_type is not null then
      update public.flights
      set luggage_options = (
            select jsonb_agg(
              case when elem->>'type' = NEW.luggage_type
                   then jsonb_set(elem, '{booked_kg}', to_jsonb(coalesce((elem->>'booked_kg')::numeric, 0) + wt))
                   else elem end
            )
            from jsonb_array_elements(luggage_options) elem
          ),
          booked_kg = booked_kg + wt
      where id = NEW.flight_id;
    else
      update public.flights
      set booked_kg = booked_kg + wt
      where id = NEW.flight_id;
    end if;
  end if;

  if NEW.status = 'rejected' and OLD.status in ('accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded') then
    select weight_kg into wt from public.shipment_requests where id = NEW.request_id;

    if NEW.luggage_type is not null then
      update public.flights
      set luggage_options = (
            select jsonb_agg(
              case when elem->>'type' = NEW.luggage_type
                   then jsonb_set(elem, '{booked_kg}', to_jsonb(greatest(0, coalesce((elem->>'booked_kg')::numeric, 0) - wt)))
                   else elem end
            )
            from jsonb_array_elements(luggage_options) elem
          ),
          booked_kg = greatest(0, booked_kg - wt)
      where id = NEW.flight_id;
    else
      update public.flights
      set booked_kg = greatest(0, booked_kg - wt)
      where id = NEW.flight_id;
    end if;
  end if;

  return NEW;
end;
$function$;
