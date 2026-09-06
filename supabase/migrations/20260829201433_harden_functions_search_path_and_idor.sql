-- 1. Fix a real IDOR: mark_messages_read(p_match_id, p_user_id) is
--    SECURITY DEFINER (bypasses messages RLS) and trusted p_user_id from
--    the client with zero check that the caller actually owns it or is
--    even a participant in that match — any signed-in user could mark
--    another user's messages read on a match they aren't part of.
create or replace function public.mark_messages_read(p_match_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'Forbidden: cannot mark messages read on behalf of another user';
  end if;
  if not exists (
    select 1 from public.matches m
    where m.id = p_match_id and (m.traveler_id = auth.uid() or m.shipper_id = auth.uid())
  ) then
    raise exception 'Forbidden: not a party to this match';
  end if;
  update public.messages
  set is_read = true
  where match_id = p_match_id
  and sender_id != p_user_id
  and is_read = false;
end;
$$;

-- 2. handle_new_user trusted a client-supplied terms_accepted_at at signup
--    (from options.data in supabase.auth.signUp), so a raw API call
--    bypassing the actual T&C checkbox could self-report consent with an
--    arbitrary timestamp. AcceptTerms.jsx is already the real, uniform
--    gate (every account, however created, must click through it — see
--    its own comment) — new profiles now always start with
--    terms_accepted_at null so every signup path goes through that one
--    real, server-timestamped consent action.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, terms_accepted_at)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email, null);
  return new;
end;
$$;

-- 3. search_path hardening on every SECURITY DEFINER / flagged function —
--    without a fixed search_path, a SECURITY DEFINER function resolves
--    unqualified identifiers via the CALLER's search_path, so a caller
--    able to create objects earlier in that path could redirect the
--    function to attacker-controlled objects while it runs with elevated
--    privilege. Standard Postgres/Supabase hardening.
alter function public.protect_match_columns() set search_path = public;
alter function public.protect_flight_price_columns() set search_path = public;
alter function public.protect_cancellation_requests() set search_path = public;
alter function public.protect_request_price_columns() set search_path = public;
alter function public.protect_profile_columns() set search_path = public;
alter function public.enforce_flight_capacity() set search_path = public;
alter function public.update_flight_capacity() set search_path = public;
alter function public.expire_old_flights() set search_path = public;
alter function public.calculate_distance_km(numeric, numeric, numeric, numeric) set search_path = public;
alter function public.reset_match_on_reopen() set search_path = public;
alter function public.reset_match_on_accept() set search_path = public;
alter function public.reset_cancelled_match() set search_path = public;
alter function public.find_matches() set search_path = public;
