create table if not exists public.flight_schedule_cache (
  cache_key text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.flight_schedule_cache enable row level security;
-- No client policies: only the flight-search edge function (service role) reads/writes this.
