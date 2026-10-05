-- Employee Onboarding PDF: generated from the submitted joining record, stored
-- privately, versioned, and finalised by HR. Reuses joining_profiles as the record.

-- Two decision states the existing flow did not have (spec: APPROVED WITH REMARKS, REJECTED).
alter table joining_profiles drop constraint if exists joining_profiles_status_check;
alter table joining_profiles add constraint joining_profiles_status_check check (status in (
  'not_started', 'in_progress', 'submitted', 'under_review', 'correction_required', 'resubmitted',
  'verified', 'approved_with_remarks', 'rejected', 'completed'
));

alter table joining_profiles add column if not exists reference_no text unique;
alter table joining_profiles add column if not exists decision_remarks text;
alter table joining_profiles add column if not exists decided_by text;
alter table joining_profiles add column if not exists decided_at timestamptz;
alter table joining_profiles add column if not exists pdf_version integer not null default 0;

create table if not exists joining_pdfs (
  id                  uuid primary key default gen_random_uuid(),
  joining_profile_id  uuid not null references joining_profiles (id) on delete cascade,
  version             integer not null,
  label               text not null,            -- e.g. Submitted, Resubmitted, Approved, Finalized
  status_at_creation  text not null,
  storage_path        text not null,
  file_name           text not null,
  size_bytes          integer,
  created_by          text,
  created_at          timestamptz not null default now(),
  unique (joining_profile_id, version)
);
create index if not exists joining_pdfs_profile_idx on joining_pdfs (joining_profile_id, version desc);
alter table joining_pdfs enable row level security;
drop policy if exists joining_pdfs_staff_select on joining_pdfs;
create policy joining_pdfs_staff_select on joining_pdfs for select using (current_role_name() is not null);

-- Private bucket: no public URLs. Files are only reached through short-lived signed links
-- issued by an HR-authorised edge function.
insert into storage.buckets (id, name, public) values ('joining-pdfs', 'joining-pdfs', false)
on conflict (id) do update set public = false;
