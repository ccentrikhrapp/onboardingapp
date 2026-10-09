-- Candidate-to-Employee Conversion & Onboarding Workflow — Sections 4/5/6/11.
--
-- Reuses existing tables wherever the data already fits (employees for the
-- employee record itself, onboarding_cases for location/phone, emails for
-- notification delivery tracking, audit_logs for compliance audit entries).
-- New here: who confirmed joining (denormalized onto employees, same
-- pattern joining_profiles.decided_by already uses), a configurable task
-- checklist (template + per-employee instance, so items can be edited by an
-- admin without a code change), and a dashboard-facing activity timeline
-- (mirrors joining_profile_events' proven shape).

-- 1. Who confirmed joining, and when — denormalized onto the employee row
--    itself so the dashboard's "HR Owner" / "Last Updated" columns don't
--    need a join into audit_logs for every row.
alter table public.employees
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists created_by_name text,
  add column if not exists office_location text;

-- 2. Configurable checklist items — Sections 4 & 5 both say "configurable",
--    not a hardcoded list. category distinguishes the two checklists this
--    spec asks for; more could be added later without a schema change.
create table public.onboarding_task_templates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('accounts_it', 'joining_arrangements')),
  key text not null,
  label text not null,
  description text,
  default_owner_role hr_role,
  display_order int not null default 0,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, key)
);

-- 3. Per-employee task instances. One row per checklist item per employee —
--    created once, from the active templates, when the employee is created
--    (never re-created on a retry: unique(employee_id, key) makes that an
--    upsert-safe no-op, the same idempotency shape used throughout this
--    codebase's integration_events tables).
create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_id uuid references public.onboarding_task_templates(id),
  category text not null check (category in ('accounts_it', 'joining_arrangements')),
  key text not null,
  label text not null,
  required boolean not null default true,
  owner_role hr_role,
  owner_profile_id uuid references public.profiles(id),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'blocked', 'completed')),
  asset_identifier text,
  remarks text,
  unavailable boolean not null default false,
  due_date date,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, key)
);
create index onboarding_tasks_employee_idx on public.onboarding_tasks(employee_id);
create index onboarding_tasks_owner_role_idx on public.onboarding_tasks(owner_role) where owner_role is not null;
create index onboarding_tasks_status_idx on public.onboarding_tasks(status);

-- 4. Dashboard-facing activity timeline — separate from audit_logs (which
--    stays the append-only compliance trail written by audit()) because
--    this one is meant to be read back and rendered as a human-readable
--    feed, exactly how joining_profile_events already works for the
--    joining form.
create table public.employee_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  task_id uuid references public.onboarding_tasks(id),
  kind text not null,
  actor_profile_id uuid references public.profiles(id),
  actor_label text,
  old_value jsonb,
  new_value jsonb,
  remark text,
  created_at timestamptz not null default now()
);
create index employee_onboarding_events_employee_idx on public.employee_onboarding_events(employee_id, created_at desc);

-- Append-only, same as audit_logs / document_verification_events — an
-- onboarding timeline that could be quietly edited after the fact isn't a
-- real audit trail.
create or replace function public.forbid_onboarding_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'this table is append-only';
end;
$$;
create trigger employee_onboarding_events_append_only
  before update or delete on public.employee_onboarding_events
  for each row execute function public.forbid_onboarding_event_mutation();

alter table public.onboarding_task_templates enable row level security;
alter table public.onboarding_tasks enable row level security;
alter table public.employee_onboarding_events enable row level security;

-- Templates: every staff role may read them (so a task's "owner_role" can be
-- checked against them); only Super Admin/HR configure them.
create policy onboarding_task_templates_select on public.onboarding_task_templates
  for select using (current_role_name() is not null);
create policy onboarding_task_templates_write on public.onboarding_task_templates
  for all using (current_role_name() in ('admin', 'hr')) with check (current_role_name() in ('admin', 'hr'));

-- Tasks: Super Admin/HR see and manage every task (oversight — Section 7
-- says HR tracks the whole onboarding, not just its own items). Accounts/
-- IT/Office Admin see and update only tasks whose owner_role is their own
-- role, or that are assigned to them by name — enforced here, not only by
-- hiding buttons in the UI (Section 10's explicit requirement).
create policy onboarding_tasks_select on public.onboarding_tasks
  for select using (
    current_role_name() in ('admin', 'hr')
    or owner_role = current_role_name()
    or owner_profile_id = auth.uid()
  );
create policy onboarding_tasks_update on public.onboarding_tasks
  for update using (
    current_role_name() in ('admin', 'hr')
    or owner_role = current_role_name()
    or owner_profile_id = auth.uid()
  );
create policy onboarding_tasks_insert on public.onboarding_tasks
  for insert with check (current_role_name() in ('admin', 'hr'));

-- Events: readable by Super Admin/HR (the dashboard) and by whoever a task
-- on this employee is assigned to (so Accounts/IT/Office Admin can see the
-- history of items they're responsible for); written only server-side.
create policy employee_onboarding_events_select on public.employee_onboarding_events
  for select using (
    current_role_name() in ('admin', 'hr')
    or exists (
      select 1 from public.onboarding_tasks t
      where t.employee_id = employee_onboarding_events.employee_id
        and (t.owner_role = current_role_name() or t.owner_profile_id = auth.uid())
    )
  );
create policy employee_onboarding_events_insert on public.employee_onboarding_events
  for insert with check (current_role_name() is not null);

-- Seed the default checklists named in Sections 4 & 5. HR/Super Admin can
-- edit, add to, or deactivate these afterward — this is the starting
-- configuration, not a hardcoded list the app depends on.
insert into public.onboarding_task_templates (category, key, label, description, default_owner_role, display_order, required) values
  ('accounts_it', 'laptop_allocation', 'Laptop / workstation allocation', 'Assign and hand over the employee''s laptop or workstation.', 'it', 10, true),
  ('accounts_it', 'peripherals', 'Required peripherals and accessories', 'Charger, mouse, keyboard, headset, or other role-specific equipment.', 'it', 20, false),
  ('accounts_it', 'email_setup', 'Corporate email account setup', 'Create the official company email account.', 'it', 30, true),
  ('accounts_it', 'software_access', 'Required software and application access', 'Business software, systems, and application permissions needed for the role.', 'it', 40, true),
  ('accounts_it', 'network_access', 'Network, VPN, and security access', 'Where applicable for the role.', 'it', 50, false),
  ('accounts_it', 'asset_register', 'Asset register update and acknowledgement', 'Record issued assets and collect the employee''s acknowledgement.', 'it', 60, true),
  ('accounts_it', 'payroll_setup', 'Payroll / employee-record setup', 'Finance and payroll record creation.', 'accounts', 70, true),
  ('joining_arrangements', 'lunch_arrangement', 'Lunch arrangement for the joining day', 'Confirm whether lunch is required and arrange it.', 'office_admin', 10, false),
  ('joining_arrangements', 'welcome_kit', 'Welcome kit', NULL, 'office_admin', 20, false),
  ('joining_arrangements', 'id_access_card', 'ID card / access card coordination', NULL, 'office_admin', 30, true),
  ('joining_arrangements', 'seating', 'Seating and workstation readiness', NULL, 'office_admin', 40, true),
  ('joining_arrangements', 'reception', 'Office access and first-day reception', NULL, 'office_admin', 50, true);
