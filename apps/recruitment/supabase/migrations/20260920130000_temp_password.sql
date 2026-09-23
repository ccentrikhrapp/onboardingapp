-- Temporary password on invitation. The invited account is created WITH a
-- random temporary password (emailed once), flagged must_change_password.
-- A session established with that password can do exactly one thing: set a
-- permanent password (set-initial-password). Everything else — every RLS
-- policy and every edge function — treats it as having no role at all.
-- Google sign-ins and sessions from a permanent password are unaffected.

alter table public.profiles add column if not exists must_change_password boolean not null default false;

create or replace function public.current_role_name()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from profiles
  where id = auth.uid()
    and active
    and not (
      must_change_password
      and coalesce(auth.jwt() -> 'amr' -> 0 ->> 'method', '') = 'password'
    );
$$;
