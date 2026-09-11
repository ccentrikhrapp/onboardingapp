import { createClient } from '@supabase/supabase-js';

// One shared browser client. Reads config from .env (see .env.example).
// If the keys are missing we still export a client so the app can render a
// friendly "backend not configured" state instead of crashing on import.

// `import.meta.env` is injected by Vite in the browser build; in the Node-based
// test bundles it isn't there, so fall back to an empty object.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and fill them in.'
  );
}

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export const SITE_URL =
  env.VITE_SITE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
