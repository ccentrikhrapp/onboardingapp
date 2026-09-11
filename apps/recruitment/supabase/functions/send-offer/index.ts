// POST /functions/v1/send-offer
// Auth: the assigned TA (or admin). Re-checks offer eligibility itself —
// never trusts that the frontend button was actually disabled
// (docs/requirements/01-*.md §12, 03-*.md §6). Application must also have
// cleared interviews; DOC_VERIFICATION/DOCS_VERIFIED are the only valid
// source statuses.
//
// Body: {
//   applicationId, subject, body, offerLetterPath?,
//   department?, designation?, employmentType?, location?, joiningDate?
// }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can send an offer.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const fields: Record<string, string> = {};
  if (!body.applicationId) fields.applicationId = "Missing application.";
  if (!body.subject?.trim()) fields.subject = "Subject is required.";
  if (!body.body?.trim()) fields.body = "Message body is required.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the offer email.", 422, fields);

  const svc = serviceClient();

  const { data: app } = await svc
    .from("applications")
    .select("id, status, assigned_ta_id, application_code, personal, jobs(title), candidates(profile_id, first_name, last_name, email)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (profile.role !== "admin" && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (!["DOC_VERIFICATION", "DOCS_VERIFIED"].includes(app.status)) {
    return fail("INVALID_STATE", "This application isn't ready for an offer yet.", 409);
  }

  const { data: eligibility } = await svc.rpc("offer_eligibility", { app_id: app.id });
  if (eligibility !== "READY_FOR_OFFER") {
    const { data: reasons } = await svc.rpc("offer_blocking_reasons", { app_id: app.id });
    return fail(
      "OFFER_LOCKED",
      "Complete the required document verification process first.",
      409,
      { blockingReasons: (reasons ?? []).join("; ") },
    );
  }

  const { data: offer, error: offerErr } = await svc
    .from("offers")
    .upsert(
      {
        application_id: app.id,
        status: "sent",
        subject: body.subject.trim(),
        body: body.body.trim(),
        offer_letter_path: body.offerLetterPath ?? null,
        department: body.department ?? null,
        designation: body.designation ?? null,
        employment_type: body.employmentType ?? null,
        location: body.location ?? null,
        joining_date: body.joiningDate ?? null,
        sent_at: new Date().toISOString(),
        created_by: profile.id,
      },
      { onConflict: "application_id" },
    )
    .select("id")
    .single();
  if (offerErr || !offer) return fail("DB_ERROR", "Could not send the offer.", 500);

  await svc.from("applications").update({ status: "OFFER_ISSUED" }).eq("id", app.id);

  const candidate = app.candidates as any;
  const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim();
  const jobTitle = (app.jobs as any)?.title ?? "the role";

  await addEvent(svc, {
    application_id: app.id, type: "offer", title: "Offer Sent",
    description: `Offer emailed for ${jobTitle}.`,
    actor_profile_id: profile.id, actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id, action: "offer.send",
    entity_type: "offer", entity_id: offer.id,
    new_state: { status: "sent" },
  });
  await notify(svc, {
    recipient_profile_id: candidate?.profile_id ?? null,
    title: "You have an offer!", message: `Your offer for ${jobTitle} is ready to review.`,
    type: "offer_sent", entity_type: "offer", entity_id: offer.id,
  });

  if (candidate?.email) {
    const mail = render("offer_sent", {
      candidate_name: candidateName, job_title: jobTitle, note: body.body.trim(),
      offer_link: siteUrl("/candidate/application"),
    });
    await queueEmail(svc, {
      recipient: candidate.email, subject: body.subject.trim() || mail.subject,
      body_html: mail.html, body_text: mail.text,
      template: "offer_sent", entity_type: "offer", entity_id: offer.id,
    });
  }

  return ok({ offerId: offer.id, status: "OFFER_ISSUED" });
});
