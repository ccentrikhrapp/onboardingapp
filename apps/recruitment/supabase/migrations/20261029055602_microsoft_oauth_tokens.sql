-- Stores each signed-in user's Microsoft (Teams) OAuth grant so edge functions
-- can create a real Teams online meeting via Microsoft Graph on that person's
-- own account instead of the mock placeholder link. Mirrors the shape of
-- google_oauth_tokens (20260917010000) — service-role only, no client-side
-- RLS policies, read/written only via the oauth-microsoft-* edge functions
-- and the microsoftGraph.ts helper.
create table public.microsoft_oauth_tokens (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  microsoft_email text not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.microsoft_oauth_tokens enable row level security;
