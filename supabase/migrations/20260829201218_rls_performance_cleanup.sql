-- 1. Remove a fully redundant duplicate policy: "Match participants can
--    update matches v2" has the exact same condition as "Involved users
--    can update matches" — pure dead weight, doubling policy evaluation
--    cost on every matches UPDATE for zero behavioral difference.
drop policy if exists "Match participants can update matches v2" on public.matches;

-- 2. Re-wrap auth.uid()/auth.role() as (select auth.uid()) etc. across
--    every flagged policy. Postgres can cache a subquery's result once per
--    statement; a bare function call in the policy gets re-evaluated once
--    per row. Same access rules, meaningfully cheaper at scale — the
--    standard Supabase RLS performance fix.

alter policy "Users can update own profile" on public.profiles
  using ((select auth.uid()) = id);
alter policy "Users can insert own profile" on public.profiles
  with check ((select auth.uid()) = id);

alter policy "Users can insert own flights" on public.flights
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own flights" on public.flights
  using ((select auth.uid()) = user_id);
alter policy "Users can delete own flights" on public.flights
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own requests" on public.shipment_requests
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own requests" on public.shipment_requests
  using ((select auth.uid()) = user_id);
alter policy "Users can delete own requests" on public.shipment_requests
  using ((select auth.uid()) = user_id);

alter policy "Matches viewable by involved users" on public.matches
  using ((select auth.uid()) = traveler_id or (select auth.uid()) = shipper_id);
alter policy "Involved users can update matches" on public.matches
  using ((select auth.uid()) = traveler_id or (select auth.uid()) = shipper_id);
alter policy "Users can insert matches they are party to" on public.matches
  with check ((select auth.uid()) = traveler_id or (select auth.uid()) = shipper_id);

alter policy "Users can insert messages" on public.messages
  with check ((select auth.uid()) = sender_id);
alter policy "Messages viewable by match participants" on public.messages
  using (exists (select 1 from public.matches m
    where m.id = messages.match_id
      and (m.traveler_id = (select auth.uid()) or m.shipper_id = (select auth.uid()))));

alter policy "Users can view own transactions" on public.transactions
  using ((select auth.uid()) = user_id);

alter policy "Users can insert cancellation requests" on public.cancellation_requests
  with check ((select auth.uid()) = requested_by);
alter policy "Match participants can view cancellation requests" on public.cancellation_requests
  using (exists (select 1 from public.matches m
    where m.id = cancellation_requests.match_id
      and (m.traveler_id = (select auth.uid()) or m.shipper_id = (select auth.uid()))));
alter policy "Match participants can update cancellation requests" on public.cancellation_requests
  using (exists (select 1 from public.matches m
    where m.id = cancellation_requests.match_id
      and (m.traveler_id = (select auth.uid()) or m.shipper_id = (select auth.uid()))));

alter policy "Users can manage own declines" on public.match_declines
  using ((select auth.uid()) = user_id);

alter policy "Users can review their own completed deals" on public.reviews
  with check (
    reviewer_id = (select auth.uid())
    and reviewee_id <> (select auth.uid())
    and exists (select 1 from public.matches m
      where m.id = reviews.match_id and m.status = 'completed'
        and ((m.traveler_id = (select auth.uid()) and m.shipper_id = reviews.reviewee_id)
          or (m.shipper_id = (select auth.uid()) and m.traveler_id = reviews.reviewee_id))));

alter policy "Users can view own pending imports" on public.pending_flight_imports
  using ((select auth.uid()) = user_id);
alter policy "Users can update own pending imports" on public.pending_flight_imports
  using ((select auth.uid()) = user_id);

-- 3. Missing covering indexes on foreign keys flagged by the linter.
create index if not exists idx_reviews_reviewee_id on public.reviews(reviewee_id);
create index if not exists idx_reviews_reviewer_id on public.reviews(reviewer_id);
create index if not exists idx_pending_flight_imports_user_id on public.pending_flight_imports(user_id);
