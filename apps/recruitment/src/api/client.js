import { supabase } from '../lib/supabase.js';
import { activityStart, activityEnd } from '../lib/activity.js';

/** Error carrying the backend's { code, message, fields } so forms can show it. */
// Backend/library wording that must never reach a person's screen.
const TECHNICAL = /non-2xx|failed to fetch|networkerror|load failed|functionshttp|jwt|row-level|\brls\b|pgrst|postgres|violates|supabase|oauth|edge function|unexpected token|is not valid json|permission denied/i;

export class ApiError extends Error {
  constructor(message, code = 'ERROR', fields = {}) {
    super(!message || TECHNICAL.test(message) ? 'Something went wrong. Please try again.' : message);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

/** Throw on a PostgREST error, otherwise return the data. */
export function unwrap({ data, error }) {
  if (error) throw new ApiError(error.message, error.code || 'DB_ERROR');
  return data;
}

/**
 * Call an edge function and unwrap the { success, data } / { success, error }
 * envelope into either the payload or a thrown ApiError.
 *
 * `client` picks which identity's session the call carries — the TA client by
 * default (every existing call site keeps working unchanged); candidate-facing
 * API functions pass the candidate client explicitly (see lib/supabase.js for
 * why the two are never the same session).
 */
async function callFnInner(name, { body, method = 'POST', query } = {}, client = supabase) {
  let path = name;
  if (query) path += `?${new URLSearchParams(query)}`;

  const { data, error } = await client.functions.invoke(path, {
    method,
    ...(body ? { body } : {}),
  });

  // Non-2xx: supabase-js puts the parsed body on error.context
  if (error) {
    // A 401/403 can mean "not allowed" — or that the server has revoked this
    // session (password changed, account removed, signed out elsewhere) while
    // the page still looks signed in. Ask the server; if the session is dead,
    // sign out so the route guards send the person to the login page instead of
    // leaving them on a screen where everything silently fails.
    const st = error.context?.status;
    if (st === 401 || st === 403) {
      const { error: sessionErr } = await client.auth.getUser();
      if (sessionErr) await client.auth.signOut();
    }
    let payload = null;
    try {
      payload = await error.context?.json?.();
    } catch {
      /* ignore */
    }
    const err = payload?.error;
    throw new ApiError(err?.message || error.message, err?.code || 'FUNCTION_ERROR', err?.fields || {});
  }

  if (data && data.success === false) {
    throw new ApiError(data.error?.message, data.error?.code, data.error?.fields || {});
  }
  return data?.data ?? data;
}

/** Short-lived signed URL for a private file. See `callFn` for what `client` means.
    `options` is passed straight through to createSignedUrl — e.g. { download: true }
    to force the browser to save the file instead of navigating to it. */
export async function signedUrl(bucket, path, expiresIn = 300, client = supabase, options = {}) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresIn, options);
  if (error) throw new ApiError(error.message, 'STORAGE_ERROR');
  return data.signedUrl;
}

// Every server action goes through here, so this is where the "working…" bar starts and stops.
export async function callFn(...args) {
  activityStart();
  try {
    return await callFnInner(...args);
  } finally {
    activityEnd();
  }
}
