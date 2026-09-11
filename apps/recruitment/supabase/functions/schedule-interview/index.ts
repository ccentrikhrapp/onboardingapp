// POST /functions/v1/schedule-interview
// Auth: the assigned TA (or admin). Creates a round, assigns the panel
// (upserting simple panelist records by email), emails the candidate and any
// panelists with an email on file, and advances the application status.
//
// Body: {
//   applicationId, name, description?, scheduledAt, durationMinutes?,
//   meetingUrl?, location?, instructions?,
//   panelists: [{ name, email?, department?, designation? }]
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can schedule interviews.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const fields: Record<string, string> = {};
  if (!body.applicationId) fields.applicationId = "Missing application.";
  if (!body.name?.trim()) fields.name = "Round name is required.";
  if (!body.scheduledAt) fields.scheduledAt = "Date and time are required.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the round details.", 422, fields);

  const svc = serviceClient();

  const { data: app } = await svc
    .from("applications")
    .select("id, status, assigned_ta_id, personal, application_code, jobs(title), candidates(profile_id)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (profile.role !== "admin" && app.assigned_ta_id !== profile.id) {
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

  const { data: round, error: roundErr } = await svc
    .from("interview_rounds")
    .insert({
      application_id: app.id,
      round_number: roundNumber,
      name: body.name.trim(),
      description: body.description ?? null,
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes ?? null,
      meeting_url: body.meetingUrl ?? null,
      location: body.location ?? null,
      instructions: body.instructions ?? null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (roundErr || !round) return fail("DB_ERROR", "Could not schedule the round.", 500);

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
  const when = new Date(body.scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const meetingInfo = body.meetingUrl || body.location || "";

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

  if (app.personal?.email) {
    const mail = render("interview_scheduled", {
      candidate_name: candidateName, job_title: jobTitle, round_name: body.name,
      when, meeting_info: meetingInfo, instructions: body.instructions ?? "",
      application_link: `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/candidate/application`,
    });
    await queueEmail(svc, {
      recipient: app.personal.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
      template: "interview_scheduled", entity_type: "application", entity_id: app.id,
    });
  }
  for (const p of body.panelists ?? []) {
    if (!p.email) continue;
    const mail = render("interview_scheduled_panelist", {
      panelist_name: p.name, candidate_name: candidateName, job_title: jobTitle, round_name: body.name, when, meeting_info: meetingInfo,
    });
    await queueEmail(svc, {
      recipient: p.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
      template: "interview_scheduled_panelist", entity_type: "interview_round", entity_id: round.id,
    });
  }

  return ok({ roundId: round.id, roundNumber });
});
