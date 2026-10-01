-- Employee Joining Form: ONE central profile per onboarding case. Every joining
-- document (PF Form 11 / Form 2, gratuity Form F, BGV, consents…) is built from
-- this row, so nothing is typed twice. The employee fills it in through the
-- recruitment app (which calls integration-joining-profile with the shared
-- secret); HR reads it here and controls the HR-only fields.
--
-- Writes happen ONLY through edge functions (service role) so field-level
-- history, locking and status rules can't be bypassed from a browser.

create table joining_profiles (
  id                     uuid primary key default gen_random_uuid(),
  onboarding_case_id     uuid not null unique references onboarding_cases (id) on delete cascade,
  source_application_id  uuid not null unique,
  data                   jsonb not null default '{}',      -- data[section][group]
  field_sources          jsonb not null default '{}',      -- "section.group.key" -> candidate_application | employee | hr | system
  hr_fields              jsonb not null default '{}',
  status                 text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'submitted', 'under_review', 'correction_required', 'resubmitted', 'verified', 'completed')),
  completion             integer not null default 0,
  corrections            jsonb not null default '[]',      -- [{ id, section, field, remark, requested_at, requested_by, resolved_at }]
  signature              jsonb,                            -- { name, at } captured at submit
  submitted_at           timestamptz,
  resubmitted_at         timestamptz,
  review_started_at      timestamptz,
  verified_at            timestamptz,
  completed_at           timestamptz,
  last_saved_at          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index joining_profiles_status_idx on joining_profiles (status);
create trigger joining_profiles_set_updated_at before update on joining_profiles
  for each row execute function set_updated_at();

-- Field-level audit trail + status history.
create table joining_profile_events (
  id                  uuid primary key default gen_random_uuid(),
  joining_profile_id  uuid not null references joining_profiles (id) on delete cascade,
  kind                text not null,      -- field_change | status | correction | hr_fields | submit | note
  section             text,
  field               text,
  old_value           jsonb,
  new_value           jsonb,
  actor_label         text,
  actor_profile_id    uuid references profiles (id) on delete set null,
  remark              text,
  created_at          timestamptz not null default now()
);
create index joining_profile_events_idx on joining_profile_events (joining_profile_id, created_at desc);

-- What was signed / submitted, frozen. Later edits never touch these rows.
create table joining_profile_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  joining_profile_id  uuid not null references joining_profiles (id) on delete cascade,
  kind                text not null check (kind in ('submitted', 'resubmitted')),
  data                jsonb not null,
  hr_fields           jsonb not null default '{}',
  signature           jsonb,
  created_at          timestamptz not null default now()
);
create index joining_profile_snapshots_idx on joining_profile_snapshots (joining_profile_id, created_at desc);

alter table joining_profiles enable row level security;
alter table joining_profile_events enable row level security;
alter table joining_profile_snapshots enable row level security;

create policy joining_profiles_staff_select on joining_profiles
  for select using (current_role_name() is not null);
create policy joining_profile_events_staff_select on joining_profile_events
  for select using (current_role_name() is not null);
create policy joining_profile_snapshots_staff_select on joining_profile_snapshots
  for select using (current_role_name() is not null);
