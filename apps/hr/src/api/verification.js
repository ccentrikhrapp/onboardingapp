import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

const COLUMNS =
  'id, source_application_id, source_document_id, candidate_name, candidate_email, ' +
  'job_title, application_code, requirement_name, requirement_key, version, status, ' +
  'hr_remarks, reviewed_by, reviewed_at, created_at, updated_at';

/** The verification queue — every pre-offer document HR can act on. */
export function listVerifications() {
  return supabase.from('document_verifications').select(COLUMNS).order('created_at', { ascending: false }).then(unwrap);
}

export function listVerificationsForApplication(sourceApplicationId) {
  return supabase
    .from('document_verifications')
    .select(COLUMNS)
    .eq('source_application_id', sourceApplicationId)
    .order('requirement_name')
    .then(unwrap);
}

/** The file lives in the recruitment project's storage — this proxies a signed URL from there. */
export async function getVerificationDocumentUrl(sourceDocumentId) {
  const { url, fileName } = await callFn('get-document-url', { body: { sourceDocumentId } });
  return { url, fileName };
}

export function getVerificationHistory(documentVerificationId) {
  return supabase
    .from('document_verification_events')
    .select('*')
    .eq('document_verification_id', documentVerificationId)
    .order('created_at', { ascending: true })
    .then(unwrap);
}
