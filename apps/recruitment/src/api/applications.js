import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

const LIST_COLUMNS =
  'id, application_code, status, source, current_version, submitted_at, created_at, ' +
  'job_id, assigned_ta_id, personal, professional, ' +
  'jobs(title, job_code, department), candidates(first_name, last_name, email, phone)';

/** Candidate: submit through the transactional edge function. */
export function submitApplication(payload) {
  return callFn('submit-application', { body: payload });
}

/** Candidate: my applications (RLS already limits this to me). */
export function listMyApplications() {
  return supabase
    .from('applications')
    .select(LIST_COLUMNS)
    .neq('status', 'DRAFT')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

export function getApplication(id) {
  return supabase
    .from('applications')
    .select(
      `${LIST_COLUMNS}, education, additional, autofilled, resume_path, resume_meta, ` +
        'return_reason, reject_reason, application_link_id'
    )
    .eq('id', id)
    .single()
    .then(unwrap);
}

/** TA/HR: recent timeline events across all applications the caller can see. */
export function listRecentEvents(limit = 40) {
  return supabase
    .from('application_events')
    .select('id, application_id, type, title, description, created_at, actor_label, applications(application_code, candidates(first_name, last_name), jobs(title))')
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

/** TA/HR: pipeline list. RLS limits TA to their assigned applications. */
export function listApplications({ status, search } = {}) {
  let q = supabase.from('applications').select(LIST_COLUMNS).neq('status', 'DRAFT');
  if (status) q = q.eq('status', status);
  if (search) q = q.or(`application_code.ilike.%${search}%`);
  return q.order('submitted_at', { ascending: false, nullsFirst: false }).then(unwrap);
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

/** Live updates for the TA dashboard/table — refetch on any change RLS lets
    the caller see (new application, a decision, etc). Returns an unsubscribe fn. */
export function subscribeApplications(onChange) {
  const channel = supabase
    .channel('applications-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
