import { supabase } from '../lib/supabase.js';
import { unwrap, ApiError } from './client.js';

/** Active document requirements for a given stage (e.g. 'application', 'pre_offer'). */
export function listRequirements(stage) {
  return supabase
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
  const allowed = requirement.allowed_file_types || [];
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (allowed.length && !allowed.includes(ext)) {
    throw new ApiError(`Please upload a ${allowed.join(', ').toUpperCase()} file.`, 'BAD_FILE_TYPE');
  }
  const maxBytes = (requirement.max_file_size_mb || 10) * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new ApiError(`File must be under ${requirement.max_file_size_mb || 10} MB.`, 'FILE_TOO_LARGE');
  }

  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new ApiError('Please sign in first.', 'UNAUTHENTICATED');

  const path = `pending/${me.user.id}/${requirement.key}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await supabase.storage.from('documents').upload(path, file, {
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
