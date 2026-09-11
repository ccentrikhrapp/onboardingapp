// POST /functions/v1/integration-document-submitted
// Inbound from the recruitment app (integration point 1, docs/requirements/
// 03-recruitment-hr-integration.md §5). Service-to-service only — never a
// user session. Idempotent on `eventId`.
//
// Body: {
//   eventId, sourceApplicationId, sourceDocumentId, version,
//   candidate: { name, email }, job: { title }, applicationCode,
//   requirement: { key, name }
// }

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

  const required = ["eventId", "sourceApplicationId", "sourceDocumentId", "requirement"];
  for (const k of required) {
    if (!body[k]) return fail("VALIDATION_ERROR", `Missing "${k}".`, 422);
  }

  const svc = serviceClient();

  // Idempotency: a repeat delivery of the same event must not re-notify HR or
  // duplicate the verification record.
  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "DOCUMENT_SUBMITTED",
      source_system: "recruitment",
      payload: body,
      status: "processing",
      entity_type: "document_verification",
    })
    .select("id")
    .maybeSingle();

  if (eventErr) {
    // unique_violation on event_id -> already processed
    return ok({ received: true, alreadyProcessed: true });
  }

  try {
    const { data: verification, error } = await svc
      .from("document_verifications")
      .upsert(
        {
          source_application_id: body.sourceApplicationId,
          source_document_id: body.sourceDocumentId,
          candidate_name: body.candidate?.name ?? null,
          candidate_email: body.candidate?.email ?? null,
          job_title: body.job?.title ?? null,
          application_code: body.applicationCode ?? null,
          requirement_key: body.requirement?.key ?? null,
          requirement_name: body.requirement?.name ?? null,
          version: body.version ?? 1,
          status: "pending",
          hr_remarks: null,
          reviewed_by: null,
          reviewed_at: null,
        },
        { onConflict: "source_document_id" },
      )
      .select("id")
      .single();
    if (error || !verification) throw new Error(error?.message ?? "upsert failed");

    await svc.from("document_verification_events").insert({
      document_verification_id: verification.id,
      version: body.version ?? 1,
      status: "pending",
      actor_label: "Recruitment system",
    });

    await svc.from("notifications").insert({
      recipient_role: "hr",
      title: "New document to verify",
      message: `${body.candidate?.name ?? "A candidate"} submitted "${body.requirement?.name}" for ${body.job?.title ?? "a role"}.`,
      type: "document_submitted",
      entity_type: "document_verification",
      entity_id: verification.id,
    });

    await svc
      .from("integration_events")
      .update({ status: "success", processed_at: new Date().toISOString() })
      .eq("id", eventRow.id);

    return ok({ received: true, processed: true, documentVerificationId: verification.id });
  } catch (e) {
    await svc
      .from("integration_events")
      .update({ status: "failed", error: String(e) })
      .eq("id", eventRow.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
