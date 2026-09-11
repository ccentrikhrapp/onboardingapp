-- ============================================================================
-- Offers. One per application. The letter itself is a file the TA uploads
-- (stored in offer-letters/{application_id}/...); this row tracks status and
-- the composer content. Offer acceptance is the trigger for integration
-- point 2 (docs/requirements/03-*.md §7) — handled in the accept-offer
-- function, not here.
-- ============================================================================

create type offer_status as enum ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');

create table offers (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null unique references applications (id) on delete cascade,
  status           offer_status not null default 'draft',
  subject          text,
  body             text,
  offer_letter_path text,
  department       text,
  designation      text,
  employment_type  text,
  location         text,
  joining_date     date,
  sent_at          timestamptz,
  viewed_at        timestamptz,
  accepted_at      timestamptz,
  declined_at      timestamptz,
  accepted_by      uuid references profiles (id),
  created_by       uuid references profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger offers_set_updated_at
  before update on offers
  for each row execute function set_updated_at();

alter table offers enable row level security;

create policy offers_select on offers
  for select using (can_read_application(application_id));

create policy offers_manage_staff on offers
  for all using (current_role_name() in ('ta', 'admin')) with check (current_role_name() in ('ta', 'admin'));

-- Candidates never write offers directly (acceptance is a dedicated,
-- audited, one-time edge function) — no candidate insert/update policy here.
