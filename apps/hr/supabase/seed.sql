-- Staff allowlist for the HR app. Edit the emails for your real HR team.
insert into staff_invites (email, role) values
  ('claudeworkk01@gmail.com', 'admin')
on conflict (email) do update set role = excluded.role;
-- insert into staff_invites (email, role) values ('hr1@ccentrik.com', 'hr') on conflict (email) do nothing;
