import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

// Company-mailbox delivery — the same model as the Ccentrik CRM: every workflow
// email goes out from one company address, so no staff member has to connect their
// own Gmail. Transports, in the CRM's order:
//   1. Resend   (RESEND_API_KEY, from RESEND_FROM) — needs a domain verified in Resend
//   2. SMTP     (MAIL_USER + MAIL_PASS, default smtp.gmail.com:465, TLS) — e.g. a Gmail
//               / Google Workspace mailbox with an app password
// Credentials live only in Supabase secrets; nothing is stored in the database.

const RESEND_KEY = () => Deno.env.get("RESEND_API_KEY") ?? "";
const MAIL_USER = () => Deno.env.get("MAIL_USER") ?? "";
const MAIL_PASS = () => Deno.env.get("MAIL_PASS") ?? "";
const FROM_NAME = () => Deno.env.get("MAIL_FROM_NAME") ?? "Ccentrik";

export const companyMailConfigured = (): boolean => !!RESEND_KEY() || (!!MAIL_USER() && !!MAIL_PASS());

const fromAddress = () => Deno.env.get("RESEND_FROM") || MAIL_USER();

export type CompanyMailResult = { sent: true; from: string } | { sent: false; reason: "not_configured" | "failed"; detail?: string };

export async function sendCompanyMail(o: { to: string; subject: string; html: string; text?: string }): Promise<CompanyMailResult> {
  if (!companyMailConfigured()) return { sent: false, reason: "not_configured" };
  const from = `${FROM_NAME()} <${fromAddress()}>`;
  const errors: string[] = [];

  if (RESEND_KEY()) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [o.to], subject: o.subject, html: o.html, text: o.text || undefined }),
      });
      if (res.ok) return { sent: true, from };
      errors.push(`resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      errors.push(`resend: ${String(e).slice(0, 200)}`);
    }
  }

  if (MAIL_USER() && MAIL_PASS()) {
    const client = new SMTPClient({
      connection: {
        hostname: Deno.env.get("MAIL_SMTP_HOST") ?? "smtp.gmail.com",
        port: Number(Deno.env.get("MAIL_SMTP_PORT") ?? "465"),
        tls: true,
        auth: { username: MAIL_USER(), password: MAIL_PASS() },
      },
    });
    try {
      await client.send({ from: `${FROM_NAME()} <${MAIL_USER()}>`, to: o.to, subject: o.subject, content: o.text || " ", html: o.html });
      return { sent: true, from: `${FROM_NAME()} <${MAIL_USER()}>` };
    } catch (e) {
      errors.push(`smtp: ${String(e).slice(0, 200)}`);
    } finally {
      try { await client.close(); } catch { /* already closed */ }
    }
  }
  return { sent: false, reason: "failed", detail: errors.join(" | ") };
}

/** Hosted logo for company mail (an image tag, not an inline attachment). */
export function withHostedLogo(html: string, siteUrl: string): string {
  return html.replaceAll("cid:ccentrik-logo", `${siteUrl.replace(/\/$/, "")}/ccentrik-logo.png`);
}
