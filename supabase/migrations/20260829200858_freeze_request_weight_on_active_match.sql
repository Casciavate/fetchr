-- weight_kg feeds both the transport-fee calc and the flight capacity
-- ledger (update_flight_capacity increments flights.booked_kg by
-- shipment_requests.weight_kg on accept). It needs the same freeze
-- purchase_price already got, for the same reason: editable post-accept
-- would let a shipper quietly change what a deal actually charges/books
-- for after the traveler agreed to specific terms.
create or replace function public.protect_request_price_columns()
returns trigger
language plpgsql
security definer
as $$
begin
  if auth.role() <> 'service_role' then
    if (new.purchase_price is distinct from old.purchase_price
        or new.weight_kg is distinct from old.weight_kg)
       and exists (
         select 1 from public.matches m
         where m.request_id = old.id
           and m.status not in ('pending', 'rejected', 'accepted')
       ) then
      new.purchase_price := old.purchase_price;
      new.weight_kg := old.weight_kg;
    end if;
  end if;
  return new;
end;
$$;
