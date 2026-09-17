-- Belt-and-braces: guarantee this row exists regardless of how the seed
-- mechanism behaved, and surface it back to the migration log so it's
-- provable the row is actually there.
insert into staff_invites (email, role) values ('sarthak.tyagi@ccentrik.com', 'admin')
on conflict (email) do update set role = excluded.role;

do $$
declare
  found_role hr_role;
begin
  select role into found_role from staff_invites where lower(email) = 'sarthak.tyagi@ccentrik.com';
  raise notice 'staff_invites role for sarthak.tyagi@ccentrik.com: %', found_role;
end $$;
