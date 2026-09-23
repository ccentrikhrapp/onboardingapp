import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

/** HR/admin only in practice — RLS only returns all profiles to staff. */
export function listTAs() {
  return supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'ta')
    .eq('active', true)
    .order('full_name')
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
