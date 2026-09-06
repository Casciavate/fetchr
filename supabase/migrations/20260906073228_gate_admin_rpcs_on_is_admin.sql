-- admin_user_stats() and admin_kpi_timeseries() are SECURITY DEFINER and,
-- like every function in the public schema, PostgREST exposes them as
-- directly callable RPC endpoints to anon/authenticated by default. Neither
-- function checked is_admin() internally — the only thing standing between
-- any signed-in (or per the linter, even anonymous) caller and every user's
-- total_earned/total_spent/fetchr_revenue plus platform-wide revenue was the
-- admin-dashboard edge function's own check, which a direct RPC call
-- bypasses entirely. Add the same is_admin() guard the edge function already
-- relies on, directly into the functions themselves.
create or replace function public.admin_user_stats()
returns table(user_id uuid, completed_deals_traveler bigint, completed_deals_shipper bigint, completed_flights bigint, completed_requests bigint, total_earned numeric, total_spent numeric, fetchr_revenue numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Forbidden: admin access only';
  end if;
  return query
  select
    p.id as user_id,
    (select count(*) from matches m where m.traveler_id = p.id and m.status = 'completed') as completed_deals_traveler,
    (select count(*) from matches m where m.shipper_id = p.id and m.status = 'completed') as completed_deals_shipper,
    (select count(distinct m.flight_id) from matches m where m.traveler_id = p.id and m.status = 'completed') as completed_flights,
    (select count(distinct m.request_id) from matches m where m.shipper_id = p.id and m.status = 'completed') as completed_requests,
    coalesce((select sum(t.amount) from transactions t where t.user_id = p.id and t.type = 'escrow_release' and t.status = 'completed'), 0) as total_earned,
    coalesce((select sum(t.amount) from transactions t where t.user_id = p.id and t.type = 'escrow_hold' and t.status = 'completed'), 0) as total_spent,
    coalesce((select sum(t.amount) from transactions t where t.user_id = p.id and t.type = 'fetchr_revenue' and t.status = 'completed'), 0) as fetchr_revenue
  from public.profiles p;
end;
$$;

create or replace function public.admin_kpi_timeseries(start_date date, end_date date)
returns table(day date, new_users bigint, completed_deals bigint, revenue numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    raise exception 'Forbidden: admin access only';
  end if;
  return query
  select
    d::date as day,
    (select count(*) from profiles p where p.created_at::date = d::date) as new_users,
    (select count(*) from matches m where m.status = 'completed' and m.created_at::date = d::date) as completed_deals,
    coalesce((select sum(t.amount) from transactions t where t.type = 'fetchr_revenue' and t.status = 'completed' and t.created_at::date = d::date), 0) as revenue
  from generate_series(start_date, end_date, interval '1 day') as d;
end;
$$;
