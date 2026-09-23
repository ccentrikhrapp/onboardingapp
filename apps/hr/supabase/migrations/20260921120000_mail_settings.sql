-- Per-user mail sending, like the CRM: each staff member saves their own Gmail App
-- Password in Settings -> Email, and workflow emails they trigger go out from THEIR own
-- address over SMTP (no Google permission screen involved). Unlike a plain column, the
-- password is kept in Supabase Vault (encrypted with a server-managed key) and no policy
-- exposes anything to the browser: only the edge functions (service role) read or write it.

drop function if exists public.set_mail_password(text);
drop function if exists public.get_mail_password();
drop function if exists public.clear_mail_settings();
drop table if exists public.mail_settings;

create table if not exists public.user_mail_credentials (
  profile_id         uuid primary key references public.profiles (id) on delete cascade,
  mail_user          text not null,
  password_secret_id uuid not null,
  updated_at         timestamptz not null default now(),
  last_test_at       timestamptz
);
alter table public.user_mail_credentials enable row level security;
revoke all on public.user_mail_credentials from anon, authenticated;

create or replace function public.set_user_mail_password(p_profile uuid, p_mail_user text, p_password text)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare sid uuid;
begin
  select password_secret_id into sid from user_mail_credentials where profile_id = p_profile;
  if sid is null then
    sid := vault.create_secret(p_password, 'mail_pw_' || p_profile::text, 'Mailbox app password');
    insert into user_mail_credentials (profile_id, mail_user, password_secret_id, last_test_at)
      values (p_profile, p_mail_user, sid, now());
  else
    perform vault.update_secret(sid, p_password);
    update user_mail_credentials set mail_user = p_mail_user, updated_at = now(), last_test_at = now() where profile_id = p_profile;
  end if;
end;
$$;

create or replace function public.get_user_mail_password(p_profile uuid)
returns text
language sql security definer set search_path = public, vault
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  join user_mail_credentials c on c.password_secret_id = ds.id
  where c.profile_id = p_profile;
$$;

create or replace function public.clear_user_mail_password(p_profile uuid)
returns void
language plpgsql security definer set search_path = public, vault
as $$
declare sid uuid;
begin
  select password_secret_id into sid from user_mail_credentials where profile_id = p_profile;
  delete from user_mail_credentials where profile_id = p_profile;
  if sid is not null then delete from vault.secrets where id = sid; end if;
end;
$$;

revoke all on function public.set_user_mail_password(uuid, text, text), public.get_user_mail_password(uuid), public.clear_user_mail_password(uuid) from public, anon, authenticated;
grant execute on function public.set_user_mail_password(uuid, text, text), public.get_user_mail_password(uuid), public.clear_user_mail_password(uuid) to service_role;

-- A removed member's stored password must not outlive them: the FK cascade drops the
-- credentials row, and this trigger deletes the Vault secret with it.
create or replace function public.drop_mail_secret_with_credentials()
returns trigger language plpgsql security definer set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = old.password_secret_id;
  return old;
end;
$$;
drop trigger if exists user_mail_credentials_drop_secret on public.user_mail_credentials;
create trigger user_mail_credentials_drop_secret
  after delete on public.user_mail_credentials
  for each row execute function public.drop_mail_secret_with_credentials();
