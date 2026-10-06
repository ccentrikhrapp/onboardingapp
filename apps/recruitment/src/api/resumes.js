import { supabase } from '../lib/supabase.js';
import { ApiError, callFn, signedUrl } from './client.js';
import { fileUploadError } from '../utils/validation.js';

const MAX_MB = 5;
const ALLOWED = ['pdf', 'doc', 'docx'];

/**
 * Upload the resume. If the candidate is already signed in it goes straight
 * to their own folder; otherwise (picking a resume is allowed before any
 * sign-in) it goes to an anonymous "pending-anon/{draftId}" folder that only
 * this browser's draft knows about — submit-application later moves it into
 * the real candidate folder once they've actually signed in. `draftId` is
 * required in the not-signed-in case (the caller generates/persists it
 * alongside the rest of the application draft).
 *
 * `client` defaults to the TA session (the "Add Candidate" form uploads a
 * sourced resume as the TA); the candidate's own Apply form passes
 * `candidateSupabase` — see lib/supabase.js for why these are never the same.
 */
export async function uploadResume(file, draftId, client = supabase) {
  const fileErr = fileUploadError(file, { allowedExt: ALLOWED, maxMB: MAX_MB });
  if (fileErr) throw new ApiError(fileErr, 'BAD_FILE');
  const { data: me } = await client.auth.getUser();

  const folder = me.user ? me.user.id : `pending-anon/${draftId}`;
  if (!me.user && !draftId) throw new ApiError('Missing draft id.', 'BAD_REQUEST');

  const path = `${folder}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await client.storage.from('resumes').upload(path, file, {
    // Upsert needs both INSERT and UPDATE policies to satisfy RLS (Postgres checks
    // the ON CONFLICT DO UPDATE path even when nothing actually conflicts). The
    // anonymous pending-anon folder only has an INSERT policy, and the timestamped
    // filename is already unique per attempt, so only upsert for signed-in users.
    upsert: Boolean(me.user),
    contentType: file.type || undefined,
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');

  return {
    path: `resumes/${path}`,
    meta: { name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() },
  };
}

/** Server-side text extraction + heuristic parse. */
export function parseResume(path, client = supabase) {
  return callFn('parse-resume', { body: { path } }, client);
}
