// POST /functions/v1/create-ta-candidate
// Auth: ta / admin_ta / admin — available to every TA tier (master prompt
// Part 2), unlike TA user management which stays Super-Admin-only.
//
// Lets a TA create an application on behalf of a sourced/referred candidate
// from an uploaded resume, without inventing a parallel account system:
//   - The application is inserted with status DRAFT and source 'ta_sourced'
//     — DRAFT already means "started, not submitted" and, in practice, is
//     never used by the existing self-apply flow (submit-application always
//     inserts straight to SUBMITTED), so this can't collide with anything.
//   - The candidate's sign-in is a real Supabase Auth magic link
//     (auth.admin.generateLink), not a bespoke token table — the same
//     handle_new_user trigger that provisions every other account runs here
//     too, so the resulting profile/candidate rows are indistinguishable
//     from a self-applied candidate's once they verify.
//
// Body: {
//   jobId?, candidateSource ('TA Sourced'|'Referral'|'Agency'|'Internal Referral'|'Other'),
//   personal: { firstName, lastName, email, mobile, currentLocation },
//   professional?: { currentJobTitle, currentCompany, totalExperience, skills },
//   education?: [...],
//   resumePath, resumeMeta,
//   duplicateAction?: 'use_existing' | 'create_new'   // set after the caller
//     already saw a DUPLICATE_CANDIDATE response and chose how to proceed
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[+]?[\d\s()-]{8,}$/;
const nameRe = /^[A-Za-z][A-Za-z .'-]{0,59}$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin_ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can create a candidate.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const personal = body.personal ?? {};
  const fields: Record<string, string> = {};
  if (!personal.firstName?.trim()) fields.firstName = "First name is required.";
  else if (!nameRe.test(personal.firstName.trim())) fields.firstName = "Enter a valid first name.";
  if (!personal.lastName?.trim()) fields.lastName = "Last name is required.";
  else if (!nameRe.test(personal.lastName.trim())) fields.lastName = "Enter a valid last name.";
  if (!personal.email?.trim() || !emailRe.test(personal.email)) fields.email = "A valid candidate email is required.";
  if (personal.mobile?.trim() && !phoneRe.test(personal.mobile.trim())) fields.mobile = "Enter a valid phone number.";
  if (!body.resumePath) fields.resume = "A resume is required.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the required fields.", 422, fields);

  const email = String(personal.email).trim().toLowerCase();
  const svc = serviceClient();

  // --- job (optional) -----------------------------------------------
  let jobId: string | null = null;
  if (body.jobId) {
    const { data: job } = await svc.from("jobs").select("id, status").eq("id", body.jobId).maybeSingle();
    if (!job) return fail("JOB_NOT_FOUND", "That role could not be found.", 404);
    jobId = job.id;
  }

  // --- duplicate check (Part 18) --------------------------------------
  const { data: existingCandidate } = await svc
    .from("candidates")
    .select("id, profile_id, first_name, last_name, email")
    .ilike("email", email)
    .maybeSingle();

  if (existingCandidate && !body.duplicateAction) {
    const { data: existingApps } = await svc
      .from("applications")
      .select("id, application_code, status, job_id, jobs(title)")
      .eq("candidate_id", existingCandidate.id);
    return ok({
      duplicate: true,
      existingCandidate: { id: existingCandidate.id, name: `${existingCandidate.first_name ?? ""} ${existingCandidate.last_name ?? ""}`.trim(), email: existingCandidate.email },
      existingApplications: (existingApps ?? []).map((a) => ({ id: a.id, code: a.application_code, status: a.status, jobTitle: (a.jobs as any)?.title ?? "General Application" })),
    });
  }

  if (existingCandidate && jobId) {
    const { data: dupeApp } = await svc
      .from("applications")
      .select("id")
      .eq("candidate_id", existingCandidate.id)
      .eq("job_id", jobId)
      .neq("status", "DRAFT")
      .maybeSingle();
    if (dupeApp) return fail("DUPLICATE_APPLICATION", "This candidate has already applied for this role.", 409);
  }

  // --- resolve/claim the candidate's auth identity ----------------------
  // Never attempt to create a second auth account for an email that's
  // already registered — Supabase rejects that outright (one account per
  // email), so "continue as new candidate" was never actually possible once
  // a match was found by email; always reuse the existing account here.
  let profileId: string;
  if (existingCandidate) {
    profileId = existingCandidate.profile_id;
  } else {
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: `${personal.firstName} ${personal.lastName}`.trim() },
    });
    if (createErr || !created?.user) {
      return fail("USER_CREATE_FAILED", createErr?.message ?? "Could not create the candidate's account.", 500);
    }
    profileId = created.user.id;
  }

  // --- candidate record -------------------------------------------------
  const { data: candidate, error: candErr } = await svc
    .from("candidates")
    .upsert(
      {
        profile_id: profileId,
        first_name: personal.firstName,
        last_name: personal.lastName,
        email,
        phone: personal.mobile ?? null,
        current_location: personal.currentLocation ?? null,
      },
      { onConflict: "profile_id" },
    )
    .select("id")
    .single();
  if (candErr || !candidate) return fail("DB_ERROR", "Could not save the candidate profile.", 500);

  // --- adopt the resume the TA uploaded (in their own folder) into the --
  // candidate's folder, same move pattern submit-application already uses
  // for anonymous uploads.
  let resumePath: string = body.resumePath;
  if (resumePath && !resumePath.startsWith(`resumes/${profileId}/`)) {
    const oldObjectPath = resumePath.replace(/^resumes\//, "");
    const fileName = oldObjectPath.split("/").pop();
    const newObjectPath = `${profileId}/${fileName}`;
    const { error: moveErr } = await svc.storage.from("resumes").move(oldObjectPath, newObjectPath);
    if (!moveErr) resumePath = `resumes/${newObjectPath}`;
  }

  // --- application (DRAFT — awaiting candidate verification) ------------
  const payload = {
    personal: { ...personal, email },
    professional: body.professional ?? {},
    education: body.education ?? [],
    additional: { candidateSource: body.candidateSource ?? "TA Sourced", createdByTa: profile.full_name ?? "Talent Acquisition" },
    resume_path: resumePath,
    resume_meta: body.resumeMeta ?? null,
  };
  const { data: application, error: appErr } = await svc
    .from("applications")
    .insert({
      candidate_id: candidate.id,
      job_id: jobId,
      assigned_ta_id: profile.role === "ta" ? profile.id : null,
      source: "ta_sourced",
      status: "DRAFT",
      current_version: 1,
      ...payload,
    })
    .select("id, application_code")
    .single();
  if (appErr || !application) return fail("DB_ERROR", "Could not create the application.", 500);

  await svc.from("application_versions").insert({ application_id: application.id, version: 1, payload });

  const candidateName = `${personal.firstName} ${personal.lastName}`.trim();
  await addEvent(svc, {
    application_id: application.id, type: "creation", title: "Candidate Created by TA",
    description: `${profile.full_name ?? "A recruiter"} created this candidate from an uploaded resume.`,
    actor_profile_id: profile.id, actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: profile.full_name, action: "candidate.ta_create",
    entity_type: "application", entity_id: application.id, new_state: { candidate_id: candidate.id, email },
  });

  // --- verification link (real Supabase magic link, not a bespoke token) -
  const redirectTo = siteUrl("/candidate/application");
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "magiclink", email, options: { redirectTo },
  });

  let emailStatus: "sent" | "failed" | "no_link" = "no_link";
  if (!linkErr && linkData?.properties?.action_link) {
    const mail = render("ta_candidate_verification", {
      candidate_name: candidateName,
      verify_link: linkData.properties.action_link,
    });
    const { data: emailRow } = await svc
      .from("emails")
      .insert({
        recipient: email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "ta_candidate_verification", entity_type: "application", entity_id: application.id, status: "queued",
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

  if (emailStatus === "sent") {
    await addEvent(svc, {
      application_id: application.id, type: "creation", title: "Verification Link Sent",
      description: `A verification email was sent to ${email}.`, actor_label: "System",
    });
  }

  return ok({
    applicationId: application.id,
    applicationCode: application.application_code,
    candidateId: candidate.id,
    candidateEmail: email,
    emailStatus,
  });
});
