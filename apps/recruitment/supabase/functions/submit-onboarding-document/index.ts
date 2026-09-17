// POST /functions/v1/submit-onboarding-document
// Auth: the candidate who owns the application. Records the upload against
// an already-requested onboarding_documents row (created by HR via
// integration-onboarding-requested), then forwards it to the HR app so HR
// can review it from their own onboarding case.
//
// Some onboarding items are genuinely data-entry forms (bank details,
// nominations, declarations — see this row's field_schema) rather than a
// file to choose, so exactly one of `path` or `formData` is required, not
// both — `path` for a real upload, `formData` for a filled-in form. The
// candidate-side PDF generated from a filled form is itself just another
// file upload (its own `path`), so `path` and `formData` can also both be
// present together for a form-type item.
//
// Body: { onboardingDocumentId, path?, fileName?, mimeType?, sizeBytes?, formData? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent } from "../_shared/workflow.ts";
import { callHr } from "../_shared/hrIntegration.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("UNAUTHENTICATED", "Please sign in.", 401);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.onboardingDocumentId || (!body.path && !body.formData)) {
    return fail("VALIDATION_ERROR", "Missing document, file, or form data.", 422);
  }

  const svc = serviceClient();
  const { data: doc } = await svc
    .from("onboarding_documents")
    .select(
      "id, status, application_id, hr_document_id, requirement_name, " +
        "applications(id, candidates(profile_id, first_name, last_name, email))",
    )
    .eq("id", body.onboardingDocumentId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document not found.", 404);

  const app = doc.applications as any;
  if (app?.candidates?.profile_id !== profile.id) return fail("FORBIDDEN", "This is not your application.", 403);
  if (!["requested", "revision_required"].includes(doc.status)) {
    return fail("INVALID_STATE", "This document isn't awaiting an upload.", 409);
  }

  const patch: Record<string, unknown> = { status: "uploaded", hr_remarks: null };
  if (body.path) {
    patch.storage_path = body.path;
    patch.file_name = body.fileName ?? null;
    patch.mime_type = body.mimeType ?? null;
    patch.size_bytes = body.sizeBytes ?? null;
  }
  if (body.formData) patch.form_data = body.formData;

  const { error: upErr } = await svc.from("onboarding_documents").update(patch).eq("id", doc.id);
  if (upErr) return fail("DB_ERROR", "Could not save the upload.", 500);

  const candidate = app.candidates as any;
  const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();

  await addEvent(svc, {
    application_id: app.id,
    type: "documents",
    title: "Onboarding Document Uploaded",
    description: `${doc.requirement_name} submitted for HR review.`,
    actor_profile_id: profile.id,
    actor_label: candidateName || "Candidate",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: "onboarding_document.upload",
    entity_type: "onboarding_document",
    entity_id: doc.id,
    new_state: { status: "uploaded" },
  });

  await callHr(
    svc,
    "integration-onboarding-document-submitted",
    "ONBOARDING_DOCUMENT_SUBMITTED",
    `onboarding-doc-${doc.id}-${Date.now()}`,
    {
      hrDocumentId: doc.hr_document_id,
      candidate: { name: candidateName, email: candidate?.email ?? null },
      formData: body.formData ?? null,
    },
    { entity_type: "onboarding_document", entity_id: doc.id },
  );

  return ok({ status: "uploaded" });
});
