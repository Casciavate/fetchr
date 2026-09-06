-- Nothing previously checked that a flight actually has enough remaining
-- capacity before letting a match reach 'accepted' — update_flight_capacity()
-- only ever incremented booked_kg, never validated against available_kg.
-- Two shippers could each get mutually accepted on the same flight for a
-- combined weight exceeding what the traveler can actually carry. The
-- flights row is locked (FOR UPDATE) for the duration of the check so two
-- concurrent accepts on the same flight can't both read stale capacity and
-- both pass.
create or replace function public.enforce_flight_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  needed_kg numeric;
  remaining_kg numeric;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    select coalesce(new.agreed_weight_kg, r.weight_kg) into needed_kg
    from public.shipment_requests r where r.id = new.request_id;

    select (f.available_kg - f.booked_kg) into remaining_kg
    from public.flights f where f.id = new.flight_id
    for update;

    if needed_kg is not null and remaining_kg is not null and needed_kg > remaining_kg then
      raise exception 'Not enough capacity left on this flight for this deal (% kg needed, % kg available)', needed_kg, remaining_kg;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_flight_capacity_trigger on public.matches;
create trigger enforce_flight_capacity_trigger
before update on public.matches
for each row execute function public.enforce_flight_capacity();
