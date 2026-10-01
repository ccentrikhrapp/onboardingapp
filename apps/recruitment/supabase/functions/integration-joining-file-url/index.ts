// POST /functions/v1/integration-joining-file-url
// Inbound from the HR app — a short-lived signed URL for a file an employee
// uploaded for a joining-document requirement. The file lives in THIS
// project's storage (the employee's session is here), so HR asks us to sign it.
// Service-to-service only; read-only. Only paths of the form
// "{applicationId}/joining/..." are ever signed.
//
// Body: { path }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const path = String(body.path ?? "");
  if (!/^[0-9a-f-]{36}\/joining\/[^/].*$/i.test(path) || path.includes("..")) return fail("VALIDATION_ERROR", "Invalid file path.", 422);

  const { data, error } = await serviceClient().storage.from("onboarding-documents").createSignedUrl(path, 300);
  if (error || !data) return fail("STORAGE_ERROR", "Could not open this file.", 404);
  return ok({ url: data.signedUrl });
});
