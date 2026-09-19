-- Global withdrawal payouts move from Stripe Connect (cross-border transfers
-- only work between a platform and connected accounts in the same
-- US/UK/EEA/CA/CH corridor — a UAE-registered platform can only create
-- UAE-country connected accounts, confirmed via a live "Connected accounts
-- in CH cannot be created by platforms in AE" rejection) to Nium's payout
-- API, which reaches 190+ countries via bank transfer and push-to-card
-- (Visa Direct / Mastercard Send) from a single UAE-based Nium client —
-- no second legal entity needed.
alter table public.profiles
  add column if not exists nium_beneficiary_id text,
  add column if not exists nium_payment_account_id text,
  add column if not exists nium_payout_method text,      -- 'CARD' | 'LOCAL' | 'SWIFT' — the method the payment account was created for
  add column if not exists nium_payout_country text;      -- ISO-2 country code the beneficiary/payment account was set up for

comment on column public.profiles.nium_beneficiary_id is 'Nium beneficiaryHashId — created once per user via nium-payout''s create_beneficiary action.';
comment on column public.profiles.nium_payment_account_id is 'Nium payment-account hash id (the specific card/bank details) attached to the beneficiary above.';
