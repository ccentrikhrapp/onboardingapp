import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

/** HR-final interview rounds the TA portal has handed off — kept live by
    integration-hr-interview-scheduled on every schedule/reschedule, so this
    is always the candidate's actual current meeting time, never a one-time
    snapshot. Soonest first. */
export function listUpcomingHrInterviews() {
  return supabase
    .from('hr_interview_handoffs')
    .select('*')
    .order('scheduled_at', { ascending: true })
    .then(unwrap);
}
