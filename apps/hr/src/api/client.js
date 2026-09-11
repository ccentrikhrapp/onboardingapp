import { supabase } from '../lib/supabase.js';

/** Error carrying the backend's { code, message, fields } so forms can show it. */
export class ApiError extends Error {
  constructor(message, code = 'ERROR', fields = {}) {
    super(message || 'Something went wrong.');
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }
}

/** Throw on a PostgREST error, otherwise return the data. */
export function unwrap({ data, error }) {
  if (error) throw new ApiError(error.message, error.code || 'DB_ERROR');
  return data;
}

/**
 * Call an edge function and unwrap the { success, data } / { success, error }
 * envelope into either the payload or a thrown ApiError.
 */
export async function callFn(name, { body, method = 'POST', query } = {}) {
  let path = name;
  if (query) path += `?${new URLSearchParams(query)}`;

  const { data, error } = await supabase.functions.invoke(path, {
    method,
    ...(body ? { body } : {}),
  });

  // Non-2xx: supabase-js puts the parsed body on error.context
  if (error) {
    let payload = null;
    try {
      payload = await error.context?.json?.();
    } catch {
      /* ignore */
    }
    const err = payload?.error;
    throw new ApiError(err?.message || error.message, err?.code || 'FUNCTION_ERROR', err?.fields || {});
  }

  if (data && data.success === false) {
    throw new ApiError(data.error?.message, data.error?.code, data.error?.fields || {});
  }
  return data?.data ?? data;
}

/** Short-lived signed URL for a private file. */
export async function signedUrl(bucket, path, expiresIn = 300) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new ApiError(error.message, 'STORAGE_ERROR');
  return data.signedUrl;
}
