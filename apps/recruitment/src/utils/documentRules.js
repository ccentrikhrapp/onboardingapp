// Same rules as supabase/functions/_shared/documentRules.ts (edge functions
// can't import from src/) — keep the two in step.
//   mandatory             -> must be uploaded and verified; never "Can't provide"
//   anything else         -> optional; never blocks verification
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

export const canSkip = (r) => !isMandatory(r) && !!r?.can_mark_cannot_provide;

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
