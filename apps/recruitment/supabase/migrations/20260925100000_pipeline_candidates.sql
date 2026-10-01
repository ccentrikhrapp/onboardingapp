-- Pipeline Candidates: a future-hiring pool the TA tracks (notes, follow-ups,
-- notice-period availability) until a suitable job opens, then converts into a
-- normal Job Candidate (application). The original record is kept for history.
--
-- Access: a TA sees the pipeline candidates they created; TA Head / Super
-- Admin see all. Nothing here is visible to candidates or HR.

create sequence if not exists pipeline_code_seq start 1001;

create table pipeline_candidates (
  id                    uuid primary key default gen_random_uuid(),
  pipeline_code         text not null unique default ('PIP-' || nextval('pipeline_code_seq')),
  name                  text not null,
  phone                 text not null,
  email                 text not null,
  position              text not null,
  organisation          text not null,
  total_exp             numeric(4,1) not null check (total_exp >= 0),
  relevant_exp          numeric(4,1) not null check (relevant_exp >= 0),
  current_ctc           numeric(10,2) not null check (current_ctc >= 0),
  offer_in_hand         boolean not null default false,
  expected_ctc          numeric(10,2) not null check (expected_ctc >= 0),
  notice_days           integer not null check (notice_days >= 0),
  current_location      text not null,
  hiring_location       text not null,
  source                text not null default 'manual' check (source in ('manual', 'csv')),
  status                text not null default 'active' check (status in ('active', 'moved', 'archived')),
  expected_availability date not null,
  reminder_notified_at  timestamptz,
  reminder_dismissed_at timestamptz,
  next_follow_up_date   date,
  moved_job_id          uuid references jobs (id) on delete set null,
  moved_application_id  uuid references applications (id) on delete set null,
  moved_by              uuid references profiles (id) on delete set null,
  moved_at              timestamptz,
  archived_at           timestamptz,
  created_by            uuid not null references profiles (id) on delete restrict,
  updated_by            uuid references profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One live pipeline record per person: same email, or same last-10 phone digits.
create unique index pipeline_candidates_email_uq
  on pipeline_candidates (lower(email)) where status <> 'archived';
create unique index pipeline_candidates_phone_uq
  on pipeline_candidates (right(regexp_replace(phone, '\D', '', 'g'), 10)) where status <> 'archived';
create index pipeline_candidates_owner_idx on pipeline_candidates (created_by, status);
create index pipeline_candidates_avail_idx on pipeline_candidates (expected_availability) where status = 'active';

create table pipeline_activities (
  id                     uuid primary key default gen_random_uuid(),
  pipeline_candidate_id  uuid not null references pipeline_candidates (id) on delete cascade,
  type                   text not null check (type in (
    'Added', 'Imported', 'Note', 'Follow-up', 'Call', 'Email', 'Interview Discussion',
    'Job Discussion', 'Candidate Update', 'Status Update', 'Other'
  )),
  note                   text,
  follow_up_date         date,
  created_by             uuid references profiles (id) on delete set null,
  created_at             timestamptz not null default now()
);
create index pipeline_activities_cand_idx on pipeline_activities (pipeline_candidate_id, created_at desc);

-- Expected availability = the day the record was created + the notice period.
-- Recomputed when the notice changes; a new date re-arms the reminder.
create or replace function pipeline_before_write()
returns trigger
language plpgsql
as $$
begin
  new.expected_availability := (coalesce(new.created_at, now()))::date + new.notice_days;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
    if new.expected_availability is distinct from old.expected_availability then
      new.reminder_notified_at := null;
      new.reminder_dismissed_at := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger pipeline_candidates_before_write
  before insert or update on pipeline_candidates
  for each row execute function pipeline_before_write();

-- Every new record starts its own history.
create or replace function pipeline_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pipeline_activities (pipeline_candidate_id, type, note, created_by)
  values (
    new.id,
    case when new.source = 'csv' then 'Imported' else 'Added' end,
    case when new.source = 'csv' then 'Source: CSV Bulk Upload' else null end,
    new.created_by
  );
  return new;
end;
$$;
create trigger pipeline_candidates_after_insert
  after insert on pipeline_candidates
  for each row execute function pipeline_after_insert();

create or replace function pipeline_can_see(owner uuid)
returns boolean
language sql
stable
as $$
  select owner = auth.uid() or current_role_name() in ('admin_ta', 'admin');
$$;

alter table pipeline_candidates enable row level security;
alter table pipeline_activities enable row level security;

create policy pipeline_candidates_select on pipeline_candidates
  for select using (current_role_name() in ('ta', 'admin_ta', 'admin') and pipeline_can_see(created_by));
create policy pipeline_candidates_insert on pipeline_candidates
  for insert with check (current_role_name() in ('ta', 'admin_ta', 'admin') and created_by = auth.uid());
create policy pipeline_candidates_update on pipeline_candidates
  for update using (current_role_name() in ('ta', 'admin_ta', 'admin') and pipeline_can_see(created_by))
  with check (current_role_name() in ('ta', 'admin_ta', 'admin') and pipeline_can_see(created_by));

create policy pipeline_activities_select on pipeline_activities
  for select using (exists (
    select 1 from pipeline_candidates p
    where p.id = pipeline_candidate_id and pipeline_can_see(p.created_by)
  ));
create policy pipeline_activities_insert on pipeline_activities
  for insert with check (created_by = auth.uid() and exists (
    select 1 from pipeline_candidates p
    where p.id = pipeline_candidate_id and pipeline_can_see(p.created_by)
  ));

-- Reminder window: 7 days before the expected availability date (change the
-- default here; it is passed as a parameter so it can become a setting later).
-- Called when the TA opens the dashboard: raises ONE bell notification per
-- candidate (reminder_notified_at guards against repeats) and returns the
-- candidates whose popup hasn't been dismissed yet.
create or replace function pipeline_check_reminders(window_days integer default 7)
returns setof pipeline_candidates
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  r pipeline_candidates;
begin
  if me is null or current_role_name() not in ('ta', 'admin_ta', 'admin') then
    return;
  end if;

  for r in
    select * from pipeline_candidates
    where status = 'active'
      and expected_availability <= current_date + window_days
      and reminder_notified_at is null
      and pipeline_can_see(created_by)
  loop
    insert into notifications (recipient_profile_id, title, message, type, entity_type, entity_id)
    values (
      r.created_by,
      'Pipeline candidate approaching availability',
      r.name || ' (' || r.position || ') is expected to be available on ' || to_char(r.expected_availability, 'DD Mon YYYY') || '.',
      'pipeline_reminder', 'pipeline_candidate', r.id
    );
    update pipeline_candidates set reminder_notified_at = now() where id = r.id;
  end loop;

  return query
    select * from pipeline_candidates
    where status = 'active'
      and expected_availability <= current_date + window_days
      and reminder_dismissed_at is null
      and pipeline_can_see(created_by)
    order by expected_availability;
end;
$$;

grant execute on function pipeline_check_reminders(integer) to authenticated;
