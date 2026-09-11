// GET /functions/v1/get-offer-status?applicationId=...
// Auth: the assigned TA (or admin). Wraps offer_eligibility()/
// offer_blocking_reasons() (defined in the hr_integration migration) so the
// TA UI can show "Offer Locked" / "Offer Ready" honestly — this is the same
// check the offer-send function re-runs itself, never trusting the frontend
// alone (docs/requirements/01-*.md §12, 03-*.md §6).

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const profile = await currentProfile(req);
  if (!profile || !["ta", "hr", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Not allowed.", 403);
  }

  const applicationId = new URL(req.url).searchParams.get("applicationId");
  if (!applicationId) return fail("VALIDATION_ERROR", "Missing applicationId.", 422);

  const svc = serviceClient();
  const { data: app } = await svc.from("applications").select("id, assigned_ta_id").eq("id", applicationId).maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);
  if (profile.role === "ta" && app.assigned_ta_id !== profile.id) {
    return fail("FORBIDDEN", "This application is assigned to another recruiter.", 403);
  }

  const { data: eligibility } = await svc.rpc("offer_eligibility", { app_id: applicationId });
  const { data: reasons } = await svc.rpc("offer_blocking_reasons", { app_id: applicationId });

  return ok({
    eligibility,
    offerReady: eligibility === "READY_FOR_OFFER",
    blockingReasons: reasons ?? [],
  });
});
