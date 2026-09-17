// POST /functions/v1/integration-employee-created
// Inbound from the HR app — HR has created the Employee record, which is the
// single point where a candidate's active recruitment workflow closes for
// good. Service-to-service only, idempotent on `eventId`. Mirrors
// integration-offer-accepted's shape.
//
// Body: { eventId, sourceApplicationId, employeeCode, designation, reviewedBy }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent } from "../_shared/workflow.ts";

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
  if (!body.eventId || !body.sourceApplicationId || !body.employeeCode) {
    return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);
  }

  const svc = serviceClient();

  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.eventId,
      event_type: "EMPLOYEE_CREATED",
      source_system: "hr",
      payload: body,
      status: "processing",
      entity_type: "application",
      entity_id: body.sourceApplicationId,
    })
    .select("id")
    .maybeSingle();
  if (eventErr) return ok({ received: true, alreadyProcessed: true });

  try {
    const { data: app } = await svc
      .from("applications")
      .select("id, status, additional")
      .eq("id", body.sourceApplicationId)
      .maybeSingle();
    if (!app) throw new Error("application not found");

    // Idempotent on application state too — a retried delivery must not
    // double-log the milestone if this already ran.
    if (app.status !== "EMPLOYEE") {
      await svc
        .from("applications")
        .update({
          status: "EMPLOYEE",
          additional: { ...(app.additional as any ?? {}), employeeCode: body.employeeCode },
        })
        .eq("id", app.id);

      await addEvent(svc, {
        application_id: app.id,
        type: "application",
        title: "Employee ID Created",
        description: `Employee record created (${body.employeeCode})${body.designation ? ` — ${body.designation}` : ""}. Welcome to the team!`,
        actor_label: body.reviewedBy ?? "HR",
      });
    }

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
