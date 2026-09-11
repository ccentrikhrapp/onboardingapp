// POST /functions/v1/verify-document
// Auth: hr/admin. The HR verification decision — approve / reject / request
// correction — then propagates the decision back to the recruitment app
// (integration point 1's return leg, docs/requirements/03-*.md §5/§8).
//
// Body: { documentVerificationId, action: 'approve'|'reject'|'reupload_required', remarks? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

const STATUS_BY_ACTION: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  reupload_required: "reupload_required",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile || !["hr", "admin"].includes(profile.role)) {
    return fail("FORBIDDEN", "HR access required.", 403);
  }

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const { documentVerificationId, action } = body;
  const remarks: string = (body.remarks ?? "").trim();
  const status = STATUS_BY_ACTION[action];
  if (!status) return fail("INVALID_ACTION", "Unknown action.", 400);
  if (action !== "approve" && !remarks) {
    return fail("VALIDATION_ERROR", "Remarks are required.", 422, { remarks: "Please explain what needs to change." });
  }

  const svc = serviceClient();
  const { data: doc } = await svc
    .from("document_verifications")
    .select("*")
    .eq("id", documentVerificationId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document not found.", 404);

  const { error: upErr } = await svc
    .from("document_verifications")
    .update({
      status,
      hr_remarks: action === "approve" ? null : remarks,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (upErr) return fail("DB_ERROR", "Could not save the decision.", 500);

  await svc.from("document_verification_events").insert({
    document_verification_id: doc.id,
    version: doc.version,
    status,
    remarks: remarks || null,
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? profile.email,
  });

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name,
    action: `document.${action}`,
    entity_type: "document_verification",
    entity_id: doc.id,
    previous_state: { status: doc.status },
    new_state: { status },
    remarks: remarks || null,
  });

  // Propagate the decision back to the recruitment app. Best-effort: the HR
  // decision is already durably saved above even if this call fails —
  // failures don't lose data, they just need a retry (docs/requirements/
  // 03-*.md §23). A dedicated outbox/retry table is a follow-up; for now the
  // attempt result is returned to the caller so the UI can surface it.
  let syncedToRecruitment = false;
  const base = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (base && secret) {
    try {
      const res = await fetch(`${base}/integration-verification-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Integration-Secret": secret },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          sourceDocumentId: doc.source_document_id,
          status,
          remarks: remarks || null,
          reviewedBy: profile.full_name ?? profile.email,
        }),
      });
      syncedToRecruitment = res.ok;
    } catch (_e) {
      syncedToRecruitment = false;
    }
  }

  return ok({ status, syncedToRecruitment });
});
