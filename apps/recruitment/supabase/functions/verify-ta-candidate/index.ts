// POST /functions/v1/verify-ta-candidate
// Auth: the candidate themselves (arrived via the magic link from
// create-ta-candidate / resend-ta-candidate-verification).
//
// Transitions their TA-created DRAFT application to SUBMITTED — from this
// point on it is indistinguishable from a self-applied application: same
// status enum, same ATS scoring, same notifications, same TA pipeline (Part
// 14 — "do NOT create a separate ATS"). Only the personal/professional/
// education/additional fields are patchable here (email changes go through
// Supabase's own auth flow, not this endpoint — see the class comment on
// why that's deliberately out of scope for this pass).
//
// Body: { applicationId, personal?, professional?, education?, additional? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { addEvent, notify, queueEmail } from "../_shared/workflow.ts";
import { audit, currentProfile, isStaffRole, serviceClient } from "../_shared/supabase.ts";
import { render } from "../_shared/emailTemplates.ts";
import { extractResumeText } from "../_shared/resumeText.ts";
import { computeAtsScore } from "../_shared/ats.ts";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[+]?[\d\s()-]{8,}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("UNAUTHENTICATED", "Please sign in.", 401);
  // Defense-in-depth: a Talent Acquisition / admin session is never a
  // candidate — see submit-application for the full reasoning.
  if (isStaffRole(profile.role)) return fail("FORBIDDEN", "This account can't verify a candidate application.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.applicationId) return fail("VALIDATION_ERROR", "Missing application.", 422);

  const svc = serviceClient();
  const { data: app } = await svc
    .from("applications")
    .select("id, status, source, job_id, personal, professional, education, additional, resume_path, candidates(id, profile_id), jobs(id, title, status, experience, description, responsibilities, required_skills, preferred_skills, qualifications)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if ((app.candidates as any)?.profile_id !== profile.id) return fail("FORBIDDEN", "This is not your application.", 403);
  if (app.status !== "DRAFT" || app.source !== "ta_sourced") {
    return fail("INVALID_STATE", "This application has already been verified.", 409);
  }

  const personal = { ...app.personal, ...(body.personal ?? {}) };
  const fields: Record<string, string> = {};
  if (!personal.firstName?.trim()) fields.firstName = "First name is required.";
  if (!personal.lastName?.trim()) fields.lastName = "Last name is required.";
  if (!personal.email?.trim()) fields.email = "Email is required.";
  else if (!emailRe.test(personal.email)) fields.email = "Enter a valid email address.";
  if (!personal.mobile?.trim()) fields.mobile = "Phone number is required.";
  else if (!phoneRe.test(personal.mobile)) fields.mobile = "Enter a valid phone number.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the required fields.", 422, fields);

  const professional = { ...app.professional, ...(body.professional ?? {}) };
  const education = body.education ?? app.education;
  const additional = { ...app.additional, ...(body.additional ?? {}) };

  const job = app.jobs as any;

  let atsScore = null;
  if (job && app.resume_path) {
    try {
      const objectPath = app.resume_path.replace(/^resumes\//, "");
      const { data: resumeFile } = await svc.storage.from("resumes").download(objectPath);
      const resumeText = resumeFile ? await extractResumeText(new Uint8Array(await resumeFile.arrayBuffer()), objectPath) : "";
      atsScore = computeAtsScore({ job, professional, education, resumeText });
    } catch {
      atsScore = null;
    }
  }

  const { error: upErr } = await svc
    .from("applications")
    .update({
      personal, professional, education, additional,
      status: "SUBMITTED",
      submitted_at: new Date().toISOString(), current_version: 2,
      ats_score: atsScore,
    })
    .eq("id", app.id);
  if (upErr) return fail("DB_ERROR", "Could not submit your application. Please try again.", 500);

  await svc.from("application_versions").insert({
    application_id: app.id, version: 2,
    payload: { personal, professional, education, additional, resume_path: app.resume_path },
  });

  const candidateName = `${personal.firstName} ${personal.lastName}`.trim();
  const jobTitle = job?.title ?? "General Application";

  await addEvent(svc, {
    application_id: app.id, type: "application", title: "Candidate Verified Application",
    description: `${candidateName} reviewed and verified the application.`,
    actor_profile_id: profile.id, actor_label: candidateName,
  });
  await addEvent(svc, {
    application_id: app.id, type: "application", title: "ATS Screening Completed",
    description: atsScore ? `ATS match: ${atsScore.overall}% (${atsScore.recommendation}).` : "No job selected — ATS screening skipped.",
    actor_label: "System",
  });
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: candidateName, action: "candidate.verify_submit",
    entity_type: "application", entity_id: app.id, new_state: { status: "SUBMITTED" },
  });

  await notify(svc, {
    recipient_profile_id: null,
    recipient_role: "admin", // TA assignment for ta_sourced candidates isn't guaranteed yet — Super Admin routes it, same as an unassigned careers application
    title: "Candidate verified their application",
    message: atsScore
      ? `${candidateName} verified and submitted the application for ${jobTitle} — ATS match ${atsScore.overall}%.`
      : `${candidateName} verified and submitted the application for ${jobTitle}.`,
    type: "candidate_verified",
    entity_type: "application",
    entity_id: app.id,
  });

  const mail = render("application_submitted", {
    candidate_name: candidateName, job_title: jobTitle,
    application_code: (await svc.from("applications").select("application_code").eq("id", app.id).single()).data?.application_code ?? "",
    application_link: `${Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173"}/candidate/application`,
  });
  await queueEmail(svc, {
    recipient: personal.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
    template: "application_submitted", entity_type: "application", entity_id: app.id,
  });

  return ok({ status: "SUBMITTED" });
});
