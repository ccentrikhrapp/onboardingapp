// POST /functions/v1/retry-failed-hr-events
// Auth: a shared secret (X-Cron-Secret), not a user — this is called by the
// pg_cron job set up in 20261102050000_retry_failed_hr_outbox.sql, every 15
// minutes, so a failed recruitment -> HR handoff (bad URL, network blip,
// HR down) gets re-sent automatically instead of staying stuck forever.
// Re-sends 'failed' integration_outbox rows targeting HR, using each row's
// own target_fn + stored payload + original event_id (so it's the exact
// same request HR would have received the first time). By default retries
// the oldest 50; pass { entityIds: [...] } in the body to scope it to
// specific application_document/application ids instead (e.g. to push one
// candidate's documents through without re-triggering everything else and
// risking HR's rate limit again).

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";

const BATCH_SIZE = 50;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const cronSecret = Deno.env.get("CRON_TRIGGER_SECRET");
  if (!cronSecret || req.headers.get("X-Cron-Secret") !== cronSecret) {
    return fail("FORBIDDEN", "Not authorized.", 403);
  }

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty body is fine — default batch */ }
  const entityIds: string[] = Array.isArray(body.entityIds) ? body.entityIds : [];

  const baseUrl = Deno.env.get("HR_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) return fail("NOT_CONFIGURED", "HR integration not configured.", 503);
  const anonKey = Deno.env.get("HR_ANON_KEY");

  const svc = serviceClient();
  let query = svc
    .from("integration_outbox")
    .select("id, event_id, target_fn, payload, attempt_count")
    .eq("target_system", "hr")
    .eq("status", "failed")
    .not("target_fn", "is", null)
    .order("created_at", { ascending: true });
  query = entityIds.length ? query.in("entity_id", entityIds) : query.limit(BATCH_SIZE);
  const { data: rows, error } = await query;
  if (error) return fail("DB_ERROR", "Could not load the outbox.", 500);

  let succeeded = 0;
  let failed = 0;
  for (const row of rows || []) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${row.target_fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Secret": secret,
          ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
        },
        body: JSON.stringify({ eventId: row.event_id, ...row.payload }),
      });
      if (res.ok) {
        await svc.from("integration_outbox").update({
          status: "success", sent_at: new Date().toISOString(), attempt_count: (row.attempt_count ?? 0) + 1,
        }).eq("id", row.id);
        succeeded++;
      } else {
        const text = await res.text().catch(() => "");
        await svc.from("integration_outbox").update({
          status: "failed", last_error: `HTTP ${res.status}: ${text.slice(0, 500)}`, attempt_count: (row.attempt_count ?? 0) + 1,
        }).eq("id", row.id);
        failed++;
      }
    } catch (e) {
      await svc.from("integration_outbox").update({
        status: "failed", last_error: String(e).slice(0, 500), attempt_count: (row.attempt_count ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
    }
  }

  return ok({ retried: (rows || []).length, succeeded, failed });
});
