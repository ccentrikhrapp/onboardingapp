// POST /functions/v1/verify-application-document
// Auth: the assigned TA (or admin-tier). Two-step verification: this is
// step 1, the TA's first pass — 'approve' here does NOT finalize the
// document, it moves it to 'under_verification' AND is the moment the
// document actually gets forwarded to HR (integration-document-submitted)
// for step 2 (final sign-off) — HR never sees a document before the TA has
// passed it. Only HR's decision (via integration-verification-status, the
// return leg from the HR app) ever sets the terminal 'verified' status.
// This function can only act while a document is still 'uploaded' — once
// the TA has passed it, it's HR's turn and this endpoint refuses to touch
// it again.
//
// Body: { applicationDocumentId, action: 'approve'|'reject'|'reupload_required', remarks? }
//   remarks required for 'reject' and 'reupload_required' — the candidate
//   sees it verbatim, so it needs to say what to fix. 'reupload_required'
//   is the one that actually reopens the Upload button for the candidate
//   (application_documents.status already allows re-upload from that state).

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify } from "../_shared/workflow.ts";
import { callHr } from "../_shared/hrIntegration.ts";

const STATUS_BY_ACTION: Record<string, string> = {
  approve: "under_verification",
  reject: "rejected",
  reupload_required: "revision_required",
};
const EVENT_TITLE: Record<string, string> = {
  approve: "Document Approved by TA",
  reject: "Document Rejected",
  reupload_required: "Document Correction Requested",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can verify documents.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const action = body.action;
  const remarks = String(body.remarks ?? "").trim();
  const fields: Record<string, string> = {};
  if (!body.applicationDocumentId) fields.applicationDocumentId = "Missing document.";
  if (!STATUS_BY_ACTION[action]) fields.action = "Unknown action.";
  if (action !== "approve" && !remarks) fields.remarks = "Please explain what needs to change.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the review.", 422, fields);

  const svc = serviceClient();
  const { data: doc } = await svc
    .from("application_documents")
    .select(
      "id, status, application_id, " +
        "document_requirements(key, name), " +
        "applications(id, assigned_ta_id, personal, application_code, jobs(title), candidates(profile_id, first_name, last_name, email))"
    )
    .eq("id", body.applicationDocumentId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document not found.", 404);

  const app = doc.applications as any;
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (doc.status !== "uploaded") {
    return fail(
      "INVALID_STATE",
      doc.status === "under_verification"
        ? "Already passed by TA — this is now with HR for final sign-off."
        : "This document isn't awaiting review.",
      409,
    );
  }

  const status = STATUS_BY_ACTION[action];
  const { error: upErr } = await svc
    .from("application_documents")
    .update({
      status,
      hr_remarks: action === "approve" ? null : remarks,
      // verified_by/verified_at are reserved for HR's final sign-off
      // (set by integration-verification-status) so they always reflect
      // who actually cleared the document, not the TA's first pass.
    })
    .eq("id", doc.id);
  if (upErr) return fail("DB_ERROR", "Could not save the decision.", 500);

  const requirement = doc.document_requirements as any;
  const docName = requirement?.name ?? "Document";

  if (action === "approve") {
    const { count } = await svc
      .from("document_files")
      .select("id", { count: "exact", head: true })
      .eq("application_document_id", doc.id);
    const version = count ?? 1;
    const candidateName = `${app.candidates?.first_name ?? ""} ${app.candidates?.last_name ?? ""}`.trim();
    await callHr(
      svc,
      "integration-document-submitted",
      "DOCUMENT_SUBMITTED",
      `doc-${doc.id}-v${version}-approved`,
      {
        sourceApplicationId: app.id,
        sourceDocumentId: doc.id,
        version,
        candidate: { name: candidateName, email: app.candidates?.email ?? null },
        job: { title: (app.jobs as any)?.title ?? null },
        applicationCode: app.application_code,
        requirement: { key: requirement?.key, name: requirement?.name },
      },
      { entity_type: "application_document", entity_id: doc.id },
    );
  }
  await addEvent(svc, {
    application_id: app.id,
    type: "documents",
    title: EVENT_TITLE[action],
    description: remarks ? `${docName}: ${remarks}` : `${docName} verified.`,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: `application_document.${action}`,
    entity_type: "application_document",
    entity_id: doc.id,
    new_state: { status },
    remarks: remarks || null,
  });

  // Only the candidate-facing "needs attention" case is notified here — a
  // plain TA pass-through to HR isn't news the candidate needs pinged
  // about (they already see "Under verification" on their checklist).
  if (action !== "approve") {
    await notify(svc, {
      recipient_profile_id: app.candidates?.profile_id ?? null,
      title: "Document needs your attention",
      message: `${docName}: ${remarks}`,
      type: "document_verification",
      entity_type: "application",
      entity_id: app.id,
    });
  }

  return ok({ status });
});
