// Same rules as supabase/functions/_shared/documentRules.ts (edge functions
// can't import from src/) — keep the two in step.
//   mandatory / conditional -> must be resolved when it APPLIES to the candidate (verified, or an accepted reason)
//   optional                -> never blocks
//   requires_front_back   -> two files: front + back
//   quantity_required > 1 -> that many files

export const isMandatory = (r) => r?.requirement_class === 'mandatory';

export function requiredSlots(r) {
  if (!r) return [];
  if (r.requires_front_back) return ['front', 'back'];
  const n = Math.max(1, Number(r.quantity_required) || 1);
  return n > 1 ? Array.from({ length: n }, (_, i) => String(i + 1)) : [];
}

export function slotLabel(r, slot) {
  const i = requiredSlots(r).indexOf(slot);
  if (i >= 0 && r.slot_labels?.[i]) return r.slot_labels[i];
  if (slot === 'front') return 'Front side';
  if (slot === 'back') return 'Back side';
  return `File ${slot}`;
}

export const canSkip = (r) => !!r?.can_mark_cannot_provide;

/** Current files, keyed by slot ('single' for a one-file document). A file
    from before slots existed (slot = null) counts as the first slot. */
export function currentFilesBySlot(r, files = []) {
  const slots = requiredSlots(r);
  const out = {};
  for (const f of files.filter((x) => x.is_current)) {
    const key = !slots.length ? 'single' : f.slot && slots.includes(f.slot) ? f.slot : slots[0];
    if (!out[key] || new Date(f.uploaded_at) > new Date(out[key].uploaded_at)) out[key] = f;
  }
  return out;
}

/** "1 of 2 files" progress for a document. */
export function fileProgress(r, files = []) {
  const slots = requiredSlots(r);
  const have = currentFilesBySlot(r, files);
  const total = slots.length || 1;
  const done = slots.length ? slots.filter((s) => have[s]).length : have.single ? 1 : 0;
  return { done, total };
}

/* Requirement outcomes & summary — mirrors offer_eligibility() in the database.
   resolved = verified | reason_approved | na_accepted. Blocking = applicable mandatory/conditional
   requirement; PAN/Aadhaar (an any-of group) is ONE requirement satisfied by any one verified document;
   optional and not-applicable documents never block. */
export const RESOLVED = ['verified', 'reason_approved', 'na_accepted'];

export function summarizeDocuments(rows, totalReference) {
  const s = { totalReference, applicable: 0, submitted: 0, approved: 0, approvedWithReason: 0, notApplicable: 0, pendingReview: 0, reasonSubmitted: 0, rejected: 0, clarification: 0, missing: 0, identityResolved: false, unresolved: [], ready: true };
  const groups = new Map();
  const units = [];
  for (const r of rows) {
    const g = r.document_requirements?.any_of_group;
    if (g && r.status !== 'not_applicable') { groups.set(g, [...(groups.get(g) || []), r]); continue; }
    units.push(r);
  }
  const count = (status) => {
    if (status === 'not_applicable' || status === 'na_accepted') { s.notApplicable += 1; return; }
    s.applicable += 1;
    if (status === 'verified') s.approved += 1;
    else if (status === 'reason_approved') s.approvedWithReason += 1;
    else if (status === 'uploaded' || status === 'under_verification') s.pendingReview += 1;
    else if (status === 'cannot_provide') s.reasonSubmitted += 1;
    else if (status === 'rejected') s.rejected += 1;
    else if (status === 'revision_required') s.clarification += 1;
    else s.missing += 1;
    if (status !== 'requested') s.submitted += 1;
  };
  for (const r of units) {
    const c = r.document_requirements?.requirement_class;
    const resolved = RESOLVED.includes(r.status);
    count(r.status);
    if (r.status !== 'not_applicable' && (c === 'mandatory' || c === 'conditional') && !resolved) {
      s.unresolved.push(`${r.document_requirements?.name || 'Document'}${r.employer_label ? ` — ${r.employer_label}` : ''}`);
    }
  }
  for (const [g, members] of groups) {
    const ok = members.some((m) => m.status === 'verified' || m.status === 'na_accepted');
    const rank = (m) => (m.status === 'verified' || m.status === 'na_accepted' ? 4 : ['uploaded', 'under_verification', 'cannot_provide'].includes(m.status) ? 3 : ['rejected', 'revision_required'].includes(m.status) ? 2 : 1);
    const best = [...members].sort((a, b) => rank(b) - rank(a))[0];
    count(best.status);
    if (g === 'identity_proof') s.identityResolved = ok;
    if (!ok) s.unresolved.push('Identity proof (PAN or Aadhaar)');
  }
  s.ready = s.unresolved.length === 0;
  return s;
}

/** Label + tone shown for one document row. */
export function docStatusMeta(row, requirementClass) {
  const cls = requirementClass || row.document_requirements?.requirement_class;
  switch (row.status) {
    case 'not_applicable': return { label: `Not Applicable${row.na_reason ? ` \u2013 ${row.na_reason}` : ''}`, tone: 'grey' };
    case 'requested': return cls === 'mandatory' ? { label: 'Required', tone: 'red' } : cls === 'conditional' ? { label: 'Applicable', tone: 'blue' } : { label: 'Optional', tone: 'grey' };
    case 'uploaded': case 'under_verification': return { label: 'Pending Review', tone: 'amber' };
    case 'cannot_provide': return { label: row.na_reason ? 'Not Applicable \u2013 Reason Submitted' : 'Cannot Provide \u2013 Reason Submitted', tone: 'amber' };
    case 'verified': return { label: 'Approved', tone: 'green' };
    case 'reason_approved': return { label: 'Approved with Reason', tone: 'green' };
    case 'na_accepted': return { label: 'Not Required for This Employee', tone: 'green' };
    case 'rejected': return { label: 'Rejected', tone: 'red' };
    case 'revision_required': return { label: 'Clarification Required', tone: 'red' };
    default: return { label: row.status, tone: 'grey' };
  }
}
