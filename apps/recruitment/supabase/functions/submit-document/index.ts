// POST /functions/v1/submit-document
// Auth: the candidate who owns the application. Records an upload or a
// Can't-Provide + reason against an already-requested application_documents
// row (created by application-decision's request_documents action).
//
// Pre-offer uploads are NOT forwarded to HR here — the TA's own approval
// (verify-application-document) is what forwards it, once the TA has passed
// it. HR is only ever meant to see a document after that first-pass review;
// calling out to HR at upload time (as this used to do) put every document
// in HR's queue immediately, before the TA had even looked at it, which
// defeated the two-step review this app's own UI already promises the TA.
//
// Body: {
//   applicationDocumentId,
//   path?, fileName?, mimeType?, sizeBytes?,   // real upload
//   slot?,                                      // "front"/"back"/"1"/"2"... for a multi-file document
//   cannotProvide?, reason?                     // Can't Provide (optional documents only)
// }
//
// A multi-file document (Aadhaar front + back, two photos, ...) is ONE
// application_documents row holding several current files, one per slot. It
// only becomes 'uploaded' (ready for the TA to review) once every slot has a
// file; until then it stays 'requested' (or 'revision_required', so the
// reviewer's remark stays visible) and the candidate sees "1 of 2 uploaded".

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify } from "../_shared/workflow.ts";
import { canSkip, isComplete, requiredSlots, slotLabel } from "../_shared/documentRules.ts";
import { pushSummary } from "../_shared/preOffer.ts";

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
      "id, application_id, status, requirement_id, document_requirements(key, name, stage, can_mark_cannot_provide, reason_required, requirement_class, requires_front_back, quantity_required, slot_labels, na_allowed, multiple_files), " +
        "applications(id, candidate_id, application_code, personal, jobs(title), candidates(profile_id, first_name, last_name, email))",
    )
    .eq("id", body.applicationDocumentId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document requirement not found.", 404);

  const app = doc.applications as any;
  if (app?.candidates?.profile_id !== profile.id) return fail("FORBIDDEN", "This is not your application.", 403);

  const requirement = doc.document_requirements as any;
  const notApplicable = !!body.notApplicable;
  const cannotProvide = !!body.cannotProvide || notApplicable;
  // A document already passed on for review / verified can't be changed from here.
  if (["uploaded", "under_verification", "verified", "reason_approved", "na_accepted", "not_applicable"].includes(doc.status)) {
    return fail("INVALID_STATE", "This document is already submitted for verification.", 409);
  }

  let newStatus: string;
  let slotText = "";
  if (cannotProvide) {
    if (notApplicable ? !requirement.na_allowed : !canSkip(requirement)) {
      return fail("VALIDATION_ERROR", notApplicable ? "This document can't be marked not applicable — please upload it or explain why you can't provide it." : "This document can't be skipped — please upload it.", 422, { reason: "Not allowed" });
    }
    const reason = String(body.reason ?? "").trim();
    // Never accept a blank / one-word reason: the reviewer has to be able to judge it.
    if (reason.length < 5) {
      return fail("VALIDATION_ERROR", "Please explain in a few words.", 422, { reason: "A reason is required." });
    }
    await svc.from("application_documents").update({
      status: "cannot_provide", cannot_provide_reason: reason, na_reason: notApplicable ? reason : null,
    }).eq("id", doc.id);
    newStatus = "cannot_provide";
  } else {
    if (!body.path) return fail("VALIDATION_ERROR", "Missing uploaded file.", 422);

    const slots = requiredSlots(requirement);
    const slot: string | null = body.slot ? String(body.slot) : null;
    if (slots.length && (!slot || !slots.includes(slot))) {
      return fail("VALIDATION_ERROR", `Choose which part of the ${requirement.name} this file is.`, 422, { slot: "Required" });
    }
    if (!slots.length && slot) return fail("VALIDATION_ERROR", "This document takes a single file.", 422);

    const { count } = await svc
      .from("document_files")
      .select("id", { count: "exact", head: true })
      .eq("application_document_id", doc.id);
    const version = (count ?? 0) + 1;

    // Retire only the file this upload replaces — the other side / slot stays.
    // (A pre-slot upload, slot = null, counts as the first slot, so it's
    // retired when the first slot is re-uploaded.)
    let retire = svc.from("document_files").update({ is_current: false }).eq("application_document_id", doc.id).eq("is_current", true);
    if (!slots.length) {
      // A multi-file requirement (e.g. all semester mark sheets) keeps every file as ONE requirement;
      // `replace: true` starts the set over (used for the first file of a fresh batch).
      if (!requirement.multiple_files || body.replace) await retire;
    } else {
      await retire.eq("slot", slot);
      if (slot === slots[0]) {
        await svc.from("document_files").update({ is_current: false })
          .eq("application_document_id", doc.id).eq("is_current", true).is("slot", null);
      }
    }
    if (requirement.multiple_files && !slots.length) {
      const { count: have } = await svc.from("document_files").select("id", { count: "exact", head: true }).eq("application_document_id", doc.id).eq("is_current", true);
      if ((have ?? 0) >= 20 && !body.replace) return fail("VALIDATION_ERROR", "You can attach up to 20 files to one requirement.", 422, { path: "Too many files" });
    }
    const { error: insErr } = await svc.from("document_files").insert({
      application_document_id: doc.id,
      storage_path: body.path,
      file_name: body.fileName ?? null,
      mime_type: body.mimeType ?? null,
      size_bytes: body.sizeBytes ?? null,
      version,
      is_current: true,
      uploaded_by: profile.id,
      slot,
    });
    if (insErr) return fail("DB_ERROR", "Could not save the upload. Please try again.", 500);

    const { data: current } = await svc
      .from("document_files")
      .select("slot")
      .eq("application_document_id", doc.id)
      .eq("is_current", true);
    const complete = isComplete(requirement, current ?? []);
    newStatus = complete ? "uploaded" : doc.status === "revision_required" ? "revision_required" : "requested";
    await svc.from("application_documents").update({
      status: newStatus, cannot_provide_reason: null, na_reason: null,
    }).eq("id", doc.id);
    slotText = slot ? ` (${slotLabel(requirement, slot)})` : "";
  }

  const candidateName = `${app.candidates?.first_name ?? ""} ${app.candidates?.last_name ?? ""}`.trim() || "Candidate";
  await addEvent(svc, {
    application_id: app.id,
    type: "documents",
    title: cannotProvide ? (notApplicable ? "Document Marked Not Applicable" : "Document Not Provided") : "Document Uploaded",
    description: cannotProvide
      ? `${requirement.name} — reason: ${body.reason}`
      : `${requirement.name}${slotText} ${newStatus === "uploaded" ? "submitted for verification." : "uploaded — waiting for the remaining file(s)."}`,
    actor_profile_id: profile.id,
    actor_label: candidateName,
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: cannotProvide ? "document.cannot_provide" : "document.upload",
    entity_type: "application_document",
    entity_id: doc.id,
    new_state: { status: newStatus, slot: body.slot ?? null },
  });

  try { await pushSummary(svc, app.id); } catch { /* HR also gets the summary with each forwarded document */ }
  return ok({ status: newStatus });
});
