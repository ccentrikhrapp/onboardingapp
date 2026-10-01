// Joining documents — server side of the requirement engine (see joiningSchema.ts).
// Keeps one joining_document_items row per APPLICABLE requirement instance for
// an employee, in step with their answers, and builds the view both the
// employee and HR see.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  DOC_REFERENCE, DocItemState, DocRef, DocReq, deriveRequirements, docLabel, docSummary, docUnits, isResolved, normalizeData, sectionProgress, SECTIONS,
} from "./joiningSchema.ts";

/** Built-in defaults overlaid with whatever HR/Admin configured (only the switches HR may change). */
export async function loadConfig(svc: SupabaseClient): Promise<DocRef[]> {
  const { data: rows } = await svc.from("joining_document_config").select("*");
  const by = new Map((rows ?? []).map((r: any) => [r.ref_key, r]));
  return DOC_REFERENCE.map((d) => {
    const c: any = by.get(d.key);
    if (!c) return d;
    return {
      ...d,
      name: c.name || d.name,
      classification: c.classification,
      cannotProvide: c.cannot_provide_allowed,
      naAllowed: c.na_allowed,
      hrApproval: c.hr_approval_required,
      maxFiles: c.max_files,
      reasons: c.reasons?.length ? c.reasons : d.reasons,
      active: c.active,
    };
  });
}

const stateOf = (r: any): DocItemState => ({ status: r.status, choice: r.choice, files: r.files, reasonText: r.reason_text, hrRemarks: r.hr_remarks });

/** Bring the stored rows in line with the employee's current answers. Employee/HR decisions are never overwritten. */
export async function syncItems(svc: SupabaseClient, profileId: string, rawData: any) {
  const cfg = await loadConfig(svc);
  const data = normalizeData(rawData);
  const reqs = deriveRequirements(data, cfg);
  const { data: rows } = await svc.from("joining_document_items").select("*").eq("joining_profile_id", profileId);
  const existing = new Map<string, any>((rows ?? []).map((r: any) => [r.item_key, r]));
  const employmentComplete = sectionProgress(SECTIONS.find((s) => s.id === "employment")!, data).percent === 100;

  const inserts: any[] = [];
  for (const r of reqs) {
    const ex = existing.get(r.itemKey);
    existing.delete(r.itemKey);
    // The employment-details item is filled from the form itself: once that step is complete it goes to HR as "pending review".
    const autoSubmit = r.dataOnly && r.applicability === "applicable" && employmentComplete;
    if (!ex) {
      inserts.push({
        joining_profile_id: profileId, item_key: r.itemKey, ref_key: r.refKey, employer_index: r.employerIndex ?? null,
        label: r.name, applicability: r.applicability, na_reason: r.naReason ?? null,
        ...(autoSubmit ? { status: "submitted", choice: "upload" } : {}),
      });
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (ex.label !== r.name) patch.label = r.name;
    if (ex.applicability !== r.applicability) patch.applicability = r.applicability;
    if ((ex.na_reason ?? null) !== (r.naReason ?? null)) patch.na_reason = r.naReason ?? null;
    if (autoSubmit && ex.status === "awaiting") { patch.status = "submitted"; patch.choice = "upload"; }
    if (Object.keys(patch).length) await svc.from("joining_document_items").update(patch).eq("id", ex.id);
  }
  if (inserts.length) await svc.from("joining_document_items").insert(inserts);

  // Requirements that no longer apply (e.g. an employer was removed): drop untouched ones, keep anything already submitted/decided.
  for (const ex of existing.values()) {
    const touched = ex.status !== "awaiting" || (ex.files ?? []).length > 0;
    if (!touched) await svc.from("joining_document_items").delete().eq("id", ex.id);
    else if (ex.applicability !== "not_applicable") {
      await svc.from("joining_document_items").update({ applicability: "not_applicable", na_reason: "No longer applies to your current answers" }).eq("id", ex.id);
    }
  }
  return { cfg, reqs };
}

/** Requirements + what the employee/HR did on each, plus the summary. */
export async function buildDocuments(svc: SupabaseClient, profileId: string, rawData: any) {
  const { cfg, reqs } = await syncItems(svc, profileId, rawData);
  const { data: rows } = await svc.from("joining_document_items").select("*").eq("joining_profile_id", profileId);
  const row = new Map<string, any>((rows ?? []).map((r: any) => [r.item_key, r]));
  const states: Record<string, DocItemState> = {};
  for (const r of reqs) states[r.itemKey] = row.get(r.itemKey) ? stateOf(row.get(r.itemKey)) : {};
  const summary = docSummary(reqs, states, cfg.filter((c) => c.active !== false).length);
  const units = docUnits(reqs, states);

  const items = reqs.map((r: DocReq) => {
    const x = row.get(r.itemKey);
    const s = states[r.itemKey];
    const lab = docLabel(r, s);
    return {
      itemKey: r.itemKey, refKey: r.refKey, name: r.name, group: r.group, classification: r.classification, applicability: r.applicability,
      naReason: r.naReason ?? null, employerIndex: r.employerIndex ?? null, anyOf: r.anyOf ?? null, cannotProvide: r.cannotProvide, naAllowed: r.naAllowed,
      dataOnly: !!r.dataOnly, maxFiles: r.maxFiles, reasons: r.reasons, hint: r.hint ?? null,
      status: s.status ?? "awaiting", choice: x?.choice ?? null, reasonCategory: x?.reason_category ?? null, reasonText: x?.reason_text ?? null,
      files: (x?.files ?? []).map((f: any) => ({ name: f.name, mime: f.mime, size: f.size })), hrRemarks: x?.hr_remarks ?? null,
      decidedByName: x?.decided_by_name ?? null, decidedAt: x?.decided_at ?? null,
      label: lab.label, tone: lab.tone, resolved: isResolved(r, s),
    };
  });
  const employers = (normalizeData(rawData)?.employment?.previous ?? []).length;
  const fresher = normalizeData(rawData)?.employment?.summary?.isFresher;
  return {
    items, summary,
    identityResolved: units.find((u) => u.key === "identity_proof")?.resolved ?? false,
    employmentType: fresher === "Yes" ? "Fresher" : fresher === "No" ? "Experienced" : "Not answered yet",
    previousEmployers: employers,
  };
}
