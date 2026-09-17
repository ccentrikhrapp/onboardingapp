// POST /functions/v1/integration-onboarding-document-submitted
// Inbound from the recruitment app: a Pre-Employee has uploaded an onboarding
// document HR requested (request-onboarding-documents). Service-to-service
// only — never a user session. Idempotent on `eventId`. This function was
// referenced by name in the onboarding_documents migration and by the
// recruitment app's submit-onboarding-document from the start, but never
// actually existed here — every upload call 404'd and the matching
// onboarding_documents row here was stuck at 'requested' forever, even after
// the candidate had genuinely uploaded the file on the recruitment side.
//
// Body: { eventId, hrDocumentId, candidate: { name, email } }

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

  const required = ["eventId", "hrDocumentId"];
  for (const k of required) {
    if (!body[k]) return fail("VALIDATION_ERROR", `Missing "${k}".`, 422);
  }

  const svc = serviceClient();

  // Idempotency: a repeat delivery of the same event must not re-notify HR.
  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "ONBOARDING_DOCUMENT_SUBMITTED",
      source_system: "recruitment",
      payload: body,
      status: "processing",
      entity_type: "onboarding_document",
    })
    .select("id")
    .maybeSingle();

  if (eventErr) {
    // unique_violation on event_id -> already processed
    return ok({ received: true, alreadyProcessed: true });
  }

  try {
    const { data: doc } = await svc
      .from("onboarding_documents")
      .select("id, onboarding_case_id, status, requirement:onboarding_document_requirements(name)")
      .eq("id", body.hrDocumentId)
      .maybeSingle();
    if (!doc) throw new Error("onboarding document not found");

    const patch: Record<string, unknown> = { status: "uploaded", hr_remarks: null };
    if (body.formData) patch.form_data = body.formData;
    const { error } = await svc.from("onboarding_documents").update(patch).eq("id", doc.id);
    if (error) throw new Error(error.message);

    await svc.from("notifications").insert({
      recipient_role: "hr",
      title: "Onboarding document uploaded",
      message: `${body.candidate?.name ?? "A candidate"} uploaded "${(doc.requirement as any)?.name ?? "a document"}".`,
      type: "onboarding_document_submitted",
      entity_type: "onboarding_document",
      entity_id: doc.id,
    });

    await svc
      .from("integration_events")
      .update({ status: "success", processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);

    return ok({ received: true, processed: true, onboardingDocumentId: doc.id });
  } catch (e) {
    await svc
      .from("integration_events")
      .update({ status: "failed", error: String(e) })
      .eq("id", eventRow.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
