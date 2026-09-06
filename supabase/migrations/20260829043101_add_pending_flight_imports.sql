create table if not exists public.pending_flight_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  flight_number text,
  flight_date date,
  raw_subject text,
  raw_snippet text,
  status text not null default 'pending' check (status in ('pending', 'imported', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table public.pending_flight_imports enable row level security;

create policy "Users can view own pending imports"
  on public.pending_flight_imports for select
  using (auth.uid() = user_id);

create policy "Users can update own pending imports"
  on public.pending_flight_imports for update
  using (auth.uid() = user_id);

-- No client INSERT policy: rows are only ever created by the
-- email-import edge function via the service role (which bypasses RLS).
