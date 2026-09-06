CREATE OR REPLACE FUNCTION public.protect_match_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.role() <> 'service_role' then
    new.payment_intent_id := old.payment_intent_id;
    new.escrow_amount := old.escrow_amount;
    new.refund_status := old.refund_status;
    new.match_score := old.match_score;

    if new.agreed_price_per_kg is distinct from old.agreed_price_per_kg
       or new.agreed_weight_kg is distinct from old.agreed_weight_kg
       or new.agreed_shop_fee is distinct from old.agreed_shop_fee
       or new.agreed_notes is distinct from old.agreed_notes then
      -- Amending was previously only allowed from 'accepted', so a deal
      -- that already reached 'terms_agreed' (e.g. one matched before the
      -- Shop & Ship mismatch check existed, and stuck with a fee that was
      -- never set) could never be corrected: the client's UPDATE would be
      -- silently reverted here, look like a no-op, and the deal would be
      -- stuck below the minimum deal size forever. 'terms_agreed' is safe
      -- to allow too since no money has moved yet (escrow gates on
      -- terms_agreed, never on 'accepted' alone) — once real escrow exists
      -- (in_escrow/proof_uploaded/completed) amending is still blocked.
      if old.status not in ('accepted', 'terms_agreed') then
        new.agreed_price_per_kg := old.agreed_price_per_kg;
        new.agreed_weight_kg := old.agreed_weight_kg;
        new.agreed_shop_fee := old.agreed_shop_fee;
        new.agreed_notes := old.agreed_notes;
      else
        new.terms_agreed_traveler := false;
        new.terms_agreed_shipper := false;
        new.status := 'accepted';
        new.deal_stage := 'matched';
      end if;
    end if;

    if new.traveler_accepted and not old.traveler_accepted and auth.uid() <> old.traveler_id then
      new.traveler_accepted := old.traveler_accepted;
    end if;
    if new.shipper_accepted and not old.shipper_accepted and auth.uid() <> old.shipper_id then
      new.shipper_accepted := old.shipper_accepted;
    end if;
    if new.terms_agreed_traveler and not old.terms_agreed_traveler and auth.uid() <> old.traveler_id then
      new.terms_agreed_traveler := old.terms_agreed_traveler;
    end if;
    if new.terms_agreed_shipper and not old.terms_agreed_shipper and auth.uid() <> old.shipper_id then
      new.terms_agreed_shipper := old.terms_agreed_shipper;
    end if;
    if new.traveler_completed and not old.traveler_completed and auth.uid() <> old.traveler_id then
      new.traveler_completed := old.traveler_completed;
    end if;
    if new.shipper_completed and not old.shipper_completed and auth.uid() <> old.shipper_id then
      new.shipper_completed := old.shipper_completed;
    end if;
  end if;
  return new;
end;
$function$;
