// POST /functions/v1/record-login   { provider }
// Called by the browser once per real sign-in (see AuthContext). Writes the
// audit row server-side so the actor is the verified JWT subject, not
// something the client claims. Disabled users get nothing (currentProfile).

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "Sign in required.", 403);

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* provider is optional */ }
  const provider = body.provider === "google" ? "google" : "password";

  const svc = serviceClient();
  // currentProfile only lets a still-flagged account through when the session is
  // not password-based (i.e. Google), which counts as accepting the invitation.
  // Deleting the open tokens leaves the emailed temporary password unable to
  // do anything (set-initial-password needs a live token).
  if (me.must_change_password) {
    const pat = me.email.replace(/[\\%_]/g, (c: string) => "\\" + c);
    await svc.from("staff_invites").update({ accepted_at: new Date().toISOString() }).ilike("email", pat).is("accepted_at", null);
    await svc.from("staff_invitation_tokens").delete().ilike("email", pat).is("used_at", null);
  }

  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email,
    action: provider === "google" ? "auth.login_google" : "auth.login_password",
    entity_type: "profile", entity_id: me.id, new_state: { role: me.role, app: "recruitment" },
  });
  return ok({ recorded: true });
});
