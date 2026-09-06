-- Security fix: withdraw_to_bank read wallet_balance, moved real money via
-- stripe.transfers.create, then wrote wallet_balance = safeBalance - amount
-- with no lock — two concurrent withdrawals could both pass the balance
-- check and both transfer real money, since the second write just
-- clobbered the first using the same stale snapshot (TOCTOU race).
--
-- This does the check-and-decrement (or credit-back, with a positive
-- delta) in one atomic UPDATE — Postgres's row lock serializes concurrent
-- callers, so a losing concurrent call gets 'Insufficient wallet balance'
-- instead of succeeding twice against one balance.
create or replace function public.adjust_wallet_balance(p_user_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_balance numeric;
begin
  update public.profiles
  set wallet_balance = wallet_balance + p_delta
  where id = p_user_id and (p_delta >= 0 or wallet_balance >= -p_delta)
  returning wallet_balance into new_balance;

  if new_balance is null then
    raise exception 'Insufficient wallet balance';
  end if;

  return new_balance;
end;
$function$;
