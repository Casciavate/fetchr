-- Roll back the Trolley payout integration (20261005170000). Not a cost
-- fit for a pre-revenue platform: Trolley's "Pay" plan (required for
-- payouts, not just the free Sync/Trust modules) is $2,399/year plus ~2%
-- per transaction, which runs against the same "no external API cost
-- pre-revenue" principle already established elsewhere in this codebase
-- (see CLAUDE.md's Flight search section). The actual integration work
-- (HMAC-SHA256 signature scheme, hex not base64-encoded; response shape
-- { ok, recipient: {...} }) was confirmed working live against Trolley's
-- real sandbox before this rollback, in case Trolley is ever revisited.
--
-- Rapyd remains the active candidate — no subscription fee, pure
-- pay-per-transaction, and its signature auth is already confirmed
-- working (see 20260926130000_add_rapyd_payout_columns.sql); only
-- blocked on the Disburse product being enabled on the account.
alter table public.profiles
  drop column if exists trolley_recipient_id,
  drop column if exists trolley_account_id,
  drop column if exists trolley_payout_method;
