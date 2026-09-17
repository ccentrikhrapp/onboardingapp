-- ============================================================================
-- Onboarding documents — the joining formalities HR collects from a
-- Pre-Employee after they've accepted their offer, distinct from the
-- pre-offer verification documents (document_verifications) collected
-- earlier by the recruitment app.
--
-- The candidate never has an account in this project — they upload through
-- the recruitment app's own portal (same session as their whole
-- application). This app owns the catalog + the review decision; the
-- recruitment app owns the file storage and the candidate-facing UI. Rows
-- here and there are correlated 1:1 by id (this table's id IS the
-- `hrDocumentId` the recruitment app's onboarding_documents.hr_document_id
-- stores) — see:
--   * request-onboarding-documents  (this app -> recruitment, outbound)
--   * integration-onboarding-document-submitted (recruitment -> this app, inbound)
--   * verify-onboarding-document    (this app's HR decision)
--   -> integration-onboarding-document-status (this app -> recruitment, outbound)
-- ============================================================================

create type onboarding_document_status as enum (
  'requested', 'uploaded', 'verified', 'rejected', 'revision_required'
);

create table onboarding_document_requirements (
  id                uuid primary key default gen_random_uuid(),
  key               text not null unique,
  name              text not null,
  description       text,
  required          boolean not null default true,
  allowed_file_types text[] not null default '{pdf,jpg,jpeg,png}',
  max_file_size_mb  integer not null default 10,
  display_order     integer not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger onboarding_document_requirements_set_updated_at
  before update on onboarding_document_requirements
  for each row execute function set_updated_at();

create table onboarding_documents (
  id                    uuid primary key default gen_random_uuid(),
  onboarding_case_id    uuid not null references onboarding_cases (id) on delete cascade,
  requirement_id        uuid not null references onboarding_document_requirements (id),
  source_application_id uuid not null, -- recruitment applications.id (reference only)
  status                onboarding_document_status not null default 'requested',
  hr_remarks            text,
  reviewed_by           uuid references profiles (id),
  reviewed_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (onboarding_case_id, requirement_id)
);
create index onboarding_documents_case_idx on onboarding_documents (onboarding_case_id);
create trigger onboarding_documents_set_updated_at
  before update on onboarding_documents
  for each row execute function set_updated_at();

alter table onboarding_document_requirements enable row level security;
alter table onboarding_documents             enable row level security;

create policy onboarding_document_requirements_staff_select on onboarding_document_requirements
  for select using (current_role_name() is not null);
create policy onboarding_document_requirements_staff_manage on onboarding_document_requirements
  for all using (current_role_name() is not null) with check (current_role_name() is not null);

create policy onboarding_documents_staff_select on onboarding_documents
  for select using (current_role_name() is not null);
create policy onboarding_documents_staff_update on onboarding_documents
  for update using (current_role_name() is not null);

-- ---------------------------------------------------------------------------
-- Default catalog — editable later from the HR app, not hardcoded elsewhere.
-- ---------------------------------------------------------------------------
insert into onboarding_document_requirements (key, name, description, required, display_order) values
  ('bank_details', 'Bank Account Details / Cancelled Cheque', 'For salary account setup.', true, 1),
  ('pf_nomination', 'PF Nomination Form (Form 2)', null, true, 2),
  ('esi_declaration', 'ESI Declaration Form', null, false, 3),
  ('joining_form', 'Employee Joining Form', null, true, 4),
  ('offer_acknowledgement', 'Signed Offer & Appointment Letter', 'Countersigned copy for records.', true, 5),
  ('emergency_contact', 'Emergency Contact Details', null, true, 6),
  ('id_photo', 'Passport-Size Photograph', 'For the employee ID card.', true, 7),
  ('medical_declaration', 'Medical Fitness Declaration', null, false, 8)
on conflict (key) do nothing;
