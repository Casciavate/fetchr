-- EMERGENCY REVERT: the previous migration revoked table-level SELECT on
-- profiles and re-granted only a column subset, but Postgres requires
-- privilege on every column for `select *` to succeed at all (it does not
-- silently narrow to the granted subset) — this broke every live
-- `.from('profiles').select('*')` call in the deployed frontend
-- (EscrowPayment.jsx, Wallet.jsx, Dashboard.jsx, Profile.jsx) instantly.
-- Restoring the original blanket table-level grant now; the dead-column
-- lockdown will be redone only after those call sites stop using select('*').
grant select on public.profiles to anon, authenticated;
