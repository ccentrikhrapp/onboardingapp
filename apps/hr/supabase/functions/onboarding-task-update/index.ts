// POST /functions/v1/onboarding-task-update
// Auth: admin/hr (any task — oversight) or the task's own owner_role/
// owner_profile_id (accounts/it/office_admin, their own assigned items
// only). Uses the service-role client, so this check is the real
// enforcement — RLS on onboarding_tasks backs it up, this isn't relying on
// RLS alone (see Section 10: permissions must be enforced server-side, not
// only by hiding buttons in the UI).
//
// Body: { taskId, status?, remarks?, assetIdentifier?, unavailable?,
//          dueDate?, ownerRole?, ownerProfileId? }
//   ownerRole / ownerProfileId (reassignment) — admin/hr only.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const STATUSES = ["not_started", "in_progress", "blocked", "completed", "not_required"];
const HR_STAFF = ["admin", "hr"];

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "Sign in required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  if (!body.taskId) return fail("VALIDATION_ERROR", "Missing task.", 422);
  if (body.status !== undefined && !STATUSES.includes(body.status)) return fail("VALIDATION_ERROR", "Invalid status.", 422);

  const svc = serviceClient();
  const { data: task } = await svc.from("onboarding_tasks").select("*, employees(full_name, employee_code)").eq("id", body.taskId).maybeSingle();
  if (!task) return fail("NOT_FOUND", "Task not found.", 404);

  const isOwner = task.owner_role === me.role || task.owner_profile_id === me.id;
  const isStaff = HR_STAFF.includes(me.role);
  if (!isStaff && !isOwner) return fail("FORBIDDEN", "This task isn't assigned to you.", 403);

  const patch: Record<string, unknown> = {};
  const changes: string[] = [];

  if (body.status !== undefined && body.status !== task.status) {
    patch.status = body.status;
    changes.push(`status: ${task.status} → ${body.status}`);
    if (body.status === "completed") { patch.completed_at = new Date().toISOString(); patch.completed_by = me.id; }
    else { patch.completed_at = null; patch.completed_by = null; }
  }
  if (body.remarks !== undefined) { patch.remarks = String(body.remarks).slice(0, 1000) || null; changes.push("remarks updated"); }
  if (body.assetIdentifier !== undefined) { patch.asset_identifier = String(body.assetIdentifier).slice(0, 200) || null; changes.push("asset identifier updated"); }
  if (body.unavailable !== undefined) { patch.unavailable = !!body.unavailable; changes.push(body.unavailable ? "marked unavailable / needs clarification" : "marked available"); }
  if (body.dueDate !== undefined) { patch.due_date = body.dueDate || null; changes.push("due date updated"); }
  // Reassignment — Section 4: "do not assume every item is Accounts' —
  // allow items to be assigned to the appropriate owner." Staff only.
  if (isStaff && body.ownerRole !== undefined) { patch.owner_role = body.ownerRole || null; changes.push(`reassigned to role: ${body.ownerRole || "none"}`); }
  if (isStaff && body.ownerProfileId !== undefined) { patch.owner_profile_id = body.ownerProfileId || null; changes.push("reassigned to a specific person"); }

  if (!Object.keys(patch).length) return ok({ task });

  patch.updated_at = new Date().toISOString();
  const { data: updated, error } = await svc.from("onboarding_tasks").update(patch).eq("id", task.id).select("*").single();
  if (error || !updated) return fail("DB_ERROR", "Could not update this task.", 500);

  const actorLabel = me.full_name ?? me.email;
  await svc.from("employee_onboarding_events").insert({
    employee_id: task.employee_id, task_id: task.id, kind: "task_update",
    actor_profile_id: me.id, actor_label: actorLabel,
    old_value: { status: task.status }, new_value: { status: updated.status },
    remark: `${task.label}: ${changes.join("; ")}`,
  });
  await audit(svc, {
    actor_profile_id: me.id, actor_label: actorLabel, action: "onboarding_task.update",
    entity_type: "onboarding_task", entity_id: task.id, new_state: patch,
  });

  return ok({ task: updated });
});
