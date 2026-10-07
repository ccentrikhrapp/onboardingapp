// POST /functions/v1/freeze-candidate
// Auth: the assigned TA (or admin). Puts an application on a cooldown —
// typically after the candidate has declined an interview and the TA
// decides not to re-approach them for a while, rather than rescheduling.
// While frozen, reschedule-interview-round refuses to run.
//
// Body: { applicationId, days?, reason? }   — days defaults to 90.
// Set days to 0 to lift an existing freeze early.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent } from "../_shared/workflow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["ta", "admin", "admin_ta"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only Talent Acquisition can freeze a candidate.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.applicationId) return fail("VALIDATION_ERROR", "Missing application.", 422, { applicationId: "Missing application." });

  const days = Number.isFinite(body.days) ? Math.max(0, Math.min(365, Number(body.days))) : 90;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  const svc = serviceClient();
  const { data: app } = await svc.from("applications").select("id, assigned_ta_id").eq("id", body.applicationId).maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (!["admin", "admin_ta"].includes(profile.role) && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }

  const cooldownUntil = days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
  const { error } = await svc
    .from("applications")
    .update({ cooldown_until: cooldownUntil, cooldown_reason: cooldownUntil ? reason || null : null })
    .eq("id", app.id);
  if (error) return fail("DB_ERROR", error.message || "Could not update the freeze.", 500);

  await addEvent(svc, {
    application_id: app.id,
    type: "status",
    title: cooldownUntil ? "Candidate Frozen" : "Candidate Unfrozen",
    description: cooldownUntil
      ? `Frozen for ${days} day${days === 1 ? "" : "s"}, until ${new Date(cooldownUntil).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}.${reason ? ` Reason: ${reason}` : ""}`
      : "Freeze lifted.",
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? "Talent Acquisition",
  });
  await audit(svc, {
    actor_profile_id: profile.id,
    action: cooldownUntil ? "application.freeze" : "application.unfreeze",
    entity_type: "application",
    entity_id: app.id,
    new_state: { cooldownUntil, reason: reason || null },
  });

  return ok({ cooldownUntil, reason: reason || null });
});
