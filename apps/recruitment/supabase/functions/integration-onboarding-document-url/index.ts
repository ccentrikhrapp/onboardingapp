// POST /functions/v1/integration-onboarding-document-url
// Inbound from the HR app — mints a short-lived signed URL for an onboarding
// document's uploaded file. The file physically lives in this project's
// storage (the candidate's session is here, not in the HR project), so HR
// can't sign its own URL for it — it asks us instead. Service-to-service
// only, no state mutation, no idempotency needed (pure read).
//
// Body: { hrDocumentId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.hrDocumentId) return fail("VALIDATION_ERROR", "Missing document.", 422);

  const svc = serviceClient();
  const { data: doc } = await svc
    .from("onboarding_documents")
    .select("storage_path, file_name")
    .eq("hr_document_id", body.hrDocumentId)
    .maybeSingle();
  if (!doc?.storage_path) return fail("NOT_FOUND", "No file uploaded for this document.", 404);

  const objectPath = doc.storage_path.replace(/^onboarding-documents\//, "");
  const { data, error } = await svc.storage.from("onboarding-documents").createSignedUrl(objectPath, 300);
  if (error || !data) return fail("STORAGE_ERROR", "Could not create a signed URL.", 500);

  return ok({ url: data.signedUrl, fileName: doc.file_name });
});
