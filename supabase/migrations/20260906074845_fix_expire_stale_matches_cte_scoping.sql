-- Bug: the original version split the `expiring` CTE across two separate
-- top-level statements (an UPDATE, then an INSERT) — a CTE's scope is the
-- single statement it's attached to, so the INSERT's `from expiring e`
-- referenced a relation that didn't exist there, erroring on every run.
-- Since this runs on a schedule with no caller checking its result, it has
-- been failing silently every 15 minutes since it was deployed — the
-- match-timeout feature has never actually fired. Fixed by chaining both
-- writes as data-modifying CTEs off the same WITH clause in one statement.
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
  ),
  updated as (
    update public.matches m
    set status = 'rejected', deal_stage = 'cancelled', cancel_reason = 'terms_not_agreed_timeout'
    from expiring e
    where m.id = e.id
    returning m.id
  )
  insert into public.messages (match_id, sender_id, content, is_read)
  select e.id, e.traveler_id,
    'This match was automatically closed because terms weren''t agreed before the flight''s departure. You can search and match again if you''d still like to arrange this.',
    false
  from expiring e;
end;
$$;
