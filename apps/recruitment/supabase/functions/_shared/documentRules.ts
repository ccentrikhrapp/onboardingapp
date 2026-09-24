// One definition of a document's rules, shared by every function that touches
// pre-offer documents. The frontend keeps an identical copy in
// src/utils/documentRules.js (edge functions can't import from src/).
//
//   mandatory              -> must be uploaded and verified; can never be "Can't provide"
//   anything else          -> optional; never blocks verification
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

/** Can "Can't provide" be used for this document? Never for a mandatory one. */
export const canSkip = (r: DocRequirement) => !isMandatory(r) && !!r.can_mark_cannot_provide;

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
