// POST /functions/v1/verify-onboarding-document
// Auth: hr/admin. The HR decision on one onboarding document the candidate
// uploaded through the recruitment app. When an approval clears the last
// required document on the case, the case moves to 'ready_for_joining' and
// the recruitment app is told so (candidate sees a single "all done"
// notice, not one per document).
//
// Body: { onboardingDocumentId, action: 'approve'|'reject'|'reupload_required', remarks? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { renderFormPdf, type FormField } from "../_shared/formPdf.ts";

const STATUS_BY_ACTION: Record<string, string> = {
  approve: "verified",
  reject: "rejected",
  reupload_required: "revision_required",
};

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  const action = body.action;
  const remarks = String(body.remarks ?? "").trim();
  const status = STATUS_BY_ACTION[action];
  if (!body.onboardingDocumentId || !status) return fail("VALIDATION_ERROR", "Missing document or invalid action.", 422);
  if (action !== "approve" && !remarks) {
    return fail("VALIDATION_ERROR", "Remarks are required.", 422, { remarks: "Please explain what needs to change." });
  }

  const svc = serviceClient();
  const { data: doc } = await svc
    .from("onboarding_documents")
    .select("id, status, onboarding_case_id, requirement_id, source_application_id, form_data, requirement:onboarding_document_requirements(name, field_schema)")
    .eq("id", body.onboardingDocumentId)
    .maybeSingle();
  if (!doc) return fail("NOT_FOUND", "Document not found.", 404);
  if (doc.status !== "uploaded") return fail("INVALID_STATE", "This document isn't awaiting review.", 409);

  const { error: upErr } = await svc
    .from("onboarding_documents")
    .update({
      status,
      hr_remarks: action === "approve" ? null : remarks,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
  if (upErr) return fail("DB_ERROR", "Could not save the decision.", 500);

  await audit(svc, {
    actor_profile_id: profile.id,
    actor_label: profile.full_name ?? profile.email,
    action: `onboarding_document.${action}`,
    entity_type: "onboarding_document",
    entity_id: doc.id,
    new_state: { status },
    remarks: remarks || null,
  });

  // A filled-in form gets its printable PDF only once HR has approved it.
  // A failure is logged, not surfaced: the approval itself has already saved.
  const formReq = (doc as any).requirement;
  if (action === "approve" && doc.form_data && formReq?.field_schema?.length) {
    try {
      const { data: caseRow } = await svc.from("onboarding_cases").select("candidate_name").eq("id", doc.onboarding_case_id).maybeSingle();
      const fields: FormField[] = formReq.field_schema
        .filter((f: any) => f.type !== "file")
        .map((f: any) => ({ label: f.label ?? f.key, value: String(doc.form_data?.[f.key] ?? "") }));
      const bytes = await renderFormPdf({
        title: formReq.name,
        candidateName: caseRow?.candidate_name ?? "Employee",
        reference: `ONB-${doc.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`,
        fields,
      });
      const now = new Date().toISOString();
      const safeName = String(formReq.name).replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const fileName = `${safeName}_${now.slice(0, 10).replace(/-/g, "")}.pdf`;
      const path = `onboarding/${doc.id}/approved-${now.replace(/[:.]/g, "-")}.pdf`;
      const { error: pdfErr } = await svc.storage.from("joining-pdfs").upload(path, bytes, { contentType: "application/pdf", upsert: false });
      if (pdfErr) throw new Error(pdfErr.message);
      await svc.from("onboarding_documents").update({ approved_pdf_path: path, approved_pdf_name: fileName, approved_pdf_at: now }).eq("id", doc.id);
    } catch (e) {
      console.error("approved form pdf failed", String(e).slice(0, 300));
    }
  }

  // A required document just cleared — see if that was the last one.
  let allRequiredVerified = false;
  if (status === "verified") {
    const { data: pendingRequired } = await svc
      .from("onboarding_documents")
      .select("id, requirement:onboarding_document_requirements(required)")
      .eq("onboarding_case_id", doc.onboarding_case_id)
      .neq("status", "verified");
    const stillPending = (pendingRequired ?? []).some((d: any) => d.requirement?.required !== false);
    if (!stillPending) {
      allRequiredVerified = true;
      await svc.from("onboarding_cases").update({ status: "ready_for_joining" }).eq("id", doc.onboarding_case_id);
    } else {
      await svc.from("onboarding_cases").update({ status: "verification_in_progress" }).eq("id", doc.onboarding_case_id);
    }
  }

  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  // See verify-document for why the anon key is also sent: it satisfies
  // Supabase's own gateway JWT check without weakening it, independent of our
  // X-Integration-Secret check below.
  const recruitmentAnonKey = Deno.env.get("RECRUITMENT_ANON_KEY");
  let syncedToRecruitment = false;
  if (baseUrl && secret) {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-onboarding-document-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Integration-Secret": secret,
          ...(recruitmentAnonKey ? { Authorization: `Bearer ${recruitmentAnonKey}`, apikey: recruitmentAnonKey } : {}),
        },
        body: JSON.stringify({
          eventId: crypto.randomUUID(),
          hrDocumentId: doc.id,
          status,
          remarks: remarks || null,
          allRequiredVerified,
          reviewedBy: profile.full_name ?? profile.email,
          reviewedByEmail: profile.email,
        }),
      });
      syncedToRecruitment = res.ok;
    } catch {
      syncedToRecruitment = false;
    }
  }

  return ok({ status, syncedToRecruitment });
});
