// POST /functions/v1/integration-hr-interview-scheduled
// Inbound from the recruitment app (TA portal) — fired when a candidate's
// HR-final interview round is scheduled or rescheduled (schedule-interview /
// reschedule-interview-round, only when the round is_hr_final). Idempotent
// on event_id (a fresh key per distinct schedule/reschedule, so a retried
// webhook delivery for the SAME action never double-processes — same
// pattern as integration-offer-accepted). The meeting record itself is
// upserted on source_round_id so a reschedule updates the one row for this
// round instead of creating a second "upcoming interview".
//
// Body: {
//   event: "HR_INTERVIEW_SCHEDULED" | "HR_INTERVIEW_RESCHEDULED", event_id,
//   round_id, application_id, application_code,
//   candidate: { name }, position: { job_title },
//   interview: {
//     round_name, scheduled_at, date, time, duration_minutes,
//     meeting_type, meeting_platform, platform_label, meeting_url,
//     location, location_details,
//   },
//   recruiter: { name },
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { activeTeamEmails } from "../_shared/onboardingWorkflow.ts";
import { sendStaffMail } from "../_shared/notify.ts";
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

  for (const k of ["event_id", "round_id", "application_id"]) {
    if (!body[k]) return fail("VALIDATION_ERROR", `Missing "${k}".`, 422);
  }
  if (!["HR_INTERVIEW_SCHEDULED", "HR_INTERVIEW_RESCHEDULED"].includes(body.event)) {
    return fail("VALIDATION_ERROR", "Unexpected event type.", 422);
  }
  const interview = body.interview || {};
  if (!body.candidate?.name || !interview.scheduled_at || !interview.round_name) {
    return fail("VALIDATION_ERROR", "Missing candidate or interview details.", 422);
  }

  const svc = serviceClient();

  const { data: eventRow, error: eventErr } = await svc
    .from("integration_events")
    .insert({
      event_id: body.event_id,
      event_type: body.event,
      source_system: "recruitment",
      payload: body,
      status: "processing",
      entity_type: "interview_round",
    })
    .select("id")
    .maybeSingle();

  if (eventErr) {
    return ok({ received: true, alreadyProcessed: true });
  }

  const rescheduled = body.event === "HR_INTERVIEW_RESCHEDULED";

  try {
    const { data: handoff, error } = await svc
      .from("hr_interview_handoffs")
      .upsert(
        {
          source_round_id: body.round_id,
          source_application_id: body.application_id,
          candidate_name: body.candidate.name,
          application_code: body.application_code ?? null,
          job_title: body.position?.job_title ?? null,
          round_name: interview.round_name,
          scheduled_at: interview.scheduled_at,
          duration_minutes: interview.duration_minutes ?? null,
          meeting_type: interview.meeting_type === "in_person" ? "in_person" : "virtual",
          meeting_platform: interview.meeting_platform ?? null,
          meeting_url: interview.meeting_url ?? null,
          location: interview.location ?? null,
          location_details: interview.location_details ?? null,
          recruiter_name: body.recruiter?.name ?? null,
          status: rescheduled ? "rescheduled" : "scheduled",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source_round_id" },
      )
      .select("id")
      .single();
    if (error || !handoff) throw new Error(error?.message ?? "upsert failed");

    // In-app notification — Super Admin and HR both oversee this workflow
    // (same "admin, hr" pairing onboarding_tasks already uses for oversight),
    // and notifications_select matches recipient_role exactly, so both roles
    // need their own row to actually see it.
    const title = `HR Interview ${rescheduled ? "Rescheduled" : "Scheduled"}`;
    const message = `${body.candidate.name} — ${body.position?.job_title ?? "a role"}${interview.date ? `. ${interview.date}` : ""}${interview.time ? `, ${interview.time}` : ""}.`;
    for (const role of ["admin", "hr"] as const) {
      await svc.from("notifications").insert({
        recipient_role: role,
        title,
        message,
        type: "hr_interview_scheduled",
        entity_type: "hr_interview_handoff",
        entity_id: handoff.id,
        metadata: { round_id: body.round_id, application_id: body.application_id },
      });
    }

    // Email — every active HR/admin profile, through the same send pipeline
    // (and the same fallback-to-company-mailbox) every other HR notification
    // uses. No idempotencyKey here: integration_events (keyed on event_id,
    // which is unique per distinct schedule/reschedule) is already this
    // function's idempotency boundary — sendStaffMail's own dedupe keys on
    // (template, entity_id, recipient), which would wrongly also suppress a
    // genuine reschedule email for the same round/recipient.
    const recipients = await activeTeamEmails(svc, ["hr", "admin"]);
    for (const r of recipients) {
      const mail = render("hr_interview_scheduled", {
        hr_recipient_name: r.name,
        rescheduled: String(rescheduled),
        candidate_name: body.candidate.name,
        application_code: body.application_code,
        job_title: body.position?.job_title,
        round_name: interview.round_name,
        date: interview.date,
        time: interview.time,
        platform_label: interview.platform_label,
        meeting_url: interview.meeting_url,
        location: [interview.location, interview.location_details].filter(Boolean).join(" — "),
        recruiter_name: body.recruiter?.name,
      });
      await sendStaffMail(svc, {
        to: r.email, subject: mail.subject, html: mail.html, text: mail.text,
        template: "hr_interview_scheduled", entityType: "hr_interview_handoff", entityId: handoff.id,
      });
    }

    await audit(svc, {
      actor_label: "System",
      action: rescheduled ? "hr_interview.rescheduled" : "hr_interview.scheduled",
      entity_type: "hr_interview_handoff",
      entity_id: handoff.id,
      new_state: { scheduled_at: interview.scheduled_at, status: rescheduled ? "rescheduled" : "scheduled" },
    });

    await svc
      .from("integration_events")
      .update({ status: "success", processed_at: new Date().toISOString(), entity_id: handoff.id })
      .eq("id", eventRow.id);

    return ok({ received: true, processed: true, handoffId: handoff.id });
  } catch (e) {
    await svc.from("integration_events").update({ status: "failed", error: String(e) }).eq("id", eventRow.id);
    return fail("PROCESSING_FAILED", "Could not process the event.", 500);
  }
});
