-- ============================================================================
-- Role hierarchy — adds "Admin TA / TA Head" as a level between Super Admin
-- ('admin', unchanged) and Normal TA ('ta', unchanged). Run AFTER
-- 20260915130000_role_hierarchy_enum.sql has committed.
--
-- 'admin' already had full cross-team oversight everywhere in this schema
-- (the "Super TA" escape hatch baked into can_read_application, jobs
-- management, etc. — see 20260910093500_rls.sql). This migration:
--   1. Gives 'admin_ta' those SAME oversight rights (full application
--      visibility, assignment, job management, interview/offer management
--      across every TA's work).
--   2. Leaves TA *user* management (profiles_admin_all, staff_invites_admin)
--      exclusive to 'admin' — an Admin TA cannot create/deactivate/promote
--      TA accounts. That's what actually distinguishes the two tiers.
--   3. Restricts job creation/deletion to admin-tier only — today ANY 'ta'
--      can manage jobs (jobs_manage_ta_admin), which is a real gap against
--      the intended hierarchy (Normal TA should request access, not have it
--      by default). This is the one genuine behavior change here; everything
--      else is additive.
--   4. Adds profiles.active + profiles.department for TA Management (a
--      deactivated account is blocked at the application layer — see
--      AuthContext.jsx — since RLS itself is keyed on role, not activity).
-- ============================================================================

alter table profiles
  add column if not exists active boolean not null default true,
  add column if not exists department text;

-- Admin-tier helper — 'admin' (Super Admin) or 'admin_ta' (Admin TA/TA Head).
create or replace function is_admin_tier()
returns boolean
language sql
stable
as $$
  select current_role_name() in ('admin', 'admin_ta');
$$;

-- --- applications: full-pipeline visibility/assignment for admin_ta too ---
create or replace function can_read_application(app uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from applications a
    join candidates c on c.id = a.candidate_id
    where a.id = app
      and (
        c.profile_id = auth.uid()                 -- the candidate
        or a.assigned_ta_id = auth.uid()          -- the assigned TA
        or current_role_name() in ('hr', 'admin', 'admin_ta') -- HR / admin-tier see the pipeline
      )
  );
$$;

drop policy if exists applications_update_staff on applications;
create policy applications_update_staff on applications
  for update using (assigned_ta_id = auth.uid() or current_role_name() in ('hr', 'admin', 'admin_ta'));

-- --- jobs: creation/deletion restricted to admin-tier (Part 4) -----------
drop policy if exists jobs_manage_ta_admin on jobs;
create policy jobs_manage_admin_tier on jobs
  for all using (is_admin_tier()) with check (is_admin_tier());

-- --- application_links: admin_ta joins the admin escape hatch -----------
drop policy if exists application_links_insert_own on application_links;
create policy application_links_insert_own on application_links
  for insert with check (ta_id = auth.uid() and current_role_name() in ('ta', 'admin', 'admin_ta'));

drop policy if exists application_links_update_own on application_links;
create policy application_links_update_own on application_links
  for update using (ta_id = auth.uid() or is_admin_tier());

-- --- interview / offer management: admin_ta joins admin -------------------
drop policy if exists interview_panelists_manage on interview_panelists;
create policy interview_panelists_manage on interview_panelists
  for all using (current_role_name() in ('ta', 'admin', 'admin_ta')) with check (current_role_name() in ('ta', 'admin', 'admin_ta'));

drop policy if exists interview_rounds_manage on interview_rounds;
create policy interview_rounds_manage on interview_rounds
  for all using (
    current_role_name() in ('ta', 'admin', 'admin_ta')
    and exists (select 1 from applications a where a.id = application_id and (a.assigned_ta_id = auth.uid() or is_admin_tier()))
  );

drop policy if exists offers_manage_staff on offers;
create policy offers_manage_staff on offers
  for all using (current_role_name() in ('ta', 'admin', 'admin_ta')) with check (current_role_name() in ('ta', 'admin', 'admin_ta'));
