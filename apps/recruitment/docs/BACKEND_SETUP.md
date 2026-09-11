# Backend setup (Supabase)

The production build uses **Supabase** — managed Postgres + Auth + Storage — plus
edge functions for server-side logic (link resolution, application submission,
resume parsing, email). This environment can't provision the project for you, so
these are the one-time manual steps.

## 1. Create the project

1. Sign in at <https://supabase.com> → **New project**. Pick a region close to you.
2. Note the project **ref**, the **Project URL** and the **anon public key**
   (Project Settings → API).

## 2. Install the CLI and link

```bash
npm install -g supabase           # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

## 3. Apply the schema

```bash
supabase db push                  # runs everything in supabase/migrations/
supabase db execute --file supabase/seed.sql   # jobs + pre-offer doc checklist + staff allowlist
```

Edit `supabase/seed.sql` first so `staff_invites` has your real TA / HR / admin
Google accounts. Anyone in that list gets that role on first sign-in; everyone
else becomes a `candidate`.

## 4. Sign-in — Google (everyone) + password (Talent Acquisition only)

Candidates always use Google. Recruiters can use Google or a password.

1. Google Cloud console → APIs & Services → Credentials → **OAuth client ID**
   (type: Web application).
2. Authorised redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
3. In Supabase → Authentication → Providers → **Google**: paste the client ID and
   secret, enable it.
4. Authentication → URL Configuration → Site URL `http://localhost:5173` (add your
   deployed URL later), and add it to the redirect allow-list.
5. To give a recruiter a password login: Authentication → Users → **Add user**,
   enter their email (must match a row in `staff_invites` with `role = 'ta'` so
   they get the right role) and set a password, **Auto Confirm User: on**. They
   can then sign in with either that password or Google at `/ta/login`. Self-
   service email/password sign-up stays disabled — only admin-created accounts
   can use a password.

## 5. Storage

The `20260910094000_storage.sql` migration creates four private buckets
(`resumes`, `documents`, `offer-letters`, `email-attachments`) with RLS. Nothing
to click.

## 6. Edge function secrets (SMTP + links + HR integration)

```bash
supabase secrets set \
  SMTP_HOST=smtp.yourprovider.com \
  SMTP_PORT=587 \
  SMTP_USER=postmaster@ccentrik.com \
  SMTP_PASSWORD=... \
  SMTP_FROM="Ccentrik Talent Acquisition <no-reply@ccentrik.com>" \
  PUBLIC_SITE_URL=http://localhost:5173 \
  INTEGRATION_SHARED_SECRET=<the SAME long random value set in the HR app> \
  HR_FUNCTIONS_URL=https://YOUR_HR_PROJECT_REF.supabase.co/functions/v1
```

`INTEGRATION_SHARED_SECRET` authenticates calls between this app and the
separate HR application (see `docs/requirements/02-*.md` / `03-*.md`) — set
identically in both projects, never exposed to the frontend.

Then deploy the functions:

```bash
supabase functions deploy resolve-link
supabase functions deploy submit-application
supabase functions deploy parse-resume
supabase functions deploy send-email
supabase functions deploy application-decision
supabase functions deploy resubmit-application
supabase functions deploy integration-verification-status   # inbound from HR
supabase functions deploy integration-get-document-url       # inbound from HR
```

## 7. Frontend env

```bash
cp .env.example .env
# fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL
npm run dev
```

## Notes

- `main` branch = the original frontend-only prototype (still runs with no
  backend). Production work is on `feat/phase-1-supabase-backend`.
- Requirements: `docs/requirements/`.
