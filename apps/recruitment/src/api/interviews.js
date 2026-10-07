import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/** Adds `invitation` ({status, sentTo}) onto each round from the emails table
    (tagged entity_type='interview_round' at schedule time) — lets the
    Interview Process list show "Invitation sent to X" persistently, not just
    in the schedule-time toast. */
export async function listInterviewRounds(applicationId, client = supabase) {
  const rounds = await client
    .from('interview_rounds')
    .select('*, interview_assignments(interview_panelists(name, email, department, designation)), interview_feedback(*)')
    .eq('application_id', applicationId)
    .order('round_number')
    .then(unwrap);

  const ids = (rounds || []).map((r) => r.id);
  if (!ids.length) return rounds;

  const emails = await client
    .from('emails')
    .select('entity_id, status, recipient, created_at')
    .eq('entity_type', 'interview_round')
    .eq('template', 'interview_scheduled')
    .in('entity_id', ids)
    .order('created_at', { ascending: false })
    .then(unwrap)
    .catch(() => []);

  const latestByRound = {};
  for (const e of emails || []) {
    if (!latestByRound[e.entity_id]) latestByRound[e.entity_id] = e; // already newest-first
  }
  return rounds.map((r) => ({
    ...r,
    invitation: latestByRound[r.id] ? { status: latestByRound[r.id].status, sentTo: latestByRound[r.id].recipient } : null,
  }));
}

export function scheduleInterview(payload) {
  return callFn('schedule-interview', { body: payload });
}

export function recordInterviewFeedback(payload) {
  return callFn('record-interview-feedback', { body: payload });
}

/** Preview a real (or, until credentials exist, mock) meeting link before
    the TA commits to scheduling — same generator schedule-interview falls
    back to itself. */
export function generateMeetingLink(platform, meta) {
  return callFn('generate-meeting-link', { body: { platform, ...meta } });
}

/** Retry — re-sends the exact interview-scheduled email for a round whose
    original send failed (or the TA just wants to resend it). */
export function resendInterviewInvitation(roundId) {
  return callFn('resend-interview-invitation', { body: { roundId } });
}

/** After a candidate declines: pick a new time for the SAME round (new
    invitation email, same round number) — see reschedule-interview-round. */
export function rescheduleInterviewRound(payload) {
  return callFn('reschedule-interview-round', { body: payload });
}

/** Put an application on a cooldown instead of rescheduling it (default 90
    days). Pass days: 0 to lift an existing freeze. */
export function freezeCandidate(payload) {
  return callFn('freeze-candidate', { body: payload });
}
