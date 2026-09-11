-- ============================================================================
-- Confidential/direct candidate invitations (master prompt §21-27, §72, §102).
--
-- Same secure-token mechanism as the public TA application link
-- (application_links + resolve-link), distinguished by invite_type so the
-- candidate-facing copy can stay discreet for a confidential invite (no
-- mention of the referring TA, no "recruitment pipeline" language).
--
-- A TA gets exactly one reusable PUBLIC link per job (unchanged), but can
-- generate any number of one-off CONFIDENTIAL invitations for the same job —
-- one per candidate they want to approach directly. The old unconditional
-- unique(job_id, ta_id) would block that, so it's replaced with a partial
-- index that only applies to public links.
-- ============================================================================

alter table application_links
  add column invite_type text not null default 'public'
    check (invite_type in ('public', 'confidential')),
  add column invited_name text,   -- optional — TA may already know who they're inviting
  add column invited_email text;

alter table application_links drop constraint if exists application_links_job_id_ta_id_key;

create unique index application_links_one_public_per_job_ta
  on application_links (job_id, ta_id)
  where invite_type = 'public';
