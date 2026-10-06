// POST /functions/v1/resend-interview-invitation
// Auth: the assigned TA (or admin). Re-renders and re-sends the exact same
// "interview scheduled" email for a round that's already been created —
// used when the original send failed, or the TA just wants to resend it.
// Waits for actual delivery and reports real success/failure, same as
// schedule-interview's candidate email.
//
// Body: { roundId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { render } from "../_shared/emailTemplates.ts";

const PLATFORM_LABEL: Record<string, string> = { teams: "Microsoft Teams", google_meet: "Google Meet" };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can resend an invitation.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.roundId) return fail("VALIDATION_ERROR", "Missing interview round.", 422, { roundId: "Missing interview round." });

  const svc = serviceClient();
  const { data: round } = await svc
    .from("interview_rounds")
    .select(
      "id, name, scheduled_at, duration_minutes, meeting_type, meeting_platform, meeting_url, location, location_details, response_token, " +
        "application_id, applications(id, assigned_ta_id, personal, jobs(title))",
    )
    .eq("id", body.roundId)
    .maybeSingle();
  if (!round) return fail("NOT_FOUND", "Interview round not found.", 404);
  const app = round.applications as any;
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  const candidateEmail: string | undefined = app.personal?.email;
  if (!candidateEmail) return fail("NO_EMAIL", "This candidate has no email on file.", 422);

  const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const scheduledDate = new Date(round.scheduled_at);
  const functionsBase = Deno.env.get("SUPABASE_URL") ?? "";
  const responseLink = (action: string) => `${functionsBase}/functions/v1/interview-response?token=${round.response_token}&action=${action}`;
  const mail = render("interview_scheduled", {
    candidate_name: candidateName,
    job_title: app.jobs?.title ?? "the role",
    round_name: round.name,
    day_of_month: String(scheduledDate.getDate()),
    month_short: scheduledDate.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
    year: String(scheduledDate.getFullYear()),
    weekday: scheduledDate.toLocaleDateString("en-IN", { weekday: "long" }),
    date: scheduledDate.toLocaleDateString("en-IN", { dateStyle: "long" }),
    time: scheduledDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    duration: round.duration_minutes ? `${round.duration_minutes} minutes` : "—",
    meeting_type: round.meeting_type === "in_person" ? "In-Person" : "Virtual",
    platform_label: round.meeting_platform ? PLATFORM_LABEL[round.meeting_platform] : "",
    meeting_link: round.meeting_url ?? "",
    location: round.location ?? "",
    location_details: round.location_details ?? "",
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

  let emailStatus: "sent" | "failed" = "failed";
  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ emailId: emailRow?.id }),
    });
    if (res.ok) emailStatus = "sent";
  } catch {
    /* emailStatus stays "failed" */
  }

  return ok({ emailStatus, candidateEmail });
});
