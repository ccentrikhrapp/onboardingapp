import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

/* Internal TA/HR notes thread on an application — staff-only (RLS hides
   these from candidates entirely, not just the UI). */
export function listApplicationNotes(applicationId) {
  return supabase
    .from('application_notes')
    .select('id, application_id, body, created_at, updated_at, author:profiles(id, full_name, email)')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: true })
    .then(unwrap);
}

export async function addApplicationNote(applicationId, body) {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase
    .from('application_notes')
    .insert({ application_id: applicationId, author_id: user.id, body })
    .select('id, application_id, body, created_at, updated_at, author:profiles(id, full_name, email)')
    .single()
    .then(unwrap);
}

export function deleteApplicationNote(id) {
  return supabase.from('application_notes').delete().eq('id', id).then(unwrap);
}
