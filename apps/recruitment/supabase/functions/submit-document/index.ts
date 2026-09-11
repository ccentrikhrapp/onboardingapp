// POST /functions/v1/submit-document
// Auth: the candidate who owns the application. Records an upload or a
// Can't-Provide + reason against an already-requested application_documents
// row (created by application-decision's request_documents action), then —
// for real uploads on the pre-offer stage — forwards it to the HR app
// (integration point 1, docs/requirements/03-*.md §5).
//
// Body: {
//   applicationDocumentId,
//   path?, fileName?, mimeType?, sizeBytes?,   // real upload
//   cannotProvide?, reason?                     // Can't Provide
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify } from "../_shared/workflow.ts";
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
  if (!body.applicationDocumentId) return fail("VALIDATION_ERROR", "Missing document.", 422);

  const svc = serviceClient();

  const { data: doc } = await svc
    .from("application_documents")
    .select(
      "id, application_id, status, requirement_id, document_requirements(key, name, stage, can_mark_cannot_provide, reason_required), " +
        "applications(id, candidate_id, application_code, personal, jobs(title), candidates(profile_id, first_name, last_name, email))",
    )
    .eq("id", body.applicationDocumentId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document requirement not found.", 404);

  const app = doc.applications as any;
  if (app?.candidates?.profile_id !== profile.id) return fail("FORBIDDEN", "This is not your application.", 403);

  const requirement = doc.document_requirements as any;
  const cannotProvide = !!body.cannotProvide;

  if (cannotProvide) {
    if (!requirement.can_mark_cannot_provide) {
      return fail("VALIDATION_ERROR", "This document cannot be skipped — please upload it.", 422, { reason: "Required" });
    }
    const reason = String(body.reason ?? "").trim();
    if (requirement.reason_required && !reason) {
      return fail("VALIDATION_ERROR", "Please explain why you can't provide this document.", 422, { reason: "Reason is required." });
    }
    await svc.from("application_documents").update({
      status: "cannot_provide", cannot_provide_reason: reason,
    }).eq("id", doc.id);
  } else {
    if (!body.path) return fail("VALIDATION_ERROR", "Missing uploaded file.", 422);

    const { count } = await svc
      .from("document_files")
      .select("id", { count: "exact", head: true })
      .eq("application_document_id", doc.id);
    const version = (count ?? 0) + 1;
    if (version > 1) {
      await svc.from("document_files").update({ is_current: false }).eq("application_document_id", doc.id);
    }
    await svc.from("document_files").insert({
      application_document_id: doc.id,
      storage_path: body.path,
      file_name: body.fileName ?? null,
      mime_type: body.mimeType ?? null,
      size_bytes: body.sizeBytes ?? null,
      version,
      is_current: true,
      uploaded_by: profile.id,
    });
    await svc.from("application_documents").update({
      status: "uploaded", cannot_provide_reason: null,
    }).eq("id", doc.id);

    if (requirement.stage === "pre_offer") {
      const candidateName = `${app.candidates?.first_name ?? ""} ${app.candidates?.last_name ?? ""}`.trim();
      await callHr(
        svc,
        "integration-document-submitted",
        "DOCUMENT_SUBMITTED",
        `doc-${doc.id}-v${version}`,
        {
          sourceApplicationId: app.id,
          sourceDocumentId: doc.id,
          version,
          candidate: { name: candidateName, email: app.candidates?.email ?? null },
          job: { title: (app.jobs as any)?.title ?? null },
          applicationCode: app.application_code,
          requirement: { key: requirement.key, name: requirement.name },
        },
        { entity_type: "application_document", entity_id: doc.id },
      );
    }
  }

  await addEvent(svc, {
    application_id: app.id,
    type: "documents",
    title: cannotProvide ? "Document Not Provided" : "Document Uploaded",
    description: `${requirement.name}${cannotProvide ? ` — reason: ${body.reason}` : " submitted for verification."}`,
    actor_profile_id: profile.id,
    actor_label: "Candidate",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: cannotProvide ? "document.cannot_provide" : "document.upload",
    entity_type: "application_document",
    entity_id: doc.id,
    new_state: cannotProvide ? { status: "cannot_provide" } : { status: "uploaded" },
  });

  return ok({ status: cannotProvide ? "cannot_provide" : "uploaded" });
});
