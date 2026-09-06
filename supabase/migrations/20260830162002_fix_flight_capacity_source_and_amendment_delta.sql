create or replace function public.update_flight_capacity()
returns trigger
language plpgsql
security definer
as $$
declare
  req_wt numeric;
  ltype text;
  old_wt numeric;
  new_wt numeric;
  delta numeric;
begin
  select weight_kg into req_wt from public.shipment_requests where id = NEW.request_id;
  ltype := coalesce(NEW.luggage_type, OLD.luggage_type);

  if NEW.status = 'accepted' and OLD.status != 'accepted' then
    new_wt := coalesce(NEW.agreed_weight_kg, req_wt);
    if ltype is not null then
      update public.flights
      set luggage_options = (
            select jsonb_agg(
              case when elem->>'type' = ltype
                   then jsonb_set(elem, '{booked_kg}', to_jsonb(coalesce((elem->>'booked_kg')::numeric, 0) + new_wt))
                   else elem end
            )
            from jsonb_array_elements(luggage_options) elem
          ),
          booked_kg = booked_kg + new_wt
      where id = NEW.flight_id;
    else
      update public.flights set booked_kg = booked_kg + new_wt where id = NEW.flight_id;
    end if;

  elsif NEW.status = 'rejected' and OLD.status in ('accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded') then
    old_wt := coalesce(OLD.agreed_weight_kg, req_wt);
    if ltype is not null then
      update public.flights
      set luggage_options = (
            select jsonb_agg(
              case when elem->>'type' = ltype
                   then jsonb_set(elem, '{booked_kg}', to_jsonb(greatest(0, coalesce((elem->>'booked_kg')::numeric, 0) - old_wt)))
                   else elem end
            )
            from jsonb_array_elements(luggage_options) elem
          ),
          booked_kg = greatest(0, booked_kg - old_wt)
      where id = NEW.flight_id;
    else
      update public.flights set booked_kg = greatest(0, booked_kg - old_wt) where id = NEW.flight_id;
    end if;

  elsif NEW.status = OLD.status and NEW.status in ('accepted', 'terms_agreed', 'in_escrow', 'proof_uploaded')
        and coalesce(NEW.agreed_weight_kg, req_wt) is distinct from coalesce(OLD.agreed_weight_kg, req_wt) then
    old_wt := coalesce(OLD.agreed_weight_kg, req_wt);
    new_wt := coalesce(NEW.agreed_weight_kg, req_wt);
    delta := new_wt - old_wt;
    if ltype is not null then
      update public.flights
      set luggage_options = (
            select jsonb_agg(
              case when elem->>'type' = ltype
                   then jsonb_set(elem, '{booked_kg}', to_jsonb(greatest(0, coalesce((elem->>'booked_kg')::numeric, 0) + delta)))
                   else elem end
            )
            from jsonb_array_elements(luggage_options) elem
          ),
          booked_kg = greatest(0, booked_kg + delta)
      where id = NEW.flight_id;
    else
      update public.flights set booked_kg = greatest(0, booked_kg + delta) where id = NEW.flight_id;
    end if;
  end if;

  return NEW;
end;
$$;
