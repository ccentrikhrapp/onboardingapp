-- Cross-portal handoff: when the TA portal schedules a candidate's HR-final
-- interview round, it calls integration-hr-interview-scheduled, which
-- upserts a row here (keyed on the TA round, not duplicated per reschedule)
-- so HR can see the real, currently-scheduled meeting — not just a one-time
-- notification that goes stale the moment the time changes.
--
-- This is a linked, HR-facing projection of the recruitment app's own
-- interview_rounds row (which this project has no access to), not a second
-- source of truth: source_round_id is the stable identifier back to it.

create table public.hr_interview_handoffs (
  id uuid primary key default gen_random_uuid(),
  source_round_id uuid not null unique,
  source_application_id uuid not null,
  candidate_name text not null,
  application_code text,
  job_title text,
  round_name text not null,
  scheduled_at timestamptz not null,
  duration_minutes int,
  meeting_type text not null check (meeting_type in ('virtual', 'in_person')),
  meeting_platform text,
  meeting_url text,
  location text,
  location_details text,
  recruiter_name text,
  status text not null default 'scheduled' check (status in ('scheduled', 'rescheduled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index hr_interview_handoffs_scheduled_idx on public.hr_interview_handoffs(scheduled_at);

alter table public.hr_interview_handoffs enable row level security;

-- Read-only from the client in every case — every write comes from the
-- service-role integration function, same as integration_events.
create policy hr_interview_handoffs_select on public.hr_interview_handoffs
  for select using (current_role_name() in ('admin', 'hr'));
