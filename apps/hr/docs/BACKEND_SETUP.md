# HR app backend setup (Supabase)

A **separate Supabase project** from the recruitment app's — its own database,
auth and storage. The two apps talk only through the integration edge
functions on each side, authenticated with a shared secret.

## 1. Create the project

Same as the recruitment app: new Supabase project at supabase.com, note the
project ref, URL and anon key.

## 2. Link and apply the schema

```bash
cd apps/hr
supabase link --project-ref YOUR_HR_PROJECT_REF
supabase db push
supabase db execute --file supabase/seed.sql   # staff allowlist
```

Edit `supabase/seed.sql` first with your real HR/admin Google accounts —
**unlike the recruitment app, there is no default role**: a Google account not
on the allowlist gets no account at all (sign-up is rejected).

## 3. Google OAuth

Same steps as the recruitment app's setup doc, but a **different OAuth
client** (or the same client with this app's redirect URI added) pointing at
this Supabase project:
`https://YOUR_HR_PROJECT_REF.supabase.co/auth/v1/callback`.
Site URL: `http://localhost:5174`.

## 4. Integration secrets (connects this app to the recruitment app)

```bash
supabase secrets set \
  INTEGRATION_SHARED_SECRET=<a long random value> \
  RECRUITMENT_FUNCTIONS_URL=https://YOUR_RECRUITMENT_PROJECT_REF.supabase.co/functions/v1
```

Set the **same** `INTEGRATION_SHARED_SECRET` in the recruitment project's
secrets too (`apps/recruitment/docs/BACKEND_SETUP.md`) — both sides check it
on every cross-app call, and reject the request if it doesn't match.

Then deploy:

```bash
supabase functions deploy integration-document-submitted
supabase functions deploy integration-offer-accepted
supabase functions deploy verify-document
```

## 5. Frontend env

```bash
cp .env.example .env
# fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL
npm run dev   # http://localhost:5174
```

## What this backend does today

- **Pre-offer document verification queue** (`document_verifications` +
  `document_verification_events`): populated by the recruitment app calling
  `integration-document-submitted` whenever a candidate uploads a pre-offer
  document. HR approves/rejects/requests correction via `verify-document`,
  which writes the decision here **and** calls the recruitment app's
  `integration-verification-status` to update the candidate/TA side.
- **Onboarding cases** (`onboarding_cases`): created by
  `integration-offer-accepted` when the recruitment app reports an accepted
  offer. Always starts as `onboarding_initiated` — never an `employees` row
  directly (see docs/requirements/02-*.md §4 and 03-*.md §14).
- **`integration_events`**: append-only inbound log, keyed by the sender's
  `event_id` — a retried delivery is a no-op, never a duplicate record.

## Not built yet

The full onboarding/joining/employee-creation workflow (docs/requirements/
00-*.md §20-21, 03-*.md §9-10, phases 9-10) — `onboarding_cases`/`employees`
tables exist, but there's no UI or forms engine on top of them yet.
