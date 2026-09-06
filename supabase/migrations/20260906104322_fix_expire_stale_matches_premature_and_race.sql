-- Two bugs in expire_stale_matches(), found live on the "Russian Chocolates"
-- deal between Sandro and Anastasiia:
--
-- 1. Off-by-one: `flight_date - current_date <= 1` starts cancelling a full
--    24h before departure, not "before the flight's departure" as the
--    message claims. Changed to `<= 0` (flight is today or has passed).
--
-- 2. Race with the amend flow: amending a deal (protect_match_columns)
--    resets deal_stage back to 'matched' even for a deal that had already
--    reached terms_agreed once — that's correct (both must re-confirm the
--    new terms). But this function only checked deal_stage/status, not
--    whether re-agreement was already under way. So a shipper amending and
--    immediately re-agreeing, with a flight a day out, got the match killed
--    by the next cron tick (runs every 15 min) before the traveler had a
--    chance to click Agree too — the deal never "reset", it was silently
--    force-rejected, twice in a row for this exact deal. Now excluded once
--    either party has already re-agreed, since that's active progress, not
--    an abandoned match.
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
      and not m.terms_agreed_traveler
      and not m.terms_agreed_shipper
      and f.flight_date <= current_date
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
