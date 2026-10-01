// POST /functions/v1/integration-joining-profile
// Inbound from the recruitment app on behalf of the signed-in employee/candidate
// (the recruitment app has already authenticated them and resolved which
// application is theirs). Service-to-service only — never a user session.
//
// Body: { action: 'get' | 'save_section' | 'submit', sourceApplicationId, ... }
//   get:           { seed? }   seed = { data } pre-fill from the candidate application, used only when the profile is first created
//   save_section:  { section, values, actorName }   values = { groupId: object | array }
//   submit:        { signatureName, actorName }
//   doc_submit:    { itemKey, choice: 'upload'|'cannot_provide'|'not_applicable', files?, reasonCategory?, reasonText? }  one document requirement
//
// Rules enforced here (not only in the UI): the form locks after submit, a
// correction request re-opens ONLY the flagged steps, every changed field is
// written to the audit trail with its source, and the profile can only be
// submitted when the shared schema says it is complete.

import { fail, ok, preflight } from "../_shared/http.ts";
import { serviceClient } from "../_shared/supabase.ts";
import { verifyServiceRequest } from "../_shared/serviceAuth.ts";
import { EDITABLE_STATUSES, SECTIONS, maskValue, normalizeData, validateAll } from "../_shared/joiningSchema.ts";
import { buildDocuments, loadConfig } from "../_shared/joiningDocs.ts";

const SECTION_BY_ID = new Map(SECTIONS.map((s) => [s.id, s]));

// leaf key -> sensitive kind, so the audit trail never stores a raw Aadhaar/PAN/bank number
const SENSITIVE_KEYS = new Map<string, string>();
for (const s of SECTIONS) for (const g of s.groups) for (const f of g.fields) if (f.sensitive) SENSITIVE_KEYS.set(`${s.id}.${g.id}.${f.key}`, f.sensitive);

function sanitizeSection(sectionId: string, values: Record<string, any>) {
  const section = SECTION_BY_ID.get(sectionId)!;
  const out: Record<string, any> = {};
  for (const g of section.groups) {
    if (!(g.id in values)) continue;
    const raw = values[g.id];
    const cleanRow = (row: any) => {
      const r: Record<string, string> = {};
      for (const f of g.fields) {
        const v = row?.[f.key];
        if (v === undefined || v === null || String(v).trim() === "") continue;
        r[f.key] = String(v).trim().slice(0, f.type === "textarea" ? 1000 : 300);
      }
      return r;
    };
    out[g.id] = g.kind === "list" ? (Array.isArray(raw) ? raw.slice(0, 50).map(cleanRow) : []) : cleanRow(raw);
  }
  return out;
}

function flatten(sectionId: string, obj: any): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [gid, val] of Object.entries(obj ?? {})) {
    if (Array.isArray(val)) {
      val.forEach((row, i) => { for (const [k, v] of Object.entries(row ?? {})) out[`${sectionId}.${gid}.${i}.${k}`] = String(v); });
    } else {
      for (const [k, v] of Object.entries(val ?? {})) out[`${sectionId}.${gid}.${k}`] = String(v);
    }
  }
  return out;
}
const leafKind = (path: string) => {
  const parts = path.split(".");
  const key = parts.filter((p) => !/^\d+$/.test(p)).join(".");
  return SENSITIVE_KEYS.get(key);
};

function flattenAll(data: any) {
  const out: Record<string, string> = {};
  for (const [sid, groups] of Object.entries(data ?? {})) Object.assign(out, flatten(sid, groups));
  return out;
}

async function loadCase(svc: any, sourceApplicationId: string) {
  const { data } = await svc
    .from("onboarding_cases")
    .select("id, candidate_name, candidate_email, job_title, department, designation, joining_date")
    .eq("source_application_id", sourceApplicationId)
    .maybeSingle();
  return data;
}

