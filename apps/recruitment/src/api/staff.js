import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

/** HR/admin only in practice — RLS only returns all profiles to staff. */
export function listTAs() {
  return supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'ta')
    .order('full_name')
    .then(unwrap);
}
