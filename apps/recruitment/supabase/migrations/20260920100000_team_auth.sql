-- Team / invitation / access layer. Extends the existing staff_invites +
-- profiles system (no parallel user tables). Business data is untouched.

-- Invitation metadata on the existing allowlist table.
alter table public.staff_invites add column if not exists full_name text;
alter table public.staff_invites add column if not exists invited_at timestamptz not null default now();
alter table public.staff_invites add column if not exists expires_at timestamptz;
alter table public.staff_invites add column if not exists last_sent_at timestamptz;
alter table public.staff_invites add column if not exists send_count integer not null default 0;
alter table public.staff_invites add column if not exists accepted_at timestamptz;

-- Single-use invitation tokens. Only the SHA-256 hash is stored, so a DB
-- read never reveals a usable link. No policies = service role only.
create table if not exists public.staff_invitation_tokens (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);
create index if not exists staff_invitation_tokens_email_idx on public.staff_invitation_tokens (lower(email));
alter table public.staff_invitation_tokens enable row level security;

-- A deactivated account loses every role-based permission at the database
-- layer too (not just in the UI): current_role_name() is what every RLS
-- policy keys on, so it returns null for an inactive profile.
create or replace function public.current_role_name()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from profiles where id = auth.uid() and active;
$$;

-- admin_ta (Talent Acquisition Head) was missing from is_staff(), which
-- hid draft jobs, other profiles, application links etc. from TA Heads.
create or replace function public.is_staff()
returns boolean
language sql stable
as $$
  select current_role_name() in ('ta', 'hr', 'admin', 'admin_ta');
$$;
