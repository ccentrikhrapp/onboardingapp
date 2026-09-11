import { supabase } from '../lib/supabase.js';
import { unwrap, callFn, ApiError } from './client.js';

/** TA: offer eligibility for an application — never trust a disabled button alone. */
export function getOfferStatus(applicationId) {
  return callFn('get-offer-status', { method: 'GET', query: { applicationId } });
}

export function getOffer(applicationId) {
  return supabase.from('offers').select('*').eq('application_id', applicationId).maybeSingle().then(unwrap);
}

/** TA uploads the actual offer letter file before composing the email. */
export async function uploadOfferLetter(applicationId, file) {
  const path = `${applicationId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
  const { error } = await supabase.storage.from('offer-letters').upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) throw new ApiError(error.message, 'UPLOAD_FAILED');
  return `offer-letters/${path}`;
}

export function sendOffer(payload) {
  return callFn('send-offer', { body: payload });
}

export function acceptOffer(offerId) {
  return callFn('accept-offer', { body: { offerId } });
}
