-- Stores each signed-in user's Gmail-send OAuth grant so edge functions can
-- send email through their own Google account instead of a shared mailbox.
-- Service-role only: no client-side RLS policies, this is never read/written
-- directly from the browser (only via the store-google-token edge function
-- and the sendGmailAsActor helper).
create table public.google_oauth_tokens (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  google_email text not null,
  refresh_token text not null,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.google_oauth_tokens enable row level security;

-- Who the email should be (or was) sent as, when a specific staff action
-- triggered it — an email address rather than a profile id, since
-- recruitment and HR are separate Supabase projects with their own profile
-- UUIDs for the same physical person; email is the one thing consistent
-- across both, and matched against google_oauth_tokens.google_email. Null
-- means "no specific actor" (this app has no fallback transport, so those
-- simply won't be delivered until a Gmail account is connected for them).
alter table public.emails add column sender_email text;
