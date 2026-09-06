create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (match_id, reviewer_id)
);

alter table public.reviews enable row level security;

create policy "Reviews are publicly readable"
  on public.reviews for select
  using (true);

create policy "Users can review their own completed deals"
  on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and reviewee_id <> auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status = 'completed'
        and (
          (m.traveler_id = auth.uid() and m.shipper_id = reviewee_id)
          or (m.shipper_id = auth.uid() and m.traveler_id = reviewee_id)
        )
    )
  );

-- Recompute the reviewee's aggregate rating server-side (SECURITY DEFINER),
-- so this works regardless of the reviewer's own RLS UPDATE restriction on
-- profiles (a user can only ever update their own profile row, not the
-- person they just reviewed's — this is why the previous client-side
-- read-modify-write approach silently did nothing).
create or replace function public.recalc_profile_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_id uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.profiles p
  set rating = coalesce((select round(avg(r.rating)::numeric, 1) from public.reviews r where r.reviewee_id = target_id), 0),
      total_reviews = (select count(*) from public.reviews r where r.reviewee_id = target_id)
  where p.id = target_id;
  return null;
end;
$$;

drop trigger if exists reviews_recalc_rating on public.reviews;
create trigger reviews_recalc_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recalc_profile_rating();
