// POST /functions/v1/joining-hr-action
// Auth: HR / Super Admin (any active profile in the HR project).
//
// Body: { profileId, action, ... }
//   set_hr_fields      { fields }                      HR-only values (employee code, grade, client, Zeta card, PF employer section…)
//   request_correction { items: [{ section, field?, remark }] }   re-opens ONLY those steps for the employee
//   start_review       {}                              submitted/resubmitted -> under_review
//   verify             {}                              -> verified (no open corrections)
//   complete           {}                              verified -> completed
//   doc_approve | doc_clarify | doc_reject | doc_mark_na | doc_mark_applicable   { itemKey, remark? }   ONE document requirement at a time
//   approve_documentation {}                           allowed once every APPLICABLE blocking requirement is resolved — never needs the whole reference list
//
// The employee is told (in the recruitment app) about corrections, verification
// and completion; everything is written to the audit trail.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { HR_FIELDS, SECTIONS, fieldError } from "../_shared/joiningSchema.ts";
import { buildDocuments } from "../_shared/joiningDocs.ts";
import { storeOnboardingPdf } from "../_shared/onboardingPdfStore.ts";

const SECTION_IDS = new Set(SECTIONS.map((s) => s.id));
const DOC_ACTIONS = ["doc_approve", "doc_clarify", "doc_reject", "doc_mark_na", "doc_mark_applicable", "approve_documentation"];
const PRE_JOINING_STATUSES = ["onboarding_initiated", "documents_pending", "documents_submitted", "verification_in_progress", "formalities_pending"];

