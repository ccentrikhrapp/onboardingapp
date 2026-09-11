-- ============================================================================
-- Interview process — rounds, panel, mandatory-remarks feedback.
--
-- Panelists are a simple roster (name/email/department), not full user
-- accounts — there's no separate panelist login/role yet. The assigned TA
-- records the panel's decision + remarks after the round happens, the same
-- way offer letters are "sent outside the app and recorded here". Round
-- names are configurable per round, never hardcoded to a fixed set.
-- ============================================================================

create type interview_round_status as enum ('scheduled', 'completed', 'cancelled', 'rescheduled');
create type interview_decision as enum ('advance', 'further_review', 'not_progressing');

create table interview_panelists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text,
  department  text,
  designation text,
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now()
);

create table interview_rounds (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references applications (id) on delete cascade,
  round_number     integer not null,
  name             text not null,
  description      text,
  scheduled_at     timestamptz,
  duration_minutes integer,
  meeting_url      text,
  location         text,
  instructions     text,
  status           interview_round_status not null default 'scheduled',
  created_by       uuid references profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (application_id, round_number)
);
create index interview_rounds_app_idx on interview_rounds (application_id);
create trigger interview_rounds_set_updated_at
  before update on interview_rounds
  for each row execute function set_updated_at();

create table interview_assignments (
  id                uuid primary key default gen_random_uuid(),
  interview_round_id uuid not null references interview_rounds (id) on delete cascade,
  panelist_id       uuid not null references interview_panelists (id),
  unique (interview_round_id, panelist_id)
);

-- One feedback row per round (the recording TA captures the panel's overall
-- decision). remarks is NOT NULL — the backend rejects empty feedback, not
-- just the frontend (master prompt §41, §41 of 00-*, §41 here).
create table interview_feedback (
  id                  uuid primary key default gen_random_uuid(),
  interview_round_id  uuid not null references interview_rounds (id) on delete cascade,
  decision            interview_decision not null,
  remarks             text not null check (btrim(remarks) <> ''),
  share_with_candidate boolean not null default false,
  submitted_by        uuid references profiles (id),
  created_at          timestamptz not null default now(),
  unique (interview_round_id)
);

alter table interview_panelists   enable row level security;
alter table interview_rounds      enable row level security;
alter table interview_assignments enable row level security;
alter table interview_feedback    enable row level security;

create policy interview_panelists_select on interview_panelists
  for select using (is_staff());
create policy interview_panelists_manage on interview_panelists
  for all using (current_role_name() in ('ta', 'admin')) with check (current_role_name() in ('ta', 'admin'));

create policy interview_rounds_select on interview_rounds
  for select using (can_read_application(application_id));
create policy interview_rounds_manage on interview_rounds
  for all using (
    current_role_name() in ('ta', 'admin')
    and exists (select 1 from applications a where a.id = application_id and (a.assigned_ta_id = auth.uid() or current_role_name() = 'admin'))
  );

create policy interview_assignments_select on interview_assignments
  for select using (
    exists (select 1 from interview_rounds r where r.id = interview_round_id and can_read_application(r.application_id))
  );
create policy interview_assignments_manage on interview_assignments
  for all using (current_role_name() in ('ta', 'admin'));

create policy interview_feedback_select on interview_feedback
  for select using (
    exists (select 1 from interview_rounds r where r.id = interview_round_id and can_read_application(r.application_id))
  );
create policy interview_feedback_manage on interview_feedback
  for all using (current_role_name() in ('ta', 'admin'));
