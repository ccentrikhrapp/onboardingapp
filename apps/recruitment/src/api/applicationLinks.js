import { supabase, candidateSupabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/** Public: resolve a TA link token into the job + recruiter it points to. */
export function resolveLink(token) {
  return callFn('resolve-link', { method: 'GET', query: { token } }, candidateSupabase);
}

/** TA: one reusable PUBLIC link per (me, job). Returns the existing one if it already exists. */
export async function createLink(jobId, label) {
  const { data: me } = await supabase.auth.getUser();
  const taId = me.user.id;
  const existing = await supabase
    .from('application_links')
    .select('*')
    .eq('job_id', jobId)
    .eq('ta_id', taId)
    .eq('invite_type', 'public')
    .maybeSingle()
    .then(unwrap);
  if (existing) return existing;
  return supabase
    .from('application_links')
    .insert({ job_id: jobId, ta_id: taId, label: label ?? null, invite_type: 'public' })
    .select('*')
    .single()
    .then(unwrap);
}

/**
 * TA: a discreet, one-off invitation for a specific candidate (never shows
 * the referring TA's name on the candidate-facing page). A TA can create as
 * many of these as they like for the same job.
 */
export async function createConfidentialInvite(jobId, { invitedName, invitedEmail } = {}) {
  const { data: me } = await supabase.auth.getUser();
  return supabase
    .from('application_links')
    .insert({
      job_id: jobId,
      ta_id: me.user.id,
      invite_type: 'confidential',
      invited_name: invitedName || null,
      invited_email: invitedEmail || null,
    })
    .select('*')
    .single()
    .then(unwrap);
}

/** TA: confidential invitations they've generated for one job. */
export function listConfidentialInvites(jobId) {
  return supabase
    .from('application_links')
    .select('*')
    .eq('job_id', jobId)
    .eq('invite_type', 'confidential')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

export function listMyLinks() {
  return supabase
    .from('application_links')
    .select('*, jobs(title, job_code)')
    .order('created_at', { ascending: false })
    .then(unwrap);
}

export function setLinkActive(id, active) {
  return supabase.from('application_links').update({ active }).eq('id', id).select('*').single().then(unwrap);
}
