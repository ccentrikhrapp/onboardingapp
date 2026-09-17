// POST /functions/v1/invite-ta
// Auth: Super Admin ('admin') only — TA user management is not delegated to
// Admin TA (see 20260915130001_role_hierarchy.sql).
//
// Reuses the EXISTING staff-provisioning mechanism end to end: writes the
// role into staff_invites (already read by the handle_new_user trigger at
// signup — this is how @ccentrik.com staff have always been allowlisted),
// then calls Supabase's own admin.inviteUserByEmail, which creates the
// auth.users row (firing that trigger) and sends Supabase's built-in invite
// email with a link to set a password. No parallel invite/email system.
//
// Body: { fullName, email, role: 'ta' | 'admin_ta' | 'hr' }
// (department, if wanted, is set afterwards via manage-ta once the profile exists)

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const INVITABLE_ROLES = ["ta", "admin_ta", "hr"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || profile.role !== "admin") {
    return fail("FORBIDDEN", "Only Super Admin can invite Talent Acquisition users.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.fullName ?? "").trim();
  const role = body.role;
  const fields: Record<string, string> = {};
  if (!fullName) fields.fullName = "Full name is required.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Enter a valid email address.";
  if (!INVITABLE_ROLES.includes(role)) fields.role = "Choose Admin TA, Talent Acquisition or HR.";
  if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "Please complete the invite details.", 422, fields);

  const svc = serviceClient();

  const { data: existingProfile } = await svc.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existingProfile) return fail("ALREADY_EXISTS", "Someone with this email already has an account.", 409);

  const { error: inviteRowErr } = await svc
    .from("staff_invites")
    .upsert({ email, role, invited_by: profile.id }, { onConflict: "email" });
  if (inviteRowErr) return fail("DB_ERROR", "Could not save the invite.", 500);

  const { error: authErr } = await svc.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });
  if (authErr) {
    return fail("INVITE_FAILED", `Could not send the invitation email: ${authErr.message}`, 502);
  }

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name,
    action: "ta.invite",
    entity_type: "staff_invite",
    new_state: { email, role, full_name: fullName },
  });

  return ok({ email, role });
});
