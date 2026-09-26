-- Second payout-provider candidate, alongside the dormant Nium integration
-- (20260919120000_add_nium_payout_columns.sql) — whichever one actually
-- gets working sandbox credentials first is what Wallet.jsx gets wired to.
-- Same reasoning as the Nium columns: Stripe Connect's cross-border
-- transfer corridor (US/UK/EEA/CA/CH only) can never reach travelers
-- outside the UAE from a UAE-registered platform, confirmed live.
alter table public.profiles
  add column if not exists rapyd_beneficiary_id text,
  add column if not exists rapyd_payout_method_type text,  -- e.g. 'us_mastercard_card', 'gb_general_bank' — Rapyd's per-country/method identifier
  add column if not exists rapyd_payout_country text;

comment on column public.profiles.rapyd_beneficiary_id is 'Rapyd beneficiary id (starts with "beneficiary_") — created once per user via rapyd-payout''s create_beneficiary action.';
