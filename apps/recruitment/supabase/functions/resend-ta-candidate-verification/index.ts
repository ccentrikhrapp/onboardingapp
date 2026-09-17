// POST /functions/v1/resend-ta-candidate-verification
// Auth: ta / admin_ta / admin. Regenerates a fresh Supabase magic link for a
// TA-created candidate who hasn't verified yet and re-sends the same
// verification email. Each call issues a brand new link (Supabase's own
// magic links are already single-use/expiring — this doesn't need a
// separate revocation step).
//
// Body: { applicationId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, siteUrl } from "../_shared/workflow.ts";
import { render } from "../_shared/emailTemplates.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin_ta", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can resend a verification link.", 403);
  }

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
    .select("id, status, source, assigned_ta_id, personal, candidates(email)")
    .eq("id", body.applicationId)
    .maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (app.status !== "DRAFT" || app.source !== "ta_sourced") {
    return fail("INVALID_STATE", "This application is not awaiting candidate verification.", 409);
  }
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }

  const email = (app.candidates as any)?.email ?? app.personal?.email;
  if (!email) return fail("NO_EMAIL", "This candidate has no email on file.", 422);

  const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim();
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "magiclink", email, options: { redirectTo: siteUrl("/candidate/application") },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return fail("LINK_FAILED", "Could not generate a new verification link.", 500);
  }

  const mail = render("ta_candidate_verification", { candidate_name: candidateName, verify_link: linkData.properties.action_link });
  const { data: emailRow } = await svc
    .from("emails")
    .insert({
      recipient: email, subject: mail.subject, body_html: mail.html, body_text: mail.text,
      template: "ta_candidate_verification", entity_type: "application", entity_id: app.id, status: "queued",
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
    emailStatus = res.ok ? "sent" : "failed";
  } catch {
    /* stays failed */
  }

  await addEvent(svc, {
    application_id: app.id, type: "creation", title: "Verification Link Resent",
    description: `${profile.full_name ?? "A recruiter"} resent the verification link to ${email}.`,
    actor_profile_id: profile.id, actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: profile.full_name, action: "candidate.resend_verification",
    entity_type: "application", entity_id: app.id,
  });

  return ok({ emailStatus, candidateEmail: email });
});
