import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/* Employee Joining Form — HR side. Reads go straight through RLS (any HR
   staff); every write goes through the joining-hr-action edge function so the
   status rules and audit trail can't be bypassed from the browser. */

export async function getJoiningForCase(caseId) {
  const rows = await supabase.from('joining_profiles').select('*').eq('onboarding_case_id', caseId).limit(1).then(unwrap);
  return rows?.[0] || null;
}

export function listJoiningEvents(profileId) {
  return supabase
    .from('joining_profile_events')
    .select('id, kind, section, field, old_value, new_value, actor_label, remark, created_at')
    .eq('joining_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(300)
    .then(unwrap);
}

/** The signed / submitted versions — frozen, never edited afterwards. */
export function listJoiningSnapshots(profileId) {
  return supabase
    .from('joining_profile_snapshots')
    .select('id, kind, data, hr_fields, signature, created_at')
    .eq('joining_profile_id', profileId)
    .order('created_at', { ascending: false })
    .then(unwrap);
}

const act = (profileId, action, extra = {}) => callFn('joining-hr-action', { body: { profileId, action, ...extra } });
export const setHrFields = (profileId, fields) => act(profileId, 'set_hr_fields', { fields });
export const requestCorrection = (profileId, items) => act(profileId, 'request_correction', { items });
export const startReview = (profileId) => act(profileId, 'start_review');
export const verifyJoining = (profileId) => act(profileId, 'verify');
export const completeJoining = (profileId) => act(profileId, 'complete');

/* ---- document-level review ---- */
export async function listJoiningItems(profileId) {
  return supabase.from('joining_document_items').select('*').eq('joining_profile_id', profileId).then(unwrap);
}
const docAct = (profileId, action, extra) => act(profileId, action, extra);
export const docApprove = (profileId, itemKey) => docAct(profileId, 'doc_approve', { itemKey });
export const docClarify = (profileId, itemKey, remark) => docAct(profileId, 'doc_clarify', { itemKey, remark });
export const docReject = (profileId, itemKey, remark) => docAct(profileId, 'doc_reject', { itemKey, remark });
export const docMarkNa = (profileId, itemKey, remark) => docAct(profileId, 'doc_mark_na', { itemKey, remark });
export const docMarkApplicable = (profileId, itemKey) => docAct(profileId, 'doc_mark_applicable', { itemKey });
export const approveDocumentation = (profileId) => docAct(profileId, 'approve_documentation');
export const getJoiningFileUrl = (profileId, itemKey, fileIndex = 0) => callFn('get-joining-file-url', { body: { profileId, itemKey, fileIndex } });

/* ---- Super Admin: rules for each reference document ---- */
export const listDocConfig = () => callFn('joining-doc-config', { body: { action: 'list' } });
export const updateDocConfig = (refKey, changes) => callFn('joining-doc-config', { body: { action: 'update', refKey, ...changes } });

/** HR/Admin overrides for the reference documents (empty = built-in defaults). Readable by any HR staff. */
export function listDocConfigRows() {
  return supabase.from('joining_document_config').select('*').then(unwrap);
}
