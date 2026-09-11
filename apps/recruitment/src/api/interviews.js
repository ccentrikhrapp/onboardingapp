import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

export function listInterviewRounds(applicationId) {
  return supabase
    .from('interview_rounds')
    .select('*, interview_assignments(interview_panelists(name, email, department, designation)), interview_feedback(*)')
    .eq('application_id', applicationId)
    .order('round_number')
    .then(unwrap);
}

export function scheduleInterview(payload) {
  return callFn('schedule-interview', { body: payload });
}

export function recordInterviewFeedback(payload) {
  return callFn('record-interview-feedback', { body: payload });
}
