-- ============================================================================
-- Ccentrik HR — core schema.
--
-- This is a SEPARATE database from the recruitment app's. It never queries the
-- recruitment DB directly. Recruitment-side entities (candidate, application,
-- job, offer, document) are referenced here only by id + a small denormalized
-- snapshot of the fields this app actually displays — the integration edge
-- functions are the only way data crosses the boundary.
--
-- Covers: profiles/roles, pre-offer document verification (the first
-- integration point), onboarding cases + employees (the second integration
-- point), the inbound integration event log (idempotency + audit), plus
-- notifications/emails/audit_logs matching the recruitment app's pattern.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type hr_role as enum ('hr', 'admin');

-- Matches docs/requirements/03-recruitment-hr-integration.md §4/§8.
create type document_verification_status as enum (
  'pending', 'under_review', 'approved', 'rejected', 'reupload_required'
);

create type onboarding_status as enum (
  'not_started', 'onboarding_initiated', 'documents_pending', 'documents_submitted',
  'verification_in_progress', 'formalities_pending', 'ready_for_joining',
  'joining_confirmed', 'employee_created', 'completed'
);

create type integration_event_status as enum ('received', 'processing', 'success', 'failed');

create type notification_status as enum ('unread', 'read');
create type email_status as enum ('queued', 'sent', 'failed');

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles + staff allowlist (same pattern as the recruitment app)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  role        hr_role not null default 'hr',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

create table staff_invites (
  email       text primary key,
  role        hr_role not null,
  invited_by  uuid references profiles (id),
  created_at  timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited_role hr_role;
begin
  select role into invited_role from staff_invites where lower(email) = lower(new.email);
  if invited_role is null then
    -- Unlike the recruitment app (default role = candidate), there is no
    -- self-serve role here: only an explicitly-invited email gets an account.
    raise exception 'This Google account is not on the HR staff allowlist.';
  end if;
  insert into profiles (id, email, full_name, avatar_url, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    invited_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function current_role_name()
returns hr_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select current_role_name() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Pre-offer document verification (integration point 1)
-- ---------------------------------------------------------------------------

-- Current verification state per recruitment document. One row per
-- (source_document_id) — corrections update this row in place; every
-- transition is also appended to document_verification_events below, so
-- history is never lost even though this row is mutated.
create table document_verifications (
  id                      uuid primary key default gen_random_uuid(),
  source_application_id   uuid not null,               -- recruitment applications.id (reference only)
  source_document_id      uuid not null unique,         -- recruitment application_documents.id
  candidate_name          text,
  candidate_email         text,
  job_title               text,
  application_code        text,
  requirement_key         text,
  requirement_name        text,
  version                 integer not null default 1,
  status                  document_verification_status not null default 'pending',
  hr_remarks              text,
  reviewed_by             uuid references profiles (id),
  reviewed_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index document_verifications_app_idx on document_verifications (source_application_id);
create index document_verifications_status_idx on document_verifications (status);
create trigger document_verifications_set_updated_at before update on document_verifications
  for each row execute function set_updated_at();

-- Append-only history — every submission/decision, never overwritten.
create table document_verification_events (
  id                        uuid primary key default gen_random_uuid(),
  document_verification_id uuid not null references document_verifications (id) on delete cascade,
  version                   integer not null,
  status                    document_verification_status not null,
  remarks                   text,
  actor_profile_id          uuid references profiles (id),
  actor_label               text,
  created_at                timestamptz not null default now()
);
create index document_verification_events_doc_idx on document_verification_events (document_verification_id, created_at);

-- ---------------------------------------------------------------------------
-- Onboarding (integration point 2) — Pre-Employee, never auto-created as an
-- Employee. See docs/requirements/02-*.md §4 and 03-*.md §14.
-- ---------------------------------------------------------------------------
create table onboarding_cases (
  id                  uuid primary key default gen_random_uuid(),
  source_candidate_id   uuid not null,
  source_application_id uuid not null,
  source_offer_id       uuid not null unique,          -- idempotency key for OFFER_ACCEPTED
  candidate_name  text,
  candidate_email text,
  candidate_phone text,
  job_title       text,
  department      text,
  designation     text,
  location        text,
  employment_type text,
  offer_date      date,
  joining_date    date,
  status          onboarding_status not null default 'onboarding_initiated',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger onboarding_cases_set_updated_at before update on onboarding_cases
  for each row execute function set_updated_at();

create table employees (
  id                 uuid primary key default gen_random_uuid(),
  onboarding_case_id uuid references onboarding_cases (id),
  employee_code      text not null unique,
  full_name          text not null,
  email              text,
  department         text,
  designation        text,
  joining_date       date,
  employment_status  text not null default 'active',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Integration event log — every inbound call from recruitment, keyed by the
-- sender's event id so a retried delivery is a no-op (docs/requirements/
-- 03-*.md §22).
-- ---------------------------------------------------------------------------
create table integration_events (
  id            uuid primary key default gen_random_uuid(),
  event_id      text not null unique,
  event_type    text not null,
  source_system text not null default 'recruitment',
  payload       jsonb not null,
  status        integration_event_status not null default 'received',
  error         text,
  entity_type   text,
  entity_id     uuid,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
create index integration_events_type_idx on integration_events (event_type, created_at);

-- ---------------------------------------------------------------------------
-- notifications / emails / audit_logs — same shape as the recruitment app
-- ---------------------------------------------------------------------------
create table notifications (
  id                    uuid primary key default gen_random_uuid(),
  recipient_profile_id  uuid references profiles (id) on delete cascade,
  recipient_role        hr_role,
  title                 text not null,
  message               text,
  type                  text,
  entity_type           text,
  entity_id             uuid,
  status                notification_status not null default 'unread',
  read_at               timestamptz,
  metadata              jsonb not null default '{}',
  created_at            timestamptz not null default now(),
  check (recipient_profile_id is not null or recipient_role is not null)
);
create index notifications_recipient_idx on notifications (recipient_profile_id, status);
create index notifications_role_idx on notifications (recipient_role, status);

create table emails (
  id           uuid primary key default gen_random_uuid(),
  recipient    text not null,
  sender       text,
  subject      text not null,
  body_html    text,
  body_text    text,
  template     text,
  entity_type  text,
  entity_id    uuid,
  status       email_status not null default 'queued',
  error        text,
  sent_at      timestamptz,
  failed_at    timestamptz,
  created_at   timestamptz not null default now()
);

create table audit_logs (
  id               uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles (id),
  actor_label      text,
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  previous_state   jsonb,
  new_state        jsonb,
  remarks          text,
  created_at       timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at);

create or replace function forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'this table is append-only';
end;
$$;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each row execute function forbid_mutation();
create trigger document_verification_events_no_update before update or delete on document_verification_events
  for each row execute function forbid_mutation();
