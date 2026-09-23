import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { sendGmailAsActor } from "./gmailSend.ts";
import { sendAsUser, withHostedLogo } from "./userMail.ts";
import { LOGO_JPEG_BASE64 } from "./emailLogo.ts";

// Shared by team-invite and accept-invite. Tokens are 256 random bits; only
// their SHA-256 hash is ever stored, so a database read never yields a
// usable link, and a token is single-use + expiring (see accept-invite).

export const INVITATION_EXPIRY_DAYS = Number(Deno.env.get("INVITATION_EXPIRY_DAYS") ?? "7");

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// 12-character temporary password: unambiguous characters only (no 0/O, 1/l/I),
// at least one upper, lower, digit and symbol, drawn from crypto randomness with
// rejection sampling so there is no modulo bias. Only ever emailed once — the
// database holds just the auth provider's hash of it.
export function generateTempPassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const below = (n: number): number => {
    const limit = 256 - (256 % n);
    for (;;) {
      const b = crypto.getRandomValues(new Uint8Array(1))[0];
      if (b < limit) return b % n;
    }
  };
  const pick = (chars: string): string => chars[below(chars.length)];
  const out = sets.map(pick);
  while (out.length < 12) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Same policy the set-password screen states to the user.
export function passwordError(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < 10) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Include at least one letter and one number.";
  if (pw.length > 72) return "Use 72 characters or fewer.";
  return null;
}

