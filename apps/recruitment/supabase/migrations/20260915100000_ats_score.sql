-- ATS score, computed server-side at submission time (see
-- supabase/functions/_shared/ats.ts + submit-application). Just a column on
-- the existing applications row — every RLS policy that already lets a
-- caller SELECT an application covers this column too, no new policy needed.
alter table applications add column if not exists ats_score jsonb;
