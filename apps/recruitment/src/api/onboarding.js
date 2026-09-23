import { candidateSupabase } from '../lib/supabase.js';
import { unwrap, ApiError, callFn, signedUrl } from './client.js';
import { fileUploadError } from '../utils/validation.js';
import { generateOnboardingFormPdf } from '../utils/onboardingPdf.js';

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
    contact, etc. — anything with a field_schema, not a plain file upload).
    Generates a PDF from the answers (the record HR can print for a physical
    signature) and uploads it the same way a regular file upload would,
    alongside the raw form_data so HR can also see the structured answers
    directly rather than only the PDF. */
export async function submitOnboardingForm(applicationId, doc, candidateName, formValues) {
  const pdfBlob = await generateOnboardingFormPdf({
    documentName: doc.requirement_name,
    candidateName,
    schema: doc.field_schema || [],
    values: formValues,
  });

  const fileName = `${doc.requirement_key}.pdf`;
  const path = `${applicationId}/${doc.requirement_key}/${Date.now()}-${fileName}`;
  const { error } = await candidateSupabase.storage.from('onboarding-documents').upload(path, pdfBlob, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');

  // form_data must be JSON-safe — the one 'file' field type (an optional
  // supporting image) already went into the PDF above, not into this JSON.
  const jsonSafeData = {};
  for (const f of doc.field_schema || []) {
    if (f.type !== 'file') jsonSafeData[f.key] = formValues[f.key] ?? '';
  }

  return callFn('submit-onboarding-document', {
    body: {
      onboardingDocumentId: doc.id,
      path: `onboarding-documents/${path}`,
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: pdfBlob.size,
      formData: jsonSafeData,
    },
  }, candidateSupabase);
}

/** Candidate views their own already-uploaded onboarding file. */
export function onboardingDocumentUrl(storagePath) {
  return signedUrl('onboarding-documents', storagePath.replace(/^onboarding-documents\//, ''), 300, candidateSupabase);
}
