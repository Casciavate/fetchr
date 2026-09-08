-- Stripe Connect can't reach every country: a platform registered in one
-- country may only create connected accounts in the countries Stripe
-- lists in country_specs.supported_transfer_countries for it. fetchr is
-- UAE-registered, so e.g. a Swiss traveler literally cannot be paid via
-- Connect ("Connected accounts in CH cannot be created by platforms in
-- AE"). Rather than leave those users with money they can never take
-- out, they file a payout request here and fetchr settles it manually
-- (bank transfer / PayPal / Wise / whatever works for that corridor).
create table public.payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount numeric not null check (amount > 0),
  fee numeric not null default 0,
  net_amount numeric not null check (net_amount > 0),
  country text,
  method text not null check (method in ('bank_transfer', 'paypal', 'wise', 'other')),
  -- Free-text because the right fields differ per corridor (IBAN + SWIFT,
  -- a PayPal email, a Wise tag...). Readable only by the requester and
  -- admins (see policies below) since it is payout-destination data.
  destination_details text not null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'rejected')),
  admin_note text,
  -- The reserving 'withdrawal' ledger row created at request time; funds
  -- are debited up front so the same balance can't be requested twice.
  transaction_id uuid references public.transactions(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- One open request at a time per user — the funds for it are already
-- reserved, and a queue of overlapping requests is just an ops hazard.
create unique index payout_requests_one_pending_per_user
  on public.payout_requests(user_id) where status = 'pending';

create index payout_requests_status_idx on public.payout_requests(status);
create index payout_requests_user_id_idx on public.payout_requests(user_id);

alter table public.payout_requests enable row level security;

create policy "Users can view their own payout requests"
  on public.payout_requests for select
  using (user_id = auth.uid());

create policy "Admins can view all payout requests"
  on public.payout_requests for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- No client-facing INSERT/UPDATE policy on purpose: every write goes
-- through stripe-connect (service role), which is where the wallet debit
-- and its matching ledger row are kept atomic with the request itself.
