// Helpers for the sign-in return trip, so the app never flashes the login form
// (or the main screen) while a Google sign-in is still being completed.
// TA-only (used by TALoginPage/RootGate) — checks the TA session's own storage
// key (see lib/supabase.js); the candidate session is intentionally separate.
import { TA_STORAGE_KEY } from '../lib/supabase.js';

/** True while the browser is returning from Google with a session/code/error in the URL. */
export function isAuthReturn() {
  try {
    return /access_token=|refresh_token=|[?&#]code=|error_description=|[?&#]error=/.test(`${window.location.search} ${window.location.hash}`);
  } catch {
    return false;
  }
}

/** True when a signed-in TA session is already saved in this browser. */
export function hasStoredSession() {
  try {
    return localStorage.getItem(TA_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export const SIGN_IN_FAILED = "We couldn't complete your sign-in. Please try again.";
export const NOT_AUTHORIZED = 'This Google account is not authorized for this workspace. Please use the email address you were invited with, or contact your administrator.';

/** Maps what Google/Supabase put in the return URL to a plain-language message ('' = show nothing). */
export function returnErrorMessage() {
  try {
    const raw = `${window.location.search} ${window.location.hash}`;
    if (!/error_description=|[?&#]error=/.test(raw)) return '';
    const text = decodeURIComponent(raw.replace(/\+/g, ' ')).toLowerCase();
    if (/access_denied/.test(text) && !/database/.test(text)) return ''; // person closed/declined the Google screen
    if (/database error|not associated|unauthor|removed|disabled/.test(text)) return NOT_AUTHORIZED;
    return SIGN_IN_FAILED;
  } catch {
    return SIGN_IN_FAILED;
  }
}

/** Removes the tokens/error from the address bar once they've been handled. */
export function cleanAuthUrl() {
  try {
    if (isAuthReturn()) window.history.replaceState(null, '', window.location.pathname);
  } catch { /* ignore */ }
}
