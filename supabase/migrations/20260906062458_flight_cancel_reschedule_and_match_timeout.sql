-- Flight cancellation / reschedule support, and auto-expiry of matches that
-- never reach terms_agreed before departure gets close.
alter table public.flights
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists reschedule_reason text,
  add column if not exists last_rescheduled_at timestamptz;

alter table public.matches
  add column if not exists cancel_reason text;

comment on column public.flights.cancellation_reason is 'Traveller-supplied reason when they cancel this flight outright.';
comment on column public.flights.reschedule_reason is 'Traveller-supplied reason for the most recent flight_date change.';
comment on column public.matches.cancel_reason is 'Why a match was auto/unilaterally closed, e.g. flight_cancelled, terms_not_agreed_timeout. Null for a normal decline or the mutual cancellation_requests flow.';

create or replace function public.expire_stale_matches()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  with expiring as (
    select m.id, m.traveler_id
    from public.matches m
    join public.flights f on f.id = m.flight_id
    where m.status = 'accepted'
      and m.deal_stage = 'matched'
      and f.flight_date - current_date <= 1
  )
  update public.matches m
  set status = 'rejected', deal_stage = 'cancelled', cancel_reason = 'terms_not_agreed_timeout'
  from expiring e
  where m.id = e.id;

  insert into public.messages (match_id, sender_id, content, is_read)
  select e.id, e.traveler_id,
    'This match was automatically closed because terms weren''t agreed before the flight''s departure. You can search and match again if you''d still like to arrange this.',
    false
  from expiring e;
end;
$$;

select cron.schedule(
  'expire-stale-matches',
  '*/15 * * * *',
  $$select public.expire_stale_matches();$$
);
