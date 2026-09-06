alter table public.profiles add column if not exists is_bot boolean not null default false;

update public.profiles set is_bot = true
where email in ('sandrocasciani1+fetchrshipper@gmail.com', 'sandrocasciani1+fetchrtraveler@gmail.com');

create table if not exists public.bot_seed_log (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_table, source_id)
);
alter table public.bot_seed_log enable row level security;
