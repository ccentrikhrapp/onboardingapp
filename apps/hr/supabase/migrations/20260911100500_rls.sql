-- ============================================================================
-- Row-level security. HR is one team here — any hr/admin sees the whole
-- verification queue and onboarding pipeline (no per-reviewer partition).
-- Integration writes (from the recruitment app) go through edge functions
-- using the service-role key and bypass these policies; the policies below
-- govern what signed-in HR staff can do directly against the database.
-- ============================================================================

alter table profiles                    enable row level security;
alter table staff_invites               enable row level security;
alter table document_verifications      enable row level security;
alter table document_verification_events enable row level security;
alter table onboarding_cases            enable row level security;
alter table employees                   enable row level security;
alter table integration_events          enable row level security;
alter table notifications               enable row level security;
alter table emails                      enable row level security;
alter table audit_logs                  enable row level security;

create policy profiles_select_self_or_staff on profiles
  for select using (id = auth.uid() or current_role_name() is not null);
create policy profiles_admin_all on profiles
  for all using (is_admin()) with check (is_admin());

create policy staff_invites_admin on staff_invites
  for all using (is_admin()) with check (is_admin());

create policy document_verifications_staff_select on document_verifications
  for select using (current_role_name() is not null);
create policy document_verifications_staff_update on document_verifications
  for update using (current_role_name() is not null);

create policy document_verification_events_staff_select on document_verification_events
  for select using (current_role_name() is not null);

create policy onboarding_cases_staff_select on onboarding_cases
  for select using (current_role_name() is not null);
create policy onboarding_cases_staff_update on onboarding_cases
  for update using (current_role_name() is not null);

create policy employees_staff_all on employees
  for all using (current_role_name() is not null) with check (current_role_name() is not null);

create policy integration_events_staff_select on integration_events
  for select using (current_role_name() is not null);

create policy notifications_select on notifications
  for select using (recipient_profile_id = auth.uid() or recipient_role = current_role_name());
create policy notifications_update_own on notifications
  for update using (recipient_profile_id = auth.uid() or recipient_role = current_role_name());

create policy emails_select_staff on emails
  for select using (current_role_name() is not null);
create policy audit_logs_select_staff on audit_logs
  for select using (current_role_name() is not null);
