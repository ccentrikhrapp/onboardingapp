// POST /functions/v1/manage-ta
// Auth: Super Admin ('admin') only.
//
// Body: { profileId, action: 'set_role' | 'set_active' | 'set_department', value }
//   set_role:       value = 'ta' | 'admin_ta' | 'hr' | 'admin'
//   set_active:     value = boolean
//   set_department: value = string | null
//
// Guards against the one genuinely dangerous case: demoting/deactivating the
// last remaining Super Admin, which would lock everyone out of TA user
// management with no way back in through the app itself.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const ROLES = ["candidate", "ta", "admin_ta", "hr", "admin", "interviewer", "employee"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || profile.role !== "admin") {
    return fail("FORBIDDEN", "Only Super Admin can manage Talent Acquisition users.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const { profileId, action, value } = body;
  if (!profileId) return fail("VALIDATION_ERROR", "Missing user.", 422, { profileId: "Missing user." });

  const svc = serviceClient();
  const { data: target } = await svc.from("profiles").select("id, role, active, full_name").eq("id", profileId).maybeSingle();
  if (!target) return fail("NOT_FOUND", "User not found.", 404);

  const wouldRemoveLastSuperAdmin = async () => {
    if (target.role !== "admin") return false;
    const { count } = await svc
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("active", true)
      .neq("id", target.id);
    return (count ?? 0) === 0;
  };

  let patch: Record<string, any> = {};
  let auditAction = "";
  let previousState: Record<string, any> = {};
  let newState: Record<string, any> = {};

  if (action === "set_role") {
    if (!ROLES.includes(value)) return fail("VALIDATION_ERROR", "Invalid role.", 422, { value: "Invalid role." });
    if (target.role === "admin" && value !== "admin" && (await wouldRemoveLastSuperAdmin())) {
      return fail("LAST_SUPER_ADMIN", "Cannot change the role of the only remaining Super Admin.", 409);
    }
    patch = { role: value };
    auditAction = "ta.role_change";
    previousState = { role: target.role };
    newState = { role: value };
  } else if (action === "set_active") {
    if (typeof value !== "boolean") return fail("VALIDATION_ERROR", "Invalid status.", 422, { value: "Invalid status." });
    if (!value && (await wouldRemoveLastSuperAdmin())) {
      return fail("LAST_SUPER_ADMIN", "Cannot deactivate the only remaining Super Admin.", 409);
    }
    if (profileId === profile.id && !value) {
      return fail("SELF_DEACTIVATE", "You cannot deactivate your own account.", 409);
    }
    patch = { active: value };
    auditAction = value ? "ta.activate" : "ta.deactivate";
    previousState = { active: target.active };
    newState = { active: value };
  } else if (action === "set_department") {
    patch = { department: value ? String(value).trim() : null };
    auditAction = "ta.department_change";
    newState = { department: patch.department };
  } else {
    return fail("VALIDATION_ERROR", "Unknown action.", 422);
  }

  const { error } = await svc.from("profiles").update(patch).eq("id", profileId);
  if (error) return fail("DB_ERROR", "Could not update this user.", 500);

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name,
    action: auditAction,
    entity_type: "profile",
    entity_id: profileId,
    previous_state: previousState,
    new_state: newState,
    remarks: `Target: ${target.full_name ?? profileId}`,
  });

  return ok({ profileId, ...patch });
});
