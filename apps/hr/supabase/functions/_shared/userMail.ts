import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// CRM-style sending: a staff member saves their own Gmail App Password in Settings, and
// every email they trigger goes out from THEIR address over SMTP — no Google permission
// screen. The password lives only in Supabase Vault (see the user_mail_credentials
// migration); this module reads it with the service role, uses it once, never logs it.

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 465;

export type SmtpResult =
  | { sent: true; from: string }
  | { sent: false; reason: "no_credentials" | "failed"; detail: string };

/** Plain-language explanation for the errors a person can actually fix. */
export function friendlySmtpError(e: unknown): string {
  const m = String(e instanceof Error ? e.message : e);
  if (/535|534|5\.7\.8|username and password not accepted|invalid credentials|authentication/i.test(m)) {
    return "Google rejected this App Password. Use a 16-character App Password (not your normal password) and make sure 2-Step Verification is on for this account.";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timed? ?out|network|connect/i.test(m)) {
    return "Couldn't reach Gmail right now. Please try again in a moment.";
  }
  return "The test email could not be sent. Please check the App Password and try again.";
}

export async function smtpSend(o: { user: string; pass: string; fromName: string; to: string; subject: string; html: string; text?: string }): Promise<void> {
  const client = new SMTPClient({
    connection: { hostname: SMTP_HOST, port: SMTP_PORT, tls: true, auth: { username: o.user, password: o.pass } },
  });
  try {
    await client.send({
      from: o.fromName ? `${o.fromName.replace(/[<>"]/g, "")} <${o.user}>` : o.user,
      to: o.to,
      subject: o.subject,
      content: o.text || " ",
      html: o.html,
    });
  } finally {
    try { await client.close(); } catch { /* already closed */ }
  }
}

/** Sends as the person with this login email, if they saved an App Password. */
export async function sendAsUser(
  svc: SupabaseClient,
  actorEmail: string,
  mail: { to: string; subject: string; html: string; text?: string },
): Promise<SmtpResult> {
  const pat = actorEmail.trim().replace(/[\\%_]/g, (c) => "\\" + c);
  const { data: profile } = await svc.from("profiles").select("id, email, full_name").ilike("email", pat).maybeSingle();
  if (!profile) return { sent: false, reason: "no_credentials", detail: "no profile" };
  const { data: cred } = await svc.from("user_mail_credentials").select("mail_user").eq("profile_id", profile.id).maybeSingle();
  if (!cred) return { sent: false, reason: "no_credentials", detail: "no saved app password" };
  const { data: pass } = await svc.rpc("get_user_mail_password", { p_profile: profile.id });
  if (!pass) return { sent: false, reason: "no_credentials", detail: "no saved app password" };
  try {
    await smtpSend({ user: cred.mail_user, pass, fromName: profile.full_name ?? "", ...mail });
    return { sent: true, from: `${profile.full_name ?? ""} <${cred.mail_user}>`.trim() };
  } catch (e) {
    return { sent: false, reason: "failed", detail: friendlySmtpError(e) };
  }
}

/** Hosted logo (an <img> URL) instead of an inline attachment, for SMTP delivery. */
export function withHostedLogo(html: string, siteUrl: string): string {
  return html.replaceAll("cid:ccentrik-logo", `${siteUrl.replace(/\/$/, "")}/ccentrik-logo.png`);
}
