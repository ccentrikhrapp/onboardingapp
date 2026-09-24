-- Split on purpose: Postgres refuses to use a new enum value in the same
-- transaction that adds it. Run this alone, then 20260924100001_document_rules.sql.
alter type requirement_class add value if not exists 'optional';
