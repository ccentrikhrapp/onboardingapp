// One definition of a document's rules, shared by every function that touches
// pre-offer documents. The frontend keeps an identical copy in
// src/utils/documentRules.js (edge functions can't import from src/).
//
//   mandatory / conditional -> must be resolved (verified, or a reason the reviewer accepts) when it APPLIES to the candidate
//   optional                -> never blocks
//   requires_front_back    -> exactly two files: "front" and "back"
//   quantity_required > 1  -> that many files: "1", "2", ...
//   otherwise              -> a single file (slot = null)

export type DocRequirement = {
  requirement_class?: string | null;
  requires_front_back?: boolean | null;
  quantity_required?: number | null;
  slot_labels?: string[] | null;
  can_mark_cannot_provide?: boolean | null;
};

export const isMandatory = (r: DocRequirement | null | undefined) => r?.requirement_class === "mandatory";

/** The slot keys a document needs, or [] for an ordinary single-file document. */
export function requiredSlots(r: DocRequirement): string[] {
  if (r.requires_front_back) return ["front", "back"];
  const n = Math.max(1, Number(r.quantity_required) || 1);
  return n > 1 ? Array.from({ length: n }, (_, i) => String(i + 1)) : [];
}

export function slotLabel(r: DocRequirement, slot: string): string {
  const slots = requiredSlots(r);
  const i = slots.indexOf(slot);
  if (i >= 0 && r.slot_labels?.[i]) return r.slot_labels[i];
  if (slot === "front") return "Front side";
  if (slot === "back") return "Back side";
  return `File ${slot}`;
}

/** Can "Cannot provide" (with a reason the reviewer accepts) be used for this document? */
export const canSkip = (r: DocRequirement) => !!r.can_mark_cannot_provide;

/**
 * Which slots currently have a file. A file uploaded before slots existed
 * (slot = null) counts as the first slot, so old uploads keep counting.
 */
export function filledSlots(r: DocRequirement, currentFiles: { slot: string | null }[]): Set<string> {
  const slots = requiredSlots(r);
  const filled = new Set<string>();
  for (const f of currentFiles) {
    if (!slots.length) { filled.add("single"); continue; }
    filled.add(f.slot && slots.includes(f.slot) ? f.slot : slots[0]);
  }
  return filled;
}

/** Every required file is present. */
export function isComplete(r: DocRequirement, currentFiles: { slot: string | null }[]): boolean {
  const slots = requiredSlots(r);
  const filled = filledSlots(r, currentFiles);
  return slots.length ? slots.every((s) => filled.has(s)) : filled.size > 0;
}

/* ---------------------------------------------------------------------
   Requirement outcomes & summary (must mirror offer_eligibility() in SQL)
   ---------------------------------------------------------------------
   resolved  = verified | reason_approved | na_accepted
   blocking  = applicable (not "not_applicable") AND class mandatory/conditional AND not part of an
               any-of group; a group (PAN / Aadhaar) is ONE requirement satisfied by any one
               verified / na-accepted member. Optional documents never block. */

export const RESOLVED = ["verified", "reason_approved", "na_accepted"];

export type DocRow = {
  status: string;
  employer_label?: string | null;
  cannot_provide_reason?: string | null;
  na_reason?: string | null;
  document_requirements: { key: string; name: string; requirement_class?: string | null; any_of_group?: string | null } | null;
};

export type DocSummary = {
  totalReference: number; applicable: number; submitted: number; approved: number; approvedWithReason: number; notApplicable: number;
  pendingReview: number; reasonSubmitted: number; rejected: number; clarification: number; missing: number;
  identityResolved: boolean; unresolved: string[]; ready: boolean;
};

export function summarizeDocuments(rows: DocRow[], totalReference: number): DocSummary {
  const s: DocSummary = {
    totalReference, applicable: 0, submitted: 0, approved: 0, approvedWithReason: 0, notApplicable: 0, pendingReview: 0,
    reasonSubmitted: 0, rejected: 0, clarification: 0, missing: 0, identityResolved: false, unresolved: [], ready: true,
  };
  const groups = new Map<string, DocRow[]>();
  const units: DocRow[] = [];
  for (const r of rows) {
    const g = r.document_requirements?.any_of_group;
    if (g && r.status !== "not_applicable") { groups.set(g, [...(groups.get(g) ?? []), r]); continue; }
    units.push(r);
  }
  const count = (status: string, resolvedRow: boolean) => {
    if (status === "not_applicable" || status === "na_accepted") { s.notApplicable += 1; return; }
    s.applicable += 1;
    if (status === "verified") s.approved += 1;
    else if (status === "reason_approved") s.approvedWithReason += 1;
    else if (status === "uploaded" || status === "under_verification") s.pendingReview += 1;
    else if (status === "cannot_provide") s.reasonSubmitted += 1;
    else if (status === "rejected") s.rejected += 1;
    else if (status === "revision_required") s.clarification += 1;
    else s.missing += 1;
    if (status !== "requested") s.submitted += 1;
    void resolvedRow;
  };
  for (const r of units) {
    const c = r.document_requirements?.requirement_class;
    const resolved = RESOLVED.includes(r.status);
    count(r.status, resolved);
    if (r.status !== "not_applicable" && (c === "mandatory" || c === "conditional") && !resolved) {
      s.unresolved.push(`${r.document_requirements?.name ?? "Document"}${r.employer_label ? ` — ${r.employer_label}` : ""}`);
    }
  }
  for (const [g, members] of groups) {
    const ok = members.some((m) => m.status === "verified" || m.status === "na_accepted");
    // the group is ONE requirement: show it by its best member
    const rank = (m: DocRow) => (m.status === "verified" || m.status === "na_accepted" ? 4 : ["uploaded", "under_verification", "cannot_provide"].includes(m.status) ? 3 : ["rejected", "revision_required"].includes(m.status) ? 2 : 1);
    const best = [...members].sort((a, b) => rank(b) - rank(a))[0];
    count(best.status, ok);
    if (g === "identity_proof") s.identityResolved = ok;
    if (!ok) s.unresolved.push("Identity proof (PAN or Aadhaar)");
  }
  s.ready = s.unresolved.length === 0;
  return s;
}

/** Label + tone the candidate / TA / HR see for one document row. */
export function docStatusMeta(row: DocRow, requirementClass?: string | null): { label: string; tone: string } {
  const st = row.status;
  const cls = requirementClass ?? row.document_requirements?.requirement_class;
  switch (st) {
    case "not_applicable": return { label: `Not Applicable${row.na_reason ? ` – ${row.na_reason}` : ""}`, tone: "grey" };
    case "requested": return cls === "mandatory" ? { label: "Required", tone: "red" } : cls === "conditional" ? { label: "Applicable", tone: "blue" } : { label: "Optional", tone: "grey" };
    case "uploaded": case "under_verification": return { label: "Pending Review", tone: "amber" };
    case "cannot_provide": return { label: row.na_reason ? "Not Applicable – Reason Submitted" : "Cannot Provide – Reason Submitted", tone: "amber" };
    case "verified": return { label: "Approved", tone: "green" };
    case "reason_approved": return { label: "Approved with Reason", tone: "green" };
    case "na_accepted": return { label: "Not Required for This Employee", tone: "green" };
    case "rejected": return { label: "Rejected", tone: "red" };
    case "revision_required": return { label: "Clarification Required", tone: "red" };
    default: return { label: st, tone: "grey" };
  }
}
