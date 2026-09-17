-- ============================================================================
-- Post-offer onboarding documents — candidate-facing mirror.
--
-- HR (a separate Supabase project, apps/hr) owns the real onboarding-case
-- workflow (onboarding_cases / onboarding_documents there) and decides what
-- to request and whether each upload is acceptable. This app never reads
-- that database directly — only through service-to-service edge functions,
-- same pattern as the existing pre-offer document integration:
--   * HR requests documents  -> integration-onboarding-requested (inbound)
--   * candidate uploads here -> submit-onboarding-document pushes to HR
--   * HR verifies/rejects    -> integration-onboarding-document-status (inbound)
--   * HR needs to see a file -> integration-onboarding-document-url (inbound,
--     mints a short-lived signed URL — the file physically lives in this
--     project's storage since that's where the candidate's session is).
--
-- `hr_document_id` is the correlation key both directions use — HR generates
-- it when it creates its own row and includes it in every call to us; we
-- echo it back in every call to HR so it always knows which row to update.
-- ============================================================================

create table onboarding_documents (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references applications (id) on delete cascade,
  hr_case_id        uuid not null,
  hr_document_id    uuid not null unique,
  requirement_key   text not null,
  requirement_name  text not null,
  required          boolean not null default true,
  status            document_status not null default 'requested',
  storage_path      text,
  file_name         text,
  mime_type         text,
  size_bytes        bigint,
  hr_remarks        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (application_id, requirement_key)
);
create index onboarding_documents_app_idx on onboarding_documents (application_id);
create trigger onboarding_documents_set_updated_at
  before update on onboarding_documents
  for each row execute function set_updated_at();

alter table onboarding_documents enable row level security;

create policy onboarding_documents_select on onboarding_documents
  for select using (can_read_application(application_id));

-- Candidate uploads their own slot while it's actually their turn to act.
create policy onboarding_documents_update_candidate on onboarding_documents
  for update using (
    status in ('requested', 'revision_required')
    and exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = application_id and c.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Storage — same private-bucket-plus-signed-URL pattern as `documents`.
-- Path convention: onboarding-documents/{application_id}/{requirement_key}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('onboarding-documents', 'onboarding-documents', false)
on conflict (id) do nothing;

create policy "onboarding-documents: read with application access" on storage.objects
  for select using (
    bucket_id = 'onboarding-documents'
    and can_read_application(((storage.foldername(name))[1])::uuid)
  );

create policy "onboarding-documents: candidate uploads to own application" on storage.objects
  for insert with check (
    bucket_id = 'onboarding-documents'
    and exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = ((storage.foldername(name))[1])::uuid
        and c.profile_id = auth.uid()
    )
  );
