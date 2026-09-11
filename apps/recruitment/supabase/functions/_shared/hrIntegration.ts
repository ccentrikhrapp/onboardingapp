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

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integration-Secret": secret },
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
