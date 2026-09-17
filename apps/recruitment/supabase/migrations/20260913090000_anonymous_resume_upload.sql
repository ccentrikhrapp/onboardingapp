-- ============================================================================
-- Let a candidate upload (and get their resume parsed) BEFORE they sign in
-- at all — Google auth was only ever needed to own the eventual application
-- row, not to pick a file. Path convention:
--
--   resumes/pending-anon/{draftId}/{file}
--
-- where {draftId} is a random id the browser generates and keeps in the
-- application draft (localStorage) — an unguessable capability token, not
-- tied to any account. No SELECT policy is added for this prefix: only
-- parse-resume and submit-application (both service-role) ever read it, so
-- there's no need to make pending resumes publicly listable/readable.
--
-- submit-application (service role) moves the file into the real
-- resumes/{profile_id}/... path once the candidate has actually signed in,
-- the same way the existing documents/pending/{profile_id}/... convention
-- gets adopted into documents/{applicationId}/... — this is the same
-- pattern, just one step earlier (before any auth exists yet, not just
-- before the application row exists).
-- ============================================================================

create policy "resumes: anonymous writes to pending-anon" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = 'pending-anon'
  );