async function buildResponse(svc: any, profile: any, caseRow: any, extras: Record<string, unknown> = {}) {
  const v = validateAll(profile.data);
  const open = (profile.corrections ?? []).filter((c: any) => !c.resolved_at);
  const editable = profile.status === "not_started" || profile.status === "in_progress"
    ? { all: true, sections: SECTIONS.map((s) => s.id) }
    : profile.status === "correction_required"
      ? { all: false, sections: [...new Set(open.map((c: any) => c.section))] }
      : { all: false, sections: [] as string[] };
  return {
    id: profile.id,
    status: profile.status,
    completion: v.percent,
    sections: Object.fromEntries(Object.entries(v.sections).map(([k, s]: any) => [k, { done: s.done, total: s.total, percent: s.percent }])),
    data: normalizeData(profile.data),
    fieldSources: profile.field_sources ?? {},
    hrFields: profile.hr_fields ?? {},
    corrections: open,
    documents: { ...(await buildDocuments(svc, profile.id, profile.data)), approvedAt: profile.documents_approved_at ?? null },
    editable,
    signature: profile.signature ?? null,
    submittedAt: profile.submitted_at,
    caseInfo: {
      name: caseRow?.candidate_name ?? null, email: caseRow?.candidate_email ?? null,
      designation: caseRow?.designation ?? null, jobTitle: caseRow?.job_title ?? null, joiningDate: caseRow?.joining_date ?? null,
    },
    ...extras,
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  if (!verifyServiceRequest(req)) return fail("FORBIDDEN", "Invalid service credentials.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const { action, sourceApplicationId } = body;
  if (!sourceApplicationId || !["get", "save_section", "submit", "doc_submit"].includes(action)) return fail("VALIDATION_ERROR", "Invalid request.", 422);

  const svc = serviceClient();
  const caseRow = await loadCase(svc, sourceApplicationId);
  if (!caseRow) return fail("NOT_STARTED", "Your joining form isn't open yet — HR will start onboarding after your offer is accepted.", 404);

  let { data: profile } = await svc.from("joining_profiles").select("*").eq("source_application_id", sourceApplicationId).maybeSingle();

  // First open: create the profile, pre-filled from the candidate application (source = candidate_application).
  if (!profile) {
    const seedData = normalizeData(body.seed?.data ?? {});
    const sources: Record<string, string> = {};
    for (const p of Object.keys(flattenAll(seedData))) sources[p] = "candidate_application";
    const { data: emp } = await svc.from("employees").select("employee_code").eq("onboarding_case_id", caseRow.id).maybeSingle();
    const hr: Record<string, string> = { branchName: "Noida" };
    if (caseRow.designation) hr.designation = caseRow.designation;
    if (caseRow.department) hr.department = caseRow.department;
    if (caseRow.joining_date) hr.dateOfJoining = caseRow.joining_date;
    if (emp?.employee_code) hr.employeeCode = emp.employee_code;
    const { data: created, error } = await svc
      .from("joining_profiles")
      .insert({
        onboarding_case_id: caseRow.id, source_application_id: sourceApplicationId,
        data: seedData, field_sources: sources, hr_fields: hr, completion: validateAll(seedData).percent,
      })
      .select("*")
      .single();
    if (error || !created) return fail("DB_ERROR", "Could not open your joining form.", 500);
    profile = created;
    await svc.from("joining_profile_events").insert({ joining_profile_id: profile.id, kind: "status", new_value: { status: "not_started" }, actor_label: "System", remark: "Joining form opened" });
  }

  if (action === "get") return ok(await buildResponse(svc, profile, caseRow));

  const actorName = String(body.actorName ?? caseRow.candidate_name ?? "Employee").slice(0, 120);
  const open = (profile.corrections ?? []).filter((c: any) => !c.resolved_at);
  const canEditSection = (sid: string) =>
    profile!.status === "not_started" || profile!.status === "in_progress" ||
    (profile!.status === "correction_required" && open.some((c: any) => c.section === sid));


  // ---- one document requirement: upload files, or say why you can't ----
  if (action === "doc_submit") {
    const itemKey = String(body.itemKey ?? "");
    const { data: item } = await svc.from("joining_document_items").select("*").eq("joining_profile_id", profile.id).eq("item_key", itemKey).maybeSingle();
    if (!item) return fail("NOT_FOUND", "That document isn't on your list.", 404);
    if (["approved", "approved_with_reason", "na_accepted"].includes(item.status)) return fail("LOCKED", "HR has already accepted this one.", 409);
    if (item.applicability === "not_applicable") return fail("NOT_APPLICABLE", "This document doesn't apply to you.", 409);
    const cfg = (await loadConfig(svc)).find((c) => c.key === item.ref_key);
    if (!cfg || cfg.dataOnly) return fail("NOT_APPLICABLE", "This item is filled from your form — nothing to upload.", 409);

    const choice = String(body.choice ?? "");
    const fields: Record<string, string> = {};
    const patch: Record<string, unknown> = { employee_updated_at: new Date().toISOString(), hr_remarks: item.hr_remarks };
    if (choice === "upload") {
      const files = Array.isArray(body.files) ? body.files : [];
      const prefix = `${sourceApplicationId}/joining/`;
      if (files.length < 1) fields.files = "Choose at least one file.";
      else if (files.length > cfg.maxFiles) fields.files = `You can upload up to ${cfg.maxFiles} file(s) here.`;
      else if (files.some((f: any) => typeof f?.path !== "string" || !f.path.startsWith(prefix) || f.path.includes(".."))) fields.files = "Invalid file.";
      if (Object.keys(fields).length) return fail("VALIDATION_ERROR", fields.files, 422, fields);
      patch.files = files.map((f: any) => ({ path: f.path, name: String(f.name ?? "").slice(0, 200), mime: String(f.mime ?? "").slice(0, 100), size: Number(f.size) || 0 }));
      patch.choice = "upload"; patch.reason_category = null; patch.reason_text = null; patch.status = "submitted";
    } else if (choice === "cannot_provide" || choice === "not_applicable") {
      if (choice === "cannot_provide" && !cfg.cannotProvide) return fail("NOT_ALLOWED", "This document can't be marked 'cannot provide'.", 409);
      if (choice === "not_applicable" && !cfg.naAllowed) return fail("NOT_ALLOWED", "This document can't be marked 'not applicable'.", 409);
      const reasonText = String(body.reasonText ?? "").trim();
      const category = String(body.reasonCategory ?? "").trim();
      if (choice === "cannot_provide" && !cfg.reasons.includes(category)) fields.reasonCategory = "Choose a reason.";
      if (reasonText.length < 5) fields.reasonText = "Please explain in a few words.";
      if (Object.keys(fields).length) return fail("VALIDATION_ERROR", "A reason is needed.", 422, fields);
      patch.choice = choice; patch.reason_category = category || null; patch.reason_text = reasonText.slice(0, 500); patch.files = []; patch.status = "reason_submitted";
    } else {
      return fail("VALIDATION_ERROR", "Choose Upload or Cannot provide.", 422);
    }
    await svc.from("joining_document_items").update(patch).eq("id", item.id);
    await svc.from("joining_profile_events").insert({
      joining_profile_id: profile.id, kind: "document", field: itemKey, actor_label: actorName,
      old_value: { status: item.status }, new_value: { status: patch.status, choice },
      remark: choice === "upload" ? `${(patch.files as any[]).length} file(s)` : String(patch.reason_text),
    });
    // The employee answered an HR question / rejection — let HR know it's back for review.
    if (["clarification_required", "rejected"].includes(item.status)) {
      await svc.from("notifications").insert({
        recipient_role: "hr", title: "Joining document updated", message: `${caseRow.candidate_name ?? "A new joiner"} responded on "${item.label}".`,
        type: "joining_document", entity_type: "joining_profile", entity_id: profile.id,
      });
    }
    return ok(await buildResponse(svc, profile, caseRow));
  }

  if (action === "save_section") {
    const sid = String(body.section ?? "");
    if (!SECTION_BY_ID.has(sid)) return fail("VALIDATION_ERROR", "Unknown step.", 422);
    if (!EDITABLE_STATUSES.includes(profile.status) || !canEditSection(sid)) {
      return fail("LOCKED", "This part of the form can't be edited right now.", 409);
    }
    if (typeof body.values !== "object" || body.values === null) return fail("VALIDATION_ERROR", "Nothing to save.", 422);

    const clean = sanitizeSection(sid, body.values);
    const before = flatten(sid, profile.data?.[sid]);
    const merged = { ...(profile.data ?? {}), [sid]: { ...(profile.data?.[sid] ?? {}), ...clean } };
    const data = normalizeData(merged);
    const after = flatten(sid, data[sid]);

    const sources = { ...(profile.field_sources ?? {}) };
    const events: any[] = [];
    for (const p of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[p] === after[p]) continue;
      // fields the system derives itself (experience, copied permanent address, minor flag) aren't the employee's edits
      const derived = /\.(totalExperience|minor)$/.test(p) || (p.startsWith("address.permanent.") && after["address.sameAs.permanentSameAsCurrent"] === "Yes");
      if (!derived) sources[p] = "employee";
      const kind = leafKind(p);
      if (events.length < 300) {
        events.push({
          joining_profile_id: profile.id, kind: "field_change", section: sid, field: p,
          old_value: before[p] === undefined ? null : kind ? maskValue(kind, before[p]) : before[p],
          new_value: after[p] === undefined ? null : kind ? maskValue(kind, after[p]) : after[p],
          actor_label: actorName,
        });
      }
    }

    const completion = validateAll(data).percent;
    const status = profile.status === "not_started" ? "in_progress" : profile.status;
    const { data: saved, error } = await svc
      .from("joining_profiles")
      .update({ data, field_sources: sources, completion, status, last_saved_at: new Date().toISOString() })
      .eq("id", profile.id)
      .select("*")
      .single();
    if (error || !saved) return fail("DB_ERROR", "Could not save. Please try again.", 500);
    if (events.length) await svc.from("joining_profile_events").insert(events);
    if (status !== profile.status) {
      await svc.from("joining_profile_events").insert({ joining_profile_id: profile.id, kind: "status", old_value: { status: profile.status }, new_value: { status }, actor_label: actorName });
    }
    return ok(await buildResponse(svc, saved, caseRow));
  }

  // ---- submit ----
  if (!EDITABLE_STATUSES.includes(profile.status)) return fail("LOCKED", "This form has already been submitted.", 409);
  const data = normalizeData(profile.data);
  const v = validateAll(data);
  if (!v.complete) {
    const fields: Record<string, string> = {};
    for (const [k, msg] of Object.entries(v.errors).slice(0, 25)) fields[k] = msg;
    return fail("INCOMPLETE", "Please complete every required step before submitting.", 422, fields);
  }
  if (profile.status === "correction_required" && open.length === 0) return fail("INVALID_STATE", "Nothing to resubmit.", 409);

  const typed = String(body.signatureName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const expected = String(data?.personal?.main?.fullName ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!typed || typed !== expected) {
    return fail("SIGNATURE_MISMATCH", "Type your full name exactly as entered in the Personal step to sign.", 422, { signatureName: "Must match your full name." });
  }

  const now = new Date().toISOString();
  const resub = profile.status === "correction_required";
  const signature = { name: String(body.signatureName).trim(), at: now };
  const corrections = (profile.corrections ?? []).map((c: any) => (c.resolved_at ? c : { ...c, resolved_at: now }));
  const nextStatus = resub ? "resubmitted" : "submitted";
  const { data: saved, error } = await svc
    .from("joining_profiles")
    .update({
      status: nextStatus, signature, corrections, completion: v.percent,
      ...(resub ? { resubmitted_at: now } : { submitted_at: now }),
    })
    .eq("id", profile.id)
    .select("*")
    .single();
  if (error || !saved) return fail("DB_ERROR", "Could not submit. Please try again.", 500);

  await svc.from("joining_profile_snapshots").insert({
    joining_profile_id: profile.id, kind: nextStatus, data, hr_fields: profile.hr_fields ?? {}, signature,
  });
  await svc.from("joining_profile_events").insert([
    { joining_profile_id: profile.id, kind: "submit", old_value: { status: profile.status }, new_value: { status: nextStatus }, actor_label: actorName, remark: `Signed as "${signature.name}"` },
  ]);
  await svc.from("notifications").insert({
    recipient_role: "hr",
    title: resub ? "Joining form resubmitted" : "Joining form submitted",
    message: `${caseRow.candidate_name ?? "A new joiner"} ${resub ? "resubmitted" : "submitted"} the joining form for review.`,
    type: "joining_form_submitted", entity_type: "joining_profile", entity_id: profile.id,
  });
  return ok(await buildResponse(svc, saved, caseRow));
});
