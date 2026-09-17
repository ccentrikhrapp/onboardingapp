// POST /functions/v1/send-email
//   { emailId }                     -> send an already-queued row
//   { to, subject, html, text }     -> compose + send + log in one call
//   { to, template, vars }          -> render a template, then send + log
//
// Auth: the service role (internal calls) or a staff member. Delivery is
// delegated to a Firebase Cloud Function (FIREBASE_MAIL_FUNCTION_URL) over
// HTTPS, authenticated with a shared secret — same pattern as the
// recruitment<->HR integration (_shared/hrIntegration.ts). Every attempt
// updates the emails row regardless of transport.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { render } from "../_shared/emailTemplates.ts";
import { sendGmailAsActor } from "../_shared/gmailSend.ts";

const FROM = Deno.env.get("MAIL_FROM") ?? "Ccentrik <no-reply@ccentrik.com>";

// Posts to the Firebase Cloud Function that actually delivers the mail.
// Returns null on success, or an error message.
async function sendViaFirebase(payload: { to: string; from: string; subject: string; html: string; text: string }) {
  const url = Deno.env.get("FIREBASE_MAIL_FUNCTION_URL");
  const secret = Deno.env.get("FIREBASE_MAIL_SHARED_SECRET");
  if (!url || !secret) return "FIREBASE_MAIL_FUNCTION_URL / FIREBASE_MAIL_SHARED_SECRET not configured";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mail-Secret": secret },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return `Firebase mail function returned ${res.status}: ${await res.text()}`;
    return null;
  } catch (e) {
    return String(e);
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const isInternal = req.headers.get("Authorization") === `Bearer ${serviceKey}`;
  if (!isInternal) {
    const profile = await currentProfile(req);
    if (!profile || !["ta", "hr", "admin", "admin_ta"].includes(profile.role)) {
      return fail("FORBIDDEN", "Not allowed.", 403);
    }
  }

  const svc = serviceClient();
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  // Resolve the email row + content --------------------------------------
  let emailId: string | null = body.emailId ?? null;
  let recipient: string;
  let subject: string;
  let html: string;
  let text: string;
  let senderEmail: string | null = body.senderEmail ?? null;

  if (emailId) {
    const { data: row } = await svc.from("emails").select("*").eq("id", emailId).maybeSingle();
    if (!row) return fail("NOT_FOUND", "Email row not found.", 404);
    recipient = row.recipient;
    subject = row.subject;
    html = row.body_html ?? "";
    text = row.body_text ?? "";
    senderEmail = row.sender_email ?? senderEmail;
  } else {
    if (!body.to) return fail("INVALID_REQUEST", "Missing recipient.", 400);
    recipient = body.to;
    if (body.template) {
      const r = render(body.template, body.vars ?? {});
      subject = r.subject;
      html = r.html;
      text = r.text;
    } else {
      subject = body.subject ?? "Ccentrik notification";
      html = body.html ?? `<p>${body.text ?? ""}</p>`;
      text = body.text ?? "";
    }
    const { data: row } = await svc
      .from("emails")
      .insert({
        recipient,
        sender: FROM,
        subject,
        body_html: html,
        body_text: text,
        template: body.template ?? null,
        entity_type: body.entityType ?? null,
        entity_id: body.entityId ?? null,
        sender_email: senderEmail,
        status: "queued",
      })
      .select("id")
      .single();
    emailId = row?.id ?? null;
  }

  // Send ----------------------------------------------------------------
  // Prefer sending through the triggering person's own Gmail account (feels
  // personal — "your recruiter emailed you" — rather than a no-reply
  // address). Only falls back to the shared mailbox relay when that person
  // hasn't connected Gmail send access (or none was specified at all).
  let error: string | null = null;
  let sentFrom: string | null = null;
  if (senderEmail) {
    const gmailResult = await sendGmailAsActor(svc, { actorEmail: senderEmail, to: recipient, subject, html, text });
    if (gmailResult.sent) {
      sentFrom = gmailResult.from;
    } else if (gmailResult.reason !== "no_token") {
      error = `Gmail send failed (${gmailResult.reason}): ${gmailResult.detail ?? ""}`;
    }
    // reason === "no_token" falls through to the shared-mailbox fallback below.
  }
  if (!sentFrom && !error) {
    error = await sendViaFirebase({ to: recipient, from: FROM, subject, html, text: text || " " });
  }

  if (error) {
    if (emailId) {
      await svc.from("emails").update({ status: "failed", error, failed_at: new Date().toISOString() }).eq("id", emailId);
    }
    return fail("SEND_FAILED", "The email could not be delivered.", 502);
  }

  if (emailId) {
    await svc
      .from("emails")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null, sender: sentFrom ?? FROM })
      .eq("id", emailId);
  }
  return ok({ emailId, status: "sent", sentFrom: sentFrom ?? FROM });
});
