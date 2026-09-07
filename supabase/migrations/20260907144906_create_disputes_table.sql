create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  raised_by uuid not null references public.profiles(id),
  reason text not null,
  evidence_photo_urls text[] not null default '{}',
  -- open: just filed, AI hasn't run yet (should be near-instant, but the
  -- edge function may still be mid-call).
  -- ai_resolved: AI decided with high confidence on a low-value deal and
  -- the release/refund already executed.
  -- escalated: AI was unsure, or the deal was too large to auto-resolve —
  -- sitting in the admin queue.
  -- resolved: an admin manually resolved an escalated dispute.
  status text not null default 'open'
    check (status in ('open', 'ai_resolved', 'escalated', 'resolved')),
  ai_verdict text check (ai_verdict in ('release_to_traveler', 'refund_to_shipper', 'inconclusive')),
  ai_confidence numeric,
  ai_reasoning text,
  resolution text check (resolution in ('release_to_traveler', 'refund_to_shipper')),
  -- null when the AI auto-resolved; set to the admin's id when a human did.
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- One open/escalated dispute per match at a time — raise_dispute checks
-- this too, but the constraint is the actual guarantee.
create unique index disputes_one_active_per_match
  on public.disputes(match_id)
  where status in ('open', 'escalated');

create index disputes_match_id_idx on public.disputes(match_id);
create index disputes_status_idx on public.disputes(status);

alter table public.disputes enable row level security;

-- Only a party to the match can see its dispute(s) — same shape as every
-- other match-scoped table's policy (messages, cancellation_requests).
create policy "Parties can view their match disputes"
  on public.disputes for select
  using (
    exists (
      select 1 from public.matches m
      where m.id = disputes.match_id
        and (m.traveler_id = auth.uid() or m.shipper_id = auth.uid())
    )
  );

-- Admins can see every dispute, for the admin console. The edge function
-- actually performing admin actions uses the service role and bypasses
-- RLS entirely, but AdminDashboard.jsx's read path should still work if a
-- future screen queries this table directly instead of through the
-- function, and this costs nothing to have in place now.
create policy "Admins can view all disputes"
  on public.disputes for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Inserts only happen through raise_dispute in stripe-connect (service
-- role, bypasses RLS) so match/status validation lives there, not in a
-- client-facing INSERT policy. No client-facing INSERT/UPDATE policy is
-- created at all — every write to this table goes through the edge
-- function, which is the only place fee/escrow logic can safely live.
