-- A human-readable Candidate ID, distinct from the Application ID
-- (application_code) — same convention as application_code_seq /
-- employee_code_seq. Backfills existing rows automatically since the
-- default is evaluated per-row on ADD COLUMN.
create sequence candidate_code_seq start 1001;
alter table candidates add column if not exists candidate_code text unique
  default ('CAN-' || nextval('candidate_code_seq'));
alter table candidates alter column candidate_code set not null;
