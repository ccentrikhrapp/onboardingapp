import { supabase } from '../lib/supabase.js';
import { ApiError, unwrap, callFn } from './client.js';

/* Pipeline Candidates — a future-hiring pool tracked by the TA (see
   migration 20260925100000_pipeline_candidates.sql). Reads/writes go straight
   through RLS (a TA sees their own, TA Head / Super Admin see all); only the
   conversion to a Job Candidate needs an edge function. */

const SELECT = '*, creator:profiles!pipeline_candidates_created_by_fkey(full_name), mover:profiles!pipeline_candidates_moved_by_fkey(full_name), moved_job:jobs!pipeline_candidates_moved_job_id_fkey(title, job_code)';

export function pipelineFromDb(r) {
  return {
    id: r.id,
    code: r.pipeline_code,
    name: r.name,
    phone: r.phone,
    email: r.email,
    position: r.position,
    organisation: r.organisation,
    totalExp: Number(r.total_exp),
    relevantExp: Number(r.relevant_exp),
    currentCtc: Number(r.current_ctc),
    offerInHand: !!r.offer_in_hand,
    expectedCtc: Number(r.expected_ctc),
    noticeDays: r.notice_days,
    currentLocation: r.current_location,
    hiringLocation: r.hiring_location,
    source: r.source,
    status: r.status,
    expectedAvailability: r.expected_availability,
    reminderDismissedAt: r.reminder_dismissed_at,
    nextFollowUpDate: r.next_follow_up_date,
    movedJobId: r.moved_job_id,
    movedJobTitle: r.moved_job?.title || null,
    movedApplicationId: r.moved_application_id,
    movedAt: r.moved_at,
    movedByName: r.mover?.full_name || null,
    createdAt: r.created_at,
    createdByName: r.creator?.full_name || null,
  };
}

function toDb(f) {
  return {
    name: f.name.trim(),
    phone: f.phone.trim(),
    email: f.email.trim().toLowerCase(),
    position: f.position.trim(),
    organisation: f.organisation.trim(),
    total_exp: Number(f.totalExp),
    relevant_exp: Number(f.relevantExp),
    current_ctc: Number(f.currentCtc),
    offer_in_hand: !!f.offerInHand,
    expected_ctc: Number(f.expectedCtc),
    notice_days: Math.round(Number(f.noticeDays)),
    current_location: f.currentLocation.trim(),
    hiring_location: f.hiringLocation.trim(),
  };
}

// A second live record for the same email / phone is refused by a unique
// index — say so plainly (the raw database wording is filtered by ApiError).
function friendly(error) {
  if (error?.code === '23505') {
    const which = /phone/.test(error.message) ? 'phone number' : 'email';
    return new ApiError(`A pipeline candidate with this ${which} already exists.`, 'DUPLICATE');
  }
  return new ApiError(error?.message, error?.code || 'DB_ERROR');
}

export async function listPipelineCandidates() {
  const rows = await supabase.from('pipeline_candidates').select(SELECT).order('created_at', { ascending: false }).then(unwrap);
  return (rows || []).map(pipelineFromDb);
}

export async function createPipelineCandidate(form, source = 'manual') {
  const { data, error } = await supabase.from('pipeline_candidates').insert({ ...toDb(form), source }).select(SELECT).single();
  if (error) throw friendly(error);
  return pipelineFromDb(data);
}

export async function updatePipelineCandidate(id, form) {
  const { data, error } = await supabase.from('pipeline_candidates').update(toDb(form)).eq('id', id).select(SELECT).single();
  if (error) throw friendly(error);
  return pipelineFromDb(data);
}

export async function setPipelineArchived(id, archived) {
  const { error } = await supabase.from('pipeline_candidates')
    .update(archived ? { status: 'archived', archived_at: new Date().toISOString() } : { status: 'active', archived_at: null })
    .eq('id', id);
  if (error) throw friendly(error);
}

export async function listPipelineActivities(id) {
  const rows = await supabase
    .from('pipeline_activities')
    .select('id, type, note, follow_up_date, created_at, creator:profiles!pipeline_activities_created_by_fkey(full_name)')
    .eq('pipeline_candidate_id', id)
    .order('created_at', { ascending: false })
    .then(unwrap);
  return (rows || []).map((a) => ({
    id: a.id, type: a.type, note: a.note, followUpDate: a.follow_up_date,
    createdAt: a.created_at, by: a.creator?.full_name || 'Talent Acquisition',
  }));
}

export async function addPipelineActivity(id, { type, note, followUpDate }) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('pipeline_activities').insert({
    pipeline_candidate_id: id, type, note: note?.trim() || null,
    follow_up_date: followUpDate || null, created_by: u?.user?.id,
  });
  if (error) throw friendly(error);
  if (followUpDate) {
    await supabase.from('pipeline_candidates').update({ next_follow_up_date: followUpDate }).eq('id', id);
  }
}

/** Raises the one-time bell notification per candidate and returns everyone
    whose availability reminder popup hasn't been dismissed yet. */
export async function checkPipelineReminders() {
  const rows = await supabase.rpc('pipeline_check_reminders').then(unwrap);
  return (rows || []).map(pipelineFromDb);
}

export async function dismissPipelineReminder(id) {
  const { error } = await supabase.from('pipeline_candidates').update({ reminder_dismissed_at: new Date().toISOString() }).eq('id', id);
  if (error) throw friendly(error);
}

export function movePipelineCandidate({ pipelineCandidateId, jobId, hiringLocation }) {
  return callFn('move-pipeline-candidate', { body: { pipelineCandidateId, jobId, hiringLocation } });
}
