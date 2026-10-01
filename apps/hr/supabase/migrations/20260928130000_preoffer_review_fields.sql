-- Pre-offer verification in HR: a forwarded item can now be a FILE ("document"), a reason for not
-- providing one ("reason") or a "not applicable" claim ("na"); and HR sees a per-candidate summary of
-- what applies to that candidate (applicable / approved / approved with reason / not applicable / …).

alter table document_verifications add column if not exists kind text not null default 'document' check (kind in ('document', 'reason', 'na'));
alter table document_verifications add column if not exists reason text;
alter table document_verifications add column if not exists requirement_class text;

create table if not exists verification_summaries (
  source_application_id uuid primary key,
  candidate_name        text,
  candidate_email       text,
  employment_type       text,
  previous_employers    integer,
  summary               jsonb not null default '{}',
  updated_at            timestamptz not null default now()
);
alter table verification_summaries enable row level security;
drop policy if exists verification_summaries_staff_select on verification_summaries;
create policy verification_summaries_staff_select on verification_summaries
  for select using (current_role_name() is not null);
