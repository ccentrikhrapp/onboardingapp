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

    const rows = (body.requirements as any[]).map((r) => ({
      application_id: app.id,
      hr_case_id: body.hrCaseId,
      hr_document_id: r.hrDocumentId,
      requirement_key: r.key,
      requirement_name: r.name,
      required: r.required !== false,
      field_schema: r.fieldSchema ?? null,
      status: "requested" as const,
    }));
    const { error: upsertErr } = await svc
      .from("onboarding_documents")
      .upsert(rows, { onConflict: "hr_document_id" });
    if (upsertErr) throw new Error(upsertErr.message);

    const candidate = app.candidates as any;
    const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();

    await addEvent(svc, {
      application_id: app.id,
      type: "documents",
      title: "Onboarding Documents Requested",
      description: "HR requested onboarding documents to complete your joining formalities.",
      actor_label: body.requestedBy ?? "HR",
    });

    await notify(svc, {
      recipient_profile_id: candidate?.profile_id ?? null,
      title: "Onboarding documents needed",
      message: "HR needs a few documents to complete your onboarding.",
      type: "onboarding_documents_requested",
      entity_type: "application",
      entity_id: app.id,
    });

    if (candidate?.email) {
      const mail = render("onboarding_documents_requested", {
        candidate_name: candidateName,
        job_title: (app.jobs as any)?.title ?? "your new role",
        onboarding_link: siteUrl("/candidate/application"),
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
