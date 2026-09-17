-- Lets a candidate submit an application with zero account creation up front.
-- Supabase's built-in "anonymous sign-in" gives the browser a real
-- auth.users row (role: authenticated, is_anonymous: true) with no email and
-- no visible sign-in step — it satisfies every existing RLS policy and the
-- submit-application auth check exactly like a real account would, without
-- changing the candidate/application ID architecture at all. The candidate
-- can later "claim" that same account via Google (supabase.auth.linkIdentity)
-- and keeps the same profile/candidate id — see AuthContext.ensureSession /
-- linkGoogle and ApplyPage.jsx.
--
-- The only thing that breaks this today: handle_new_user() inserts
-- profiles.email = new.email, and profiles.email is NOT NULL — an anonymous
-- auth.users row has no email at all, so today that insert (and therefore
-- the anonymous sign-in itself) would fail outright. Fix: fall back to ''.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invited_role app_role;
begin
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
