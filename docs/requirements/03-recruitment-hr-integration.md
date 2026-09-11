# Recruitment ↔ HR Integration — Detailed Contract

> Supplied by the product owner on 2026-09-11, refining
> [`02-two-application-architecture.md`](./02-two-application-architecture.md).
> **This supersedes 02's claim that offer-acceptance is the single integration
> trigger — there are two integration points**, pre-offer document
> verification and offer acceptance. Everything else in `02-*` (ownership,
> security, idempotency, failure handling, repo layout) still applies.

## 1. Master business flow

```
Candidate applies -> TA approves -> TA schedules interview -> candidate clears
round -> next round -> all required rounds cleared -> TA requests pre-offer
documents -> candidate uploads -> [INTEGRATION 1] -> HR verifies
  -> rejected: candidate corrects -> HR re-verifies (loop)
  -> approved: all mandatory docs approved -> TA becomes offer-eligible
-> TA sends offer -> candidate accepts -> [INTEGRATION 2] -> HR onboarding
-> joining documents/formalities -> joining -> employee created -> active employee
```

## 2. HR's role in recruitment — precisely scoped

HR is **not** involved in application approval, interview scheduling/
evaluation/feedback, or candidate selection — that's entirely TA's. HR's first
involvement is **pre-offer document verification**, after TA has moved the
candidate to `DOCUMENTS REQUIRED` and the candidate has uploaded.

## 3. Two document phases — never mix them

- **Phase A — pre-offer documents.** Required *before* TA can send the offer.
  `Candidate uploads -> HR verifies -> approved -> TA can send offer.` This is
  the [`01-pre-offer-document-verification.md`](./01-pre-offer-document-verification.md)
  checklist/engine, already modeled in the recruitment DB
  (`document_requirements`, `application_documents`, `document_files`, all
  `stage = 'pre_offer'`).
