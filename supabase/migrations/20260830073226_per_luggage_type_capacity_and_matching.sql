-- Per-luggage-type independent capacity tracking + matching.
--
-- Previously a flight's flat available_kg/booked_kg pooled every luggage
-- tranche into one number (e.g. 10kg check-in + 8kg carry-on = 18kg), so a
-- request for 11kg could look "matchable" even though neither individual
-- tranche can actually hold it, and booking against one tranche silently
-- ate into the other's capacity. Fix: track booked_kg per luggage_options
-- entry (the real per-type pool), add matches.luggage_type to record which
-- tranche a match/deal is drawn from, and make find_matches/
-- enforce_flight_capacity/update_flight_capacity type-aware. Flights with
-- no luggage_options (legacy / single-tranche) are untouched — they keep
-- using the flat fields exactly as before, with luggage_type left null.

-- 1. Record which tranche a match draws from.
alter table public.matches
  add column if not exists luggage_type text
  check (luggage_type is null or luggage_type in ('carry_on', 'checkin'));

-- 2. Backfill existing luggage_options entries with a booked_kg field.
update public.flights
set luggage_options = (
  select jsonb_agg(elem || jsonb_build_object('booked_kg', coalesce((elem->>'booked_kg')::numeric, 0)))
  from jsonb_array_elements(luggage_options) elem
)
where luggage_options is not null and jsonb_typeof(luggage_options) = 'array';

-- 3. find_matches(): evaluate each luggage tranche independently. For a
-- flight with real per-type options, only a tranche whose OWN remaining
-- capacity covers the request qualifies; among qualifying tranches, the
-- cheapest price/kg for the shipper is offered. Legacy flights (no
-- luggage_options) fall back to a single synthetic option built from the
-- flat fields, exactly reproducing the old behaviour (luggage_type stays
-- null).
create or replace function public.find_matches()
returns void
language plpgsql
set search_path to 'public'
as $function$
begin
  insert into matches (flight_id, request_id, traveler_id, shipper_id, match_score, status, luggage_type)
  select
    f.id,
    r.id,
    f.user_id,
    r.user_id,
    greatest(0, least(100, (
      case when f.from_code = r.from_code and f.to_code = r.to_code then 60
           when f.from_city = r.from_city and f.to_city = r.to_city then 50
           else 0 end
      +
      case when f.flight_date = r.needed_by then 20
           when abs(f.flight_date - r.needed_by) <= 2 then 15
           when abs(f.flight_date - r.needed_by) <= 7 then 10
           else 5 end
      +
      case when opt.remaining_kg >= r.weight_kg then 20
           when opt.remaining_kg >= r.weight_kg * 0.8 then 10
           else 0 end
      -
      case when r.requires_purchase = true and f.delivery_type is distinct from 'both' then 25
           else 0 end
    ))),
    'pending',
    opt.luggage_type
  from flights f
  join shipment_requests r on (
    (f.from_code = r.from_code and f.to_code = r.to_code)
    or (f.from_city = r.from_city and f.to_city = r.to_city)
  )
  cross join lateral (
    select
      elem->>'type' as luggage_type,
      coalesce((elem->>'available_kg')::numeric, 0) - coalesce((elem->>'booked_kg')::numeric, 0) as remaining_kg
    from jsonb_array_elements(
      case when jsonb_typeof(f.luggage_options) = 'array' and jsonb_array_length(f.luggage_options) > 0
           then f.luggage_options
           else jsonb_build_array(jsonb_build_object(
             'type', null,
             'available_kg', f.available_kg,
             'price_per_kg', f.price_per_kg,
             'booked_kg', f.booked_kg
           ))
      end
    ) elem
    where coalesce((elem->>'available_kg')::numeric, 0) - coalesce((elem->>'booked_kg')::numeric, 0) >= r.weight_kg * 0.5
    order by (elem->>'price_per_kg')::numeric asc
    limit 1
  ) opt
  where
    f.status = 'active'
    and r.status = 'open'
    and f.user_id != r.user_id
    and f.flight_date >= current_date
    and (r.needed_by is null or f.flight_date <= r.needed_by + 7)
    and not exists (
      select 1 from matches m
      where m.flight_id = f.id
      and m.request_id = r.id
      and m.status != 'rejected'
    );
end;
$function$;

-- 4. enforce_flight_capacity(): check the specific tranche's own remaining
-- capacity when the match was made against one (luggage_type set);
-- otherwise fall back to the flat flight-level check exactly as before.
create or replace function public.enforce_flight_capacity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  needed_kg numeric;
  remaining_kg numeric;
  opt jsonb;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(new.agreed_weight_kg, r.weight_kg) into needed_kg
    from public.shipment_requests r where r.id = new.request_id;

    if new.luggage_type is not null then
      select elem into opt
      from public.flights f, jsonb_array_elements(f.luggage_options) elem
      where f.id = new.flight_id and elem->>'type' = new.luggage_type
      for update of f;

      if opt is not null then
        remaining_kg := coalesce((opt->>'available_kg')::numeric, 0) - coalesce((opt->>'booked_kg')::numeric, 0);
      end if;
    else
      select (f.available_kg - f.booked_kg) into remaining_kg
      from public.flights f where f.id = new.flight_id
      for update;
    end if;

    if needed_kg is not null and remaining_kg is not null and needed_kg > remaining_kg then
      raise exception 'Not enough capacity left on this flight for this deal (% kg needed, % kg available)', needed_kg, remaining_kg;
    end if;
  end if;
  return new;
end;
$function$;

-- 5. update_flight_capacity(): when a match has a luggage_type, book/
-- release capacity against that specific tranche inside luggage_options,
-- while keeping the flat booked_kg column in sync as a pooled aggregate
-- (still read by a couple of summary displays). Legacy matches
-- (luggage_type null) update the flat field only, exactly as before.
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

  if NEW.status = 'pending' and OLD.status = 'accepted' then
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
