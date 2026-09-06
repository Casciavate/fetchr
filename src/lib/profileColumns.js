// Single source of truth for which `profiles` columns the client is allowed
// to read — must stay in sync with the GRANT SELECT column list on
// public.profiles (see the profiles-lockdown migration). Defined once and
// imported everywhere instead of copy-pasted, so a future grant change (or
// a new column that needs exposing) only needs updating in one place.

// A user's own full profile read (Profile, Dashboard, EscrowPayment, Wallet).
export const PROFILE_SELF_COLUMNS = 'id, full_name, email, avatar_url, role, bio, rating, total_reviews, wallet_balance, created_at, phone, nationality, languages, verified, completed_deals, response_rate, payout_card_last4, payout_card_brand, stripe_payment_method_id, is_admin, terms_accepted_at, stripe_connect_payouts_enabled, is_bot'

// The counterparty subset shown on match/deal tickets and chat headers —
// never the full self read, since it's someone else's data.
export const PROFILE_PUBLIC_COLUMNS = 'id, full_name, avatar_url, rating, total_reviews, verified'
