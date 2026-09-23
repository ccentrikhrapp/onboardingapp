# Authentication, Teams and Deployment

Applies to both apps: `apps/recruitment` (TA + Candidate) and `apps/hr` (HR).
They are separate Supabase projects, so there are two independent auth
systems. A person is the same identity in both apps by **lower-cased email
address** — there is no shared user table.

## Roles (exact names)

| App | Role label | DB value | Home |
|---|---|---|---|
| TA + Candidate | Super Admin | `admin` | `/ta` |
| TA + Candidate | Talent Acquisition Head | `admin_ta` | `/ta` |
| TA + Candidate | Talent Acquisition | `ta` | `/ta` |
| TA + Candidate | Candidate | `candidate` | `/candidate` |
| HR | Super Admin | `admin` | `/hr` |
| HR | HR | `hr` | `/hr` |

The DB enum values are unchanged (renaming them would touch every RLS policy
and edge function); only the visible labels are the required names.
A role in one app grants nothing in the other.

Initial Super Admin in both apps: `sarthak.tyagi@ccentrik.com`.

## Who may do what (enforced server-side in `team-*` edge functions)

| Action | Super Admin | TA Head | TA / HR |
|---|---|---|---|
| Open Teams | yes | yes (TA app only) | no |
| Invite | any role | Talent Acquisition only | no |
| Resend invitation | yes | Talent Acquisition only | no |
| Disable / re-enable | anyone but self | Talent Acquisition only | no |
| Change role | yes (not self) | no | no |
| Delete member permanently | yes (not self, not the last Super Admin) | no | no |

Nobody can change their own account; the last active Super Admin cannot be
demoted, disabled or deleted.

**Delete** (`team-manage` action `delete`) removes the account, profile, invites
and tokens, the stored Google refresh token (also revoked at Google), and the
invitation e-mail log; audit history is kept (`team.delete`). In the TA app the
address goes on `blocked_emails` so Google sign-in cannot silently recreate it
(HR relies on its allow-list trigger); only a deliberate re-invite lifts that.
A TA's applications are handed to the deleting Super Admin; deletion is refused
if the person owns candidate data.

## Invitation flow

1. Teams → *Invite Team Member* (full name, email — any domain, optional phone,
   role) → `team-invite` (Super Admin / TA Head).
2. Function creates the auth user with a **random 12-character temporary
   password** (`must_change_password = true`) + `staff_invites` allow-list row
   (the `handle_new_user` trigger creates the profile with the invited role),
   then a 256-bit one-time token. Only the token's SHA-256 hash is stored
   (`staff_invitation_tokens`); it is single-use and expires after
   `INVITATION_EXPIRY_DAYS` (default 7). The temporary password is never
   stored by the app — only in the e-mail.
3. The CCENTRIK-branded e-mail (login e-mail, **temporary password**, role,
   inviter, validity, "Login to CCENTRIK" button, "change your password
   immediately" warning, plus a one-time activation link as an alternative) is
   sent through the **inviter's own Gmail** (`sendGmailAsActor`) and logged in
   `emails`. The API reports `emailSent` truthfully; a failed send leaves a
   *Pending* invitation that can be resent (resend issues a **new** temporary
   password; the old one stops working).
4. Signing in with the temporary password shows only a *Choose your password*
   screen. Until it is completed the session has **no role**: `current_role_name()`
   returns null (RLS denies everything) and every edge function's
   `currentProfile()` returns null; the single allowed call is
   `set-initial-password` (≥10 chars, letter + number, must differ from the
   temporary one, requires a live/unexpired invitation token). Success clears the
   flag, burns the token, marks the invitation accepted and signs the user in again.
5. Alternatives: the one-time link `/accept-invite?token=…` (`accept-invite`,
   public, token is the credential) sets a password directly; **Sign in with
   Google** with the same e-mail also accepts the invitation (the temporary
   password is then dead — its tokens are deleted). Google sessions are never
   affected by `must_change_password`.
6. Later logins: e-mail + password, or Google. Forgot password uses Supabase's
   single-use recovery email → `/reset-password`.

Statuses: Pending, Accepted, Active, Expired, Disabled (account status:
INVITED / ACTIVE / DISABLED). Expiry is derived from the token itself; a login
with the temporary password alone does not make a member *Active*.

## Access control layers

* **Google ≠ authorization.** Role always comes from `profiles`, which is only
  ever created from `staff_invites` (HR: the trigger *rejects* any email that
  isn't invited; recruitment: unknown Google accounts become plain
  *candidates* and are shown "not associated with an authorized user account"
  on the staff login).
* **Disabled users**: `profiles.active=false` + auth ban (no login/refresh),
  `current_role_name()` returns null (RLS denies everything role-based), and
  every edge function's `currentProfile()` returns null.
* Frontend guards (`RoleRoute`) only hide UI; each function re-checks.
* Audit (`audit_logs`): `team.invite`, `team.invite_resend`,
  `team.activate_invitation`, `team.role_change`, `team.disable`,
  `team.activate`, `team.delete`, `team.set_initial_password`,
  `auth.login_google`, `auth.login_password`.

## Environment

Frontend (`VITE_*`, public by design): `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`.

Edge-function secrets (`supabase secrets set`, per project):
`PUBLIC_SITE_URL` (that app's public URL — used in invitation links),
`INVITATION_EXPIRY_DAYS`, `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, `INTEGRATION_SHARED_SECRET`,
`HR_FUNCTIONS_URL`/`HR_ANON_KEY` (recruitment → HR),
`RECRUITMENT_FUNCTIONS_URL`/`RECRUITMENT_ANON_KEY` (HR → recruitment).
Nothing secret is in the repo or in a frontend bundle.

## Deploying to Vercel

Each app has a `vercel.json` (SPA rewrite so `/accept-invite`, `/ta/team`, …
resolve; security headers). One Vercel project per app:

```
cd apps/recruitment   # then apps/hr
npx vercel login
npx vercel link
npx vercel env add VITE_SUPABASE_URL production
npx vercel env add VITE_SUPABASE_ANON_KEY production
npx vercel env add VITE_SITE_URL production      # the app's own https URL
npx vercel --prod
```

After you have the two production URLs:

1. Supabase (each project) → Authentication → URL Configuration: set *Site URL*
   to that app's production URL and add `https://<app>/**` (and the
   localhost URLs for dev) to *Redirect URLs*.
2. Google Cloud → the OAuth client → Authorized redirect URIs: keep both
   `https://<project-ref>.supabase.co/auth/v1/callback` URLs (Google redirects
   to Supabase, not to Vercel). Publish or keep test users listed.
3. `supabase secrets set PUBLIC_SITE_URL=https://<app>` in each project.
4. Supabase → Authentication → SMTP: configure a real SMTP provider (the
   built-in mailer is heavily rate-limited; it only carries the *forgot
   password* email — invitations go via Gmail).
5. Use separate Supabase projects/keys for Preview vs Production Vercel
   environments if you don't want previews touching production data.

## Known limitations

* Failed sign-in attempts are not audited (Supabase Auth rejects them before
  any of our code runs).
* Inviting requires the inviter to have signed in with Google at least once
  (their Gmail token sends the mail); otherwise the invitation is created but
  reported as "email not sent" until they do.
* In the recruitment app an uninvited Google account still gets a *candidate*
  session (candidates legitimately sign in with Google); it is denied staff
  access and told so.
