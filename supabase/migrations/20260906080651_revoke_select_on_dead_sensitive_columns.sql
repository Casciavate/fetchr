-- These columns are never read by any frontend query for any row (verified
-- by grep across src/) — they're written server-side only (stripe-connect
-- edge function) or are dead legacy fields from the removed save_bank_account
-- flow. Revoking SELECT closes them off from the "anyone can read every
-- column via the REST API" exposure with zero functional impact, since
-- nothing legitimately reads them client-side, including the row owner.
revoke select (
  stripe_customer_id,
  stripe_connect_account_id,
  stripe_bank_token,
  bank_account_last4,
  bank_account_country,
  bank_account_holder,
  payout_card_token
) on public.profiles from anon, authenticated;