async function notifyRecruitment(applicationId: string, status: string, message: string) {
  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) return false;
  const anon = Deno.env.get("RECRUITMENT_ANON_KEY");
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-joining-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integration-Secret": secret, ...(anon ? { Authorization: `Bearer ${anon}`, apikey: anon } : {}) },
      body: JSON.stringify({ eventId: crypto.randomUUID(), applicationId, status, message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const { profileId, action } = body;
  if (!profileId || !["set_hr_fields", "request_correction", "start_review", "verify", "complete", "approve_with_remarks", "reject", ...DOC_ACTIONS].includes(action)) {
    return fail("VALIDATION_ERROR", "Invalid request.", 422);
  }

  const svc = serviceClient();
  const { data: p } = await svc.from("joining_profiles").select("*").eq("id", profileId).maybeSingle();
  if (!p) return fail("NOT_FOUND", "Joining profile not found.", 404);
  const { data: caseRow } = await svc.from("onboarding_cases").select("candidate_name").eq("id", p.onboarding_case_id).maybeSingle();
  const actor = me.full_name ?? me.email;
  const now = new Date().toISOString();
  const log = (row: Record<string, unknown>) => svc.from("joining_profile_events").insert({ joining_profile_id: p.id, actor_label: actor, actor_profile_id: me.id, ...row });

  if (action === "set_hr_fields") {
    const incoming = (body.fields ?? {}) as Record<string, any>;
    const known = new Map(HR_FIELDS.map((f) => [f.key, f]));
    const errors: Record<string, string> = {};
    const next = { ...(p.hr_fields ?? {}) } as Record<string, string>;
    const changed: string[] = [];
    for (const [k, raw] of Object.entries(incoming)) {
      const f = known.get(k);
      if (!f) continue;
      const v = String(raw ?? "").trim();
      const msg = v ? fieldError(f, v, {}, {}, false) : "";
      if (msg) { errors[k] = msg; continue; }
      if ((next[k] ?? "") !== v) {
        changed.push(k);
        await log({ kind: "hr_fields", field: k, old_value: next[k] ?? null, new_value: v || null });
        if (v) next[k] = v; else delete next[k];
      }
    }
    if (Object.keys(errors).length) return fail("VALIDATION_ERROR", "Please fix the highlighted fields.", 422, errors);
    if (changed.length) await svc.from("joining_profiles").update({ hr_fields: next }).eq("id", p.id);
    return ok({ hrFields: next, changed });
  }


  // ---------------- document-level review ----------------
  if (DOC_ACTIONS.includes(action)) {
    let built = await buildDocuments(svc, p.id, p.data); // also makes sure every applicable requirement has its row

    if (action === "approve_documentation") {
      if (!built.summary.ready) {
        return fail("NOT_READY", `${built.summary.unresolved.length} requirement(s) still need HR: ${built.summary.unresolved.slice(0, 6).join(", ")}`, 409, { unresolved: built.summary.unresolved.join("; ") });
      }
      await svc.from("joining_profiles").update({ documents_approved_at: now, documents_approved_by: actor }).eq("id", p.id);
      await svc.from("onboarding_cases").update({ status: "ready_for_joining" }).eq("id", p.onboarding_case_id).in("status", PRE_JOINING_STATUSES);
      await log({ kind: "document", remark: "Joining documentation approved", new_value: { summary: built.summary } });
      await audit(svc, { actor_profile_id: me.id, actor_label: actor, action: "joining.documents_approved", entity_type: "joining_profile", entity_id: p.id, new_state: { applicable: built.summary.applicable } });
      const synced = await notifyRecruitment(p.source_application_id, "documents_approved", "HR has approved your joining documentation.");
      return ok({ approved: true, summary: built.summary, synced });
    }

    const itemKey = String(body.itemKey ?? "");
    const remark = String(body.remark ?? "").trim().slice(0, 500);
    const { data: item } = await svc.from("joining_document_items").select("*").eq("joining_profile_id", p.id).eq("item_key", itemKey).maybeSingle();
    if (!item) return fail("NOT_FOUND", "That requirement isn't on this employee's list.", 404);
    const decided = ["approved", "approved_with_reason", "na_accepted"];
    let status: string | null = null;
    let patch: Record<string, unknown> = {};

    if (action === "doc_approve") {
      if (item.status === "submitted") status = "approved";
      else if (item.status === "reason_submitted") status = item.choice === "not_applicable" ? "na_accepted" : "approved_with_reason";
      else if (item.status === "awaiting" && item.applicability === "not_applicable" && item.ref_key === "employment_details") status = "na_accepted"; // HR confirms the fresher answer
      else return fail("INVALID_STATE", "There is nothing submitted on this requirement to approve.", 409);
    } else if (action === "doc_clarify" || action === "doc_reject") {
      if (!remark) return fail("VALIDATION_ERROR", "Say what is needed.", 422, { remark: "Please add a remark." });
      if (!["submitted", "reason_submitted", ...decided].includes(item.status)) return fail("INVALID_STATE", "The employee hasn't submitted anything here yet.", 409);
      status = action === "doc_clarify" ? "clarification_required" : "rejected";
    } else if (action === "doc_mark_na") {
      status = "na_accepted";
      patch = { choice: null };
    } else {
      if (item.status !== "na_accepted") return fail("INVALID_STATE", "Only a requirement marked not applicable can be made applicable again.", 409);
      status = "awaiting";
    }

    await svc.from("joining_document_items").update({
      status, hr_remarks: status === "awaiting" || status === "approved" || status === "approved_with_reason" ? null : remark || null,
      decided_by: me.id, decided_by_name: actor, decided_at: now, ...patch,
    }).eq("id", item.id);
    await log({ kind: "document", field: itemKey, old_value: { status: item.status }, new_value: { status }, remark: remark || null });

    // Reopening something after the documentation was approved withdraws that approval until it is resolved again.
    built = await buildDocuments(svc, p.id, p.data);
    let approvalWithdrawn = false;
    if (p.documents_approved_at && !built.summary.ready) {
      await svc.from("joining_profiles").update({ documents_approved_at: null, documents_approved_by: null }).eq("id", p.id);
      await log({ kind: "document", remark: "Documentation approval withdrawn — a requirement was reopened" });
      approvalWithdrawn = true;
    }

    let synced: boolean | undefined;
    if (status === "clarification_required") synced = await notifyRecruitment(p.source_application_id, "documents_clarification", `${item.label}: ${remark}`);
    if (status === "rejected") synced = await notifyRecruitment(p.source_application_id, "documents_rejected", `${item.label}: ${remark}`);
    return ok({ status, summary: built.summary, approvalWithdrawn, synced });
  }

  const open = (p.corrections ?? []).filter((c: any) => !c.resolved_at);

  if (action === "approve_with_remarks" || action === "reject") {
    const remark = String(body.remarks ?? "").trim();
    if (!remark) return fail("VALIDATION_ERROR", "Please add remarks for this decision.", 422, { remarks: "Remarks are required." });
    if (!["submitted", "resubmitted", "under_review"].includes(p.status)) return fail("INVALID_STATE", "The form must be submitted before it can be decided.", 409);
    if (action === "approve_with_remarks" && open.length) return fail("INVALID_STATE", "There are open corrections.", 409);
    const next = action === "reject" ? "rejected" : "approved_with_remarks";
    await svc.from("joining_profiles").update({ status: next, decision_remarks: remark, decided_by: actor, decided_at: now }).eq("id", p.id);
    await log({ kind: "status", old_value: { status: p.status }, new_value: { status: next }, remark });
    await audit(svc, { actor_profile_id: me.id, actor_label: actor, action: `joining.${next}`, entity_type: "joining_profile", entity_id: p.id, remarks: remark });
    if (next === "approved_with_remarks") {
      try { await storeOnboardingPdf(svc, p.id, "Approved with remarks", actor); } catch (e) { console.error("pdf", String(e).slice(0, 300)); }
    }
    const synced = await notifyRecruitment(p.source_application_id, next, remark);
    return ok({ status: next, synced });
  }

  if (action === "request_correction") {
    if (!["submitted", "resubmitted", "under_review"].includes(p.status)) return fail("INVALID_STATE", "Corrections can be requested once the form is submitted and before it is verified.", 409);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return fail("VALIDATION_ERROR", "Choose what needs correcting.", 422);
    const fresh = [];
    for (const it of items.slice(0, 30)) {
      const section = String(it.section ?? "");
      const remark = String(it.remark ?? "").trim();
      if (!SECTION_IDS.has(section)) return fail("VALIDATION_ERROR", "Unknown step.", 422);
      if (!remark) return fail("VALIDATION_ERROR", "Say what needs to be corrected.", 422, { remark: "Please add a remark." });
      fresh.push({ id: crypto.randomUUID(), section, field: it.field ? String(it.field).slice(0, 120) : null, remark: remark.slice(0, 500), requested_at: now, requested_by: actor, resolved_at: null });
    }
    await svc.from("joining_profiles").update({ status: "correction_required", corrections: [...(p.corrections ?? []), ...fresh] }).eq("id", p.id);
    for (const c of fresh) await log({ kind: "correction", section: c.section, field: c.field, remark: c.remark });
    await log({ kind: "status", old_value: { status: p.status }, new_value: { status: "correction_required" } });
    await audit(svc, { actor_profile_id: me.id, actor_label: actor, action: "joining.correction_requested", entity_type: "joining_profile", entity_id: p.id, new_state: { items: fresh.length } });
    await svc.from("joining_profiles").update({ decided_by: actor, decided_at: now, decision_remarks: fresh.map((c) => c.remark).join(" | ").slice(0, 1000) }).eq("id", p.id);
    const synced = await notifyRecruitment(p.source_application_id, "correction_required",
      `HR asked for a correction in your joining form: ${fresh.map((c) => c.remark).join(" · ").slice(0, 300)}`);
    return ok({ status: "correction_required", synced });
  }

  if (action === "start_review") {
    if (!["submitted", "resubmitted"].includes(p.status)) return fail("INVALID_STATE", "Nothing waiting for review.", 409);
    await svc.from("joining_profiles").update({ status: "under_review", review_started_at: now }).eq("id", p.id);
    await log({ kind: "status", old_value: { status: p.status }, new_value: { status: "under_review" } });
    return ok({ status: "under_review" });
  }

  if (action === "verify") {
    if (!["submitted", "resubmitted", "under_review"].includes(p.status)) return fail("INVALID_STATE", "The form must be submitted before it can be verified.", 409);
    if (open.length) return fail("INVALID_STATE", "There are open corrections.", 409);
    await svc.from("joining_profiles").update({ status: "verified", verified_at: now }).eq("id", p.id);
    await log({ kind: "status", old_value: { status: p.status }, new_value: { status: "verified" } });
    await svc.from("joining_profiles").update({ decided_by: actor, decided_at: now }).eq("id", p.id);
    await audit(svc, { actor_profile_id: me.id, actor_label: actor, action: "joining.verified", entity_type: "joining_profile", entity_id: p.id });
    try { await storeOnboardingPdf(svc, p.id, "Approved", actor); } catch (e) { console.error("pdf", String(e).slice(0, 300)); }
    const synced = await notifyRecruitment(p.source_application_id, "verified", "HR has verified your joining form.");
    return ok({ status: "verified", synced });
  }

  // complete
  if (p.status !== "verified") return fail("INVALID_STATE", "Verify the joining form before completing it.", 409);
  await svc.from("joining_profiles").update({ status: "completed", completed_at: now }).eq("id", p.id);
  await log({ kind: "status", old_value: { status: "verified" }, new_value: { status: "completed" } });
  await audit(svc, { actor_profile_id: me.id, actor_label: actor, action: "joining.completed", entity_type: "joining_profile", entity_id: p.id });
  try { await storeOnboardingPdf(svc, p.id, "Finalised", actor); } catch (e) { console.error("pdf", String(e).slice(0, 300)); }
  const synced = await notifyRecruitment(p.source_application_id, "completed", "Your joining formalities are complete.");
  return ok({ status: "completed", synced, name: caseRow?.candidate_name ?? null });
});
