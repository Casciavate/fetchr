-- find_matches()'s own dedupe (`not exists (... where status != 'rejected')`)
-- was written to allow a fresh match once a prior one is rejected/cancelled,
-- but the table's unconditional UNIQUE(flight_id, request_id) blocked that
-- insert regardless of the old row's status — silently, since no caller
-- ever checks find_matches()'s result (documented precedent: the
-- SECURITY DEFINER fix in CLAUDE.md's debugging notes was found the same
-- way). Any pair that reached mutual cancellation, the new unilateral
-- flight-cancellation refund path, or the new expire_stale_matches()
-- timeout sweep could never be rematched again. Replaced with a partial
-- unique index that only constrains non-rejected rows, matching the
-- dedupe's own intent exactly — multiple rejected rows for the same pair
-- are fine (history), only one *live* one ever is.
alter table public.matches drop constraint unique_flight_request;
create unique index unique_flight_request_live on public.matches (flight_id, request_id) where status <> 'rejected';
