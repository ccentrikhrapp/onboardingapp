-- Talent Acquisition (role 'ta') can now create job postings, like Super Admin
-- and TA Head. Editing and deleting a posting stays admin-tier only
-- (jobs_manage_admin_tier); this policy is INSERT-only.

drop policy if exists jobs_insert_ta on jobs;
create policy jobs_insert_ta on jobs
  for insert
  with check (current_role_name() = 'ta');
