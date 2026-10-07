// POST /functions/v1/integration-onboarding-requested
// Inbound from the HR app — HR has decided which onboarding documents this
// newly-accepted candidate needs to submit and wants this app to collect
// them (the candidate authenticates here, not in the HR project). Service-
// to-service only, idempotent on `eventId`.
//
// Body: {
//   eventId, applicationId, hrCaseId,
//   requirements: [{ hrDocumentId, key, name, required }]
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { callHr } from "../_shared/hrIntegration.ts";

// Onboarding document requirement key -> the pre-offer document_requirements
// key it is a straight duplicate of. A candidate who already submitted (and
// had HR-verified) the pre-offer document must not be asked to upload the
// same thing again during onboarding — see docs/requirements §8. Keep this
// list to genuine one-for-one duplicates only: e.g. "bank_details" also asks
// for new account-number/IFSC form fields no pre-offer stage ever collected,
// so it is NOT a duplicate and is deliberately left out.
const REUSE_FROM_PRE_OFFER: Record<string, string> = {
  id_photo: "passport_photos",
};
const RESOLVED_PRE_OFFER = ["verified", "reason_approved", "na_accepted"];

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
  if (!body.eventId || !body.applicationId || !Array.isArray(body.requirements) || body.requirements.length === 0) {
    return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);
  }

  const svc = serviceClient();

  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "ONBOARDING_DOCUMENTS_REQUESTED",
      source_system: "hr",
      payload: body,
      status: "processing",
      entity_type: "application",
      entity_id: body.applicationId,
    })
    .select("id")
    .maybeSingle();
  if (eventErr) return ok({ received: true, alreadyProcessed: true });

  try {
    const { data: app } = await svc
      .from("applications")
      .select("id, jobs(title), candidates(profile_id, email, first_name, last_name)")
      .eq("id", body.applicationId)
      .maybeSingle();
    if (!app) throw new Error("application not found");

    // For any requirement that duplicates a pre-offer document, look up
    // whether this application already has a resolved (HR-verified) copy —
    // if so, carry the existing file forward instead of asking again.
    const reusable = new Map<string, { storage_path: string; file_name: string | null; mime_type: string | null; size_bytes: number | null }>();
    for (const r of body.requirements as any[]) {
      const preOfferKey = REUSE_FROM_PRE_OFFER[r.key];
      if (!preOfferKey) continue;
      const { data: doc } = await svc
        .from("application_documents")
        .select("id, status, document_requirements!inner(key)")
        .eq("application_id", app.id)
        .eq("document_requirements.key", preOfferKey)
        .maybeSingle();
      if (!doc || !RESOLVED_PRE_OFFER.includes((doc as any).status)) continue;
      const { data: file } = await svc
        .from("document_files")
        .select("storage_path, file_name, mime_type, size_bytes")
        .eq("application_document_id", doc.id)
        .eq("is_current", true)
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (file?.storage_path) reusable.set(r.hrDocumentId, file as any);
    }

    const rows = (body.requirements as any[]).map((r) => {
      const reuse = reusable.get(r.hrDocumentId);
      return {
        application_id: app.id,
        hr_case_id: body.hrCaseId,
        hr_document_id: r.hrDocumentId,
        requirement_key: r.key,
        requirement_name: r.name,
        required: r.required !== false,
        field_schema: r.fieldSchema ?? null,
        status: (reuse ? "uploaded" : "requested") as const,
        ...(reuse ? {
          storage_path: reuse.storage_path,
          file_name: reuse.file_name,
          mime_type: reuse.mime_type,
          size_bytes: reuse.size_bytes,
          hr_remarks: "Reused from your original application — already on file and verified, no new upload needed.",
        } : {}),
      };
    });
    const { error: upsertErr } = await svc
      .from("onboarding_documents")
      .upsert(rows, { onConflict: "hr_document_id" });
    if (upsertErr) throw new Error(upsertErr.message);

    const candidate = app.candidates as any;
    const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();

    // Mirror each reused document to HR immediately, exactly like a real
    // candidate upload (submit-onboarding-document) — so HR's own copy shows
    // it as already submitted, with a note that it's a carried-over file.
    for (const hrDocumentId of reusable.keys()) {
      await callHr(
        svc,
        "integration-onboarding-document-submitted",
        "ONBOARDING_DOCUMENT_SUBMITTED",
        `onboarding-doc-reuse-${hrDocumentId}`,
        {
          hrDocumentId,
          candidate: { name: candidateName, email: candidate?.email ?? null },
          formData: null,
          reused: true,
          reuseNote: "Reused from the candidate's original application — already on file and HR-verified during recruitment.",
        },
        { entity_type: "onboarding_document", entity_id: hrDocumentId },
      );
    }

    const reuseNote = reusable.size > 0
      ? ` ${reusable.size} of them were already on file from your application and didn't need a new upload.`
      : "";

    await addEvent(svc, {
      application_id: app.id,
      type: "documents",
      title: "Onboarding Documents Requested",
      description: `HR requested onboarding documents to complete your joining formalities.${reuseNote}`,
      actor_label: body.requestedBy ?? "HR",
    });

    await notify(svc, {
      recipient_profile_id: candidate?.profile_id ?? null,
      title: "Onboarding documents needed",
      message: `HR needs a few documents to complete your onboarding.${reuseNote}`,
      type: "onboarding_documents_requested",
      entity_type: "application",
      entity_id: app.id,
    });

    if (candidate?.email) {
      const mail = render("onboarding_documents_requested", {
        candidate_name: candidateName,
        job_title: (app.jobs as any)?.title ?? "your new role",
        onboarding_link: siteUrl("/candidate/application"),
        reuse_note: reusable.size > 0 ? `${reusable.size} item${reusable.size > 1 ? "s" : ""} on your checklist ${reusable.size > 1 ? "are" : "is"} already on file from your application — no new upload needed there.` : null,
      });
      await queueEmail(svc, {
        recipient: candidate.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "onboarding_documents_requested", entity_type: "application", entity_id: app.id,
        sender_email: body.requestedByEmail ?? null,
      });
    }

    await svc.from("integration_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", eventRow!.id);
    return ok({ received: true, processed: true });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow!.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
