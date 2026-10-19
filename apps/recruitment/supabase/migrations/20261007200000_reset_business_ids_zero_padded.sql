-- Production go-live: every business-facing ID (application, candidate, job)
-- now generates zero-padded (APP-00001, CAN-00001, JOB-00001, ...), and
-- job_code gets a real sequence for the first time — it used to be stamped
-- client-side from Date.now(), never a real counter at all. Sequences were
-- separately restarted at 1 via the Supabase dashboard once legacy test
-- rows were cleared (not re-run here, since this migration may run again
-- on a database that already has real records).
--
-- job_code_seq itself was created ad hoc on the live database when this
-- migration first ran there (unlike application_code_seq/candidate_code_seq,
-- which were created by their own earlier migrations) — added here so a
-- fresh database (e.g. a region migration) replays cleanly too.
create sequence if not exists public.job_code_seq start 1001;
alter table public.jobs alter column job_code set default ('JOB-' || lpad(nextval('public.job_code_seq')::text, 5, '0'));
alter table public.applications alter column application_code set default ('APP-' || lpad(nextval('public.application_code_seq')::text, 5, '0'));
alter table public.candidates alter column candidate_code set default ('CAN-' || lpad(nextval('public.candidate_code_seq')::text, 5, '0'));
