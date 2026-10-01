// Outbound calls from this app to the HR app (integration points 1 & 2,
// docs/requirements/03-recruitment-hr-integration.md §5/§7/§8). Every attempt
// is logged to integration_outbox first so a failed HR call is never silently
// lost — the event can be retried later from that row even if this request
// never returns.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export async function callHr(
  svc: SupabaseClient,
  fn: string,
  eventType: string,
  eventId: string,
  payload: Record<string, unknown>,
  entity?: { entity_type: string; entity_id: string },
): Promise<{ ok: boolean; error?: string }> {
  const { data: row } = await svc
    .from("integration_outbox")
    .insert({
      event_id: eventId,
      event_type: eventType,
      target_system: "hr",
      payload,
      status: "processing",
      attempt_count: 1,
      ...entity,
    })
    .select("id")
    .single();

  const baseUrl = Deno.env.get("HR_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) {
    if (row) await svc.from("integration_outbox").update({ status: "failed", last_error: "HR integration not configured" }).eq("id", row.id);
    return { ok: false, error: "HR integration not configured" };
  }

  // Supabase's own API gateway requires a valid Supabase-issued JWT on every
  // edge function call (independent of and in front of our own X-Integration-
  // Secret check below) unless the function is deployed with JWT verification
  // disabled. Rather than disable that platform-level check, the target
  // project's own anon key satisfies it — the anon key is meant to be public/
  // embeddable, so this adds no real access (X-Integration-Secret remains the
  // actual authorization), it just gets the request past the gateway.
  const anonKey = Deno.env.get("HR_ANON_KEY");

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Secret": secret,
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify({ eventId, ...payload }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (row) await svc.from("integration_outbox").update({ status: "failed", last_error: `HTTP ${res.status}: ${text.slice(0, 500)}` }).eq("id", row.id);
      return { ok: false, error: `HR call failed (${res.status})` };
    }
    if (row) await svc.from("integration_outbox").update({ status: "success", sent_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: true };
  } catch (e) {
    if (row) await svc.from("integration_outbox").update({ status: "failed", last_error: String(e).slice(0, 500) }).eq("id", row.id);
    return { ok: false, error: "HR call threw" };
  }
}

// Same service-to-service call as callHr, but the caller needs HR's answer
// back (e.g. the joining-form profile), so the response body is returned.
export async function callHrSync(
  fn: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; json: any }> {
  const baseUrl = Deno.env.get("HR_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) return { ok: false, status: 503, json: { error: { code: "NOT_CONFIGURED", message: "The joining form isn't available right now." } } };
  const anonKey = Deno.env.get("HR_ANON_KEY");
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Secret": secret,
        ...(anonKey ? { Authorization: `Bearer ${anonKey}`, apikey: anonKey } : {}),
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 502, json: { error: { code: "UNREACHABLE", message: "Could not reach HR. Please try again." } } };
  }
}
