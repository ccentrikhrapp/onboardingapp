// POST /functions/v1/application-decision
// Auth: the assigned TA (or admin). Drives the TA review state machine and fires
// every side effect a transition needs.
//
// Body: { applicationId, action, reason? }
//   action = "start_review" | "advance" | "close" | "request_update"
//   reason required for "close" and "request_update"

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify, queueEmail, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

type Action = "start_review" | "advance" | "close" | "request_update" | "request_documents";

// Allowed source statuses for each action, and the status it moves to.
const TRANSITIONS: Record<Action, { from: string[]; to: string }> = {
  start_review: { from: ["SUBMITTED"], to: "TA_REVIEW" },
  advance: { from: ["SUBMITTED", "TA_REVIEW"], to: "INTERVIEW_PLANNING" },
  close: { from: ["SUBMITTED", "TA_REVIEW", "RETURNED"], to: "REJECTED" },
  request_update: { from: ["SUBMITTED", "TA_REVIEW"], to: "RETURNED" },
  // All required interview rounds cleared -> unlock the pre-offer document
  // checklist (docs/requirements/03-*.md §11 step 3).
  request_documents: { from: ["INTERVIEW_PASSED"], to: "DOC_VERIFICATION" },
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "hr", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can do this.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const { applicationId, action } = body as { applicationId: string; action: Action };
  const reason: string = (body.reason ?? "").trim();

  const rule = TRANSITIONS[action];
  if (!rule) return fail("INVALID_ACTION", "Unknown action.", 400);
  if ((action === "close" || action === "request_update") && !reason) {
    return fail("VALIDATION_ERROR", "A reason is required.", 422, { reason: "Please explain what the candidate needs." });
  }

  const svc = serviceClient();

  const { data: app } = await svc
    .from("applications")
    .select(
      "id, application_code, status, assigned_ta_id, current_version, personal, job_id, " +
        "candidates(profile_id, email, first_name, last_name), jobs(title)",
    )
    .eq("id", applicationId)
    .maybeSingle();

  if (!app) return fail("NOT_FOUND", "Application not found.", 404);

  // The assigned TA (or any admin) may act. An unassigned application can be
  // claimed by the first TA who reviews it.
  if (profile.role !== "admin" && app.assigned_ta_id && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }
  if (!rule.from.includes(app.status)) {
    return fail("INVALID_STATE", `Cannot ${action.replace("_", " ")} from "${app.status}".`, 409);
  }

  const patch: Record<string, unknown> = { status: rule.to };
  if (!app.assigned_ta_id) patch.assigned_ta_id = profile.id;
  if (action === "close") patch.reject_reason = reason;
  if (action === "request_update") patch.return_reason = reason;

  const { error: upErr } = await svc.from("applications").update(patch).eq("id", applicationId);
  if (upErr) return fail("DB_ERROR", "Could not update the application.", 500);

  // start_review is a quiet internal transition — no candidate noise.
  if (action === "start_review") {
    await addEvent(svc, {
      application_id: app.id,
      type: "review",
      title: "TA Review Started",
      description: "Talent Acquisition began reviewing the application.",
      actor_profile_id: profile.id,
      actor_label: profile.full_name ?? "Talent Acquisition",
    });
    await audit(svc, {
      actor_profile_id: profile.id,
      action: "application.start_review",
      entity_type: "application",
      entity_id: app.id,
      previous_state: { status: app.status },
      new_state: { status: rule.to },
    });
    return ok({ status: rule.to });
  }

  const candidate = app.candidates as any;
  const candidateName = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim() ||
    `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const jobTitle = (app.jobs as any)?.title ?? "the role";
  const appLink = siteUrl("/candidate/application");

  // Unlocking pre-offer documents needs its own side effects (create the
  // requirement rows), so it's handled separately from the generic table below.
  if (action === "request_documents") {
    const { data: requirements } = await svc
      .from("document_requirements")
      .select("id")
      .eq("stage", "pre_offer")
      .eq("active", true);
    for (const r of requirements ?? []) {
      await svc.from("application_documents").insert({
        application_id: app.id,
        requirement_id: r.id,
        status: "requested",
      });
    }

    await addEvent(svc, {
      application_id: app.id, type: "documents", title: "Pre-Offer Documents Requested",
      description: "All required interview rounds cleared — pre-offer document checklist unlocked.",
      actor_profile_id: profile.id, actor_label: profile.full_name ?? "Talent Acquisition",
    });
    await audit(svc, {
      actor_profile_id: profile.id, action: "application.request_documents",
      entity_type: "application", entity_id: app.id,
      previous_state: { status: app.status }, new_state: { status: rule.to },
    });
    await notify(svc, {
      recipient_profile_id: candidate?.profile_id ?? null,
      title: "Documents requested", message: `Please submit your pre-offer documents for ${jobTitle}.`,
      type: "documents_requested", entity_type: "application", entity_id: app.id,
    });
    if (candidate?.email) {
      const mail = render("documents_requested", {
        candidate_name: candidateName, job_title: jobTitle,
        document_link: siteUrl("/candidate/application"),
      });
      await queueEmail(svc, {
        recipient: candidate.email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
        template: "documents_requested", entity_type: "application", entity_id: app.id,
      });
    }
    return ok({ status: rule.to });
  }

  const META: Record<Exclude<Action, "start_review" | "request_documents">, {
    eventTitle: string;
    eventDesc: string;
    notifyTitle: string;
    notifyMsg: string;
    template: string;
  }> = {
    advance: {
      eventTitle: "Application Advanced",
      eventDesc: "TA advanced the candidate to the interview stage.",
      notifyTitle: "Application progressed",
      notifyMsg: `Your application for ${jobTitle} has progressed to the next stage.`,
      template: "application_approved",
    },
    close: {
      eventTitle: "Application Closed",
      eventDesc: `Application closed: ${reason}`,
      notifyTitle: "Application update",
      notifyMsg: `Your application for ${jobTitle} was not taken forward.`,
      template: "application_rejected",
    },
    request_update: {
      eventTitle: "Update Requested",
      eventDesc: `TA asked the candidate to update the application: ${reason}`,
      notifyTitle: "Action needed on your application",
      notifyMsg: reason,
      template: "application_update_required",
    },
  };
  const m = META[action as Exclude<Action, "start_review" | "request_documents">];

  await addEvent(svc, {
    application_id: app.id,
    version: app.current_version,
    type: "review",
    title: m.eventTitle,
    description: m.eventDesc,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });

  await notify(svc, {
    recipient_profile_id: candidate?.profile_id ?? null,
    title: m.notifyTitle,
    message: m.notifyMsg,
    type: `application_${action}`,
    entity_type: "application",
    entity_id: app.id,
  });

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name,
    action: `application.${action}`,
    entity_type: "application",
    entity_id: app.id,
    previous_state: { status: app.status },
    new_state: { status: rule.to },
    remarks: reason || null,
  });

  if (candidate?.email) {
    const mail = render(m.template, {
      candidate_name: candidateName,
      job_title: jobTitle,
      application_code: app.application_code,
      application_link: appLink,
      reason,
    });
    await queueEmail(svc, {
      recipient: candidate.email,
      subject: mail.subject,
      body_html: mail.html,
      body_text: mail.text,
      template: m.template,
      entity_type: "application",
      entity_id: app.id,
    });
  }

  return ok({ status: rule.to });
});
