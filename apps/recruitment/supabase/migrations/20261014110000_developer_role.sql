-- Developer role + team scope, mirroring the HR app's
-- 20261014100000_developer_role.sql. See that file's comment for the full
-- rationale — same model here: team_scope is never independently settable,
-- it is always derived from role by team-manage/team-invite (both already
-- admin/admin_ta-only, and team-manage already blocks self-modification),
-- so there is no request shape that lets a developer account grant itself
-- Real Team visibility or escalate its own role.

alter type app_role add value if not exists 'developer';

alter table public.profiles
  add column if not exists team_scope text not null default 'real'
    check (team_scope in ('real', 'developer_test'));

create index if not exists profiles_team_scope_idx on public.profiles(team_scope);
