-- ============================================================================
-- Candidate stage notes — an internal TA/HR thread attached to an
-- application (Tiimi-reference "Timeline & Notes" tab + candidate slide-over
-- panel). Staff-only: candidates never see these.
-- ============================================================================

create table application_notes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications (id) on delete cascade,
  author_id      uuid not null references profiles (id),
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index application_notes_application_idx on application_notes (application_id, created_at);
create trigger application_notes_set_updated_at
  before update on application_notes
  for each row execute function set_updated_at();

alter table application_notes enable row level security;

-- Readable by anyone who can already read the application (TA/HR/admin — the
-- candidate policy in can_read_application never applies here since notes
-- are staff-only, enforced by the extra is_staff() check below).
create policy application_notes_select on application_notes
  for select using (is_staff() and can_read_application(application_id));

create policy application_notes_insert on application_notes
  for insert with check (
    is_staff() and can_read_application(application_id) and author_id = auth.uid()
  );

-- Author can edit/delete their own note; admin can moderate any note.
create policy application_notes_update_own on application_notes
  for update using (author_id = auth.uid() or current_role_name() = 'admin')
  with check (author_id = auth.uid() or current_role_name() = 'admin');

create policy application_notes_delete_own on application_notes
  for delete using (author_id = auth.uid() or current_role_name() = 'admin');
