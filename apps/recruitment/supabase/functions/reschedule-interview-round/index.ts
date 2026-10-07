// POST /functions/v1/reschedule-interview-round
// Auth: the assigned TA (or admin). Picks a new time for a round the
// candidate declined — same round, same round number, so it doesn't run
// into the "one open round at a time" / "HR is the final round" rules that
// scheduling a brand-new round would.
//
// Body: {
//   roundId, scheduledAt, durationMinutes?,
//   meetingType: 'virtual' | 'in_person',
//   meetingPlatform?, meetingUrl?, location?, locationDetails?
// }
//
// The candidate's response is reset (a fresh response_token is issued — the
// old email's links stop working) and the invitation email is sent again.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, deliverQueuedEmail, istDateParts, notify } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { createMeetingLink } from "../_shared/meetingProviders.ts";
import { randomToken } from "../_shared/teamInvite.ts";

const PLATFORM_LABEL: Record<string, string> = { teams: "Microsoft Teams", google_meet: "Google Meet" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can reschedule interviews.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const meetingType = body.meetingType === "in_person" ? "in_person" : "virtual";
  const fields: Record<string, string> = {};
  if (!body.roundId) fields.roundId = "Missing round.";
  if (!body.scheduledAt) fields.scheduledAt = "Date and time are required.";
  if (meetingType === "virtual") {
    if (!["teams", "google_meet"].includes(body.meetingPlatform)) fields.meetingPlatform = "Choose Microsoft Teams or Google Meet.";
  } else if (!body.location?.trim()) {
    fields.location = "Interview location is required.";
  }
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the round details.", 422, fields);

  const svc = serviceClient();
  const { data: round } = await svc
    .from("interview_rounds")
    .select("id, name, round_number, candidate_response, application_id, applications(id, assigned_ta_id, status, personal, cooldown_until, jobs(title), candidates(profile_id))")
    .eq("id", body.roundId)
    .maybeSingle();
  if (!round) return fail("NOT_FOUND", "Interview round not found.", 404);

  const app = round.applications as any;
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (round.candidate_response !== "declined") {
    return fail("INVALID_STATE", "Only a round the candidate declined can be rescheduled here.", 409);
  }
  if (app.cooldown_until && new Date(app.cooldown_until) > new Date()) {
    return fail("FROZEN", `This candidate is frozen until ${new Date(app.cooldown_until).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}. Unfreeze before rescheduling.`, 409);
  }

  let meetingUrl: string | null = meetingType === "virtual" ? body.meetingUrl ?? null : null;
  if (meetingType === "virtual" && !meetingUrl) {
    const generated = await createMeetingLink(
      body.meetingPlatform,
      { roundName: round.name, scheduledAt: body.scheduledAt, durationMinutes: body.durationMinutes, actorEmail: profile.email ?? undefined },
      svc,
    );
    meetingUrl = generated.url;
  }

  const newToken = randomToken();
  const { error: updErr } = await svc
    .from("interview_rounds")
    .update({
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes ?? null,
      meeting_type: meetingType,
      meeting_platform: meetingType === "virtual" ? body.meetingPlatform : null,
      meeting_url: meetingUrl,
      location: meetingType === "in_person" ? body.location?.trim() ?? null : null,
      location_details: meetingType === "in_person" ? body.locationDetails?.trim() ?? null : null,
      status: "scheduled",
      candidate_response: null,
      candidate_response_reason: null,
      responded_at: null,
      response_token: newToken,
    })
    .eq("id", round.id);
  if (updErr) return fail("DB_ERROR", updErr.message || "Could not reschedule the round.", 500);

  if (app.status !== "INTERVIEW_IN_PROGRESS") {
    await svc.from("applications").update({ status: "INTERVIEW_IN_PROGRESS" }).eq("id", app.id);
  }

  const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const jobTitle = (app.jobs as any)?.title ?? "the role";
  const scheduledDate = new Date(body.scheduledAt);
  const ist = istDateParts(scheduledDate);

  await addEvent(svc, {
    application_id: app.id,
    type: "interview",
    title: `${round.name} Rescheduled`,
    description: `Round ${round.round_number} rescheduled for ${ist.when}.`,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: "interview.reschedule",
    entity_type: "interview_round",
    entity_id: round.id,
    new_state: { round_number: round.round_number, scheduled_at: body.scheduledAt },
  });
  await notify(svc, {
    recipient_profile_id: (app.candidates as any)?.profile_id ?? null,
    title: "Interview rescheduled",
    message: `${round.name} — ${ist.when}`,
    type: "interview_scheduled",
    entity_type: "application",
    entity_id: app.id,
  });

  const candidateEmail: string | undefined = app.personal?.email;
  let emailStatus: "queued" | "failed" | "no_email" = "no_email";
  if (candidateEmail) {
    const functionsBase = Deno.env.get("SUPABASE_URL") ?? "";
    const responseLink = (action: string) => `${functionsBase}/functions/v1/interview-response?token=${newToken}&action=${action}`;
    const mail = render("interview_scheduled", {
      candidate_name: candidateName,
      job_title: jobTitle,
      round_name: round.name,
      day_of_month: ist.day_of_month,
      month_short: ist.month_short,
      year: ist.year,
      weekday: ist.weekday,
      date: ist.date,
      time: ist.time,
      duration: body.durationMinutes ? `${body.durationMinutes} minutes` : "—",
      meeting_type: meetingType === "in_person" ? "In-Person" : "Virtual",
      platform_label: meetingType === "virtual" ? PLATFORM_LABEL[body.meetingPlatform] ?? "" : "",
      meeting_link: meetingType === "virtual" ? meetingUrl ?? "" : "",
      location: meetingType === "in_person" ? body.location ?? "" : "",
      location_details: meetingType === "in_person" ? body.locationDetails ?? "" : "",
      application_link: `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/candidate/application`,
      accept_link: responseLink("accept"),
      decline_link: responseLink("decline"),
    });
    const { data: emailRow } = await svc
      .from("emails")
      .insert({
        recipient: candidateEmail, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "interview_scheduled", entity_type: "interview_round", entity_id: round.id, status: "queued",
        sender_email: profile.email ?? null,
      })
      .select("id")
      .single();
    if (emailRow?.id) {
      await deliverQueuedEmail(svc, emailRow.id);
      emailStatus = "queued";
    } else {
      emailStatus = "failed";
    }
  }

  return ok({ roundId: round.id, emailStatus, candidateEmail: candidateEmail ?? null, meetingUrl });
});
