-- 20260920120000_member_removal.sql redefined handle_new_user() and dropped the
-- anonymous-candidate fix from 20260915110000_anonymous_candidate_auth.sql: an
-- anonymous auth user has no email, profiles.email is NOT NULL, so every
-- anonymous sign-in ("apply without an account") failed with a 500.
-- This keeps the blocked-email guard and restores the '' fallback.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invited_role app_role;
begin
  if coalesce(new.email, '') <> '' and exists (select 1 from blocked_emails where lower(email) = lower(new.email)) then
    raise exception 'This account has been removed. Contact your administrator.';
  end if;

  select role into invited_role
  from staff_invites
  where lower(email) = lower(coalesce(new.email, ''));

  insert into profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(invited_role, 'candidate')
  );
  return new;
end;
$$;
