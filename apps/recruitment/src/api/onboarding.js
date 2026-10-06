import { candidateSupabase } from '../lib/supabase.js';
import { unwrap, ApiError, callFn, signedUrl } from './client.js';
import { fileUploadError } from '../utils/validation.js';

/** Candidate: their onboarding checklist for the given application (empty until HR requests one). */
export function listOnboardingDocuments(applicationId) {
  return candidateSupabase
    .from('onboarding_documents')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at')
    .then(unwrap);
}

/** Candidate uploads a file for one onboarding document slot, then records it. */
export async function uploadOnboardingDocument(applicationId, doc, file) {
  const fileErr = fileUploadError(file, { allowedExt: ['pdf', 'jpg', 'jpeg', 'png'], maxMB: 10 });
  if (fileErr) throw new ApiError(fileErr, 'BAD_FILE');

  const path = `${applicationId}/${doc.requirement_key}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await candidateSupabase.storage.from('onboarding-documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');

  return callFn('submit-onboarding-document', {
    body: {
      onboardingDocumentId: doc.id,
      path: `onboarding-documents/${path}`,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  }, candidateSupabase);
}

/** Candidate submits a filled-in onboarding form (bank details, emergency
    contact, etc.). Only the answers are sent. HR reviews them, and the
    printable PDF is created when HR approves the form. */
export function submitOnboardingForm(applicationId, doc, candidateName, formValues) {
  const jsonSafeData = {};
  for (const f of doc.field_schema || []) {
    if (f.type !== 'file') jsonSafeData[f.key] = formValues[f.key] ?? '';
  }

  return callFn('submit-onboarding-document', {
    body: {
      onboardingDocumentId: doc.id,
      formData: jsonSafeData,
    },
  }, candidateSupabase);
}
