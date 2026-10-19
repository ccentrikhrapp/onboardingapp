-- Email OTP second factor for Super Admin logins only (profiles.role =
-- 'admin'). Independent of staff_invitation_tokens / passwords — this adds
-- one verification step after primary auth succeeds; nothing else changes.
create table if not exists public.super_admin_otp_codes (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  code_hash   text not null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists super_admin_otp_codes_profile_idx on public.super_admin_otp_codes (profile_id, created_at desc);
-- RLS enabled, no policies: only the service-role key used by the
-- send-super-admin-otp / verify-super-admin-otp edge functions can touch it.
alter table public.super_admin_otp_codes enable row level security;
