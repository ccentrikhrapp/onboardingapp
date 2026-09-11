// POST /functions/v1/integration-offer-accepted
// Inbound from the recruitment app (integration point 2, docs/requirements/
// 02-two-application-architecture.md §6, 03-*.md §13-14). Creates an
// Onboarding Case / Pre-Employee — never an Employee directly. Idempotent on
// both `eventId` and `offer.offer_id`.
//
// Body (see 02-*.md §6 for the full shape):
// {
//   event: "OFFER_ACCEPTED", event_id, candidate_id, application_id, offer_id,
//   candidate: { name, email, phone },
//   position: { job_id, job_title, department, designation },
//   offer: { offer_date, joining_date, employment_type, location }
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

  for (const k of ["event_id", "candidate_id", "application_id", "offer_id"]) {
    if (!body[k]) return fail("VALIDATION_ERROR", `Missing "${k}".`, 422);
  }
  if (body.event && body.event !== "OFFER_ACCEPTED") {
    return fail("VALIDATION_ERROR", "Unexpected event type.", 422);
  }

  const svc = serviceClient();

  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.event_id,
      event_type: "OFFER_ACCEPTED",
      source_system: "recruitment",
      payload: body,
      status: "processing",
      entity_type: "onboarding_case",
    })
    .select("id")
    .maybeSingle();

  if (eventErr) {
    return ok({ received: true, alreadyProcessed: true });
  }

  try {
    // Idempotent on offer_id too, independent of the event log, so a second
    // OFFER_ACCEPTED for the same offer (even under a different event id)
    // still can't create a second case.
    const { data: existing } = await svc
      .from("onboarding_cases")
      .select("id")
      .eq("source_offer_id", body.offer_id)
      .maybeSingle();

    let caseId = existing?.id;
    if (!caseId) {
      const { data: created, error } = await svc
        .from("onboarding_cases")
        .insert({
          source_candidate_id: body.candidate_id,
          source_application_id: body.application_id,
          source_offer_id: body.offer_id,
          candidate_name: body.candidate?.name ?? null,
          candidate_email: body.candidate?.email ?? null,
          candidate_phone: body.candidate?.phone ?? null,
          job_title: body.position?.job_title ?? null,
          department: body.position?.department ?? null,
          designation: body.position?.designation ?? null,
          location: body.offer?.location ?? null,
          employment_type: body.offer?.employment_type ?? null,
          offer_date: body.offer?.offer_date ?? null,
          joining_date: body.offer?.joining_date ?? null,
          status: "onboarding_initiated",
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "insert failed");
      caseId = created.id;

      await svc.from("notifications").insert({
        recipient_role: "hr",
        title: "New onboarding",
        message: `${body.candidate?.name ?? "A candidate"} accepted their offer for ${body.position?.job_title ?? "a role"}.`,
        type: "onboarding_created",
        entity_type: "onboarding_case",
        entity_id: caseId,
      });
    }

    await svc
      .from("integration_events")
      .update({ status: "success", processed_at: new Date().toISOString(), entity_id: caseId })
      .eq("id", eventRow.id);

    return ok({ received: true, processed: true, onboardingCaseId: caseId });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
