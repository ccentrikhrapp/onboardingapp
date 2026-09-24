-- Pre-offer document rules: two clear tiers, multi-file documents, and a
-- verification gate that depends ONLY on mandatory documents.
--
--   mandatory -> must be uploaded AND verified; "Can't provide" never satisfies it
--   optional  -> upload, mark "Can't provide", or leave it; never blocks verification
--   (legacy 'required' / 'conditional' rows are treated as optional too)
--
-- Everything here is data, editable by the Super Admin from
-- Settings -> Pre-offer documents, so the company can change which documents
-- are mandatory without a code change.

-- Which part of a multi-file document an upload is ("front", "back", "1", "2"...).
-- NULL for a single-file document (every file uploaded before this migration).
alter table public.document_files add column if not exists slot text;

-- Friendly name per required file, e.g. {"Front side","Back side"}.
alter table public.document_requirements add column if not exists slot_labels text[];

-- Initial configuration: PAN + Aadhaar mandatory, everything else optional.
update public.document_requirements
   set requirement_class = 'mandatory', can_mark_cannot_provide = false
 where stage = 'pre_offer' and key in ('pan_card', 'aadhaar');

update public.document_requirements
   set requirement_class = 'optional', can_mark_cannot_provide = true
 where stage = 'pre_offer' and key not in ('pan_card', 'aadhaar');

-- Multi-file documents.
update public.document_requirements
   set requires_front_back = true, quantity_required = 2, slot_labels = array['Front side', 'Back side']
 where key = 'aadhaar';
update public.document_requirements
   set slot_labels = array['Current address proof', 'Permanent address proof']
 where key = 'address_proof';
update public.document_requirements
   set slot_labels = array['Photo 1', 'Photo 2']
 where key = 'passport_photos';
-- "Last three employment details" as three separate mandatory-count uploads
-- could never be completed by someone with fewer than three employers.
update public.document_requirements
   set quantity_required = 1, allowed_file_types = array['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png']
 where key = 'employment_history';

-- Offer gate: only mandatory documents decide readiness.
create or replace function public.offer_eligibility(app_id uuid)
returns text
language plpgsql
stable
as $$
declare
  requested integer;
  mandatory_unmet integer;
  any_rejected integer;
  any_not_uploaded integer;
begin
  select count(*) into requested
  from application_documents ad
  join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer';

  if requested = 0 then
    return 'DOCUMENTS_PENDING'; -- TA hasn't requested pre-offer documents yet
  end if;

  select count(*) into mandatory_unmet
  from application_documents ad
  join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer' and r.active
    and r.requirement_class = 'mandatory' and ad.status <> 'verified';

  if mandatory_unmet = 0 then
    return 'READY_FOR_OFFER';
  end if;

  select count(*) into any_rejected
  from application_documents ad
  join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer' and r.active
    and r.requirement_class = 'mandatory'
    and ad.status in ('rejected', 'revision_required');
  if any_rejected > 0 then
    return 'DOCUMENTS_REJECTED';
  end if;

  select count(*) into any_not_uploaded
  from application_documents ad
  join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer' and r.active
    and r.requirement_class = 'mandatory'
    and ad.status in ('requested', 'cannot_provide');
  if any_not_uploaded > 0 then
    return 'DOCUMENTS_INCOMPLETE';
  end if;

  return 'HR_VERIFICATION_PENDING'; -- uploaded / under review, waiting on TA/HR
end;
$$;

create or replace function public.offer_blocking_reasons(app_id uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(
    r.name || case
      when ad.status = 'rejected' then ' — rejected'
      when ad.status = 'revision_required' then ' — correction required'
      when ad.status in ('requested', 'cannot_provide') then ' — not yet uploaded'
      else ' — awaiting verification'
    end
    order by r.display_order
  ), '{}')
  from application_documents ad
  join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer' and r.active
    and r.requirement_class = 'mandatory'
    and ad.status <> 'verified';
$$;
