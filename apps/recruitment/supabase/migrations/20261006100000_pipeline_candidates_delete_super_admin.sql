-- Super Admin can permanently delete pipeline candidates (multi-select delete
-- on the Pipeline Candidates page). Their activity history cascades with them.
-- No delete policy existed before, so every delete was silently refused.
create policy pipeline_candidates_delete_super_admin on pipeline_candidates
  for delete using (current_role_name() = 'admin');
