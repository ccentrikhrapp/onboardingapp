// Shared by send-super-admin-otp / verify-super-admin-otp. Same model as
// teamInvite.ts's invitation tokens: only a SHA-256 hash of the code is ever
// stored, so a database read never yields a usable code.

export const OTP_EXPIRY_MINUTES = 5;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 45;

// Unbiased 6-digit numeric code (000000-999999) via rejection sampling — no
// modulo bias, never a timestamp or predictable sequence.
export function generateOtp(): string {
  const range = 1_000_000;
  const limit = Math.floor(0xffffffff / range) * range;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return String(n % range).padStart(6, "0");
}

export async function hashOtp(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(2, user.length - visible.length))}@${domain}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function otpEmail(o: { code: string; appName: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#f1f3f7;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <table role="presentation" align="center" style="width:100%;max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ec;border-top:3px solid #3157D5;border-radius:14px;border-collapse:separate">
    <tr><td style="padding:24px 26px 8px;text-align:center">
      <div style="font-size:17px;font-weight:800;color:#0f1729">Your Super Admin Verification Code</div>
    </td></tr>
    <tr><td style="padding:6px 26px 18px;font-size:13px;color:#374151;text-align:center">
      A login attempt was made to your Super Admin account on CCENTRIK ${esc(o.appName)}.
    </td></tr>
    <tr><td style="padding:0 26px 18px;text-align:center">
      <span style="display:inline-block;padding:12px 22px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:28px;letter-spacing:.12em;color:#0f1729;font-weight:700">${esc(o.code)}</span>
    </td></tr>
    <tr><td style="padding:0 26px 20px;font-size:12px;color:#6b7280;text-align:center">
      This code will expire in ${OTP_EXPIRY_MINUTES} minutes. If you did not initiate this login, please secure your account immediately.
    </td></tr>
    <tr><td style="padding:14px 26px;border-top:1px solid #eef0f3;font-size:11px;color:#9aa3b2;text-align:center">
      Talent Blooming &middot; Automated &middot; Do not reply
    </td></tr>
  </table></body></html>`;
  const text = `A login attempt was made to your Super Admin account.\n\nYour verification code is:\n\n${o.code}\n\nThis code will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not initiate this login, please secure your account immediately.\n\nRegards,\nTalent Blooming`;
  return { subject: "Your Super Admin Verification Code", html, text };
}
