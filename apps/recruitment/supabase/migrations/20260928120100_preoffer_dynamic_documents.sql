-- Pre-offer documents: the reference checklist is NOT "every candidate must provide
-- every document". What applies is worked out per candidate (fresher / experienced,
-- how many previous employers, other offer, same address…); an unavailable document can
-- be explained with a reason that the reviewer accepts; and the offer gate depends on the
-- APPLICABLE requirements being resolved.

alter table document_requirements add column if not exists any_of_group text;        -- alternatives: any ONE satisfies the group (PAN or Aadhaar)
alter table document_requirements add column if not exists na_allowed boolean not null default false;
alter table document_requirements add column if not exists per_employer boolean not null default false;
alter table document_requirements add column if not exists reason_options text[] not null default '{}';
alter table application_documents add column if not exists na_reason text;             -- set when the candidate said "not applicable" (vs "cannot provide")

-- ---- classification (Super Admin can change these later; see the Document rules page) ----
update document_requirements set requirement_class = 'mandatory'
 where stage = 'pre_offer' and key in ('pan_card', 'aadhaar', 'tenth_cert', 'twelfth_cert', 'degree_marksheets', 'address_proof', 'passport_photos');
update document_requirements set requirement_class = 'conditional'
 where stage = 'pre_offer' and key in ('prev_offer_letter', 'prev_appointment_letter', 'prev_relieving_letter', 'payslips_3m', 'employment_history', 'cancelled_cheque');
update document_requirements set requirement_class = 'optional'
 where stage = 'pre_offer' and key in ('passport', 'increment_letter', 'current_offer_letter');

update document_requirements set any_of_group = 'identity_proof' where stage = 'pre_offer' and key in ('pan_card', 'aadhaar');
update document_requirements set per_employer = true where stage = 'pre_offer' and key in ('prev_offer_letter', 'prev_appointment_letter', 'prev_relieving_letter', 'payslips_3m');
update document_requirements set na_allowed = true where stage = 'pre_offer' and key in ('increment_letter', 'current_offer_letter');
-- every real document can be explained with a reason (the reviewer decides); nothing is silently skipped
update document_requirements set can_mark_cannot_provide = true, reason_required = true where stage = 'pre_offer';
update document_requirements set reason_options = array['Document not available', 'Not issued by the employer / institution', 'Lost or misplaced', 'Application in process', 'Not applicable to me', 'Other']
 where stage = 'pre_offer' and cardinality(reason_options) = 0;
update document_requirements set reason_options = array['Passport not available', 'Passport application in process', 'Passport expired', 'Passport not applicable', 'Other']
 where stage = 'pre_offer' and key = 'passport';

-- ---- current vs permanent address proof are two requirements (permanent only when the address differs) ----
update document_requirements
   set name = 'Current address proof', requires_front_back = false, quantity_required = 1, slot_labels = null, multiple_files = true
 where stage = 'pre_offer' and key = 'address_proof';

insert into document_requirements (stage, key, name, description, requirement_class, quantity_required, requires_front_back, multiple_files,
                                   requires_hr_verification, can_mark_cannot_provide, reason_required, allowed_file_types, max_file_size_mb, display_order, active, applicable_for,
                                   na_allowed, reason_options)
select stage, 'address_proof_permanent', 'Permanent address proof', description, 'mandatory', 1, false, true,
       requires_hr_verification, true, true, allowed_file_types, max_file_size_mb, display_order + 1, true, applicable_for, false, reason_options
  from document_requirements where stage = 'pre_offer' and key = 'address_proof'
on conflict do nothing;

insert into document_requirements (stage, key, name, description, requirement_class, quantity_required, requires_front_back, multiple_files,
                                   requires_hr_verification, can_mark_cannot_provide, reason_required, allowed_file_types, max_file_size_mb, display_order, active, applicable_for,
                                   na_allowed, reason_options)
select stage, 'name_change_proof', 'Name change proof', 'Only if your name has changed since your documents were issued.', 'conditional', 1, false, true,
       requires_hr_verification, true, true, allowed_file_types, max_file_size_mb, display_order + 2, true, applicable_for, false, reason_options
  from document_requirements where stage = 'pre_offer' and key = 'address_proof'
