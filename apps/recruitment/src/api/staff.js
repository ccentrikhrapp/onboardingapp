import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/** HR/admin only in practice — RLS only returns all profiles to staff. */
export function listTAs() {
  return supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'ta')
    .order('full_name')
    .then(unwrap);
}

/** Super Admin: every TA/Admin TA/HR account — for the Team page. */
export function listTAUsers() {
  return supabase
    .from('profiles')
    .select('id, full_name, email, role, active, department, phone, created_at')
    .in('role', ['ta', 'admin_ta', 'hr', 'admin'])
    .order('created_at', { ascending: false })
    .then(unwrap);
}

/** Super Admin: how many applications are currently assigned to each TA. */
export async function taWorkloadCounts() {
  const rows = await supabase
    .from('applications')
    .select('assigned_ta_id')
    .not('assigned_ta_id', 'is', null)
    .neq('status', 'DRAFT')
    .then(unwrap);
  const counts = {};
  for (const r of rows || []) counts[r.assigned_ta_id] = (counts[r.assigned_ta_id] || 0) + 1;
  return counts;
}

export function inviteTA({ fullName, email, role }) {
  return callFn('invite-ta', { body: { fullName, email, role } });
}

export function setTARole(profileId, role) {
  return callFn('manage-ta', { body: { profileId, action: 'set_role', value: role } });
}

export function setTAActive(profileId, active) {
  return callFn('manage-ta', { body: { profileId, action: 'set_active', value: active } });
}

export function setTADepartment(profileId, department) {
  return callFn('manage-ta', { body: { profileId, action: 'set_department', value: department } });
}
