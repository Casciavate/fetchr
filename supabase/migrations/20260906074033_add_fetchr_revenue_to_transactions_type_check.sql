-- capture_payment (stripe-connect edge function) has inserted type='fetchr_revenue'
-- since the two-sided pricing rewrite, but the CHECK constraint was never
-- updated to allow it — every capture since that rewrite has been silently
-- failing this insert (supabase-js doesn't throw on a returned {error}, and
-- capture_payment doesn't check this particular insert's error), losing
-- BOTH the escrow_release row for the traveler AND the fetchr_revenue row
-- for admin reporting in one shot, since a multi-row insert is rejected as
-- a whole when any row violates a constraint. The wallet_balance credit
-- itself still lands (that's a separate prior statement), but its absence
-- from the ledger permanently understates getVerifiedBalance() for the
-- traveler (ledger-derived credits no longer include that escrow_release),
-- which can block real withdrawals of money the traveler actually has.
-- There is a real, live, non-bot in_escrow deal (match 32cad139-...) that
-- will hit this the moment it's captured — fixing before that happens.
alter table public.transactions drop constraint transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type = any (array['credit','debit','topup','withdrawal','escrow_hold','escrow_release','fetchr_fee','fetchr_revenue']));
