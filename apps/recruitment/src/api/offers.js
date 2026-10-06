import { supabase } from '../lib/supabase.js';
import { unwrap, callFn, ApiError } from './client.js';

/** TA: offer eligibility for an application — never trust a disabled button alone. */
export function getOfferStatus(applicationId) {
  return callFn('get-offer-status', { method: 'GET', query: { applicationId } });
}

export function getOffer(applicationId, client = supabase) {
  return client.from('offers').select('*').eq('application_id', applicationId).maybeSingle().then(unwrap);
}

export function sendOffer(payload) {
  return callFn('send-offer', { body: payload });
}

export function acceptOffer(offerId) {
  return callFn('accept-offer', { body: { offerId } });
}
