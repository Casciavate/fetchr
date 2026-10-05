-- Third payout-provider candidate, alongside the dormant Nium and Rapyd
-- integrations (20260919120000, 20260926130000). Trolley's own developer
-- signup was the first of the three where account creation and sandbox
-- API key issuance actually completed without a support/sales blocker.
-- Same underlying reason as the other two: Stripe Connect's cross-border
-- transfer corridor (US/UK/EEA/CA/CH only) can never reach travelers
-- outside the UAE from a UAE-registered platform, confirmed live.
alter table public.profiles
  add column if not exists trolley_recipient_id text,
  add column if not exists trolley_account_id text,
  add column if not exists trolley_payout_method text;  -- 'bank-transfer' | 'paypal' | 'debit-card' | 'venmo' | 'check'

comment on column public.profiles.trolley_recipient_id is 'Trolley recipient id (starts with "R-") — created once per user via trolley-payout''s create_recipient action.';
comment on column public.profiles.trolley_account_id is 'Trolley payout-method/account id attached to the recipient above, via POST /v1/recipients/:id/accounts.';
