-- Employee Joining & Onboarding enhancement — joining details fields,
-- Super Admin selector fields, the third (ID card) Accounts/IT request
-- type, and a "Not Required" task status.

-- 1. Joining details HR can complete for an existing employee without
--    recreating the record (Section 1 of this round's spec). position is
--    kept separate from designation: onboarding_cases already distinguishes
--    job_title (the role recruited for) from designation (what HR assigns
--    on joining) — position mirrors that same distinction on the employee
--    record itself. photo_path is a Storage path (like joining_pdfs'
--    storage_path), never a public URL — access is always through a
--    signed URL, consistent with every other document in this app.
alter table public.employees
  add column if not exists phone text,
  add column if not exists blood_group text,
  add column if not exists address jsonb,
  add column if not exists photo_path text,
  add column if not exists position text;

-- 2. Fields the Super Admin selector needs to show (Section 2) — admins
--    already have phone; designation is new.
alter table public.profiles
  add column if not exists designation text;

-- 3. A joining-day / Accounts-IT item can be genuinely Not Required for a
--    given employee (e.g. no laptop needed for a field role) — distinct
--    from Not Started, which implies it's still outstanding.
alter table public.onboarding_tasks drop constraint onboarding_tasks_status_check;
alter table public.onboarding_tasks add constraint onboarding_tasks_status_check
  check (status in ('not_started', 'in_progress', 'blocked', 'completed', 'not_required'));

-- 4. The third, previously-missing Accounts/IT request type. Kept as its
--    own template row — same mechanism as the other checklist items, not a
--    special case — so it gets the same status tracking, ownership and
--    activity log everything else does.
insert into public.onboarding_task_templates (category, key, label, description, default_owner_role, display_order, required)
values ('accounts_it', 'id_card_creation', 'Physical employee ID card creation',
        'Printed ID card — uses only the employee''s name, Employee ID, designation, blood group, address and phone, never their full record.',
        'it', 15, true)
on conflict (category, key) do nothing;

update public.onboarding_task_templates
  set label = 'Organisational email / account creation (Google Workspace or Microsoft 365)',
      description = 'Create the employee''s official email and workspace account.'
  where category = 'accounts_it' and key = 'email_setup';

-- 5. Employee photos — private bucket, signed URLs only (identical model
--    to joining-pdfs).
insert into storage.buckets (id, name, public) values ('employee-photos', 'employee-photos', false)
  on conflict (id) do nothing;

create policy employee_photos_staff_read on storage.objects
  for select using (bucket_id = 'employee-photos' and current_role_name() is not null);
create policy employee_photos_staff_write on storage.objects
  for insert with check (bucket_id = 'employee-photos' and current_role_name() in ('admin', 'hr'));
create policy employee_photos_staff_update on storage.objects
  for update using (bucket_id = 'employee-photos' and current_role_name() in ('admin', 'hr'));
