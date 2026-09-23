// POST /functions/v1/submit-application
// Auth: candidate. Creates the application and everything that must happen with
// it — atomically enough that we never leave a half-built application: the row
// and its v1 snapshot go in first, then best-effort side effects.
//
// Body: {
//   jobId?, linkToken?, source?,
//   personal, professional, education, additional, autofilled,
//   resumePath, resumeMeta,
//   documents?: [{ requirementId, requirementKey, path, fileName, mimeType,
//                   sizeBytes, cannotProvide, reason }]
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, isStaffRole, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";
import { extractResumeText } from "../_shared/resumeText.ts";
import { computeAtsScore } from "../_shared/ats.ts";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Kept in sync by hand with src/utils/validation.js's PHONE_DIGITS_RE/NAME_RE —
// Deno edge functions can't import from src/, so this is the one other place
// these rules live. Frontend validation alone isn't enough since this
// endpoint is reachable directly (curl, a modified client, etc).
const phoneRe = /^(?:\+?91[\s-]?|0)?([6-9]\d{9})$/;
const nameRe = /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)*$/;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("UNAUTHENTICATED", "Please sign in to apply.", 401);
  // A Talent Acquisition / admin session is never a candidate — see isStaffRole.
  // The frontend can no longer send a staff JWT here at all (separate sessions
  // per portal), but a direct call still must not be able to turn a staff
  // account into a candidate record.
  if (isStaffRole(profile.role)) return fail("FORBIDDEN", "This account can't submit a candidate application.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed request body.", 400);
  }

  const personal = body.personal ?? {};
  const fields: Record<string, string> = {};
  if (!personal.firstName?.trim()) fields.firstName = "First name is required.";
  else if (personal.firstName.trim().length > 60 || !nameRe.test(personal.firstName.trim())) {
    fields.firstName = "Enter a valid first name.";
  }
  if (!personal.lastName?.trim()) fields.lastName = "Last name is required.";
  else if (personal.lastName.trim().length > 60 || !nameRe.test(personal.lastName.trim())) {
    fields.lastName = "Enter a valid last name.";
  }
  if (!personal.email?.trim()) fields.email = "Email is required.";
  else if (!emailRe.test(personal.email)) fields.email = "Enter a valid email address.";
  // profile.email is '' for the anonymous session most candidates apply
  // under (handle_new_user() coalesces a null auth email to '') — nothing
  // to compare against yet, so only enforce the match once a real signed-in
  // email exists and differs from what was typed into the form.
  else if (profile.email && profile.email.trim().toLowerCase() !== personal.email.trim().toLowerCase()) {
    fields.email = "This must match the email address you signed in with.";
  }
  if (!personal.mobile?.trim()) fields.mobile = "Phone number is required.";
  else if (!phoneRe.test(personal.mobile)) fields.mobile = "Enter a valid phone number.";
  if (!body.resumePath) fields.resume = "A resume is required.";
  if (Object.keys(fields).length) {
    return fail("VALIDATION_ERROR", "Please complete the required fields.", 422, fields);
  }

  const svc = serviceClient();

  // --- adopt an anonymously-uploaded resume into the candidate's own folder --
  // The candidate could have picked/parsed their resume before ever signing
  // in (resumes/pending-anon/{draftId}/...) — now that we know who they are,
  // move it into their real, permanent folder. Falls back to leaving the
  // path as-is if the move fails, rather than blocking submission over it.
  let resumePath: string | null = body.resumePath ?? null;
  if (resumePath && resumePath.startsWith("resumes/pending-anon/")) {
    const oldObjectPath = resumePath.replace(/^resumes\//, "");
    const fileName = oldObjectPath.split("/").pop();
    const newObjectPath = `${profile.id}/${fileName}`;
    const { error: moveErr } = await svc.storage.from("resumes").move(oldObjectPath, newObjectPath);
    if (!moveErr) resumePath = `resumes/${newObjectPath}`;
  }

  // --- candidate record ---------------------------------------------------
  const { data: candidate, error: candErr } = await svc
    .from("candidates")
    .upsert(
      {
        profile_id: profile.id,
        first_name: personal.firstName,
        last_name: personal.lastName,
        email: personal.email,
        phone: personal.mobile,
        current_location: personal.currentLocation ?? null,
        linkedin_url: body.additional?.linkedin ?? null,
        portfolio_url: body.additional?.portfolio ?? null,
      },
      { onConflict: "profile_id" },
    )
    .select("id")
    .single();
  if (candErr || !candidate) {
    return fail("DB_ERROR", "Could not save your candidate profile.", 500);
  }

  // --- resolve job / link ------------------------------------------------
  let jobId: string | null = null;
  let assignedTaId: string | null = null;
  let applicationLinkId: string | null = null;
  let source: "careers" | "ta_link" = "careers";

  if (body.linkToken) {
    const { data: link } = await svc
      .from("application_links")
      .select("id, active, expires_at, job_id, ta_id")
      .eq("token", String(body.linkToken).trim())
      .maybeSingle();
    if (!link || !link.active) return fail("LINK_INVALID", "This application link is no longer active.", 410);
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return fail("LINK_EXPIRED", "This application link has expired.", 410);
    }
    jobId = link.job_id;
    assignedTaId = link.ta_id; // server-side attribution — candidate cannot set this
    applicationLinkId = link.id;
    source = "ta_link";
  } else if (body.jobId) {
    jobId = body.jobId;
  }

  let job: Record<string, any> | null = null;
  if (jobId) {
    const { data: jobRow } = await svc
      .from("jobs")
      .select("id, title, status, deadline, application_limit, experience, description, responsibilities, required_skills, preferred_skills, qualifications")
      .eq("id", jobId)
      .maybeSingle();
    if (!jobRow) return fail("JOB_NOT_FOUND", "That role could not be found.", 404);
    // Deadline check runs even if the nightly close_expired_jobs cron hasn't
    // flipped the status to 'closed' yet (e.g. applying on the deadline's
    // final hours in a different timezone than the cron's midnight UTC).
    const pastDeadline = jobRow.deadline && new Date(jobRow.deadline) < new Date(new Date().toDateString());
    if (jobRow.status !== "published" || pastDeadline) {
      return fail("JOB_CLOSED", "This role is no longer accepting applications.", 410);
    }
    if (jobRow.application_limit != null) {
      // Enforced here, not just hidden in the UI — a direct API call must not
      // be able to bypass the limit once it's reached.
      const { count } = await svc
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .neq("status", "DRAFT");
      if ((count ?? 0) >= jobRow.application_limit) {
        return fail("APPLICATION_LIMIT_REACHED", "This role has reached its application limit and is no longer accepting applications.", 410);
      }
    }
    job = jobRow;
  }

  // --- duplicate guard --------------------------------------------------
  if (jobId) {
    const { data: existing } = await svc
      .from("applications")
      .select("id, status")
      .eq("candidate_id", candidate.id)
      .eq("job_id", jobId)
      .neq("status", "DRAFT")
      .maybeSingle();
    if (existing) {
      return fail("DUPLICATE_APPLICATION", "You have already applied for this role.", 409);
    }
  }

  // --- application-stage document requirements ---------------------------
  const { data: requirements } = await svc
    .from("document_requirements")
    .select("*")
    .eq("stage", "application")
    .eq("active", true);

  const submittedDocs: Record<string, any> = {};
  for (const d of body.documents ?? []) {
    if (d.requirementId) submittedDocs[d.requirementId] = d;
  }

  const docFields: Record<string, string> = {};
  for (const r of requirements ?? []) {
    if (r.requirement_class === "conditional") continue; // opt-in only
    const entry = submittedDocs[r.id];
    const key = `doc_${r.key}`;
    if (!entry) {
      docFields[key] = `${r.name} is required.`;
      continue;
    }
    if (entry.cannotProvide) {
      if (!r.can_mark_cannot_provide) {
        docFields[key] = `${r.name} cannot be skipped — please upload it.`;
      } else if (r.reason_required && !String(entry.reason ?? "").trim()) {
        docFields[key] = `Please explain why you can't provide ${r.name}.`;
      }
    } else if (!entry.path) {
      docFields[key] = `${r.name} is required.`;
    }
  }
  if (Object.keys(docFields).length) {
    return fail("VALIDATION_ERROR", "Please complete the required documents.", 422, docFields);
  }

  // --- ATS score (best effort — never blocks submission) -----------------
  // Only meaningful against a specific job; a general application has no JD
  // to score against. Re-downloads and re-reads the resume rather than
  // trusting the client, same as parse-resume already does.
  let atsScore = null;
  if (job) {
    try {
      const objectPath = (resumePath || "").replace(/^resumes\//, "");
      const { data: resumeFile } = await svc.storage.from("resumes").download(objectPath);
      const resumeText = resumeFile ? await extractResumeText(new Uint8Array(await resumeFile.arrayBuffer()), objectPath) : "";
      atsScore = computeAtsScore({
        job: job as any,
        professional: body.professional ?? {},
        education: body.education ?? [],
        resumeText,
      });
    } catch (_e) {
      atsScore = null; // scoring is a nice-to-have for TA, not a submission gate
    }
  }

  // --- create the application -----------------------------------------
  const payload = {
    personal,
    professional: body.professional ?? {},
    education: body.education ?? [],
    additional: body.additional ?? {},
    autofilled: body.autofilled ?? [],
    resume_path: resumePath,
    resume_meta: body.resumeMeta ?? null,
  };

  const { data: application, error: appErr } = await svc
    .from("applications")
    .insert({
      candidate_id: candidate.id,
      job_id: jobId,
      application_link_id: applicationLinkId,
      assigned_ta_id: assignedTaId,
      source,
      status: "SUBMITTED",
      current_version: 1,
      submitted_at: new Date().toISOString(),
      ats_score: atsScore,
      ...payload,
    })
    .select("id, application_code, job_id")
    .single();
  if (appErr || !application) {
    return fail("DB_ERROR", "Could not submit your application. Please try again.", 500);
  }

  await svc.from("application_versions").insert({
    application_id: application.id,
    version: 1,
    payload,
  });

  // --- adopt uploaded/waived documents into the real application ---------
  for (const r of requirements ?? []) {
    const entry = submittedDocs[r.id];
    if (!entry) continue;

    if (entry.cannotProvide) {
      await svc.from("application_documents").insert({
        application_id: application.id,
        requirement_id: r.id,
        status: "cannot_provide",
        cannot_provide_reason: entry.reason ?? null,
      });
      continue;
    }

    if (!entry.path) continue;
    const oldObjectPath = String(entry.path).replace(/^documents\//, "");
    const newObjectPath = `${application.id}/${r.key}/${entry.fileName}`;
    const { error: moveErr } = await svc.storage.from("documents").move(oldObjectPath, newObjectPath);

    const { data: appDoc } = await svc
      .from("application_documents")
      .insert({ application_id: application.id, requirement_id: r.id, status: "uploaded" })
      .select("id")
      .single();
    if (appDoc) {
      await svc.from("document_files").insert({
        application_document_id: appDoc.id,
        storage_path: `documents/${moveErr ? oldObjectPath : newObjectPath}`,
        file_name: entry.fileName,
        mime_type: entry.mimeType ?? null,
        size_bytes: entry.sizeBytes ?? null,
        version: 1,
        is_current: true,
        uploaded_by: profile.id,
      });
    }
  }

  // --- side effects (best effort) ------------------------------------
  const jobTitle = job?.title ?? "General Application";
  const candidateName = `${personal.firstName} ${personal.lastName}`.trim();
  const appLink = siteUrl("/candidate/application");

  await addEvent(svc, {
    application_id: application.id,
    type: "application",
    title: "Application Submitted",
    description: `Candidate applied for ${jobTitle}.`,
    actor_profile_id: profile.id,
    actor_label: candidateName,
  });

  await notify(svc, {
    recipient_profile_id: assignedTaId,
    // Unassigned (direct Careers) applications go to Super TA (admin), not a
    // blind broadcast to every TA — regular TAs can't read an application
    // that isn't assigned to them anyway (RLS), so a role-wide "ta" notify
    // would be a dead link for them. See master prompt §33.
    recipient_role: assignedTaId ? null : "admin",
    title: assignedTaId ? "New application received" : "New unassigned application",
    message: atsScore
      ? `${candidateName} applied for ${jobTitle} — ATS match ${atsScore.overall}%.`
      : `${candidateName} applied for ${jobTitle}.`,
    type: "application_submitted",
    entity_type: "application",
    entity_id: application.id,
  });

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: candidateName,
    action: "application.submit",
    entity_type: "application",
    entity_id: application.id,
    new_state: { status: "SUBMITTED", source },
  });

  const mail = render("application_submitted", {
    candidate_name: candidateName,
    job_title: jobTitle,
    application_code: application.application_code,
    application_link: appLink,
  });
  await queueEmail(svc, {
    recipient: personal.email,
    subject: mail.subject,
    body_html: mail.html,
    body_text: mail.text,
    template: "application_submitted",
    entity_type: "application",
    entity_id: application.id,
  });

  return ok({
    applicationId: application.id,
    applicationCode: application.application_code,
    status: "SUBMITTED",
  });
});
