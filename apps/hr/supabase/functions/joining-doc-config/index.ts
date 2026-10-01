// POST /functions/v1/joining-doc-config
// Auth: Super Admin (HR project role "admin"). Reads / updates the rules for
// each reference joining document: mandatory (critical) / conditional /
// optional, whether "cannot provide" and "not applicable" are allowed,
// whether HR approval is required, and how many files.
//
// Body: { action: 'list' } | { action: 'update', refKey, classification?, cannotProvide?, naAllowed?, hrApproval?, maxFiles?, active? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";
import { DOC_REFERENCE } from "../_shared/joiningSchema.ts";
import { loadConfig } from "../_shared/joiningDocs.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  const me = await currentProfile(req);
  if (!me || me.role !== "admin") return fail("FORBIDDEN", "Only a Super Admin can change document rules.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const svc = serviceClient();

  if (body.action === "list") return ok({ config: await loadConfig(svc) });
  if (body.action !== "update") return fail("VALIDATION_ERROR", "Invalid request.", 422);

  const def = DOC_REFERENCE.find((d) => d.key === body.refKey);
  if (!def) return fail("NOT_FOUND", "Unknown document.", 404);
  const current = (await loadConfig(svc)).find((d) => d.key === def.key)!;
  const next = {
    classification: body.classification ?? current.classification,
    cannotProvide: body.cannotProvide ?? current.cannotProvide,
    naAllowed: body.naAllowed ?? current.naAllowed,
    hrApproval: body.hrApproval ?? current.hrApproval,
    maxFiles: body.maxFiles ?? current.maxFiles,
    active: body.active ?? current.active,
  };
  if (!["critical", "conditional", "optional"].includes(next.classification)) return fail("VALIDATION_ERROR", "Choose Mandatory, Conditional or Optional.", 422);
  const mf = Number(next.maxFiles);
  if (!Number.isInteger(mf) || mf < 0 || mf > 30) return fail("VALIDATION_ERROR", "Files must be between 0 and 30.", 422);
  if (def.dataOnly && (next.cannotProvide || mf !== 0)) return fail("VALIDATION_ERROR", "This item is filled from the form, not uploaded.", 422);

  const { error } = await svc.from("joining_document_config").upsert({
    ref_key: def.key, name: current.name, doc_group: def.group, classification: next.classification,
    cannot_provide_allowed: !!next.cannotProvide, na_allowed: !!next.naAllowed, hr_approval_required: !!next.hrApproval,
    max_files: mf, reasons: current.reasons, active: !!next.active, updated_by: me.id,
  }, { onConflict: "ref_key" });
  if (error) return fail("DB_ERROR", "Could not save.", 500);
  await audit(svc, { actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "joining.doc_config", entity_type: "joining_document_config", entity_id: null, previous_state: current, new_state: next });
  return ok({ config: await loadConfig(svc) });
});
