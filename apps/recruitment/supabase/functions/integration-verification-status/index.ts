// POST /functions/v1/integration-verification-status
// Inbound from the HR app — the return leg of integration point 1
// (docs/requirements/03-recruitment-hr-integration.md §5/§8). Service-to-
// service only, idempotent on `eventId`.
//
// Body: { eventId, sourceDocumentId, status, remarks, reviewedBy }
//   status is HR's vocabulary: approved | rejected | reupload_required

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { pushSummary } from "../_shared/preOffer.ts";

// HR's document_verification_status -> this app's document_status.
const STATUS_MAP: Record<string, string> = {
  approved: "verified",
  rejected: "rejected",
  reupload_required: "revision_required",
};

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

  const mapped = STATUS_MAP[body.status];
  if (!body.eventId || !body.sourceDocumentId || !mapped) {
    return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);
  }

  const svc = serviceClient();

  const { error: eventErr, data: eventRow } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "DOCUMENT_VERIFICATION_STATUS",
      source_system: "hr",
      payload: body,
      status: "processing",
      entity_type: "application_document",
      entity_id: body.sourceDocumentId,
    })
    .select("id")
    .maybeSingle();
  if (eventErr) return ok({ received: true, alreadyProcessed: true });

  try {
    const { data: doc } = await svc
      .from("application_documents")
      .select("id, application_id, status, requirement_id, cannot_provide_reason, na_reason, document_requirements(name)")
      .eq("id", body.sourceDocumentId)
      .maybeSingle();
    if (!doc) throw new Error("application_documents row not found");

    // HR approving a REASON (no file) resolves the requirement as "approved with reason" (or "not applicable accepted").
    const { count: fileCount } = await svc.from("document_files").select("id", { count: "exact", head: true }).eq("application_document_id", doc.id).eq("is_current", true);
    const reasonOnly = !!(doc as any).cannot_provide_reason && (fileCount ?? 0) === 0;
    const finalStatus = mapped === "verified" && reasonOnly ? ((doc as any).na_reason ? "na_accepted" : "reason_approved") : mapped;
    await svc
      .from("application_documents")
      .update({
        status: finalStatus,
        hr_remarks: body.remarks ?? null,
        verified_at: ["verified", "reason_approved", "na_accepted"].includes(finalStatus) ? new Date().toISOString() : null,
      })
      .eq("id", doc.id);

    const requirementName = (doc as any).document_requirements?.name ?? "Document";

    const { data: app } = await svc
      .from("applications")
      .select("id, status, assigned_ta_id, candidates(profile_id, email, first_name, last_name), jobs(title)")
      .eq("id", doc.application_id)
      .maybeSingle();

    // Nothing ever advanced applications.status once every pre-offer document
    // cleared — DOCS_VERIFIED existed in the status enum and the TA UI's step
    // list, but no code path ever set it, so the Offer step (gated on this
    // status) was unreachable for every candidate no matter how complete
    // their documents were. Mirrors verify-onboarding-document's
    // allRequiredVerified check on the HR side of this same pattern.
    // Complete = every MANDATORY pre-offer document verified — optional ones
    // never block. offer_eligibility() is the one definition of that rule (the
    // same one send-offer checks), so the two can't drift apart.
    if (["verified", "reason_approved", "na_accepted"].includes(finalStatus) && app?.status === "DOC_VERIFICATION") {
      const { data: eligibility } = await svc.rpc("offer_eligibility", { app_id: doc.application_id });
      if (eligibility === "READY_FOR_OFFER") {
        await svc.from("applications").update({ status: "DOCS_VERIFIED" }).eq("id", doc.application_id);
        await addEvent(svc, {
          application_id: doc.application_id, type: "documents", title: "Document Verification Completed",
          description: "Every applicable pre-offer requirement is resolved.", actor_label: "System",
        });
      }
    }

    await addEvent(svc, {
      application_id: doc.application_id,
      type: "documents",
      title: mapped === "verified" ? (finalStatus === "verified" ? "Document Verified" : "Document Reason Accepted") : mapped === "rejected" ? "Document Rejected" : "Document Correction Required",
      description: `${requirementName}: ${finalStatus}${body.remarks ? ` — ${body.remarks}` : ""} (HR: ${body.reviewedBy ?? "reviewer"})`,
      actor_label: body.reviewedBy ?? "HR",
    });

    if (mapped !== "verified" && app) {
      const candidate = app.candidates as any;
      const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();
      const jobTitle = (app.jobs as any)?.title ?? "your application";

      await notify(svc, {
        recipient_profile_id: candidate?.profile_id ?? null,
        title: "Document needs your attention",
        message: `${requirementName}: ${body.remarks ?? "please review and re-upload."}`,
        type: "document_correction_required",
        entity_type: "application_document",
        entity_id: doc.id,
      });
      await notify(svc, {
        recipient_profile_id: app.assigned_ta_id,
        recipient_role: app.assigned_ta_id ? null : "ta",
        title: "HR requested a document correction",
        message: `${candidateName || "Candidate"}: ${requirementName} — ${body.remarks ?? ""}`,
        type: "document_correction_required",
        entity_type: "application_document",
        entity_id: doc.id,
      });

      if (candidate?.email) {
        const mail = render("document_correction_required", {
          candidate_name: candidateName,
          job_title: jobTitle,
          reason: `${requirementName}: ${body.remarks ?? "Please review and re-upload this document."}`,
          document_link: siteUrl("/candidate/application"),
        });
        await queueEmail(svc, {
          recipient: candidate.email,
          subject: mail.subject,
          body_html: mail.html,
          body_text: mail.text,
          template: "document_correction_required",
          entity_type: "application_document",
          entity_id: doc.id,
          sender_email: body.reviewedByEmail ?? null,
        });
      }
    } else if (app?.assigned_ta_id) {
      await notify(svc, {
        recipient_profile_id: app.assigned_ta_id,
        title: "Document verified",
        message: `${requirementName} verified by HR.`,
        type: "document_verified",
        entity_type: "application_document",
        entity_id: doc.id,
      });
    }

    // HR's own decision changes what is resolved — refresh HR's per-candidate summary too.
    try { await pushSummary(svc, doc.application_id); } catch { /* best effort */ }

    await svc
      .from("integration_events")
      .update({ status: "success", processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);

    return ok({ received: true, processed: true });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
