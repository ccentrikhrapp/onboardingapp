// POST /functions/v1/integration-joining-status
// Inbound from the HR app: HR's decision on the employee's joining form
// (correction required / verified / completed). Service-to-service only.
// Puts a clear line on the candidate's timeline and a bell notification.
//
// Body: { eventId, applicationId, status: 'correction_required'|'verified'|'completed'|'documents_clarification'|'documents_rejected'|'documents_approved', message }

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { addEvent, notify } from "../_shared/workflow.ts";

const TITLE: Record<string, string> = {
  correction_required: "Joining Form Correction Required",
  verified: "Joining Form Verified",
  completed: "Joining Formalities Completed",
  documents_clarification: "Joining Document Clarification Required",
  documents_rejected: "Joining Document Rejected",
  documents_approved: "Joining Documentation Approved",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const title = TITLE[body.status];
  if (!body.eventId || !body.applicationId || !title) return fail("VALIDATION_ERROR", "Missing or invalid fields.", 422);

  const svc = serviceClient();
  const { data: app } = await svc.from("applications").select("id, candidates(profile_id)").eq("id", body.applicationId).maybeSingle();
  if (!app) return fail("NOT_FOUND", "Application not found.", 404);

  const message = String(body.message ?? "").slice(0, 500);
  await addEvent(svc, { application_id: app.id, type: "onboarding", title, description: message, actor_label: "HR" });
  const profileId = (app.candidates as any)?.profile_id;
  if (profileId) {
    await notify(svc, {
      recipient_profile_id: profileId, recipient_role: null, title, message,
      type: "joining_form", entity_type: "application", entity_id: app.id,
    });
  }
  return ok({ received: true });
});
