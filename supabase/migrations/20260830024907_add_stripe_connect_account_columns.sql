alter table public.profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false;

-- Same protection as every other Stripe/financial column on profiles —
-- only the service-role edge function (via Stripe's own account creation
-- and the account.updated webhook) may ever set these, never the client.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.wallet_balance := old.wallet_balance;
    new.is_admin := old.is_admin;
    new.verified := old.verified;
    new.rating := old.rating;
    new.total_reviews := old.total_reviews;
    new.completed_deals := old.completed_deals;
    new.response_rate := old.response_rate;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_payment_method_id := old.stripe_payment_method_id;
    new.payout_card_last4 := old.payout_card_last4;
    new.payout_card_brand := old.payout_card_brand;
    new.payout_card_token := old.payout_card_token;
    new.bank_account_last4 := old.bank_account_last4;
    new.bank_account_country := old.bank_account_country;
    new.bank_account_holder := old.bank_account_holder;
    new.stripe_bank_token := old.stripe_bank_token;
    new.stripe_connect_account_id := old.stripe_connect_account_id;
    new.stripe_connect_payouts_enabled := old.stripe_connect_payouts_enabled;
  end if;
  return new;
end;
$$;
