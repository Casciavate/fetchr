create or replace function public.find_matches()
returns void
language plpgsql
security definer
as $$
begin
  insert into matches (flight_id, request_id, traveler_id, shipper_id, match_score, status, luggage_type)
  select
    f.id,
    r.id,
    f.user_id,
    r.user_id,
    greatest(0, least(100, (
      case when f.from_code = r.from_code and f.to_code = r.to_code then 60
           when f.from_city = r.from_city and f.to_city = r.to_city then 50
           else 0 end
      +
      case when r.needed_by is null then 15
           when f.flight_date = r.needed_by then 20
           when r.needed_by - f.flight_date <= 2 then 15
           when r.needed_by - f.flight_date <= 7 then 10
           else 5 end
      +
      case when opt.remaining_kg >= r.weight_kg then 20
           when opt.remaining_kg >= r.weight_kg * 0.8 then 10
           else 0 end
      -
      case when r.requires_purchase = true and f.delivery_type is distinct from 'both' then 25
           else 0 end
    ))),
    'pending',
    opt.luggage_type
  from flights f
  join shipment_requests r on (
    (f.from_code = r.from_code and f.to_code = r.to_code)
    or (f.from_city = r.from_city and f.to_city = r.to_city)
  )
  cross join lateral (
    select
      elem->>'type' as luggage_type,
      coalesce((elem->>'available_kg')::numeric, 0) - coalesce((elem->>'booked_kg')::numeric, 0) as remaining_kg
    from jsonb_array_elements(
      case when jsonb_typeof(f.luggage_options) = 'array' and jsonb_array_length(f.luggage_options) > 0
           then f.luggage_options
           else jsonb_build_array(jsonb_build_object(
             'type', null,
             'available_kg', f.available_kg,
             'price_per_kg', f.price_per_kg,
             'booked_kg', f.booked_kg
           ))
      end
    ) elem
    where coalesce((elem->>'available_kg')::numeric, 0) - coalesce((elem->>'booked_kg')::numeric, 0) >= r.weight_kg * 0.5
      -- Liquids the shipper already owns (not a duty-free Shop & Ship
      -- purchase) can't pass security in hand luggage — check-in only.
      and not (elem->>'type' = 'carry_on' and r.is_liquid = true and r.requires_purchase = false)
    order by
      case when f.fill_priority is not null and elem->>'type' = f.fill_priority then 0 else 1 end,
      (elem->>'price_per_kg')::numeric asc
    limit 1
  ) opt
  where
    f.status = 'active'
    and r.status = 'open'
    and f.user_id != r.user_id
    and f.flight_date >= current_date
    -- A request with no deadline can match any upcoming flight. One with a
    -- deadline can only match a flight arriving on or before it — a flight
    -- that lands after the item is needed can never fulfil the request, no
    -- matter how close the score-bonus tiers above consider it.
    and (r.needed_by is null or f.flight_date <= r.needed_by)
    and not exists (
      select 1 from matches m
      where m.flight_id = f.id
      and m.request_id = r.id
      and m.status != 'rejected'
    );
end;
$$;
