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

// This app serves two unrelated identities from one origin: Talent Acquisition
// staff (/ta/*) and job-seeking candidates (/candidate/*). They must never share
// a session — a TA opening the Jobs Portal must look signed out there, and a
// candidate's Google sign-in must never touch the TA's account. Two Supabase
// Auth clients, each with its OWN localStorage key, give each identity its own
// independent session (same project, same anon key — this is Supabase's own
// documented pattern for holding more than one session per browser).
export const TA_STORAGE_KEY = 'sb-ccx-ta-auth';
export const CANDIDATE_STORAGE_KEY = 'sb-ccx-candidate-auth';

// Both clients read from the SAME browser storage backend, so the only thing
// keeping an OAuth/recovery callback from landing on the wrong one is which
// client actually parses the tokens out of the return URL (`detectSessionInUrl`,
// baked in at construction time — it can't be switched per navigation). Which
// identity a callback belongs to is NOT reliably the current path: the TA login
// page always requests a return to /ta/login, but if Supabase's own hosted
// "Redirect URLs" allow-list doesn't happen to match it, Supabase silently
// falls back to sending the browser to its configured Site URL (the app root)
// instead — a real, previously-hit failure mode (see RootGate.jsx), so a TA's
// callback can legitimately land on "/" too.
//
// So the sign-in call itself marks, in sessionStorage (this tab only, survives
// the round trip to Google and back regardless of which URL it lands on),
// which identity is signing in — see markAuthIntent below, called from
// AuthContext/CandidateAuthContext right before every redirect-based sign-in.
// A path-based guess is kept only as the fallback for the one case with no
// marker to read: the very first page a person ever opens.
const AUTH_INTENT_KEY = 'ccx-auth-intent';
export function markAuthIntent(which /* 'ta' | 'candidate' */) {
  try { sessionStorage.setItem(AUTH_INTENT_KEY, which); } catch { /* private mode — falls back to the path guess below */ }
}
function readAuthIntent() {
  try { return sessionStorage.getItem(AUTH_INTENT_KEY); } catch { return null; }
}

const STAFF_CALLBACK_PATHS = ['/ta', '/reset-password'];
const pathLooksLikeStaff =
  typeof window !== 'undefined' &&
  STAFF_CALLBACK_PATHS.some((p) => window.location.pathname === p || window.location.pathname.startsWith(`${p}/`));
const intent = readAuthIntent();
const isStaffCallback = intent === 'ta' ? true : intent === 'candidate' ? false : pathLooksLikeStaff;

export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isStaffCallback,
      storageKey: TA_STORAGE_KEY,
    },
  }
);

// The candidate-facing (Jobs Portal) session — see the block comment above.
export const candidateSupabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !isStaffCallback,
      storageKey: CANDIDATE_STORAGE_KEY,
    },
  }
);

// In a browser, sign-in always returns to the address the app is running on, so a
// build can never send people to a different host (e.g. a leftover local value).
export const SITE_URL =
  typeof window !== 'undefined'
    ? window.location.origin
    : env.VITE_SITE_URL || 'http://localhost:5173';
