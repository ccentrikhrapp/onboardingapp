import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

// jobs!left — job_id is nullable (general applications, or a since-deleted
// job via applications.job_id on delete set null). Without the explicit
// !left hint, PostgREST's embed resolves as an inner join and silently
// drops the entire application row whenever job_id is null.
//
// The assigned TA's name is deliberately NOT embedded here the same way —
// a second embed on the nullable assigned_ta_id turned out to make the
// query fail outright (400) rather than just filter rows, taking down the
// whole TA table. Fetched separately instead (enrichAssignedToNames), same
// safe pattern already used for interview-invitation status.
const LIST_COLUMNS =
  'id, application_code, status, source, current_version, submitted_at, created_at, ' +
  'job_id, assigned_ta_id, personal, professional, education, additional, ats_score, ' +
  'jobs!left(title, job_code, department), candidates(candidate_code, first_name, last_name, email, phone)';

async function enrichAssignedToNames(rows) {
  const ids = [...new Set((rows || []).map((r) => r.assigned_ta_id).filter(Boolean))];
  if (!ids.length) return rows;
  const profiles = await supabase.from('profiles').select('id, full_name, email').in('id', ids).then(unwrap).catch(() => []);
  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  return (rows || []).map((r) => ({ ...r, assigned_ta: r.assigned_ta_id ? byId[r.assigned_ta_id] || null : null }));
}

/** Candidate: submit through the transactional edge function. */
export function submitApplication(payload) {
  return callFn('submit-application', { body: payload });
}

/** Candidate: my applications (RLS already limits this to me). No DRAFT
    filter here — the self-apply flow never creates a DB-level draft row (it
    inserts straight to SUBMITTED), so the only DRAFT a candidate will ever
    see here is one a TA created for them and they haven't verified yet. */
export function listMyApplications() {
  return supabase
    .from('applications')
    .select(LIST_COLUMNS)
    .order('created_at', { ascending: false })
    .then(unwrap);
}

export async function getApplication(id) {
  const row = await supabase
    .from('applications')
    .select(
      `${LIST_COLUMNS}, autofilled, resume_path, resume_meta, ats_score, ` +
        'return_reason, reject_reason, application_link_id'
    )
    .eq('id', id)
    .single()
    .then(unwrap);
  const [enriched] = await enrichAssignedToNames([row]);
  return enriched;
}

/** TA/HR: recent timeline events across all applications the caller can see. */
export function listRecentEvents(limit = 40) {
  return supabase
    .from('application_events')
    .select('id, application_id, type, title, description, created_at, actor_label, applications(application_code, candidates(first_name, last_name), jobs!left(title))')
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(unwrap);
}

export function getApplicationEvents(id) {
  return supabase
    .from('application_events')
    .select('*')
    .eq('application_id', id)
    .order('created_at', { ascending: true })
    .then(unwrap);
}

/** TA/HR: pipeline list. RLS limits TA to their assigned applications.
    Excludes DRAFT except TA-sourced candidates awaiting verification — those
    are real work items for the TA (resend link, view, cancel) even though
    the candidate hasn't submitted yet.
    This exclusion is applied client-side, not via `.or('status.neq.DRAFT,
    source.eq.ta_sourced')` — PostgREST failed to correctly cast values when
    that combined two different enum columns (status/source) in one OR
    expression (error 22P02, "invalid input value for enum
    application_source"), which took the entire TA table down with a bare
    400. Fetching everything and filtering in JS avoids that class of bug
    entirely, and the row count here is small enough that it's not a real
    cost. */
export async function listApplications({ status, search } = {}) {
  let q = supabase.from('applications').select(LIST_COLUMNS);
  if (status) q = q.eq('status', status);
  if (search) q = q.or(`application_code.ilike.%${search}%`);
  const rows = await q.order('submitted_at', { ascending: false, nullsFirst: false }).then(unwrap);
  const visible = rows.filter((r) => r.status !== 'DRAFT' || r.source === 'ta_sourced');
  return enrichAssignedToNames(visible);
}

/** TA review state machine. action = start_review | advance | close | request_update */
export function decideApplication(applicationId, action, reason) {
  return callFn('application-decision', { body: { applicationId, action, reason } });
}

export function startReview(applicationId) {
  return decideApplication(applicationId, 'start_review');
}

/** Candidate: apply edits to a RETURNED application and send it back to review. */
export function resubmitApplication(applicationId, patch = {}) {
  return callFn('resubmit-application', { body: { applicationId, ...patch } });
}

/** Super Admin / Admin TA only — RLS enforces this, not just the UI.
    Cascades to every child record (versions, events, documents, interviews,
    offers) per the schema's existing ON DELETE CASCADE. */
export function deleteApplication(id) {
  return supabase.from('applications').delete().eq('id', id).then(unwrap);
}

/** Super TA (HR/admin): assign unassigned/careers applications to a recruiter. */
export function assignApplications(applicationIds, taId) {
  return callFn('assign-applications', { body: { applicationIds, taId } });
}

/** TA: create an application on behalf of a sourced/referred candidate from
    an uploaded resume. Returns either the created application, or
    { duplicate: true, existingCandidate, existingApplications } if a
    candidate with this email already exists and no duplicateAction was
    given yet — the caller re-calls with duplicateAction set once the TA
    picks how to proceed. */
export function createTaCandidate(payload) {
  return callFn('create-ta-candidate', { body: payload });
}

/** TA: re-send the verification link for a TA-sourced candidate who hasn't
    verified yet. */
export function resendTaCandidateVerification(applicationId) {
  return callFn('resend-ta-candidate-verification', { body: { applicationId } });
}

/** Candidate: review/edit + confirm a TA-created (DRAFT) application, moving
    it into the normal SUBMITTED pipeline. */
export function verifyTaCandidate(applicationId, patch = {}) {
  return callFn('verify-ta-candidate', { body: { applicationId, ...patch } });
}

/** Live updates for the TA dashboard/table — refetch on any change RLS lets
    the caller see (new application, a decision, etc). Returns an unsubscribe fn. */
export function subscribeApplications(onChange) {
  const channel = supabase
    .channel('applications-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
