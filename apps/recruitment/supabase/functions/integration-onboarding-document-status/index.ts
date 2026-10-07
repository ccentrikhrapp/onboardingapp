// POST /functions/v1/integration-onboarding-document-status
// Inbound from the HR app — HR's verification decision on one onboarding
// document. Service-to-service only, idempotent on `eventId`.
//
// Body: {
//   eventId, hrDocumentId, status: 'verified'|'rejected'|'revision_required',
//   remarks?, allRequiredVerified?
// }
//   allRequiredVerified: HR includes this (computed from its own case) when
//   a 'verified' decision was also the LAST required document to clear —
//   triggers the "onboarding documents complete" notification/email instead
//   of a single-document one.

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent, notify, queueEmail, siteUrl, staffContact } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

const VALID_STATUS = ["verified", "rejected", "revision_required"];

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
  if (!body.eventId || !body.hrDocumentId || !VALID_STATUS.includes(body.status)) {
    return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);
  }

  const svc = serviceClient();
  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "ONBOARDING_DOCUMENT_STATUS",
      source_system: "hr",
      payload: body,
      status: "processing",
      entity_type: "onboarding_document",
    })
    .select("id")
    .maybeSingle();
  if (eventErr) return ok({ received: true, alreadyProcessed: true });

  try {
    const { data: doc } = await svc
      .from("onboarding_documents")
      .select("id, application_id, requirement_name, applications(id, assigned_ta_id, candidates(profile_id, email, first_name, last_name))")
      .eq("hr_document_id", body.hrDocumentId)
      .maybeSingle();
    if (!doc) throw new Error("onboarding_documents row not found");

    await svc
      .from("onboarding_documents")
      .update({ status: body.status, hr_remarks: body.remarks ?? null })
      .eq("id", doc.id);

    const app = doc.applications as any;
    const candidate = app?.candidates as any;
    const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();

    await addEvent(svc, {
      application_id: doc.application_id,
      type: "documents",
      title:
        body.status === "verified" ? "Onboarding Document Verified" :
        body.status === "rejected" ? "Onboarding Document Rejected" : "Onboarding Document Correction Requested",
      description: body.remarks ? `${doc.requirement_name}: ${body.remarks}` : `${doc.requirement_name} verified by HR.`,
      actor_label: body.reviewedBy ?? "HR",
    });

    // TA gets told about every HR decision on an onboarding document — this
    // app never notified TA at all for this stage before (only candidate
    // corrections were surfaced).
    const ta = await staffContact(svc, app?.assigned_ta_id);
    if (ta) {
      await notify(svc, {
        recipient_profile_id: app.assigned_ta_id,
        title: "HR reviewed an onboarding document",
        message: `${candidateName || "Candidate"}: ${doc.requirement_name} — ${body.status === "verified" ? "verified" : body.status === "rejected" ? "rejected" : "correction requested"}.`,
        type: "onboarding_document_status",
        entity_type: "onboarding_document",
        entity_id: doc.id,
      });
      const taMail = render("document_status_ta", {
        ta_name: ta.name,
        candidate_name: candidateName || "The candidate",
        document_name: doc.requirement_name,
        reviewed_by: body.reviewedBy ?? "HR",
        status_label: body.status === "verified" ? "Verified" : body.status === "rejected" ? "Rejected" : "Correction required",
        status_tone: body.status === "verified" ? "approved" : "rejected",
        reason: body.status === "verified" ? null : body.remarks ?? null,
        portal_link: siteUrl(`/ta/candidates/${doc.application_id}`),
      });
      await queueEmail(svc, {
        recipient: ta.email, subject: taMail.subject, body_html: taMail.html, body_text: taMail.text,
        template: "document_status_ta", entity_type: "onboarding_document", entity_id: doc.id,
      });
    }

    if (body.status === "revision_required" || body.status === "rejected") {
      await notify(svc, {
        recipient_profile_id: candidate?.profile_id ?? null,
        title: "Onboarding document needs your attention",
        message: `${doc.requirement_name}: ${body.remarks ?? "please review and re-upload."}`,
        type: "onboarding_document_correction_required",
        entity_type: "onboarding_document",
        entity_id: doc.id,
      });
      if (candidate?.email) {
        const mail = render("onboarding_document_correction_required", {
          candidate_name: candidateName,
          reason: `${doc.requirement_name}: ${body.remarks ?? "Please review and re-upload this document."}`,
          onboarding_link: siteUrl("/candidate/application"),
        });
        await queueEmail(svc, {
          recipient: candidate.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
          template: "onboarding_document_correction_required", entity_type: "onboarding_document", entity_id: doc.id,
          sender_email: body.reviewedByEmail ?? null,
        });
      }
    } else if (body.allRequiredVerified) {
      await notify(svc, {
        recipient_profile_id: candidate?.profile_id ?? null,
        title: "Onboarding documents verified",
        message: "All your onboarding documents have been verified.",
        type: "onboarding_documents_completed",
        entity_type: "application",
        entity_id: doc.application_id,
      });
      if (candidate?.email) {
        const mail = render("onboarding_documents_completed", { candidate_name: candidateName });
        await queueEmail(svc, {
          recipient: candidate.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
          template: "onboarding_documents_completed", entity_type: "application", entity_id: doc.application_id,
        });
      }
    }

    await svc.from("integration_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", eventRow!.id);
    return ok({ received: true, processed: true });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow!.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
