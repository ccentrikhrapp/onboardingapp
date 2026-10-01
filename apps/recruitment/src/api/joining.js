import { candidateSupabase } from '../lib/supabase.js';
import { ApiError, callFn } from './client.js';
import { fileUploadError } from '../utils/validation.js';

/* Employee Joining Form. The data lives in the HR project; these calls go
   through the joining-profile edge function, which proves who the caller is,
   finds their onboarding application and relays to HR. */
const call = (body) => callFn('joining-profile', { body }, candidateSupabase);

export const getJoiningProfile = () => call({ action: 'get' });
export const saveJoiningSection = (section, values) => call({ action: 'save_section', section, values });
export const submitJoining = (signatureName) => call({ action: 'submit', signatureName });

/** Uploads one file into this application's own folder, ready to attach to a document requirement. */
export async function uploadJoiningFile(applicationId, itemKey, file) {
  const err = fileUploadError(file, { allowedExt: ['pdf', 'jpg', 'jpeg', 'png'], maxMB: 10 });
  if (err) throw new ApiError(err, 'BAD_FILE');
  const safe = itemKey.replace(/[^\w-]+/g, '_');
  const path = `${applicationId}/joining/${safe}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await candidateSupabase.storage.from('onboarding-documents').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new ApiError('Upload failed. Please try again.', 'UPLOAD_FAILED');
  return { path, name: file.name, mime: file.type, size: file.size };
}

/** One document requirement: upload files, or say why you can't (reason) / that it doesn't apply. */
export const submitJoiningDocument = ({ itemKey, choice, files, reasonCategory, reasonText }) =>
  call({ action: 'doc_submit', itemKey, choice, files, reasonCategory, reasonText });
