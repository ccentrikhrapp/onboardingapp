// POST /functions/v1/accept-offer
// Auth: the assigned TA (or admin-tier) — the offer itself is sent and
// accepted outside the app (the TA's own email), so this just records that
// the candidate replied accepting it. One-time transition — rejects a
// second acceptance attempt outright, no re-processing. Fires integration
// point 2: notifies the HR app so it can create an Onboarding Case /
// Pre-Employee (never an Employee directly) — docs/requirements/03-*.md §7,
// 02-*.md §6.
//
// Body: { offerId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { callHr } from "../_shared/hrIntegration.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can record offer acceptance.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.offerId) return fail("VALIDATION_ERROR", "Missing offer.", 422);

  const svc = serviceClient();

  const { data: offer } = await svc
    .from("offers")
    .select(
      "id, status, application_id, department, designation, employment_type, location, joining_date, sent_at, " +
        "applications(id, application_code, job_id, candidate_id, assigned_ta_id, personal, jobs(id, title), candidates(id, profile_id, first_name, last_name, email, phone))",
    )
    .eq("id", body.offerId)
    .maybeSingle();
  if (!offer) return fail("NOT_FOUND", "Offer not found.", 404);

  const app = offer.applications as any;
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (!["sent", "viewed"].includes(offer.status)) {
    return fail("INVALID_STATE", offer.status === "accepted" ? "This offer has already been accepted." : "This offer can no longer be accepted.", 409);
  }

  const now = new Date().toISOString();
  const { error: upErr } = await svc.from("offers").update({
    status: "accepted", accepted_at: now, accepted_by: profile.id,
  }).eq("id", offer.id);
  if (upErr) return fail("DB_ERROR", "Could not record the acceptance. Please try again.", 500);

  await svc.from("applications").update({ status: "OFFER_ACCEPTED" }).eq("id", app.id);

  const candidate = app.candidates as any;
  const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();
  const jobTitle = (app.jobs as any)?.title ?? "the role";

  await addEvent(svc, {
    application_id: app.id, type: "offer", title: "Offer Accepted",
    description: "Candidate accepted the offer (confirmed by email).",
    actor_profile_id: profile.id, actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id, action: "offer.accept",
    entity_type: "offer", entity_id: offer.id, new_state: { status: "accepted", accepted_at: now },
  });

  if (candidate?.email) {
    const mail = render("offer_accepted_ack", { candidate_name: candidateName, job_title: jobTitle });
    await queueEmail(svc, {
      recipient: candidate.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
      template: "offer_accepted_ack", entity_type: "offer", entity_id: offer.id,
      sender_email: profile.email ?? null,
    });
  }
  await notify(svc, {
    recipient_profile_id: app.assigned_ta_id,
    recipient_role: app.assigned_ta_id ? null : "admin",
    title: "Offer accepted", message: `${candidateName} accepted their offer for ${jobTitle}.`,
    type: "offer_accepted", entity_type: "application", entity_id: app.id,
  });

  // --- integration point 2: hand off to HR -------------------------------
  const eventId = `offer-accepted-${offer.id}`;
  const hrResult = await callHr(
    svc,
    "integration-offer-accepted",
    "OFFER_ACCEPTED",
    eventId,
    {
      event: "OFFER_ACCEPTED",
      event_id: eventId, // integration-offer-accepted reads snake_case
      candidate_id: candidate?.id,
      application_id: app.id,
      offer_id: offer.id,
      candidate: { name: candidateName, email: candidate?.email ?? null, phone: candidate?.phone ?? null },
      position: {
        job_id: app.job_id, job_title: jobTitle,
        department: offer.department, designation: offer.designation,
      },
      offer: {
        offer_date: offer.sent_at, joining_date: offer.joining_date,
        employment_type: offer.employment_type, location: offer.location,
      },
    },
    { entity_type: "offer", entity_id: offer.id },
  );
  if (!hrResult.ok) {
    // The acceptance itself is already recorded — HR handoff failure is
    // logged to integration_outbox for retry, not surfaced as a failure to
    // the candidate (their acceptance is real either way).
    await audit(svc, {
      action: "offer.hr_handoff_failed", entity_type: "offer", entity_id: offer.id,
      remarks: hrResult.error ?? "unknown error",
    });
  }

  return ok({ status: "OFFER_ACCEPTED" });
});
