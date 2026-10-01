// POST /functions/v1/move-pipeline-candidate
// Auth: ta / admin_ta / admin (a TA only for pipeline candidates they own).
//
// Converts a Pipeline Candidate into a Job Candidate for a chosen job, through
// the SAME creation path a TA-added candidate already uses (create-ta-candidate:
// one candidate record per person, DRAFT application awaiting the candidate's
// verification link) — this function only adds the pipeline-specific parts:
// ownership check, "already associated with this job" detection, and writing
// the conversion history back onto the pipeline record + its timeline.
//
// Body: { pipelineCandidateId, jobId, hiringLocation? }
// Returns: { moved: true, applicationId, applicationCode, candidateCode }
//       or { alreadyAssociated: true, applicationId }   (nothing was created)

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const digits10 = (p: string) => String(p ?? "").replace(/\D/g, "").slice(-10);

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin_ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can move a pipeline candidate.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.pipelineCandidateId) return fail("VALIDATION_ERROR", "Missing pipeline candidate.", 422);
  if (!body.jobId) return fail("VALIDATION_ERROR", "Select the job to move this candidate to.", 422, { jobId: "Select a job." });

  const svc = serviceClient();
  const { data: pc } = await svc.from("pipeline_candidates").select("*").eq("id", body.pipelineCandidateId).maybeSingle();
  if (!pc) return fail("NOT_FOUND", "Pipeline candidate not found.", 404);
  if (profile.role === "ta" && pc.created_by !== profile.id) {
    return fail("FORBIDDEN", "This pipeline candidate belongs to another recruiter.", 403);
  }
  if (pc.status === "archived") return fail("INVALID_STATE", "Restore this candidate before moving them to a job.", 409);

  const { data: job } = await svc.from("jobs").select("id, title, status").eq("id", body.jobId).maybeSingle();
  if (!job) return fail("JOB_NOT_FOUND", "That job could not be found.", 404);
  if (job.status !== "published") return fail("JOB_NOT_ACTIVE", "Only active jobs can receive candidates.", 409);

  // --- already associated with THIS job? (by email, then by phone) -------
  const email = String(pc.email).trim().toLowerCase();
  const { data: byEmail } = await svc.from("candidates").select("id, phone").ilike("email", email);
  const { data: allPhones } = await svc.from("candidates").select("id, phone").not("phone", "is", null);
  const matchedIds = new Set<string>((byEmail ?? []).map((c) => c.id));
  const want = digits10(pc.phone);
  if (want.length === 10) for (const c of allPhones ?? []) if (digits10(c.phone) === want) matchedIds.add(c.id);

  // Same phone under a different email = the same person; a second candidate
  // record would be a duplicate, so point the TA at the existing one instead.
  if (!(byEmail ?? []).length && matchedIds.size) {
    const { data: theirApp } = await svc.from("applications").select("id").in("candidate_id", [...matchedIds]).limit(1).maybeSingle();
    return fail("DUPLICATE_CANDIDATE", "A candidate with this phone number already exists under a different email. Open that Job Candidate instead.", 409, theirApp ? { applicationId: theirApp.id } : {});
  }

  if (matchedIds.size) {
    const { data: existing } = await svc
      .from("applications")
      .select("id, application_code")
      .eq("job_id", job.id)
      .in("candidate_id", [...matchedIds])
      .maybeSingle();
    if (existing) {
      return ok({ alreadyAssociated: true, applicationId: existing.id, applicationCode: existing.application_code });
    }
  }

  // --- create through the existing TA-created-candidate path -------------
  const parts = String(pc.name).trim().split(/\s+/);
  const firstName = parts.slice(0, -1).join(" ") || parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  if (!lastName) return fail("VALIDATION_ERROR", "Add the candidate's last name before moving them to a job.", 422);

  const hiringLocation = String(body.hiringLocation ?? pc.hiring_location ?? "").trim() || pc.hiring_location;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-ta-candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({
      jobId: job.id,
      candidateSource: "TA Sourced",
      skipResume: true,
      createdVia: "pipeline",
      duplicateAction: matchedIds.size ? "use_existing" : undefined,
      personal: {
        firstName, lastName, email, mobile: pc.phone, currentLocation: pc.current_location,
        preferredLocation: hiringLocation, middleName: "", dob: "", gender: "", nationality: "",
        address: { line1: "", line2: "", city: pc.current_location, state: "", country: "India", postalCode: "" },
      },
      professional: {
        currentJobTitle: pc.position, currentCompany: pc.organisation,
        totalExperience: String(pc.total_exp), relevantExperience: String(pc.relevant_exp),
        employmentStatus: "Employed", currentCTC: String(pc.current_ctc), expectedCTC: String(pc.expected_ctc),
        noticePeriod: `${pc.notice_days} days`, preferredJobLocation: hiringLocation,
        skills: [], certifications: [], languages: [],
      },
      education: [],
      additional: { pipelineCandidateId: pc.id, pipelineCode: pc.pipeline_code, offerInHand: pc.offer_in_hand },
    }),
  });
  const created = await res.json().catch(() => ({}));
  if (!res.ok || !created?.success) {
    const err = created?.error;
    return fail(err?.code ?? "MOVE_FAILED", err?.message ?? "Could not move this candidate.", res.status || 500, err?.fields ?? {});
  }
  const d = created.data;
  if (d?.duplicate) {
    // A different candidate record matched only by email and already has other applications:
    // we asked for use_existing above, so this should not happen — surface it rather than guess.
    return fail("DUPLICATE_CANDIDATE", "This candidate already exists — open their record instead.", 409);
  }

  const now = new Date().toISOString();
  await svc.from("pipeline_candidates").update({
    status: "moved", moved_job_id: job.id, moved_application_id: d.applicationId,
    moved_by: profile.id, moved_at: now, updated_by: profile.id,
  }).eq("id", pc.id);
  await svc.from("pipeline_activities").insert({
    pipeline_candidate_id: pc.id, type: "Status Update", created_by: profile.id,
    note: `Moved to Job Candidate — ${job.title} (${d.applicationCode}).`,
  });
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: profile.full_name, action: "pipeline.move_to_job",
    entity_type: "pipeline_candidate", entity_id: pc.id,
    new_state: { job_id: job.id, application_id: d.applicationId },
  });

  return ok({ moved: true, applicationId: d.applicationId, applicationCode: d.applicationCode, candidateCode: d.candidateCode });
});
