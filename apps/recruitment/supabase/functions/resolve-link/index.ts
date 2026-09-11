// GET /functions/v1/resolve-link?token=xxxx
// Public. Turns a TA application-link token into the job + recruiter it points
// to, without ever exposing internal ids or the ta_id in a URL.

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) return fail("INVALID_REQUEST", "Missing link token.", 400);

  const svc = serviceClient();

  const { data: link } = await svc
    .from("application_links")
    .select("id, active, expires_at, job_id, ta_id, invite_type, invited_name")
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.active) {
    return fail("LINK_INVALID", "This application link is no longer active.", 404);
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return fail("LINK_EXPIRED", "This application link has expired.", 410);
  }

  const { data: job } = await svc
    .from("jobs")
    .select("id, job_code, title, department, location, work_mode, employment_type, experience, description, required_skills, status")
    .eq("id", link.job_id)
    .maybeSingle();

  if (!job || (job.status !== "published")) {
    return fail("JOB_CLOSED", "This role is no longer accepting applications.", 410);
  }

  const { data: ta } = await svc
    .from("profiles")
    .select("full_name")
    .eq("id", link.ta_id)
    .maybeSingle();

  const confidential = link.invite_type === "confidential";
  return ok({
    linkId: link.id,
    job,
    // A confidential invitation never names the referring TA — see
    // docs/requirements master prompt §24.
    recruiterName: confidential ? null : ta?.full_name ?? null,
    inviteType: link.invite_type,
    invitedName: link.invited_name ?? null,
    source: "ta_link",
  });
});
