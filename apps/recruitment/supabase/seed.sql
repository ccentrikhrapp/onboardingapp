-- ============================================================================
-- Seed data. Runs on `supabase db reset` (local) and can be applied to a remote
-- project once. Safe to re-run: every insert is idempotent.
--
--   * staff allowlist (edit the emails for your team)
--   * published jobs
--   * the pre-offer document-requirement checklist (16 items, master prompt)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Staff allowlist — when these Google accounts sign in they get this role
-- instead of 'candidate'. Change the emails to your real team.
-- ---------------------------------------------------------------------------
insert into staff_invites (email, role) values
  ('claudeworkk01@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;
-- add your TA / HR here, e.g.:
-- insert into staff_invites (email, role) values ('ta1@ccentrik.com', 'ta') on conflict (email) do nothing;
-- insert into staff_invites (email, role) values ('hr1@ccentrik.com', 'hr') on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Jobs (published). Mirrors the old src/data/jobs.js catalogue.
-- ---------------------------------------------------------------------------
insert into jobs (job_code, title, department, location, work_mode, employment_type, experience, description, required_skills, deadline, status)
values
  ('JOB-1024', 'SAP Consultant', 'SAP Functional', 'Bengaluru, India', 'Hybrid', 'Full-time', '4-7 years',
   'Implement and support SAP S/4HANA and BTP solutions for enterprise clients.',
   '{SAP,"SAP CAP",OData,Fiori,JavaScript}', '2026-10-15', 'published'),
  ('JOB-1025', 'Senior Frontend Engineer', 'Engineering', 'Remote, India', 'Remote', 'Full-time', '5-9 years',
   'Build delightful, accessible user interfaces for our flagship SaaS platform using React.',
   '{React,TypeScript,CSS,Testing,Accessibility}', '2026-10-05', 'published'),
  ('JOB-1026', 'Talent Acquisition Partner', 'Talent Acquisition', 'Mumbai, India', 'On-site', 'Full-time', '3-6 years',
   'Drive full-cycle recruitment for technology roles.',
   '{Sourcing,Interviewing,ATS,"Stakeholder management"}', '2026-09-28', 'published'),
  ('JOB-1027', 'Backend Engineer (Node.js)', 'Engineering', 'Hyderabad, India', 'Hybrid', 'Full-time', '3-6 years',
   'Design and operate scalable APIs and services that power our platform.',
   '{Node.js,PostgreSQL,REST,Docker}', '2026-10-20', 'published'),
  ('JOB-1028', 'Product Designer', 'Design', 'Bengaluru, India', 'Hybrid', 'Full-time', '4-8 years',
   'Shape end-to-end product experiences from research to polished UI.',
   '{Figma,"Interaction Design",Prototyping,"Design Systems"}', '2026-10-12', 'published'),
  ('JOB-1029', 'Data Analyst', 'Analytics', 'Pune, India', 'On-site', 'Full-time', '2-5 years',
   'Turn raw data into decisions with dashboards, analysis and clear storytelling.',
   '{SQL,Python,"Power BI",Statistics}', '2026-09-30', 'published'),
  ('JOB-1030', 'QA Automation Engineer', 'Engineering', 'Remote, India', 'Remote', 'Full-time', '3-6 years',
   'Own automated test coverage across web and API layers.',
   '{Playwright,JavaScript,CI/CD,"API Testing"}', '2026-10-18', 'published'),
  ('JOB-1031', 'DevOps Engineer', 'Engineering', 'Bengaluru, India', 'Hybrid', 'Full-time', '4-8 years',
   'Build the infrastructure and tooling that lets teams ship safely and fast.',
   '{AWS,Terraform,Kubernetes,CI/CD}', '2026-10-25', 'published'),
  ('JOB-1032', 'HR Operations Specialist', 'Human Resource', 'Mumbai, India', 'On-site', 'Full-time', '2-5 years',
   'Run smooth onboarding, documentation and HR systems for a growing workforce.',
   '{HRIS,Onboarding,Documentation,Compliance}', '2026-09-26', 'published'),
  ('JOB-1033', 'Engineering Manager', 'Engineering', 'Bengaluru, India', 'Hybrid', 'Full-time', '8-12 years',
   'Lead and grow a team of engineers delivering customer-facing product.',
   '{"People Management","System Design",Agile,Hiring}', '2026-11-01', 'published'),
  ('JOB-1034', 'Business Analyst', 'Sales', 'Chennai, India', 'Hybrid', 'Full-time', '3-6 years',
   'Bridge business and technology teams, translating needs into clear requirements.',
   '{"Requirements Analysis",UML,SQL,Agile}', '2026-10-08', 'published'),
  ('JOB-1035', 'Customer Success Manager', 'Sales', 'Remote, India', 'Remote', 'Full-time', '4-7 years',
   'Own the post-sale relationship and drive adoption, retention and growth.',
   '{"Account Management",SaaS,Communication,Analytics}', '2026-10-14', 'published')
on conflict (job_code) do nothing;

-- ---------------------------------------------------------------------------
-- Pre-offer document checklist — see docs/requirements/01-*.md
-- ---------------------------------------------------------------------------
insert into document_requirements
  (stage, key, name, requirement_class, condition_type, quantity_required,
   requires_front_back, requires_employer, employer_count, requires_period, period_count,
   multiple_files, structured_data, can_mark_cannot_provide, warning_message,
   allowed_file_types, max_file_size_mb, display_order)
values
  ('pre_offer', 'pan_card', 'PAN Card', 'mandatory', null, 1,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 10, 1),

  ('pre_offer', 'aadhaar', 'Aadhaar Card (Front & Back)', 'mandatory', null, 1,
   true, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 10, 2),

  ('pre_offer', 'passport', 'Passport', 'mandatory', null, 1,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 10, 3),

  ('pre_offer', 'payslips_3m', 'Latest 3-Month Payslips', 'required', null, 1,
   false, true, 2, true, 3, false, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 4),

  ('pre_offer', 'prev_offer_letter', 'Offer Letter — Previous Employers', 'required', null, 1,
   false, true, 2, false, 0, false, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 5),

  ('pre_offer', 'prev_relieving_letter', 'Relieving Letter — Previous Employers', 'required', null, 1,
   false, true, 2, false, 0, false, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 6),

  ('pre_offer', 'increment_letter', 'Increment Letter', 'conditional', 'if_applicable', 1,
   false, false, 0, false, 0, true, false, false,
   null, '{pdf,jpg,jpeg,png}', 10, 7),

  ('pre_offer', 'tenth_cert', '10th Certificate', 'mandatory', null, 1,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 10, 8),

  ('pre_offer', 'twelfth_cert', '12th Certificate', 'mandatory', null, 1,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 10, 9),

  ('pre_offer', 'degree_marksheets', 'Degree Certificate / Semester Mark Sheets', 'mandatory', null, 1,
   false, false, 0, false, 0, true, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{pdf,jpg,jpeg,png}', 15, 10),

  ('pre_offer', 'address_proof', 'Current & Permanent Address Proof', 'required', null, 2,
   false, false, 0, false, 0, true, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 11),

  ('pre_offer', 'prev_appointment_letter', 'Appointment Letter — Previous Employers', 'required', null, 1,
   false, true, 2, false, 0, false, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 12),

  ('pre_offer', 'passport_photos', 'Passport-Size Photographs', 'mandatory', null, 2,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is required for the verification process. Not providing it may affect your application and can lead to rejection.',
   '{jpg,jpeg,png}', 5, 13),

  ('pre_offer', 'cancelled_cheque', 'Cancelled Cheque', 'required', null, 1,
   false, false, 0, false, 0, false, false, true,
   'Important: This document is part of the verification checklist. Not providing it may delay your offer.',
   '{pdf,jpg,jpeg,png}', 10, 14),

  ('pre_offer', 'employment_history', 'Last Three Employment Details', 'required', null, 3,
   false, false, 0, false, 0, false, true, false,
   null, '{}', 0, 15),

  ('pre_offer', 'current_offer_letter', 'Current / Existing Offer Letter', 'conditional', 'if_applicable', 1,
   false, false, 0, false, 0, false, false, false,
   null, '{pdf,jpg,jpeg,png}', 10, 16)
on conflict (stage, key) do nothing;

-- ---------------------------------------------------------------------------
-- Application-stage documents — collected as part of the application itself
-- (docs/requirements — Phase 1 candidate/TA spec, 2026-09-11, §22-26). A
-- minimal starter set; add/remove rows here as the real requirement list is
-- finalized — nothing about this is hardcoded into the app.
-- ---------------------------------------------------------------------------
insert into document_requirements
  (stage, key, name, requirement_class, condition_type, quantity_required,
   requires_front_back, requires_employer, employer_count, requires_period, period_count,
   multiple_files, structured_data, can_mark_cannot_provide, warning_message,
   allowed_file_types, max_file_size_mb, display_order)
values
  ('application', 'identity_proof', 'Identity Proof', 'required', null, 1,
   false, false, 0, false, 0, false, false, true,
   'You have indicated that you cannot provide a required document. Please note that failure to submit this document may affect your application and may result in rejection.',
   '{pdf,jpg,jpeg,png}', 10, 1),

  ('application', 'education_certificate', 'Education Certificate', 'required', null, 1,
   false, false, 0, false, 0, false, false, true,
   'You have indicated that you cannot provide a required document. Please note that failure to submit this document may affect your application and may result in rejection.',
   '{pdf,jpg,jpeg,png}', 10, 2)
on conflict (stage, key) do nothing;
