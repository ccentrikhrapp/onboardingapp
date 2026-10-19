// POST /functions/v1/send-super-admin-otp   {}
// Generates and emails a fresh 6-digit OTP to the signed-in Super Admin's
// own registered email — never a client-supplied address. Super Admin only
// (profiles.role === 'admin'); every other role (ta, admin_ta, hr,
// candidate) gets the same generic refusal as "not signed in" and nothing
// is sent or stored.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, serviceClient } from "../_shared/supabase.ts";
import { sendCompanyMail } from "../_shared/companyMail.ts";
import { generateOtp, hashOtp, maskEmail, otpEmail, OTP_EXPIRY_MINUTES, OTP_RESEND_COOLDOWN_SECONDS } from "../_shared/otp.ts";

const APP_NAME = "Recruitment";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return fail("FORBIDDEN", "Sign in required.", 403);
  const svc = serviceClient();
  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData.user) return fail("FORBIDDEN", "Sign in required.", 403);

  const { data: profile } = await svc.from("profiles").select("id, email, role, active").eq("id", userData.user.id).single();
  // Same generic refusal whether the caller isn't signed in, is disabled, or
  // simply isn't a Super Admin — no role information leaks to the client.
  if (!profile || !profile.active || profile.role !== "admin") return fail("FORBIDDEN", "Sign in required.", 403);

  const { data: recent } = await svc
    .from("super_admin_otp_codes")
    .select("created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const waitMs = OTP_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(recent.created_at).getTime());
    if (waitMs > 0) return fail("COOLDOWN", "Please wait before requesting another code.", 429, { retryAfterMs: String(Math.ceil(waitMs)) });
  }

  // A new code burns any previous unused one — never two simultaneously valid.
  await svc.from("super_admin_otp_codes").update({ used_at: new Date().toISOString() }).eq("profile_id", profile.id).is("used_at", null);

  const code = generateOtp();
  const codeHash = await hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000).toISOString();
  const { error: insErr } = await svc.from("super_admin_otp_codes").insert({ profile_id: profile.id, code_hash: codeHash, expires_at: expiresAt });
  if (insErr) return fail("OTP_FAILED", "Could not generate a verification code. Please try again.", 500);

  const { subject, html, text } = otpEmail({ code, appName: APP_NAME });
  const mail = await sendCompanyMail({ to: profile.email, subject, html, text });
  if (!mail.sent) return fail("EMAIL_FAILED", "Could not send the verification email. Please try again shortly.", 502);

  await audit(svc, { actor_profile_id: profile.id, action: "super_admin.otp_sent", entity_type: "profile", entity_id: profile.id });

  return ok({ maskedEmail: maskEmail(profile.email), expiresAt, resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS });
});
