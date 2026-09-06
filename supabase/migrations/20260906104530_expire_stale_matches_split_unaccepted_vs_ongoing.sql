-- Further correction per product decision: the "flight departs within 24h"
-- timeout should only ever apply to a candidate match neither party has
-- accepted yet (status pending/awaiting_other) — there's no reason to keep
-- an unengaged candidate alive right up to departure.
--
-- An already-accepted, ongoing deal (status accepted/terms_agreed) must
-- NOT be touched by that 24h rule at all — amending and renegotiating terms
-- is exactly the point of that stage, and should be allowed all the way up
-- to actual departure, however many rounds it takes. Such a deal should
-- only ever be auto-closed once the flight has genuinely departed
-- (flight_date <= current_date) AND it never made it to escrow
-- (in_escrow/proof_uploaded/completed) — i.e. it really did fall through,
-- not just "still mid-negotiation".
create or replace function public.expire_stale_matches()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  with expiring_unaccepted as (
    select m.id, m.traveler_id,
      'terms_not_agreed_timeout'::text as reason,
      'This match was automatically closed because terms weren''t agreed before the flight''s departure. You can search and match again if you''d still like to arrange this.'::text as msg
    from public.matches m
    join public.flights f on f.id = m.flight_id
    where m.status in ('pending', 'awaiting_other')
      and f.flight_date - current_date <= 1
  ),
  expiring_incomplete as (
    select m.id, m.traveler_id,
      'deal_not_completed_timeout'::text as reason,
      'This match was automatically closed because the deal was never completed (escrow was never paid) before the flight''s departure. You can search and match again if you''d still like to arrange this.'::text as msg
    from public.matches m
    join public.flights f on f.id = m.flight_id
    where m.status in ('accepted', 'terms_agreed')
      and f.flight_date <= current_date
  ),
  expiring as (
    select * from expiring_unaccepted
    union all
    select * from expiring_incomplete
  ),
  updated as (
    update public.matches m
    set status = 'rejected', deal_stage = 'cancelled', cancel_reason = e.reason
    from expiring e
    where m.id = e.id
    returning m.id
  )
  insert into public.messages (match_id, sender_id, content, is_read)
  select e.id, e.traveler_id, e.msg, false
  from expiring e;
end;
$$;
