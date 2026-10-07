import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { afterResponse } from "./http.ts";

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

// Queue an email row; it is delivered via the send-email function right after
// the reply is sent. Delivery failure is recorded on the row, not thrown — the workflow
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

  await deliverQueuedEmail(svc, row.id);
}

// Hands a queued email row to send-email after the reply has gone out. The
// outcome (sent / failed) is written on the row by send-email, or here if it
// could not even be reached.
export function deliverQueuedEmail(svc: SupabaseClient, emailId: string): Promise<void> {
  return afterResponse(
    fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ emailId }),
    }).catch(() =>
      svc.from("emails")
        .update({ status: "failed", error: "send-email invocation failed", failed_at: new Date().toISOString() })
        .eq("id", emailId)
    ),
  );
}

// Interview times are always shown to the candidate in India time, regardless
// of which time zone the server process itself runs in (date.getDate() etc.
// otherwise reflect the SERVER's zone, not India's — that was producing the
// wrong time/date in interview emails).
const IST = "Asia/Kolkata";
export function istDateParts(d: Date) {
  const day_of_month = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: IST }).format(d);
  const month_short = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: IST }).format(d).toUpperCase();
  const year = new Intl.DateTimeFormat("en-IN", { year: "numeric", timeZone: IST }).format(d);
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: IST }).format(d);
  const date = new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: IST }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST }).format(d);
  const when = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: IST }).format(d);
  return { day_of_month, month_short, year, weekday, date, time, when };
}

// Email + display name for a staff profile (TA, HR, ...), or null when there
// is none to notify or it has no email on file — callers skip sending rather
// than fail.
export async function staffContact(svc: SupabaseClient, profileId: string | null | undefined) {
  if (!profileId) return null;
  const { data } = await svc.from("profiles").select("email, full_name").eq("id", profileId).maybeSingle();
  if (!data?.email) return null;
  return { email: data.email as string, name: (data.full_name as string) || "there" };
}

// Secure links inside candidate emails — no internal ids in the query string
// beyond opaque codes the app already shows the candidate.
export function siteUrl(path: string): string {
  const base = Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173";
  return `${base.replace(/\/$/, "")}${path}`;
}
