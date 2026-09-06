-- ── 1. Protect sensitive profiles columns from direct client writes ──
-- RLS's "auth.uid() = id" allows a user to update ANY column on their own
-- row, including wallet_balance, is_admin, verified, rating. Nothing in the
-- app legitimately writes these from the client (verified by code search);
-- they're always meant to be set server-side (edge functions / triggers).
create or replace function public.protect_profile_columns() returns trigger
language plpgsql security definer as $$
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
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_columns_trigger on public.profiles;
create trigger protect_profile_columns_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- ── 2. Protect sensitive matches columns from direct client writes ──
-- These are only ever legitimately set by the stripe-connect edge function
-- (service role); nothing in the frontend writes them directly (verified).
create or replace function public.protect_match_columns() returns trigger
language plpgsql security definer as $$
begin
  if auth.role() <> 'service_role' then
    new.payment_intent_id := old.payment_intent_id;
    new.escrow_amount := old.escrow_amount;
    new.refund_status := old.refund_status;
    new.match_score := old.match_score;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_match_columns_trigger on public.matches;
create trigger protect_match_columns_trigger
  before update on public.matches
  for each row execute function public.protect_match_columns();

-- ── 3. Tighten matches INSERT — was `with_check: true` (anyone could
-- fabricate a match between two unrelated third parties). find_matches()
-- is SECURITY INVOKER, so it runs as the calling user and always inserts
-- matches where that user is one of the two parties — this doesn't break it.
drop policy if exists "System can insert matches" on public.matches;
create policy "Users can insert matches they are party to"
  on public.matches for insert
  with check (auth.uid() = traveler_id or auth.uid() = shipper_id);

-- ── 4. Messages were readable by EVERY authenticated user, not just match
-- participants (`qual: true`) — a real data-privacy leak of private chats.
drop policy if exists "Messages viewable by match participants" on public.messages;
create policy "Messages viewable by match participants"
  on public.messages for select
  using (exists (
    select 1 from public.matches m
    where m.id = messages.match_id
      and (m.traveler_id = auth.uid() or m.shipper_id = auth.uid())
  ));

-- ── 5. Same leak on cancellation_requests (SELECT was `true`, UPDATE was
-- `true` — anyone could read or modify any cancellation request).
drop policy if exists "Match participants can view cancellation requests" on public.cancellation_requests;
create policy "Match participants can view cancellation requests"
  on public.cancellation_requests for select
  using (exists (
    select 1 from public.matches m
    where m.id = cancellation_requests.match_id
      and (m.traveler_id = auth.uid() or m.shipper_id = auth.uid())
  ));

drop policy if exists "Users can update cancellation requests" on public.cancellation_requests;
create policy "Match participants can update cancellation requests"
  on public.cancellation_requests for update
  using (exists (
    select 1 from public.matches m
    where m.id = cancellation_requests.match_id
      and (m.traveler_id = auth.uid() or m.shipper_id = auth.uid())
  ));
