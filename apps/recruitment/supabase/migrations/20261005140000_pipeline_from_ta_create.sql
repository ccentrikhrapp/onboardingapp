-- Candidates created by TA without a job go to Pipeline Candidates (no
-- application). That form doesn't collect every pipeline field, so those become
-- optional here; the manual Pipeline form still validates them in the UI.
-- The resume and the full submitted details are kept on the record.
alter table pipeline_candidates
  alter column position drop not null,
  alter column organisation drop not null,
  alter column total_exp drop not null,
  alter column relevant_exp drop not null,
  alter column current_ctc drop not null,
  alter column expected_ctc drop not null,
  alter column notice_days drop not null,
  alter column current_location drop not null,
  alter column hiring_location drop not null,
  alter column expected_availability drop not null;

alter table pipeline_candidates
  add column if not exists resume_path text,
  add column if not exists resume_meta jsonb,
  add column if not exists details jsonb not null default '{}'::jsonb;

alter table pipeline_candidates drop constraint if exists pipeline_candidates_source_check;
alter table pipeline_candidates add constraint pipeline_candidates_source_check
  check (source in ('manual', 'csv', 'ta_create'));
