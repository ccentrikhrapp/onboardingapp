import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendGmailAsActor } from "./gmailSend.ts";
import { sendAsUser, withHostedLogo } from "./userMail.ts";
import { companyMailConfigured, sendCompanyMail } from "./companyMail.ts";
import { appBaseUrl } from "./teamInvite.ts";

// The one place HR-side notification emails actually get sent, queued and
// recorded — every onboarding notification (Super Admin, Accounts/IT,
// Joining Arrangements) goes through this, the same way every recruitment-
// side email goes through that app's send-email function. Mirrors its
// fallback order: the triggering person's own App Password, then their
// connected Google account, then the company mailbox (Resend, then SMTP) —
// so this app gets the same reliability recruitment's does, using the
// infrastructure that already exists here (gmailSend/userMail/companyMail),
// extended rather than replaced.
export async function sendStaffMail(
  svc: SupabaseClient,
  o: {
    to: string; subject: string; html: string; text: string; template: string;
    entityType?: string; entityId?: string; actorEmail?: string | null;
    // Idempotency: a retried action (duplicate click, network retry) must not
    // send the same notification twice. Pass a stable key per logical event
    // (e.g. `employee-created-super-admin-${employeeId}`) and this returns
    // {skipped:true} on a repeat without sending anything.
    idempotencyKey?: string;
  },
): Promise<{ sent: boolean; skipped?: boolean; error?: string }> {
  if (o.idempotencyKey) {
    const { data: existing } = await svc.from("emails").select("id, status").eq("template", o.template).eq("entity_id", o.entityId ?? null).eq("recipient", o.to).maybeSingle();
    if (existing && existing.status !== "failed") return { sent: existing.status === "sent", skipped: true };
  }

  const { data: row } = await svc
    .from("emails")
    .insert({
      recipient: o.to, subject: o.subject, body_html: o.html, body_text: o.text,
      template: o.template, entity_type: o.entityType ?? null, entity_id: o.entityId ?? null,
      sender_email: o.actorEmail ?? null, status: "queued",
    })
    .select("id")
    .single();
  const markSent = async (sender: string) => { if (row) await svc.from("emails").update({ status: "sent", sent_at: new Date().toISOString(), sender }).eq("id", row.id); };
  const markFailed = async (error: string) => { if (row) await svc.from("emails").update({ status: "failed", error, failed_at: new Date().toISOString() }).eq("id", row.id); };

  const html = withHostedLogo(o.html, appBaseUrl());

  if (o.actorEmail) {
    const smtp = await sendAsUser(svc, o.actorEmail, { to: o.to, subject: o.subject, html, text: o.text });
    if (smtp.sent) { await markSent(smtp.from); return { sent: true }; }
    if (smtp.reason === "failed") { const error = `Email send failed: ${smtp.detail}`; await markFailed(error); return { sent: false, error }; }

    const gmail = await sendGmailAsActor(svc, { actorEmail: o.actorEmail, to: o.to, subject: o.subject, html, text: o.text });
    if (gmail.sent) { await markSent(gmail.from); return { sent: true }; }
  }

  if (companyMailConfigured()) {
    const r = await sendCompanyMail({ to: o.to, subject: o.subject, html, text: o.text });
    if (r.sent) { await markSent(r.from); return { sent: true }; }
    const error = `Company mail failed: ${r.reason === "failed" ? r.detail : r.reason}`;
    await markFailed(error);
    return { sent: false, error };
  }

  const error = "No email sender is set up for this account yet. Save your Gmail App Password in Settings → Email, then resend.";
  await markFailed(error);
  return { sent: false, error };
}
