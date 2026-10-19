// POST /functions/v1/verify-super-admin-otp   { code }
// Validates a 6-digit code against the hash stored by send-super-admin-otp.
// Single-use, time-limited, attempt-capped — all enforced here, never in the
// browser. Super Admin only (profiles.role === 'admin').

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, serviceClient } from "../_shared/supabase.ts";
import { hashOtp, OTP_MAX_ATTEMPTS } from "../_shared/otp.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return fail("FORBIDDEN", "Sign in required.", 403);
  const svc = serviceClient();
  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData.user) return fail("FORBIDDEN", "Sign in required.", 403);

  const { data: profile } = await svc.from("profiles").select("id, role, active").eq("id", userData.user.id).single();
  if (!profile || !profile.active || profile.role !== "admin") return fail("FORBIDDEN", "Sign in required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) return fail("INVALID_OTP", "Invalid verification code. Please try again.", 422);

  const { data: row } = await svc
    .from("super_admin_otp_codes")
    .select("id, code_hash, expires_at, attempts, used_at")
    .eq("profile_id", profile.id)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return fail("EXPIRED", "This verification code has expired. Please request a new code.", 410);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await svc.from("super_admin_otp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return fail("EXPIRED", "This verification code has expired. Please request a new code.", 410);
  }

  const codeHash = await hashOtp(code);
  if (codeHash !== row.code_hash) {
    const attempts = row.attempts + 1;
    const maxedOut = attempts >= OTP_MAX_ATTEMPTS;
    await svc.from("super_admin_otp_codes").update({ attempts, ...(maxedOut ? { used_at: new Date().toISOString() } : {}) }).eq("id", row.id);
    if (maxedOut) return fail("MAX_ATTEMPTS", "Too many incorrect attempts. Please request a new code.", 429);
    return fail("INVALID_OTP", "Invalid verification code. Please try again.", 422);
  }

  await svc.from("super_admin_otp_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
  await audit(svc, { actor_profile_id: profile.id, action: "super_admin.otp_verified", entity_type: "profile", entity_id: profile.id });

  return ok({ verified: true });
});
