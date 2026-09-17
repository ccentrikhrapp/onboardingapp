import { supabase } from '../lib/supabase.js';
import { unwrap, callFn } from './client.js';

/** All onboarding-document rows for a case, with the requirement name/flag joined in. */
export function listOnboardingDocuments(onboardingCaseId) {
  return supabase
    .from('onboarding_documents')
    .select('*, requirement:onboarding_document_requirements(name, required, field_schema)')
    .eq('onboarding_case_id', onboardingCaseId)
    .then(unwrap);
}

/** Every onboarding document across every case — for list-page summaries
    (grouped client-side by onboarding_case_id) so the candidates list
    doesn't fire one query per row. */
export function listAllOnboardingDocuments() {
  return supabase
    .from('onboarding_documents')
    .select('id, onboarding_case_id, status, requirement:onboarding_document_requirements(name, required)')
    .then(unwrap);
}

/** The active catalog HR can choose from when requesting documents. */
export function listOnboardingDocumentRequirements() {
  return supabase
    .from('onboarding_document_requirements')
    .select('*')
    .eq('active', true)
    .order('display_order')
    .then(unwrap);
}

/** Creates the requested rows and asks the recruitment app to collect them from the candidate. */
export function requestOnboardingDocuments(onboardingCaseId, requirementIds) {
  return callFn('request-onboarding-documents', { body: { onboardingCaseId, requirementIds } });
}

/** action = 'approve' | 'reject' | 'reupload_required'. remarks required for the latter two. */
export function verifyOnboardingDocument(onboardingDocumentId, action, remarks) {
  return callFn('verify-onboarding-document', { body: { onboardingDocumentId, action, remarks } });
}

/** The file lives in the recruitment project's storage — this proxies a signed URL from there. */
export async function getOnboardingDocumentUrl(onboardingDocumentId) {
  return callFn('get-onboarding-document-url', { body: { onboardingDocumentId } });
}
