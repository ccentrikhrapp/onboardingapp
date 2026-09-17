import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

// One place for the side-effects every workflow transition needs:
// a timeline event, an in-app notification, and a queued email.

export async function addEvent(
  svc: SupabaseClient,
  e: {
    application_id: string;
    version?: number;
    type: string;
    title: string;
    description?: string;
    actor_profile_id?: string | null;
    actor_label?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await svc.from("application_events").insert({
    version: 1,
    metadata: {},
    ...e,
  });
}

export async function notify(
  svc: SupabaseClient,
  n: {
    recipient_profile_id?: string | null;
    recipient_role?: string | null;
    title: string;
    message?: string;
    type?: string;
    entity_type?: string;
    entity_id?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await svc.from("notifications").insert({ metadata: {}, ...n });
}

// Queue an email row and immediately try to deliver it via the send-email
// function. Delivery failure is recorded on the row, not thrown — the workflow
// transition still succeeds.
export async function queueEmail(
  svc: SupabaseClient,
  m: {
    recipient: string;
    subject: string;
    body_html: string;
    body_text?: string;
    template?: string;
    entity_type?: string;
    entity_id?: string | null;
    // Email of whoever's action triggered this — when they've connected
    // Gmail send access (see store-google-token), send-email delivers it
    // through their own Google account instead of the shared/dead fallback
    // mailbox. Email, not profile id, since recruitment and HR are separate
    // Supabase projects with their own profile UUIDs for the same person.
    sender_email?: string | null;
  },
) {
  const { data: row } = await svc
    .from("emails")
    .insert({ status: "queued", ...m })
    .select("id")
    .single();

  if (!row) return;

  try {
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ emailId: row.id }),
    });
  } catch (_err) {
    await svc
      .from("emails")
      .update({ status: "failed", error: "send-email invocation failed", failed_at: new Date().toISOString() })
      .eq("id", row.id);
  }
}

// Secure links inside candidate emails — no internal ids in the query string
// beyond opaque codes the app already shows the candidate.
export function siteUrl(path: string): string {
  const base = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}
