-- Split on purpose (see 20260915130000_role_hierarchy_enum.sql for why):
-- Postgres refuses to let a new enum value be used in the same transaction
-- that adds it. Run this alone, let it commit, THEN run
-- 20260915140001_ta_created_candidate.sql.
alter type application_source add value if not exists 'ta_sourced';
