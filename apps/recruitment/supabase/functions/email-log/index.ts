// POST /functions/v1/email-log
// Auth: any signed-in staff (TA) profile. Read-only view of the `emails`
// table — every email the system has ever queued, across both this app and
// HR's integration calls, gets a row here with a real status/error, but
// nothing ever surfaced it to a human. This is that surface, so a failed
// email is "visible in Settings," not "silent until someone checks the DB."
//
// Body: { status?: 'all' | 'sent' | 'queued' | 'failed', limit?: number }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  // currentProfile() returns successfully for ANY active profile, including
  // role 'candidate' — it does no role filtering itself, so every caller must.
  // This list is everyone who isn't a candidate (see mail-settings for the
  // same check): a candidate must never see other candidates' email log.
  const me = await currentProfile(req);
  if (!me || me.role === "candidate") return fail("FORBIDDEN", "Staff access required.", 403);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty body is fine — defaults apply */ }

  const svc = serviceClient();
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);

  let q = svc
    .from("emails")
    .select("id, recipient, subject, template, status, error, entity_type, entity_id, created_at, sent_at, failed_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (body.status && body.status !== "all") q = q.eq("status", body.status);

  const { data, error } = await q;
  if (error) return fail("DB_ERROR", "Could not load the email log.", 500);

  const { count: failedCount } = await svc.from("emails").select("id", { count: "exact", head: true }).eq("status", "failed");

  return ok({ emails: data ?? [], failedCount: failedCount ?? 0 });
});
