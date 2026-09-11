// POST /functions/v1/assign-applications
// Auth: hr/admin only (the "Super TA" role — master prompt §33-35, §74).
// Assigns one or more unassigned/careers applications to a TA. Backend-
// enforced: the frontend role check is not trusted, RLS + this function's own
// role check both gate it.
//
// Body: { applicationIds: string[], taId: string }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { addEvent, notify } from "../_shared/workflow.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["hr", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "Only HR/admin can assign applications.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const applicationIds: string[] = Array.isArray(body.applicationIds) ? body.applicationIds : [];
  const taId: string = body.taId;
  if (!applicationIds.length || !taId) {
    return fail("VALIDATION_ERROR", "Select at least one candidate and a recruiter.", 422);
  }

  const svc = serviceClient();

  const { data: ta } = await svc.from("profiles").select("id, full_name, role").eq("id", taId).maybeSingle();
  if (!ta || ta.role !== "ta") return fail("INVALID_TA", "That recruiter could not be found.", 404);

  const { data: apps } = await svc
    .from("applications")
    .select("id, assigned_ta_id, personal, jobs(title)")
    .in("id", applicationIds);
  if (!apps || apps.length !== applicationIds.length) {
    return fail("NOT_FOUND", "One or more applications could not be found.", 404);
  }

  let assignedCount = 0;
  for (const app of apps) {
    const previousTaId = app.assigned_ta_id;
    const { error } = await svc.from("applications").update({ assigned_ta_id: taId }).eq("id", app.id);
    if (error) continue;
    assignedCount++;

    const candidateName = `${app.personal?.firstName ?? ""} ${app.personal?.lastName ?? ""}`.trim() || "A candidate";
    await addEvent(svc, {
      application_id: app.id,
      type: "assignment",
      title: "Assigned to Recruiter",
      description: `${profile.full_name ?? "Super TA"} assigned this application to ${ta.full_name ?? "a recruiter"}.`,
      actor_profile_id: profile.id,
      actor_label: profile.full_name ?? "Super TA",
    });
    await audit(svc, {
      actor_profile_id: profile.id,
      actor_label: profile.full_name,
      action: "application.assign",
      entity_type: "application",
      entity_id: app.id,
      previous_state: { assigned_ta_id: previousTaId },
      new_state: { assigned_ta_id: taId },
    });
    await notify(svc, {
      recipient_profile_id: taId,
      title: "New candidate assigned to you",
      message: `${candidateName} — ${(app.jobs as any)?.title ?? "a role"} has been assigned to you.`,
      type: "application_assigned",
      entity_type: "application",
      entity_id: app.id,
    });
  }

  return ok({ assigned: assignedCount });
});
