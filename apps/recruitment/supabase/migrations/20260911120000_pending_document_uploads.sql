-- ============================================================================
-- Let a candidate upload application-stage documents BEFORE the application
-- row exists yet (the document engine ties files to an application_id, but
-- during the apply form there isn't one). Path convention:
--
--   documents/pending/{profile_id}/{requirement_key}/{file}
--
-- submit-application (service role) "adopts" these into the real
-- documents/{application_id}/... path once the application is created, in
-- the same transaction as everything else — see docs/requirements/
-- 03-recruitment-hr-integration.md §3/§16 (this is the application-stage,
-- not pre-offer-stage, instance of the same document engine).
--
-- The existing "documents" bucket policies unconditionally cast the first
-- path segment to uuid — with a 'pending/...' path that cast would raise,
-- not just evaluate false, since Postgres doesn't guarantee left-to-right
-- short-circuiting of AND across a policy's boolean expression. Replace them
-- with a version that only attempts the cast when the segment looks like a
-- uuid, via a cast helper that returns null instead of raising.
-- ============================================================================

create or replace function safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "documents: read with application access" on storage.objects;
create policy "documents: read with application access" on storage.objects
  for select using (
    bucket_id = 'documents'
    and can_read_application(safe_uuid((storage.foldername(name))[1]))
  );

drop policy if exists "documents: candidate uploads to own application" on storage.objects;
create policy "documents: candidate uploads to own application" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and exists (
      select 1 from applications a join candidates c on c.id = a.candidate_id
      where a.id = safe_uuid((storage.foldername(name))[1])
        and c.profile_id = auth.uid()
    )
  );

create policy "documents: candidate uploads to own pending folder" on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "documents: candidate reads own pending folder" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "documents: candidate removes own pending folder" on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'pending'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
