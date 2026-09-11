// POST /functions/v1/record-interview-feedback
// Auth: the assigned TA (or admin), recording the panel's decision after the
// round happens. Remarks are mandatory regardless of decision — enforced here
// AND by a DB check constraint, never trusting the frontend alone.
//
// Body: { roundId, decision: 'advance'|'further_review'|'not_progressing', remarks, shareWithCandidate? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

const DECISIONS = ["advance", "further_review", "not_progressing"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can record interview feedback.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const decision = body.decision;
  const remarks = String(body.remarks ?? "").trim();
  const fields: Record<string, string> = {};
  if (!body.roundId) fields.roundId = "Missing interview round.";
  if (!DECISIONS.includes(decision)) fields.decision = "Choose Advance, Further Review or Not Moving Forward.";
  if (!remarks) fields.remarks = "Please provide interview remarks before submitting.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the feedback.", 422, fields);

  const svc = serviceClient();

  const { data: round } = await svc
    .from("interview_rounds")
    .select("id, name, round_number, status, application_id, applications(id, status, assigned_ta_id, personal, jobs(title), candidates(profile_id))")
    .eq("id", body.roundId)
    .maybeSingle();
  if (!round) return fail("NOT_FOUND", "Interview round not found.", 404);
  const app = round.applications as any;
  if (profile.role !== "admin" && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (round.status !== "scheduled") {
    return fail("INVALID_STATE", "Feedback has already been recorded for this round.", 409);
  }

  const { error: fbErr } = await svc.from("interview_feedback").insert({
    interview_round_id: round.id,
    decision,
    remarks,
    share_with_candidate: !!body.shareWithCandidate,
    submitted_by: profile.id,
  });
  if (fbErr) {
    if (String(fbErr.message).includes("duplicate")) return fail("DUPLICATE_FEEDBACK", "Feedback has already been recorded for this round.", 409);
    return fail("DB_ERROR", "Could not save the feedback.", 500);
  }
  await svc.from("interview_rounds").update({ status: "completed" }).eq("id", round.id);

  const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const jobTitle = app.jobs?.title ?? "the role";
  const DECISION_LABEL: Record<string, string> = { advance: "Advance", further_review: "Further Review", not_progressing: "Not Moving Forward" };

  await addEvent(svc, {
    application_id: app.id,
    type: "interview",
    title: `${round.name} — ${DECISION_LABEL[decision]}`,
    description: `Round ${round.round_number} result recorded: ${DECISION_LABEL[decision]}.`,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: "interview.feedback",
    entity_type: "interview_round",
    entity_id: round.id,
    new_state: { decision, remarks },
  });

  // --- application progression --------------------------------------
  let newAppStatus: string | null = null;
  if (decision === "not_progressing") {
    newAppStatus = "INTERVIEW_FAILED";
  } else if (decision === "advance") {
    const { data: openRounds } = await svc
      .from("interview_rounds")
      .select("id")
      .eq("application_id", app.id)
      .eq("status", "scheduled");
    if (!openRounds || openRounds.length === 0) newAppStatus = "INTERVIEW_PASSED";
  }
  if (newAppStatus) {
    await svc.from("applications").update({ status: newAppStatus }).eq("id", app.id);
    if (newAppStatus === "INTERVIEW_PASSED") {
      await addEvent(svc, {
        application_id: app.id, type: "interview", title: "All Required Rounds Cleared",
        description: "Ready to proceed to document verification.", actor_label: "System",
      });
    }
  }

  // --- candidate notification ----------------------------------------
  if (decision !== "further_review") {
    await notify(svc, {
      recipient_profile_id: app.candidates?.profile_id ?? null,
      title: decision === "advance" ? "Interview update — you've advanced" : "Interview update",
      message: decision === "advance" ? `You've cleared ${round.name}.` : `Update on your ${round.name} interview.`,
      type: "interview_outcome",
      entity_type: "application",
      entity_id: app.id,
    });
    if (app.personal?.email) {
      const mail = render(decision === "advance" ? "interview_advance" : "interview_not_progressing", {
        candidate_name: candidateName, job_title: jobTitle, round_name: round.name,
      });
      await queueEmail(svc, {
        recipient: app.personal.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: `interview_${decision === "advance" ? "advance" : "not_progressing"}`, entity_type: "application", entity_id: app.id,
      });
    }
  }

  return ok({ status: newAppStatus ?? app.status });
});
