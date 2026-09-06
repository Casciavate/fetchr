-- Security fix: profiles' UPDATE RLS policy is row-scoped only
-- (auth.uid() = id), with no column allow-list — meaning any authenticated
-- user could previously self-set is_admin=true (admin escalation),
-- verified=true (bypasses the $500 Stripe Identity gate), or inflate their
-- own wallet_balance, by calling supabase.from('profiles').update({...})
-- on their own row like every other legitimate profile edit does.
--
-- Mirrors the existing protect_match_columns / protect_request_price_columns
-- pattern: a BEFORE UPDATE trigger that reverts privileged columns back to
-- their old value whenever the caller isn't the service role (i.e. every
-- normal client request; edge functions using the service-role key bypass
-- this and keep working exactly as before).
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.role() <> 'service_role' then
    new.id := old.id;
    new.email := old.email;
    new.created_at := old.created_at;
    new.role := old.role;
    new.is_admin := old.is_admin;
    new.verified := old.verified;
    new.wallet_balance := old.wallet_balance;
    new.rating := old.rating;
    new.total_reviews := old.total_reviews;
    new.completed_deals := old.completed_deals;
    new.response_rate := old.response_rate;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_connect_account_id := old.stripe_connect_account_id;
    new.stripe_connect_payouts_enabled := old.stripe_connect_payouts_enabled;
    new.bank_account_last4 := old.bank_account_last4;
    new.bank_account_country := old.bank_account_country;
    new.bank_account_holder := old.bank_account_holder;
    new.stripe_bank_token := old.stripe_bank_token;

    -- Payout card fields: Profile.jsx's "Remove stored card" legitimately
    -- clears these client-side — only allow clearing them, never setting
    -- or replacing them (a real saved card is only ever written by
    -- stripe-connect's service-role update after a real SetupIntent).
    if new.stripe_payment_method_id is not null then new.stripe_payment_method_id := old.stripe_payment_method_id; end if;
    if new.payout_card_last4 is not null then new.payout_card_last4 := old.payout_card_last4; end if;
    if new.payout_card_brand is not null then new.payout_card_brand := old.payout_card_brand; end if;

    -- AcceptTerms.jsx legitimately sets this once (null -> now()) — allow
    -- that, but not un-accepting or backdating an already-set value.
    if old.terms_accepted_at is not null then
      new.terms_accepted_at := old.terms_accepted_at;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists protect_profile_columns_trigger on public.profiles;
create trigger protect_profile_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_columns();
