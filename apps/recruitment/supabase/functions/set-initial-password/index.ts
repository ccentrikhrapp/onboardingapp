// POST /functions/v1/set-initial-password   { password }
// The one thing a session made with the emailed temporary password may do.
// Requires: that session (JWT method "password"), the account still flagged
// must_change_password, and a live invitation token (so an expired or
// already-accepted invitation cannot be finished with the old temp password).
// The new password must satisfy the policy and differ from the temporary one.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, serviceClient, sessionMethod } from "../_shared/supabase.ts";
import { passwordError } from "../_shared/teamInvite.ts";

const APP = "recruitment";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return fail("FORBIDDEN", "Sign in required.", 403);
  const svc = serviceClient();
  const { data: userData, error } = await svc.auth.getUser(token);
  if (error || !userData.user) return fail("FORBIDDEN", "Sign in required.", 403);

  const { data: profile } = await svc.from("profiles").select("id, email, full_name, role, active, must_change_password").eq("id", userData.user.id).single();
  if (!profile || !profile.active) return fail("FORBIDDEN", "This account is not active.", 403);
  if (!profile.must_change_password || sessionMethod(token) !== "password") {
    return fail("NOT_REQUIRED", "Your password has already been set.", 409);
  }

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const password = body.password;
  const pwErr = passwordError(password);
  if (pwErr) return fail("WEAK_PASSWORD", pwErr, 422, { password: pwErr });

  const pat = profile.email.replace(/[\\%_]/g, (c: string) => "\\" + c);
  const { data: live } = await svc.from("staff_invitation_tokens").select("id").ilike("email", pat).is("used_at", null).gt("expires_at", new Date().toISOString());
  if (!live?.length) return fail("INVITE_EXPIRED", "This invitation has expired. Ask your administrator to resend it.", 410);

  // Refuse to keep the temporary password: if it still signs in, it's unchanged.
  const probe = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const same = await probe.auth.signInWithPassword({ email: profile.email, password });
  if (same.data?.session) return fail("SAME_PASSWORD", "Choose a password different from the temporary one.", 422, { password: "Choose a password different from the temporary one." });

  const { error: upErr } = await svc.auth.admin.updateUserById(profile.id, { password });
  if (upErr) return fail("ACTIVATION_FAILED", "Could not set your password. Please try again.", 500);

  await svc.from("profiles").update({ must_change_password: false }).eq("id", profile.id);
  await svc.from("staff_invitation_tokens").delete().ilike("email", pat).is("used_at", null);
  await svc.from("staff_invites").update({ accepted_at: new Date().toISOString() }).ilike("email", pat);
  await audit(svc, {
    actor_profile_id: profile.id, actor_label: profile.full_name ?? profile.email, action: "team.set_initial_password",
    entity_type: "profile", entity_id: profile.id, new_state: { app: APP, role: profile.role },
  });

  return ok({ email: profile.email });
});
