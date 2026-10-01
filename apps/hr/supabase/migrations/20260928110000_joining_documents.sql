-- Joining documents: a per-employee requirement list worked out from the
-- employee's own answers (fresher / how many previous employers / same address…),
-- reviewed by HR one requirement at a time. NOT "every document from the
-- reference checklist for everyone".
--
--   joining_document_config  HR/Admin-editable rules per reference document
--                            (mandatory / conditional / optional, cannot-provide,
--                            not-applicable, HR approval). Empty table = built-in defaults.
--   joining_document_items   one row per applicable requirement instance for a profile
--                            (e.g. "Relieving letter — Employer 1"): what the employee did
--                            and what HR decided.

create table joining_document_config (
  ref_key                text primary key,
  name                   text not null,
  doc_group              text not null,
  classification         text not null check (classification in ('critical', 'conditional', 'optional')),
  cannot_provide_allowed boolean not null default true,
  na_allowed             boolean not null default false,
  hr_approval_required   boolean not null default true,
  max_files              integer not null default 3 check (max_files between 0 and 30),
  reasons                text[] not null default '{}',
  active                 boolean not null default true,
  updated_by             uuid references profiles (id) on delete set null,
  updated_at             timestamptz not null default now()
);
create trigger joining_document_config_set_updated_at before update on joining_document_config
  for each row execute function set_updated_at();

create table joining_document_items (
  id                   uuid primary key default gen_random_uuid(),
  joining_profile_id   uuid not null references joining_profiles (id) on delete cascade,
  item_key             text not null,                 -- e.g. pan_card | payslips:0
  ref_key              text not null,
  employer_index       integer,
  label                text not null,
  applicability        text not null check (applicability in ('applicable', 'optional', 'not_applicable')),
  na_reason            text,
  choice               text check (choice in ('upload', 'cannot_provide', 'not_applicable')),
  reason_category      text,
  reason_text          text,
  files                jsonb not null default '[]',   -- [{ path, name, mime, size }]  (files live in the recruitment project's storage)
  status               text not null default 'awaiting'
    check (status in ('awaiting', 'submitted', 'reason_submitted', 'approved', 'approved_with_reason', 'na_accepted', 'rejected', 'clarification_required')),
  hr_remarks           text,
  decided_by           uuid references profiles (id) on delete set null,
  decided_by_name      text,
  decided_at           timestamptz,
  employee_updated_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (joining_profile_id, item_key)
);
create index joining_document_items_profile_idx on joining_document_items (joining_profile_id);
create trigger joining_document_items_set_updated_at before update on joining_document_items
  for each row execute function set_updated_at();

alter table joining_profiles add column if not exists documents_approved_at timestamptz;
alter table joining_profiles add column if not exists documents_approved_by text;

alter table joining_document_config enable row level security;
alter table joining_document_items enable row level security;
create policy joining_document_config_staff_select on joining_document_config
  for select using (current_role_name() is not null);
create policy joining_document_items_staff_select on joining_document_items
  for select using (current_role_name() is not null);
-- writes: edge functions only (service role)
