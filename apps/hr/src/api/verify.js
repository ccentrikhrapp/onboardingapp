import { callFn } from './client.js';

/** action = 'approve' | 'reject' | 'reupload_required'. remarks required for the latter two. */
export function verifyDocument(documentVerificationId, action, remarks) {
  return callFn('verify-document', { body: { documentVerificationId, action, remarks } });
}
