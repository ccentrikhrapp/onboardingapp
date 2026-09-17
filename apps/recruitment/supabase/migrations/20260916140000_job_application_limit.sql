-- Optional cap on how many applications a job will accept, enforced
-- server-side in submit-application (mirrors the existing deadline check).
-- null = unlimited, matching how a null deadline already means "no deadline".
alter table jobs add column if not exists application_limit integer
  check (application_limit is null or application_limit > 0);
