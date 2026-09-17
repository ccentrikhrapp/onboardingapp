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
  ('ccentrikhrapp@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;
-- add your TA / HR here, e.g.:
-- insert into staff_invites (email, role) values ('ta1@ccentrik.com', 'ta') on conflict (email) do nothing;
-- insert into staff_invites (email, role) values ('hr1@ccentrik.com', 'hr') on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- Jobs — none seeded. Publish real openings from the TA workspace
-- (/ta/jobs → New Job) instead of demo placeholders.
-- ---------------------------------------------------------------------------

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
-- Application-stage documents — none. Candidates upload only a resume when
-- applying; document collection (ID, education, etc.) happens later at the
-- pre-offer stage, once shortlisted. Add rows with stage='application' here
-- if that ever needs to change — the ApplyPage renders whatever exists.
-- ---------------------------------------------------------------------------
