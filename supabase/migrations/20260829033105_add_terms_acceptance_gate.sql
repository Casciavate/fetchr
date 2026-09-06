alter table public.profiles add column if not exists terms_accepted_at timestamptz;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, email, terms_accepted_at)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    case when new.raw_user_meta_data->>'terms_accepted_at' is not null
      then (new.raw_user_meta_data->>'terms_accepted_at')::timestamptz
      else null
    end
  );
  return new;
end;
$$;
