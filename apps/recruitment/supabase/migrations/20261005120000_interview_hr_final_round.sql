-- Interview workflow rules (database backstop; the edge functions give the
-- friendly messages first):
--   1. Rounds are dynamic per application, but HR is always the final round.
--   2. At most one HR final round per application.
--   3. No round can be added after the HR final round.
--   4. The next round cannot be added while another round is still open.
--
-- Existing rows keep is_hr_final = false, so already-scheduled rounds are
-- unaffected.

alter table interview_rounds
  add column if not exists is_hr_final boolean not null default false;

create unique index if not exists interview_rounds_one_hr_final
  on interview_rounds (application_id)
  where is_hr_final;

create or replace function interview_rounds_enforce_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from interview_rounds r
    where r.application_id = new.application_id and r.is_hr_final
  ) then
    raise exception 'HR is the final interview round. No round can be added after it.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from interview_rounds r
    where r.application_id = new.application_id and r.status = 'scheduled'
  ) then
    raise exception 'The previous interview round is still open. Record its outcome first.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists interview_rounds_order_guard on interview_rounds;
create trigger interview_rounds_order_guard
  before insert on interview_rounds
  for each row execute function interview_rounds_enforce_order();
