-- Permanently removing a team member (team-manage action "delete").
--
-- Historical records must SURVIVE the person: every "who did this" column
-- that blocked deleting a profile becomes ON DELETE SET NULL, so document
-- verifications, onboarding records etc. stay intact. audit_logs is
-- append-only and can't be updated, so its actor FK is dropped instead — the
-- row keeps the actor's id + label as plain history.
--
-- (No blocklist table here: this app's handle_new_user already refuses any
-- email that isn't on the staff allow-list, and removal deletes the email
-- from that list, so a removed member can't create an account again.)

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype = 'a'
      and not a.attnotnull
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    if r.tbl <> 'audit_logs' then
      execute format(
        'alter table %s add constraint %I foreign key (%I) references public.profiles (id) on delete set null',
        r.tbl, r.conname, r.col);
    end if;
  end loop;
end $$;