on conflict do nothing;

-- ---- offer readiness -------------------------------------------------------
-- Ready when every APPLICABLE mandatory/conditional requirement is resolved:
--   verified | reason accepted | not-applicable accepted.
-- Alternatives (PAN or Aadhaar) count as ONE requirement, satisfied by any one verified document.
-- Optional documents and not-applicable ones never block.
create or replace function public.offer_eligibility(app_id uuid)
returns text
language plpgsql
stable
as $$
declare
  requested integer;
  single_unresolved integer;
  single_rejected integer;
  single_empty integer;
  group_unresolved integer;
  group_rejected integer;
  group_empty integer;
begin
  select count(*) into requested
  from application_documents ad join document_requirements r on r.id = ad.requirement_id
  where ad.application_id = app_id and r.stage = 'pre_offer';
  if requested = 0 then
    return 'DOCUMENTS_PENDING'; -- TA hasn't requested pre-offer documents yet
  end if;

  with rows as (
    select ad.status::text s, r.requirement_class::text c, r.any_of_group g
    from application_documents ad join document_requirements r on r.id = ad.requirement_id
    where ad.application_id = app_id and r.stage = 'pre_offer' and r.active and ad.status::text <> 'not_applicable'
  )
  select
    count(*) filter (where g is null and c in ('mandatory', 'conditional') and s not in ('verified', 'reason_approved', 'na_accepted')),
    count(*) filter (where g is null and c in ('mandatory', 'conditional') and s in ('rejected', 'revision_required')),
    count(*) filter (where g is null and c in ('mandatory', 'conditional') and s = 'requested')
  into single_unresolved, single_rejected, single_empty
  from rows;

  with rows as (
    select ad.status::text s, r.any_of_group g
    from application_documents ad join document_requirements r on r.id = ad.requirement_id
    where ad.application_id = app_id and r.stage = 'pre_offer' and r.active and r.any_of_group is not null and ad.status::text <> 'not_applicable'
  ), grp as (
    select g,
           bool_or(s in ('verified', 'na_accepted')) as ok,
           bool_or(s in ('rejected', 'revision_required')) as any_rejected,
           bool_or(s in ('uploaded', 'under_verification', 'cannot_provide')) as in_progress
    from rows group by g
  )
  select count(*) filter (where not ok),
         count(*) filter (where not ok and any_rejected and not in_progress),
         count(*) filter (where not ok and not in_progress and not any_rejected)
  into group_unresolved, group_rejected, group_empty
  from grp;

  if single_unresolved + group_unresolved = 0 then
    return 'READY_FOR_OFFER';
  end if;
  if single_rejected + group_rejected > 0 then
    return 'DOCUMENTS_REJECTED';
  end if;
  if single_empty + group_empty > 0 then
    return 'DOCUMENTS_INCOMPLETE';
  end if;
  return 'HR_VERIFICATION_PENDING'; -- submitted / reason given, waiting on TA/HR
end;
$$;

create or replace function public.offer_blocking_reasons(app_id uuid)
returns text[]
language sql
stable
as $$
  with rows as (
    select ad.status::text s, r.name, r.requirement_class::text c, r.any_of_group g, r.display_order, ad.employer_label
    from application_documents ad join document_requirements r on r.id = ad.requirement_id
    where ad.application_id = app_id and r.stage = 'pre_offer' and r.active and ad.status::text <> 'not_applicable'
  ), singles as (
    select display_order,
           name || coalesce(' — ' || employer_label, '') || case
             when s = 'rejected' then ' — rejected'
             when s = 'revision_required' then ' — clarification required'
             when s = 'requested' then ' — not yet provided'
             else ' — awaiting review' end as msg
    from rows where g is null and c in ('mandatory', 'conditional') and s not in ('verified', 'reason_approved', 'na_accepted')
  ), groups as (
    select min(display_order) as display_order, 'Identity proof — provide PAN or Aadhaar (one is enough)'::text as msg
    from rows where g is not null group by g having not bool_or(s in ('verified', 'na_accepted'))
  )
  select coalesce(array_agg(msg order by display_order), '{}') from (select * from singles union all select * from groups) u;
$$;
