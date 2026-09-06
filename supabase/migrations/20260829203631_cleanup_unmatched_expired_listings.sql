-- Flights/requests that never got a real deal shouldn't linger or count
-- toward anything once their date has clearly passed — they should just
-- disappear. A listing with any non-rejected match keeps existing (it has
-- real history); only genuinely never-matched, well-past-date listings
-- are deleted outright rather than marked 'expired' forever.
create or replace function public.expire_old_flights()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.flights f
  where f.flight_date < current_date - interval '5 days'
  and not exists (
    select 1 from public.matches m where m.flight_id = f.id and m.status <> 'rejected'
  );

  delete from public.shipment_requests r
  where r.status = 'open'
  and r.needed_by is not null
  and r.needed_by < current_date - interval '5 days'
  and not exists (
    select 1 from public.matches m where m.request_id = r.id and m.status <> 'rejected'
  );

  update public.flights
  set status = 'expired'
  where status = 'active'
  and flight_date < current_date - interval '5 days';

  update public.flights f
  set status = 'completed'
  from public.matches m
  where m.flight_id = f.id
  and m.status = 'completed'
  and f.status = 'active';

  update public.shipment_requests r
  set status = 'completed'
  from public.matches m
  where m.request_id = r.id
  and m.status = 'completed'
  and r.status = 'open';
end;
$$;
