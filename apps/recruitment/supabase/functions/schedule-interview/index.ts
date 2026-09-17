// POST /functions/v1/schedule-interview
// Auth: the assigned TA (or admin). Creates a round, assigns the panel
// (upserting simple panelist records by email), emails the candidate and any
// panelists with an email on file, and advances the application status.
//
// Body: {
//   applicationId, name, description?, scheduledAt, durationMinutes?,
//   meetingType: 'virtual' | 'in_person',
//   // virtual:
//   meetingPlatform?: 'teams' | 'google_meet', meetingUrl?,
//   // in_person:
//   location?, locationDetails?,
//   instructions?,
//   panelists: [{ name, email?, department?, designation? }]
// }
//
// The candidate's invitation email is sent synchronously here (not fire-and-
// forget) so the response can report whether it actually went out —
// scheduling the round and notifying the candidate are reported as separate
// outcomes, never conflated into one blanket "success".

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { createMeetingLink } from "../_shared/meetingProviders.ts";

const PLATFORM_LABEL: Record<string, string> = { teams: "Microsoft Teams", google_meet: "Google Meet" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can schedule interviews.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const meetingType = body.meetingType === "in_person" ? "in_person" : "virtual";

  const fields: Record<string, string> = {};
  if (!body.applicationId) fields.applicationId = "Missing application.";
  if (!body.name?.trim()) fields.name = "Round name is required.";
  if (!body.scheduledAt) fields.scheduledAt = "Date and time are required.";
  if (meetingType === "virtual") {
    if (!["teams", "google_meet"].includes(body.meetingPlatform)) fields.meetingPlatform = "Choose Microsoft Teams or Google Meet.";
  } else if (!body.location?.trim()) {
    fields.location = "Interview location is required.";
  }
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the round details.", 422, fields);

  const svc = serviceClient();

  const { data: app } = await svc
    .from("applications")
    .select("id, status, assigned_ta_id, personal, application_code, jobs(title), candidates(profile_id)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }

  const startable = ["INTERVIEW_PLANNING", "INTERVIEW_IN_PROGRESS", "INTERVIEW_PASSED"];
  if (!startable.includes(app.status)) {
    return fail("INVALID_STATE", "This application isn't at the interview stage.", 409);
  }

  const { count } = await svc
    .from("interview_rounds")
    .select("id", { count: "exact", head: true })
    .eq("application_id", app.id);
  const roundNumber = (count ?? 0) + 1;

  // The modal generates the link up front (via generate-meeting-link) so the
  // TA sees it before scheduling — this is a safety net in case that step
  // was skipped, never the TA typing a URL manually.
  let meetingUrl: string | null = meetingType === "virtual" ? body.meetingUrl ?? null : null;
  if (meetingType === "virtual" && !meetingUrl) {
    const generated = await createMeetingLink(
      body.meetingPlatform,
      { roundName: body.name.trim(), scheduledAt: body.scheduledAt, durationMinutes: body.durationMinutes, actorEmail: profile.email ?? undefined },
      svc,
    );
    meetingUrl = generated.url;
  }

  const { data: round, error: roundErr } = await svc
    .from("interview_rounds")
    .insert({
      application_id: app.id,
      round_number: roundNumber,
      name: body.name.trim(),
      description: body.description ?? null,
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes ?? null,
      meeting_type: meetingType,
      meeting_platform: meetingType === "virtual" ? body.meetingPlatform : null,
      meeting_url: meetingUrl,
      location: meetingType === "in_person" ? body.location?.trim() ?? null : null,
      location_details: meetingType === "in_person" ? body.locationDetails?.trim() ?? null : null,
      instructions: body.instructions ?? null,
      created_by: profile.id,
    })
    .select("id, response_token")
    .single();
  if (roundErr || !round) {
    console.error("schedule-interview insert failed:", roundErr);
    return fail("DB_ERROR", roundErr?.message || "Could not schedule the round.", 500);
  }

  // --- panel -------------------------------------------------------------
  const panelistEmails: string[] = [];
  for (const p of body.panelists ?? []) {
    if (!p.name?.trim()) continue;
    let panelistId: string | null = null;
    if (p.email) {
      const { data: existing } = await svc.from("interview_panelists").select("id").eq("email", p.email).maybeSingle();
      panelistId = existing?.id ?? null;
    }
    if (!panelistId) {
      const { data: created } = await svc
        .from("interview_panelists")
        .insert({ name: p.name.trim(), email: p.email ?? null, department: p.department ?? null, designation: p.designation ?? null, created_by: profile.id })
        .select("id")
        .single();
      panelistId = created?.id ?? null;
    }
    if (panelistId) {
      await svc.from("interview_assignments").insert({ interview_round_id: round.id, panelist_id: panelistId }).select("id").maybeSingle();
      if (p.email) panelistEmails.push(p.email);
    }
  }

  if (app.status !== "INTERVIEW_IN_PROGRESS") {
    await svc.from("applications").update({ status: "INTERVIEW_IN_PROGRESS" }).eq("id", app.id);
  }

  const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const jobTitle = (app.jobs as any)?.title ?? "the role";
  const scheduledDate = new Date(body.scheduledAt);
  const when = scheduledDate.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const meetingInfo = meetingType === "virtual" ? meetingUrl ?? "" : [body.location, body.locationDetails].filter(Boolean).join(" — ");

  await addEvent(svc, {
    application_id: app.id,
    type: "interview",
    title: `${body.name} Scheduled`,
    description: `Round ${roundNumber} scheduled for ${when}.`,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: "interview.schedule",
    entity_type: "interview_round",
    entity_id: round.id,
    new_state: { round_number: roundNumber, name: body.name, scheduled_at: body.scheduledAt },
  });
  await notify(svc, {
    recipient_profile_id: (app.candidates as any)?.profile_id ?? null,
    title: "Interview scheduled",
    message: `${body.name} — ${when}`,
    type: "interview_scheduled",
    entity_type: "application",
    entity_id: app.id,
  });

  // Candidate invitation is sent synchronously (not the fire-and-forget
  // queueEmail helper other side effects use) so the response can honestly
  // report whether it actually reached them — scheduling the round and
  // notifying the candidate are reported as two separate outcomes.
  const candidateEmail: string | undefined = app.personal?.email;
  let emailStatus: "sent" | "failed" | "no_email" = "no_email";
  if (candidateEmail) {
    const functionsBase = Deno.env.get("SUPABASE_URL") ?? "";
    const responseLink = (action: string) => `${functionsBase}/functions/v1/interview-response?token=${round.response_token}&action=${action}`;
    const mail = render("interview_scheduled", {
      candidate_name: candidateName,
      job_title: jobTitle,
      round_name: body.name,
      day_of_month: String(scheduledDate.getDate()),
      month_short: scheduledDate.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
      year: String(scheduledDate.getFullYear()),
      weekday: scheduledDate.toLocaleDateString("en-IN", { weekday: "long" }),
      date: scheduledDate.toLocaleDateString("en-IN", { dateStyle: "long" }),
      time: scheduledDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      duration: body.durationMinutes ? `${body.durationMinutes} minutes` : "—",
      meeting_type: meetingType === "in_person" ? "In-Person" : "Virtual",
      platform_label: meetingType === "virtual" ? PLATFORM_LABEL[body.meetingPlatform] ?? "" : "",
      meeting_link: meetingType === "virtual" ? meetingUrl ?? "" : "",
      location: meetingType === "in_person" ? body.location ?? "" : "",
      location_details: meetingType === "in_person" ? body.locationDetails ?? "" : "",
      application_link: `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/candidate/application`,
      accept_link: responseLink("accept"),
      decline_link: responseLink("decline"),
      reschedule_link: responseLink("reschedule"),
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
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ emailId: emailRow?.id }),
      });
      emailStatus = res.ok ? "sent" : "failed";
    } catch {
      emailStatus = "failed";
    }
  }
  for (const p of body.panelists ?? []) {
    if (!p.email) continue;
    const mail = render("interview_scheduled_panelist", {
      panelist_name: p.name, candidate_name: candidateName, job_title: jobTitle, round_name: body.name, when, meeting_info: meetingInfo,
    });
    await queueEmail(svc, {
      recipient: p.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
      template: "interview_scheduled_panelist", entity_type: "interview_round", entity_id: round.id,
      sender_email: profile.email ?? null,
    });
  }

  return ok({ roundId: round.id, roundNumber, emailStatus, candidateEmail: candidateEmail ?? null, meetingUrl });
});
