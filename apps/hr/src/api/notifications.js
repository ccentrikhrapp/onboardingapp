import { supabase } from '../lib/supabase.js';
import { unwrap } from './client.js';

export function listNotifications() {
  return supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
    .then(unwrap);
}

export function markAllRead() {
  return supabase
    .from('notifications')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('status', 'unread')
    .then(unwrap);
}

export function subscribeNotifications(onChange) {
  const channel = supabase
    .channel('notifications')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
