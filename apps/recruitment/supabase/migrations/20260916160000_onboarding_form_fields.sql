-- Mirrors HR's onboarding_document_requirements.field_schema /
-- onboarding_documents.form_data (see the matching migration in apps/hr) —
-- the candidate fills these fields here, in the recruitment app, so this
-- local table needs to carry the schema HR sent and store what gets typed.
alter table onboarding_documents add column if not exists field_schema jsonb;
alter table onboarding_documents add column if not exists form_data jsonb;