- **Phase B — joining/onboarding documents.** Happen *after* offer acceptance,
  entirely inside the HR application (`docs/requirements/00-*` §20 onward,
  reshaped as HR's own module — not built by copying recruitment code).

## 4. Document status (recruitment-owned, candidate-facing + TA-facing)

```
NOT_REQUESTED | REQUESTED | UPLOADED | UNDER_REVIEW | APPROVED | REJECTED | REUPLOAD_REQUIRED
```
The existing `document_status` enum (`requested/uploaded/under_verification/
verified/rejected/revision_required/cannot_provide`) already covers this
vocabulary — HR verification decisions update it via integration, not by HR
writing to the recruitment DB directly.

## 5. Integration point 1 — document submitted → HR verification

```
Candidate uploads -> Recruitment backend stores it -> secure integration call
-> HR backend -> HR verification queue (visible immediately, no manual TA
   forwarding, no manual download-and-email)
```

**Ownership split** (non-negotiable):
- **Recruitment owns:** the document request, the candidate's upload, submission
  status, re-upload, and recruitment-side metadata (file, requirement, slot).
- **HR owns:** the verification decision, comments, timestamp, reviewer
  identity, and verification history. HR never gets direct storage/DB access
  into recruitment — only what the integration payload carries (metadata +
  a securely-accessible reference, e.g. a short-lived signed URL minted by
  recruitment on request, not a permanent public link).

**HR verification actions**, each flowing back to recruitment:
- **Approve** → `APPROVED` (`verified`)
- **Reject** → `REJECTED` (`rejected`) + mandatory reason
- **Request correction** → `REUPLOAD_REQUIRED` (`revision_required`) + mandatory instructions

**Reupload loop:** `HR requests correction -> integration -> recruitment ->
candidate notified -> candidate re-uploads (new version) -> integration ->
HR verifies again.` Every version is retained — never overwritten.

## 6. Offer eligibility — enforced on both ends

Computed automatically, never left to TA to eyeball:

```
DOCUMENTS_PENDING | DOCUMENTS_UNDER_REVIEW | DOCUMENTS_REJECTED
DOCUMENTS_INCOMPLETE | HR_VERIFICATION_PENDING | READY_FOR_OFFER
```

Only `READY_FOR_OFFER` (= every mandatory/required pre-offer document
`APPROVED`, conditional ones satisfied or N/A) unlocks Send Offer. The TA UI
disables the button *and* the offer-send backend endpoint independently
re-checks eligibility and rejects the call if not ready — never trust the
frontend alone, and never let a manual API call bypass this.

## 7. Integration point 2 — offer accepted → HR onboarding

Unchanged from `02-*`: candidate accepts → recruitment emits `OFFER_ACCEPTED`
→ HR creates an **Onboarding Case / Pre-Employee** (never an Employee
directly) → HR owns everything from there (onboarding, joining docs/
formalities, employee creation). TA sees only coarse status
(`Offer Accepted / HR Onboarding Initiated / In Progress / Joining Confirmed`),
never payroll/bank/leave/attendance/compensation detail.

## 8. API contract (conceptual — adapt to Supabase edge functions)

**Recruitment → HR**
```
POST /integration/documents/submitted
POST /integration/candidate/preoffer-data
POST /integration/offer-accepted
```
**HR → Recruitment**
```
POST /integration/documents/verification-status
POST /integration/onboarding/status
POST /integration/joining/status
```

Every call: service-to-service auth (shared secret / signed request, never a
user JWT), an `integration_event_id` for idempotency, schema-validated payload,
and a logged attempt (`PENDING|PROCESSING|SUCCESS|FAILED|RETRYING`) on the
sending side plus a dedup check on the receiving side. A repeat delivery of
the same event must never double-create a record.

## 9. Stable cross-system identifiers

`candidate_id, application_id, job_id, offer_id, document_id, onboarding_id,
employee_id, integration_event_id` — HR stores these as references, not as a
copy of the recruitment record.

## 10. HR dashboard — Pre-Offer Verification Queue

The first real HR screen (before onboarding exists at all): a queue of
candidates with pending/rejected pre-offer documents, counts (required /
submitted / approved / rejected / pending), and a verification workspace
(candidate info + per-document approve/reject/request-correction with
mandatory comments on reject/correction). Overall status per candidate:
`ACTION REQUIRED` while anything is outstanding, `VERIFIED` once all mandatory
documents are approved.

## 11. Implementation order (supersedes `02-*` §9 with this finer sequence)

1. Recruitment: Candidate + TA app (underway).
2. Recruitment: workflow through **all rounds cleared** (interviews — not yet built).
3. Recruitment: pre-offer document request (TA) + candidate upload (not yet built;
   the DB engine already exists — `document_requirements`/`application_documents`/`document_files`).
4. HR: independent application + document-verification module (this session).
5. Integration 1: documents → HR verification → status back to recruitment/TA.
6. Offer eligibility enforcement (backend + frontend).
7. Offer workflow (TA send → candidate accept/reject).
8. Integration 2: offer accepted → HR onboarding case.
9. HR: full onboarding.
10. HR: joining + employee creation.
11. Reverse status sync back to recruitment where TA needs visibility.
12. End-to-end testing across both applications, including failure modes
    (API down, duplicate events, invalid ids, rejected/withdrawn offers,
    joining cancellation, missing documents, partial data, unauthorized calls).

**Status (2026-09-11):** steps 1, 4, 5, 8 done from earlier work. Steps 2
(interviews), 3 (pre-offer document request + candidate upload, wired to
integration point 1), 6 (offer eligibility enforcement) and 7 (offer
send/accept, wired to integration point 2) are now done too — see recruitment
commits `c2e77de` and `c4ecc2d`. Both integration points are exercised
end-to-end in code (untested against live Supabase projects — none exist
yet). Remaining: step 9 (HR's own full onboarding module beyond the
OnboardingCasesPage scaffold already in apps/hr), step 10 (joining + employee
creation — createEmployee already exists in apps/hr/api/onboarding.js, no
dedicated joining-date/formalities UI yet), step 11 (reverse status sync:
HR's onboarding/joining status back to recruitment — the outbound HR->
recruitment integration functions for this don't exist yet, only the
document-verification and offer-accepted directions do), and step 12
(cross-app end-to-end testing, which needs real Supabase projects for both
apps).
