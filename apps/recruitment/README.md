# Ccentrik — Recruitment (Candidate + Talent Acquisition)

Application 1 of the Ccentrik platform. A real backend (Supabase — Postgres,
Auth, Storage, edge functions) — no mock data, no offline demo mode. HR is a
completely separate application (see the repo root's
[`docs/requirements/`](../../docs/requirements/)) reached only through a
secured integration layer.

Built with **React + Vite + React Router + Lucide**.

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase project's URL + anon key
npm run dev             # http://localhost:5173
```

Without a configured backend the app still runs and renders — every page
shows a clear "backend not configured" state instead of falling back to fake
data. See [`docs/BACKEND_SETUP.md`](docs/BACKEND_SETUP.md) for the one-time
Supabase project setup (schema, RLS, edge functions, Google OAuth, SMTP).

Other scripts:

| Script | Purpose |
| --- | --- |
| `npm run build` | Production build |
| `npm run preview` | Serve the production build |
| `npm run test:routes` | SSR-renders every route and reports crashes |
| `npm run graph` | Regenerate the code map in `graph/` (`GRAPH.md` + data) |
| `npm run graph:open` | Serve `graph/index.html` (force-directed code map) and open it |

## Roles

Sign in with Google at `/`. Roles are set server-side (via the `staff_invites`
allowlist in the database) and cannot be changed from the client:

- **Candidate** — the default role for any new sign-in. Browse jobs, apply
  (real résumé upload + server-side parsing), track the application, respond
  to TA update requests.
- **Talent Acquisition** — assigned/reviews applications, advances / requests
  updates / closes them, manages jobs and per-TA application links.

## End-to-end flow (implemented so far)

```
Candidate applies (direct or via a TA link)
      → real application row created, TA notified + candidate emailed
      → TA reviews: Advance / Request Update / Close
      → candidate notified + emailed; a "Request Update" creates a new,
        versioned resubmission when the candidate acts on it
```

Interviews, pre-offer document verification, offers and onboarding are the
next phases — see [`docs/requirements/`](../../docs/requirements/) at the repo
root for the full specification and current status.

## Project structure

```
src/
├── api/              centralized Supabase calls — client, jobs, applications,
│                     applicationLinks, resumes, notifications, mappers
├── components/
│   ├── common/       Icon, Button, Modal, Table, Badge, …
│   ├── ta/           premium UI kit — Card, DataGrid, KpiCard, DonutChart,
│   │                 FunnelChart, Tag, Toolbar, Pager, TAHeader, …
│   ├── navigation/    CandidateHeader, TASidebar, TATopbar, NotificationBell, ProfileMenu
│   ├── routing/       RoleRoute guard
│   └── workflow/      CreateJobDrawer, ReasonModal
├── context/          AuthContext (Supabase session -> profile -> role),
│                     AppContext (jobs + thin passthrough), ToastContext
├── constants/        statuses.js (status registry), roles.js
├── hooks/            useLocalStorage (apply-form draft only), useCollectionView
├── layouts/          CandidateLayout, TALayout
├── pages/            candidate/ · talentAcquisition/ · shared/
├── routes/           AppRoutes.jsx
├── styles/           ta.css (premium design layer)
└── utils/            ids.js, format.js, metrics.js

supabase/             migrations, RLS, seed data, edge functions
```

`graph/` holds an offline code map — run `npm run graph:open` for the
force-directed view, or read `graph/GRAPH.md` (regenerate after structural
changes — it's currently stale post-refactor).
