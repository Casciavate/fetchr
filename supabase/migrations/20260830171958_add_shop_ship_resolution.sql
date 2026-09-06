alter table public.matches add column if not exists shop_ship_included boolean;

comment on column public.matches.shop_ship_included is
  'Explicit resolution of a Shop & Ship expectation mismatch between the request and flight. Null = unresolved (or no mismatch exists). Set only via the chat resolution flow, which also resets both terms_agreed_* flags.';

create or replace function public.enforce_shop_ship_resolution()
returns trigger
language plpgsql
security definer
as $$
declare
  requested boolean;
  offered boolean;
begin
  if NEW.status = 'terms_agreed' and OLD.status != 'terms_agreed' then
    select r.requires_purchase into requested from public.shipment_requests r where r.id = NEW.request_id;
    select (f.delivery_type = 'both') into offered from public.flights f where f.id = NEW.flight_id;

    if coalesce(requested, false) is distinct from coalesce(offered, false) and NEW.shop_ship_included is null then
      raise exception 'Shop & Ship expectations do not match on this deal and have not been explicitly resolved by both parties';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists enforce_shop_ship_resolution_trigger on public.matches;
create trigger enforce_shop_ship_resolution_trigger
  before update on public.matches
  for each row execute function public.enforce_shop_ship_resolution();
