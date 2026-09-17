-- Fresher vs Experienced document applicability (master prompt Part 1-2).
-- No new enum needed — text[] with a check constraint, defaulting to "both"
-- so every existing requirement keeps applying to everyone unless the data
-- fix below says otherwise.
alter table document_requirements
  add column if not exists applicable_for text[] not null default '{fresher,experienced}';

alter table document_requirements
  drop constraint if exists document_requirements_applicable_for_check;
alter table document_requirements
  add constraint document_requirements_applicable_for_check
  check (applicable_for <@ array['fresher','experienced']::text[] and array_length(applicable_for, 1) > 0);

-- Real data fix: these are employment-history documents a fresher cannot
-- reasonably provide — restrict them to experienced candidates so they're
-- never even shown (create-time filtering, not a "N/A" placeholder — see
-- application-decision's request_documents handler).
update document_requirements
set applicable_for = '{experienced}'
where stage = 'pre_offer'
  and key in ('payslips_3m', 'prev_offer_letter', 'prev_relieving_letter', 'increment_letter',
              'prev_appointment_letter', 'current_offer_letter', 'employment_history');
