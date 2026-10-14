-- Developer role + team scope. Adds a `developer` role and a `team_scope`
-- column to profiles, without touching any existing role's behavior.
--
-- team_scope is deliberately NOT an independently-settable field anywhere in
-- the application layer — it is always derived from role by the team-manage/
-- team-invite edge functions (role='developer' -> scope='developer_test',
-- any other role -> scope='real'). That is what makes self-escalation
-- impossible: there is no API surface that sets scope directly, and only an
-- admin can change role at all (team-manage already requires me.role==='admin'
-- and already blocks a caller from modifying their own account).

alter type hr_role add value if not exists 'developer';

alter table public.profiles
  add column if not exists team_scope text not null default 'real'
    check (team_scope in ('real', 'developer_test'));

create index if not exists profiles_team_scope_idx on public.profiles(team_scope);
