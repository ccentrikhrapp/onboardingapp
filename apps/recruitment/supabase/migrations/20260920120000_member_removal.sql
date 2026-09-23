-- Permanently removing a team member (team-manage action "delete").
--
-- 1. Historical records must SURVIVE the person: every "who did this"
--    column that blocked deleting a profile becomes ON DELETE SET NULL, so
--    jobs, offers, interviews, documents etc. stay intact (their *_label /
--    timeline text keeps the name). audit_logs is append-only and can't be
--    updated, so its actor FK is dropped instead — the row keeps the actor's
--    id + label as plain history.
-- 2. A removed person's email is blocked from re-creating any account until
--    a Super Admin explicitly invites it again.

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype = 'a'                 -- currently NO ACTION (blocks deletes)
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

create table if not exists public.blocked_emails (
  email      text primary key,
  blocked_at timestamptz not null default now(),
  blocked_by uuid,
  reason     text
);
alter table public.blocked_emails enable row level security;  -- service role only

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  invited_role app_role;
begin
  if new.email is not null and exists (select 1 from blocked_emails where lower(email) = lower(new.email)) then
    raise exception 'This account has been removed. Contact your administrator.';
  end if;

  select role into invited_role
  from staff_invites
  where lower(email) = lower(new.email);

  insert into profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(invited_role, 'candidate')
  );
  return new;
end;
$$;
