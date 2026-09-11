# Ccentrik HR

Application 2 of the C-Centrik platform — the HR side. A completely separate
application from the Candidate/TA recruitment app: own frontend, own backend
(Supabase project — own database/auth/storage), own deploy. The two apps
communicate only through a secured integration layer (shared-secret edge
function calls), never by querying each other's database.

Full architecture: see the recruitment app's `docs/requirements/`
(`02-two-application-architecture.md`, `03-recruitment-hr-integration.md`) —
those specs are the source of truth for both applications.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5174
```

| Script | Purpose |
| --- | --- |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build |
| `npm run test:routes` | SSR-renders every route and reports crashes |

Backend setup (own Supabase project, integration secrets): see
[`docs/BACKEND_SETUP.md`](docs/BACKEND_SETUP.md).

## What's here today

- **Auth**: Google OAuth, hr/admin roles only, allowlist-gated (no self-serve
  sign-up — an uninvited Google account gets no account at all).
- **Pre-offer document verification queue** (`/hr`): the first integration
  point with the recruitment app — documents a candidate uploads there appear
  here automatically for HR to approve / reject / request a correction, and
  the decision flows back to the candidate/TA side.
- **Design**: its own copy of the recruitment app's premium UI kit, renamed to
  an `hr-` class/token prefix — same visual language, zero shared code.

## Not built yet

Full onboarding (joining documents/forms), employee creation, and the rest of
the HR lifecycle modules (attendance/leave/payroll/exit) from
`docs/requirements/00-master-development-prompt.md` §20 onward. The
`onboarding_cases`/`employees` tables exist (populated by the second
integration point, offer acceptance) but have no UI yet.
