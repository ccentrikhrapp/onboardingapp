-- Split from 20260915130001_role_hierarchy.sql on purpose: Postgres refuses
-- to let a new enum value be USED (e.g. in a policy's `in (...)` expression)
-- in the same transaction that adds it via ALTER TYPE ... ADD VALUE. Run this
-- file, let it commit, THEN run 20260915130001_role_hierarchy.sql.
alter type app_role add value if not exists 'admin_ta';
