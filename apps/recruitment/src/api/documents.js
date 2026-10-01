import { supabase, candidateSupabase } from '../lib/supabase.js';
import { unwrap, ApiError, callFn, signedUrl } from './client.js';
import { fileUploadError } from '../utils/validation.js';

/** Active document requirements for a given stage (e.g. 'application', 'pre_offer').
    Candidate-only (the Apply form's checklist) — always the candidate's own session. */
export function listRequirements(stage) {
  return candidateSupabase
    .from('document_requirements')
    .select('*')
    .eq('stage', stage)
    .eq('active', true)
    .order('display_order')
    .then(unwrap);
}

/**
 * Upload a document before the application exists yet — stored under the
 * candidate's own "pending" folder. submit-application adopts it into the
 * real documents/{applicationId}/... path once the application is created.
 */
export async function uploadPendingDocument(file, requirement) {
  const fileErr = fileUploadError(file, {
    allowedExt: requirement.allowed_file_types || [],
    maxMB: requirement.max_file_size_mb || 10,
  });
  if (fileErr) throw new ApiError(fileErr, 'BAD_FILE');

  const { data: me } = await candidateSupabase.auth.getUser();
  if (!me.user) throw new ApiError('Please sign in first.', 'UNAUTHENTICATED');

  const path = `pending/${me.user.id}/${requirement.key}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await candidateSupabase.storage.from('documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');

  return {
    path: `documents/${path}`,
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

/** The candidate's checklist for an already-created application (pre-offer stage).
    Also embeds document_files so a TA/HR viewer can open what was uploaded.
    `client` defaults to the TA session; the candidate's own page passes
    `candidateSupabase`. */
export function listApplicationDocuments(applicationId, client = supabase) {
  return client
    .from('application_documents')
    .select('*, document_requirements(*), document_files(storage_path, file_name, is_current, uploaded_at, slot)')
    .eq('application_id', applicationId)
    .then(unwrap);
}

/** Short-lived signed URL to open a document's current uploaded file. */
export function documentFileUrl(storagePath) {
  return signedUrl('documents', storagePath.replace(/^documents\//, ''));
}

/** TA: verify an uploaded document. action = 'approve' | 'reject' | 'reupload_required'.
    remarks required for reject/reupload_required — the candidate sees it verbatim. */
export function verifyApplicationDocument(applicationDocumentId, action, remarks) {
  return callFn('verify-application-document', { body: { applicationDocumentId, action, remarks } });
}

/** Real upload against an application that already exists (post-submission). */
export async function uploadDocumentFile(applicationId, requirement, file) {
  const fileErr = fileUploadError(file, {
    allowedExt: requirement.allowed_file_types || [],
    maxMB: requirement.max_file_size_mb || 10,
  });
  if (fileErr) throw new ApiError(fileErr, 'BAD_FILE');
  const path = `${applicationId}/${requirement.key}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await candidateSupabase.storage.from('documents').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');
  return { path: `documents/${path}`, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
}

/** Record an upload or a Can't-Provide+reason against a requested document row. */
export function submitDocument(payload) {
  return callFn('submit-document', { body: payload }, candidateSupabase);
}

/** Candidate: the few answers that decide which documents apply (previous employers, other offer, same address, name change). */
export function setDocumentAnswers(answers) {
  return callFn('set-document-answers', { body: answers }, candidateSupabase);
}

/** TA: reviewer action on one requirement. action = approve | reject | reupload_required | mark_na. */
export const reviewDocument = verifyApplicationDocument;
