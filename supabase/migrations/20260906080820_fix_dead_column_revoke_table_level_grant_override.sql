-- The previous column-level REVOKE was a no-op: Supabase's default schema
-- setup grants SELECT at the TABLE level (GRANT SELECT ON ALL TABLES IN
-- SCHEMA public), which implicitly covers every column and is not
-- overridden by a column-specific REVOKE. The only way to actually
-- restrict specific columns is to revoke the table-level grant entirely
-- and re-grant SELECT on the explicit safe column list.
revoke select on public.profiles from anon, authenticated;
grant select (
  id, full_name, email, avatar_url, role, bio, rating, total_reviews,
  wallet_balance, created_at, phone, nationality, languages, verified,
  completed_deals, response_rate, payout_card_last4, payout_card_brand,
  stripe_payment_method_id, is_admin, terms_accepted_at,
  stripe_connect_payouts_enabled, is_bot
) on public.profiles to anon, authenticated;
