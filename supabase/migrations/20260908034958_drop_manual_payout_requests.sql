-- Rolled back: manual (admin-settled) payouts are not an acceptable
-- operating model for fetchr — payouts must be automated. The table was
-- created earlier today, never used (zero rows), and is dropped here
-- rather than left dangling. The real problem it was working around is
-- unchanged and is NOT solved by Stripe Connect: cross-border payouts
-- are limited to platforms in the US/UK/EEA/CA/CH, so a UAE-registered
-- platform can only ever create UAE connected accounts. Paying
-- travelers elsewhere requires a push-to-card payout provider instead.
drop table if exists public.payout_requests;
