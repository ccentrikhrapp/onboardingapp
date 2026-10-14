-- Reverts 20261014100000_developer_role.sql: the Developer role feature was
-- built and then decided against. The 'developer' value added to the
-- hr_role enum cannot be removed (Postgres has no DROP VALUE for enums) --
-- it stays, permanently unused, with no code path setting or checking it.

drop index if exists public.profiles_team_scope_idx;

alter table public.profiles drop column if exists team_scope;
