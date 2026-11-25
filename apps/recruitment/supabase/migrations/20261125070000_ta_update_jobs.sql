-- Talent Acquisition (role 'ta') can now edit any job posting, not just
-- create one — matches the collaborative workflow where any TA can already
-- work any job's candidates, not just the ones they personally posted.
-- Deleting a posting stays admin-tier only (jobs_manage_admin_tier, for all
-- using/with check on is_admin_tier()); this policy is UPDATE-only.

drop policy if exists jobs_update_ta on jobs;
create policy jobs_update_ta on jobs
  for update
  using (current_role_name() = 'ta')
  with check (current_role_name() = 'ta');
