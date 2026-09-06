alter table public.pending_flight_imports
  add column if not exists airline text,
  add column if not exists from_code text,
  add column if not exists from_city text,
  add column if not exists to_code text,
  add column if not exists to_city text;
