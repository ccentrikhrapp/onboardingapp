// POST /functions/v1/integration-joining-status
// Inbound from the HR app: HR's decision on the employee's joining form
// (correction required / verified / completed / ...). Service-to-service
// only, idempotent on `eventId` — a retried delivery must not double-send
// the candidate email or double-log the timeline entry.
//
// Body: { eventId, applicationId, status: 'correction_required'|'verified'|'completed'|'approved_with_remarks'|'rejected'|'documents_clarification'|'documents_rejected'|'documents_approved', message }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

const TITLE: Record<string, string> = {
  correction_required: "Joining Form Correction Required",
  verified: "Joining Form Verified",
  completed: "Joining Formalities Completed",
  documents_clarification: "Joining Document Clarification Required",
  documents_rejected: "Joining Document Rejected",
  documents_approved: "Joining Documentation Approved",
  approved_with_remarks: "Joining Form Approved with Remarks",
  rejected: "Joining Form Rejected",
};

// Short text for the badge pill in the email — TITLE above is the longer
// subject/heading wording.
const STATUS_LABEL: Record<string, string> = {
  correction_required: "Correction required",
  verified: "Verified",
  completed: "Completed",
  documents_clarification: "Clarification needed",
  documents_rejected: "Rejected",
  documents_approved: "Approved",
  approved_with_remarks: "Approved with remarks",
  rejected: "Rejected",
};

const TONE: Record<string, "approved" | "pending" | "rejected"> = {
  correction_required: "pending",
  verified: "approved",
  completed: "approved",
  documents_clarification: "pending",
  documents_rejected: "rejected",
  documents_approved: "approved",
  approved_with_remarks: "approved",
  rejected: "rejected",
};

// Only the statuses that need a candidate action get one; the others are
// purely informational ("HR has verified it", "you're done").
const NEXT_STEPS: Record<string, string> = {
  correction_required: "Open your joining form, make the requested change, and resubmit it.",
  documents_clarification: "Open your joining form to see what HR needs from you.",
  documents_rejected: "Please re-upload the document from your joining form.",
  rejected: "Please contact HR for details on next steps.",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const title = TITLE[body.status];
  if (!body.eventId || !body.applicationId || !title) return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);

  const svc = serviceClient();

  const { error: eventErr, data: eventRow } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "JOINING_STATUS",
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
      .select("id, personal, candidates(profile_id, email, first_name, last_name)")
      .eq("id", body.applicationId)
      .maybeSingle();
    if (!app) throw new Error("application not found");

    const message = String(body.message ?? "").slice(0, 500);
    await addEvent(svc, { application_id: app.id, type: "onboarding", title, description: message, actor_label: "HR" });

    const candidate = app.candidates as any;
    const profileId = candidate?.profile_id;
    if (profileId) {
      await notify(svc, {
        recipient_profile_id: profileId, recipient_role: null, title, message,
        type: "joining_form", entity_type: "application", entity_id: app.id,
      });
    }

    const candidateEmail = candidate?.email || app.personal?.email;
    if (candidateEmail) {
      const candidateName = `${candidate?.first_name ?? app.personal?.firstName ?? ""} ${candidate?.last_name ?? app.personal?.lastName ?? ""}`.trim();
      const mail = render("joining_status_update", {
        candidate_name: candidateName || "there",
        headline: title,
        message,
        status_label: STATUS_LABEL[body.status] ?? body.status,
        status_tone: TONE[body.status] ?? "info",
        reason: ["documents_clarification", "documents_rejected", "rejected", "approved_with_remarks"].includes(body.status) ? message : null,
        next_steps: NEXT_STEPS[body.status] ?? null,
        portal_link: siteUrl("/candidate/joining"),
      });
      await queueEmail(svc, {
        recipient: candidateEmail, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "joining_status_update", entity_type: "application", entity_id: app.id,
      });
    }

    await svc.from("integration_events").update({ status: "success", processed_at: new Date().toISOString() }).eq("id", eventRow!.id);
    return ok({ received: true, processed: true });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow!.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
