-- The "Application Deadline" field on the job form has always been purely
-- cosmetic (an "apply by" date shown to candidates) — nothing actually
-- closed the job once it passed. This makes it real: a published job whose
-- deadline has passed is automatically moved to 'closed' by a daily cron
-- job, so it stops accepting applications and drops off the careers page
-- without anyone having to remember to close it by hand.
--
-- Deletion is intentionally NOT automated here — that stays a manual,
-- deliberate action (the existing "Delete job" button), since it's
-- destructive and irreversible.
create extension if not exists pg_cron with schema extensions;

create or replace function close_expired_jobs()
returns void
language sql
as $$
  update jobs
  set status = 'closed'
  where status = 'published'
    and deadline is not null
    and deadline < current_date;
$$;

select cron.schedule(
  'close-expired-jobs',
  '0 0 * * *', -- once a day, midnight UTC
  $$select close_expired_jobs();$$
);
