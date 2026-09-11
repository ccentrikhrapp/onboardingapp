# Ccentrik

**Primary repository** — the complete, production-target C-Centrik system.
Two logically separate applications, strict boundaries between them
(routes/components/APIs/data ownership), connected only through a controlled
integration layer — see
[`docs/requirements/02-two-application-architecture.md`](docs/requirements/02-two-application-architecture.md)
and [`03-recruitment-hr-integration.md`](docs/requirements/03-recruitment-hr-integration.md).

```
apps/
  recruitment/   Application A — Candidate + Talent Acquisition
  hr/            Application B — HR (pre-offer verification onward)
```

Each app has its own `package.json`, its own Supabase project (own database,
auth, storage, edge functions), and its own env vars. Neither app imports code
from the other or talks to the other's database directly.

> **Reference repository:** `https://github.com/sarthak-uwu/Employee-Onboarding`
> is the original frontend-only prototype — used only to understand prior
> workflows/UI/business logic. It is not a development target; this repo is
> the source of truth going forward.

## Getting started

```bash
npm install                 # installs both apps' dependencies
npm run recruitment         # Candidate/TA app -> http://localhost:5173
npm run hr                  # HR app -> http://localhost:5174
```

Backend setup (separate Supabase project per app):
[`apps/recruitment/docs/BACKEND_SETUP.md`](apps/recruitment/docs/BACKEND_SETUP.md),
[`apps/hr/docs/BACKEND_SETUP.md`](apps/hr/docs/BACKEND_SETUP.md).

## Requirements (source of truth)

- [`docs/requirements/00-master-development-prompt.md`](docs/requirements/00-master-development-prompt.md)
- [`docs/requirements/01-pre-offer-document-verification.md`](docs/requirements/01-pre-offer-document-verification.md)
- [`docs/requirements/02-two-application-architecture.md`](docs/requirements/02-two-application-architecture.md)
- [`docs/requirements/03-recruitment-hr-integration.md`](docs/requirements/03-recruitment-hr-integration.md)
