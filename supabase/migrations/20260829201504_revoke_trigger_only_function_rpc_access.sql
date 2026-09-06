-- These are trigger-only functions (fire via BEFORE/AFTER UPDATE, never
-- called directly by the app or referenced in an RLS policy) that
-- PostgREST otherwise exposes as callable RPC endpoints. Calling them
-- directly is harmless in practice (NEW/OLD aren't defined outside a real
-- trigger context, so they'd just error), but there's no reason to leave
-- them reachable at all. is_admin/expire_old_flights/find_matches/
-- mark_messages_read are deliberately left alone — genuinely called via
-- .rpc()/RLS policies from the app.
revoke execute on function public.protect_match_columns() from anon, authenticated;
revoke execute on function public.protect_flight_price_columns() from anon, authenticated;
revoke execute on function public.protect_cancellation_requests() from anon, authenticated;
revoke execute on function public.protect_request_price_columns() from anon, authenticated;
revoke execute on function public.protect_profile_columns() from anon, authenticated;
revoke execute on function public.enforce_flight_capacity() from anon, authenticated;
revoke execute on function public.update_flight_capacity() from anon, authenticated;
revoke execute on function public.recalc_profile_rating() from anon, authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated;
