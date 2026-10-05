-- A filled-in onboarding form gets a printable PDF only when HR approves it.
-- Stored in the private joining-pdfs bucket; the candidate never creates it.
alter table onboarding_documents
  add column if not exists approved_pdf_path text,
  add column if not exists approved_pdf_name text,
  add column if not exists approved_pdf_at timestamptz;