export function appBaseUrl(): string {
  return (Deno.env.get("PUBLIC_SITE_URL") ?? "http://localhost:5173").replace(/\/$/, "");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function invitationEmail(o: {
  appName: string; name: string; email: string; roleLabel: string; link: string;
  expiresAt: Date; inviterName: string; inviterEmail: string;
  tempPassword: string; loginUrl: string;
}) {
  const expires = o.expiresAt.toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
  const year = new Date().getFullYear();
  const row = (label: string, value: string, last = false) =>
    `<tr>
       <td style="width:38%;padding:11px 14px;background:#f8fafc;border-bottom:${last ? "0" : "1px solid #e6e9ef"};border-right:1px solid #e6e9ef;font-size:12px;color:#6b7280">${label}</td>
       <td style="padding:11px 14px;border-bottom:${last ? "0" : "1px solid #e6e9ef"};font-size:13px;color:#0f1729;font-weight:600">${value}</td>
     </tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f3f7;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <table role="presentation" align="center" style="width:100%;max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ec;border-top:3px solid #2563eb;border-radius:14px;border-collapse:separate">
    <tr><td style="padding:18px 26px;border-bottom:1px solid #eef0f3">
      <table role="presentation" style="width:100%"><tr>
        <td><img src="cid:ccentrik-logo" width="92" alt="CCENTRIK" style="display:block;border:0;height:auto" /></td>
        <td align="right"><span style="display:inline-block;padding:4px 12px;border:1px solid #bfd3ff;background:#eef4ff;color:#1d4ed8;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.08em">TEAM INVITATION</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:24px 26px 6px">
      <div style="background:#eef4ff;border:1px solid #cfe0ff;border-radius:12px;padding:22px 18px;text-align:center">
        <div style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:12px;background:#2563eb;font-size:22px">&#127881;</div>
        <div style="margin-top:10px;font-size:19px;font-weight:800;color:#0f1729">Welcome, ${esc(o.name)}!</div>
        <div style="margin-top:6px;font-size:12px;color:#2563eb">You've been added to the CCENTRIK ${esc(o.appName)} workspace by ${esc(o.inviterName)}.</div>
      </div>
    </td></tr>
    <tr><td style="padding:14px 26px 4px;font-size:13px;color:#374151">
      Your account is ready. Sign in with the temporary password below &mdash; you'll be asked to choose your own password straight away.
    </td></tr>
    <tr><td style="padding:12px 26px 6px">
      <table role="presentation" style="width:100%;border:1px solid #e6e9ef;border-radius:10px;border-collapse:separate;overflow:hidden">
        ${row("Login Email", `<a href="mailto:${esc(o.email)}" style="color:#2563eb;text-decoration:underline">${esc(o.email)}</a>`)}
        ${row("Your Role", esc(o.roleLabel))}
        ${row("Invited By", `<a href="mailto:${esc(o.inviterEmail)}" style="color:#2563eb;text-decoration:underline">${esc(o.inviterEmail)}</a>`)}
        ${row("Temporary Password", `<span style="display:inline-block;padding:3px 10px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;font-family:Consolas,Menlo,monospace;font-size:14px;letter-spacing:.04em;color:#0f1729">${esc(o.tempPassword)}</span>`)}
        ${row("Valid until", esc(expires), true)}
      </table>
    </td></tr>
    <tr><td style="padding:14px 26px 6px">
      <a href="${o.loginUrl}" style="display:block;text-align:center;padding:14px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px">Login to CCENTRIK &rarr;</a>
    </td></tr>
    <tr><td style="padding:8px 26px 4px">
      <div style="background:#fffbeb;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e">
        &#9888;&#65039; Change your password immediately after your first login. The temporary password only lets you set a new one.
      </div>
    </td></tr>
    <tr><td style="padding:8px 26px 20px;font-size:12px;color:#6b7280">
      Prefer a link? <a href="${o.link}" style="color:#2563eb">Activate with a one-time link</a> instead (single use). You can also sign in with <strong>Google</strong> using this same email address. If this expires, ask ${esc(o.inviterName)} to resend it. Wasn't expecting this? You can ignore this email.
    </td></tr>
    <tr><td style="padding:14px 26px;border-top:1px solid #eef0f3;font-size:11px;color:#9aa3b2">
      <table role="presentation" style="width:100%"><tr>
        <td>&copy; ${year} CCENTRIK &middot; Automated &middot; Do not reply</td>
        <td align="right">ccentrik.com</td>
      </tr></table>
    </td></tr>
  </table></body></html>`;
  const text =
    `Welcome, ${o.name}!\n\nYou've been added to the CCENTRIK ${o.appName} workspace by ${o.inviterName}.\n\n` +
    `Login email: ${o.email}\nTemporary password: ${o.tempPassword}\nYour role: ${o.roleLabel}\nInvited by: ${o.inviterEmail}\nValid until: ${expires}\n\n` +
    `Login: ${o.loginUrl}\n\nChange your password immediately after your first login.\n\n` +
    `Or activate with a one-time link:\n${o.link}\n\nYou can also sign in with Google using this same email.\n`;
  return { subject: `Welcome to CCENTRIK ${o.appName} — your login details`, html, text };
}

// Sends through the inviter's own Gmail (same mechanism as every workflow
// email) and records the attempt in `emails`. Returns whether it truly went
// out — callers report that honestly rather than assuming success.
export async function deliverInvitation(
  svc: SupabaseClient,
  o: { to: string; inviterEmail: string; subject: string; html: string; text: string },
): Promise<{ sent: boolean; error?: string }> {
  const { data: row } = await svc
    .from("emails")
    .insert({ recipient: o.to, subject: o.subject, body_html: o.html, body_text: o.text, template: "team_invitation", sender_email: o.inviterEmail, status: "queued" })
    .select("id")
    .single();
  // The inviter's own App Password first (saved in Settings -> Email; sent from their address,
  // no Google permission needed), then their connected Google account, then a company mailbox secret.
  const smtp = await sendAsUser(svc, o.inviterEmail, { to: o.to, subject: o.subject, html: withHostedLogo(o.html, appBaseUrl()), text: o.text });
  if (smtp.sent) {
    if (row) await svc.from("emails").update({ status: "sent", sent_at: new Date().toISOString(), sender: smtp.from }).eq("id", row.id);
    return { sent: true };
  }
  if (smtp.reason === "failed") {
    const error = `Email send failed: ${smtp.detail}`;
    if (row) await svc.from("emails").update({ status: "failed", error, failed_at: new Date().toISOString() }).eq("id", row.id);
    return { sent: false, error };
  }
  const res = await sendGmailAsActor(svc, {
    actorEmail: o.inviterEmail, to: o.to, subject: o.subject, html: o.html, text: o.text,
    inlineImages: [{ cid: "ccentrik-logo", mimeType: "image/jpeg", base64: LOGO_JPEG_BASE64, filename: "ccentrik-logo.jpg" }],
  });
  if (res.sent) {
    if (row) await svc.from("emails").update({ status: "sent", sent_at: new Date().toISOString(), sender: res.from }).eq("id", row.id);
    return { sent: true };
  }
  const error = res.reason === "no_token"
    ? "No email sender is set up for your account yet. Save your Gmail App Password in Settings → Email, then resend."
    : `Gmail send failed (${res.reason})`;
  if (row) await svc.from("emails").update({ status: "failed", error, failed_at: new Date().toISOString() }).eq("id", row.id);
  return { sent: false, error };
}
