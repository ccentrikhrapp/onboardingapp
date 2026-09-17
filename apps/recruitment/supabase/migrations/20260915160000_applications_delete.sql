-- Super Admin / Admin TA can delete a candidate's application. No delete
-- policy existed on applications at all before this — child rows
-- (application_versions, application_events, application_documents,
-- employment_history, interview_rounds -> assignments/feedback, offers) all
-- already cascade on delete per the original schema, so this cleans up
-- fully with no orphaned rows in those tables.
create policy applications_delete_admin_tier on applications
  for delete using (is_admin_tier());
