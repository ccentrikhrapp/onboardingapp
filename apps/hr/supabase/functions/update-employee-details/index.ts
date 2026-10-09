// POST /functions/v1/update-employee-details
// Auth: hr/admin. Lets HR complete missing joining details on an EXISTING
// employee record (Section 1: "identify and allow HR to complete missing
// details for existing employees without recreating records") — a plain
// update, never a new insert, so the employee's id and Employee ID never
// change.
//
// Body: { employeeId, joiningDate?, department?, designation?, position?,
//         phone?, bloodGroup?, address?, officeLocation?, photoPath? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const FIELD_MAP: Record<string, string> = {
  joiningDate: "joining_date", department: "department", designation: "designation", position: "position",
  phone: "phone", bloodGroup: "blood_group", address: "address", officeLocation: "office_location", photoPath: "photo_path",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me || !["admin", "hr"].includes(me.role)) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  if (!body.employeeId) return fail("VALIDATION_ERROR", "Missing employee.", 422);

  const svc = serviceClient();
  const { data: existing } = await svc.from("employees").select("*").eq("id", body.employeeId).maybeSingle();
  if (!existing) return fail("NOT_FOUND", "Employee not found.", 404);

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (!(key in body)) continue;
    const value = body[key];
    if (JSON.stringify(existing[column] ?? null) === JSON.stringify(value ?? null)) continue;
    patch[column] = value || null;
    changed.push(column);
  }
  if (!changed.length) return ok({ employee: existing, changed: [] });

  patch.updated_at = new Date().toISOString();
  const { data: updated, error } = await svc.from("employees").update(patch).eq("id", body.employeeId).select("*").single();
  if (error || !updated) return fail("DB_ERROR", "Could not save these details.", 500);

  await svc.from("employee_onboarding_events").insert({
    employee_id: body.employeeId, kind: "joining_details_updated", actor_profile_id: me.id, actor_label: me.full_name ?? me.email,
    remark: `Updated: ${changed.join(", ")}`,
  });
  await audit(svc, {
    actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "employee.joining_details_updated",
    entity_type: "employee", entity_id: body.employeeId, new_state: patch,
  });

  return ok({ employee: updated, changed });
});
