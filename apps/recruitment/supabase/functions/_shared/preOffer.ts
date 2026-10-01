// Pre-offer documents — which requirements APPLY to this candidate.
//
// The reference checklist (document_requirements) lists every document that
// might ever be needed. It is NOT a rule that everyone provides all of them:
// this works out, from the candidate's own data and answers, which rows they
// get, which are "not applicable", and how many previous-employer sets exist.
//
// Inputs:  applications.professional.totalExperience  -> fresher / experienced
//          applications.additional.docAnswers          -> { previousEmployers: [{ name }], holdingOtherOffer,
//                                                            permanentSameAsCurrent, nameChanged }
// Output:  application_documents rows kept in step (created / made applicable / made not-applicable).
//          Anything the candidate or a reviewer has already acted on is never overwritten or deleted.

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { DocRow, summarizeDocuments } from "./documentRules.ts";
import { callHr } from "./hrIntegration.ts";

export type DocAnswers = {
  previousEmployers?: { name?: string }[];
  holdingOtherOffer?: "Yes" | "No";
  permanentSameAsCurrent?: "Yes" | "No";
  nameChanged?: "Yes" | "No";
};

export const MAX_EMPLOYERS = 10;

export const candidateTypeOf = (app: any): "fresher" | "experienced" => (Number(app?.professional?.totalExperience ?? 0) > 0 ? "experienced" : "fresher");

type Wanted = { requirement_id: string; employer_index: number | null; employer_label: string | null; applicable: boolean; na_reason: string | null };

export function deriveWanted(app: any, requirements: any[]): Wanted[] {
  const type = candidateTypeOf(app);
  const a: DocAnswers = app?.additional?.docAnswers ?? {};
  const employers = (a.previousEmployers ?? []).slice(0, MAX_EMPLOYERS);
  const out: Wanted[] = [];
  for (const r of requirements) {
    const one = (applicable: boolean, na: string | null = null): Wanted => ({ requirement_id: r.id, employer_index: null, employer_label: null, applicable, na_reason: applicable ? null : na });
    if (r.per_employer) {
      if (type === "fresher") { out.push(one(false, "Fresher")); continue; }
      const n = Math.max(1, employers.length);
      for (let i = 0; i < n; i++) {
        const nm = String(employers[i]?.name ?? "").trim();
        out.push({ requirement_id: r.id, employer_index: i + 1, employer_label: nm || `Employer ${i + 1}`, applicable: true, na_reason: null });
      }
      continue;
    }
    switch (r.key) {
      case "increment_letter":
      case "employment_history": out.push(one(type === "experienced", "Fresher")); break;
      case "current_offer_letter": out.push(one(a.holdingOtherOffer === "Yes", "No other offer held")); break;
      case "address_proof_permanent": out.push(one(a.permanentSameAsCurrent !== "Yes", "Same as current address — one proof covers both")); break;
      case "name_change_proof": out.push(one(a.nameChanged === "Yes", "Name has not changed")); break;
      default: out.push(one(true));
    }
  }
  return out;
}

/** Bring application_documents in line with what applies to this candidate. Returns the current rows. */
export async function syncPreOfferRows(svc: SupabaseClient, applicationId: string) {
  const { data: app } = await svc.from("applications").select("id, professional, additional").eq("id", applicationId).maybeSingle();
  if (!app) return [];
  const { data: requirements } = await svc.from("document_requirements").select("id, key, per_employer, active").eq("stage", "pre_offer").eq("active", true);
  const { data: rows } = await svc
    .from("application_documents")
    .select("id, requirement_id, employer_index, employer_label, status, na_reason, document_requirements!inner(stage)")
    .eq("application_id", applicationId)
    .eq("document_requirements.stage", "pre_offer");

  const wanted = deriveWanted(app, requirements ?? []);
  const keyOf = (rid: string, idx: number | null) => `${rid}:${idx ?? 0}`;
  const existing = new Map<string, any>((rows ?? []).map((r: any) => [keyOf(r.requirement_id, r.employer_index), r]));
  const inserts: any[] = [];

  for (const w of wanted) {
    const ex = existing.get(keyOf(w.requirement_id, w.employer_index));
    existing.delete(keyOf(w.requirement_id, w.employer_index));
    if (!ex) {
      inserts.push({
        application_id: applicationId, requirement_id: w.requirement_id, employer_index: w.employer_index, employer_label: w.employer_label,
        // slot_key is NOT NULL (default 'default'); per-employer rows need their own value so the unique index holds
        slot_key: w.employer_index ? `employer-${w.employer_index}` : "default",
        status: w.applicable ? "requested" : "not_applicable", na_reason: w.applicable ? null : w.na_reason,
      });
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (w.applicable && ex.status === "not_applicable") { patch.status = "requested"; patch.na_reason = null; }
    if (!w.applicable && ex.status === "requested") { patch.status = "not_applicable"; patch.na_reason = w.na_reason; }
    if (!w.applicable && ex.status === "not_applicable" && ex.na_reason !== w.na_reason) patch.na_reason = w.na_reason;
    if (w.applicable && (ex.employer_label ?? null) !== (w.employer_label ?? null)) patch.employer_label = w.employer_label;
    if (Object.keys(patch).length) await svc.from("application_documents").update(patch).eq("id", ex.id);
  }
  if (inserts.length) {
    const { error } = await svc.from("application_documents").insert(inserts);
    if (error) throw new Error(`Could not create the document checklist: ${error.message}`);
  }

  // Rows that no longer apply (e.g. an employer was removed): drop untouched ones; keep anything already acted on.
  for (const ex of existing.values()) {
    if (["requested", "not_applicable"].includes(ex.status)) await svc.from("application_documents").delete().eq("id", ex.id);
  }
  const { data: fresh } = await svc
    .from("application_documents")
    .select("*, document_requirements(*)")
    .eq("application_id", applicationId);
  return (fresh ?? []).filter((r: any) => r.document_requirements?.stage === "pre_offer");
}

/** Tell HR the current picture for this application (best effort — HR also gets it with every forwarded document). */
export async function pushSummary(svc: SupabaseClient, applicationId: string) {
  const { data: app } = await svc.from("applications").select("id, professional, additional, application_code, candidates(first_name, last_name, email)").eq("id", applicationId).maybeSingle();
  if (!app) return;
  const { data: rows } = await svc.from("application_documents").select("status, employer_label, cannot_provide_reason, na_reason, document_requirements(key, name, requirement_class, any_of_group, stage)").eq("application_id", applicationId);
  const pre = ((rows ?? []) as any[]).filter((r) => r.document_requirements?.stage === "pre_offer") as DocRow[];
  const { count } = await svc.from("document_requirements").select("id", { count: "exact", head: true }).eq("stage", "pre_offer").eq("active", true);
  const summary = summarizeDocuments(pre, count ?? 0);
  const a: DocAnswers = (app as any).additional?.docAnswers ?? {};
  const c = (app as any).candidates;
  await callHr(svc, "integration-document-summary", "DOCUMENT_SUMMARY", `docsum-${applicationId}-${Date.now()}`, {
    sourceApplicationId: applicationId,
    candidate: { name: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(), email: c?.email ?? null },
    employmentType: candidateTypeOf(app),
    previousEmployers: candidateTypeOf(app) === "fresher" ? 0 : Math.max(1, (a.previousEmployers ?? []).length),
    summary,
  }, { entity_type: "application", entity_id: applicationId });
}
