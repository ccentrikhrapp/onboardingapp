-- The recruitment -> HR handoff (integration_outbox) already logged every
-- failed delivery, but nothing ever retried it — a bad HR_FUNCTIONS_URL (or
-- any transient network blip) meant an approved document stayed stuck
-- forever with no automatic recovery. This adds:
--   1. target_fn on integration_outbox, so a retry knows which HR endpoint
--      to call without guessing from event_type.
--   2. A scheduled job that calls the new retry-failed-hr-events edge
--      function every 15 minutes, which re-sends anything still 'failed'.
-- The job authenticates to our own edge function with a secret kept in
-- Supabase Vault (never committed to the repo) — see the one-off
-- `vault.create_secret(...)` run alongside this migration.

alter table integration_outbox add column if not exists target_fn text;

update integration_outbox set target_fn = case event_type
  when 'DOCUMENT_SUBMITTED' then 'integration-document-submitted'
  when 'DOCUMENT_SUMMARY' then 'integration-document-summary'
  when 'OFFER_ACCEPTED' then 'integration-offer-accepted'
  when 'ONBOARDING_DOCUMENT_SUBMITTED' then 'integration-onboarding-document-submitted'
  when 'HR_INTERVIEW_SCHEDULED' then 'integration-hr-interview-scheduled'
  when 'HR_INTERVIEW_RESCHEDULED' then 'integration-hr-interview-scheduled'
  else target_fn
end
where target_fn is null;

create extension if not exists pg_net with schema extensions;

create or replace function trigger_retry_failed_hr_events()
returns void
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare
  cron_secret text;
begin
  select decrypted_secret into cron_secret from vault.decrypted_secrets where name = 'cron_trigger_secret' limit 1;
  if cron_secret is null then return; end if; -- not provisioned yet, nothing to do

  perform net.http_post(
    url := 'https://krkprggumyglcdsnanvh.supabase.co/functions/v1/retry-failed-hr-events',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', cron_secret),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'retry-failed-hr-events',
  '*/15 * * * *', -- every 15 minutes
  $$select trigger_retry_failed_hr_events();$$
);
