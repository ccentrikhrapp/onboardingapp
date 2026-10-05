// POST /functions/v1/joining-pdf
// Auth: any active HR / Super Admin profile.
// Actions:
//   list  { profileId }                 -> every stored version, newest first
//   url   { profileId, version? }       -> short-lived signed link to one version (default: latest),
//                                          downloaded under its proper filename
// PDFs are never public; a link expires after five minutes and is only issued here.

import { fail, ok, preflight } from "../_shared/http.ts";
import { audit, currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed request.", 400); }
  if (!body.profileId) return fail("VALIDATION_ERROR", "Missing record.", 422);
  const svc = serviceClient();

  if (body.action === "list") {
    const { data } = await svc.from("joining_pdfs")
      .select("id, version, label, status_at_creation, file_name, size_bytes, created_by, created_at")
      .eq("joining_profile_id", body.profileId).order("version", { ascending: false });
    return ok({ versions: data ?? [] });
  }

  if (body.action === "url") {
    let q = svc.from("joining_pdfs").select("id, version, storage_path, file_name").eq("joining_profile_id", body.profileId);
    q = body.version ? q.eq("version", Number(body.version)) : q.order("version", { ascending: false }).limit(1);
    const { data: pdf } = await (body.version ? q.maybeSingle() : q.maybeSingle());
    if (!pdf) return fail("NOT_FOUND", "No document has been generated for this record yet.", 404);
    const { data, error } = await svc.storage.from("joining-pdfs").createSignedUrl(pdf.storage_path, 300, { download: pdf.file_name });
    if (error || !data) return fail("FILE_UNAVAILABLE", "Could not open this document. Please try again.", 500);
    await audit(svc, { actor_profile_id: me.id, actor_label: me.full_name ?? me.email, action: "joining.pdf_downloaded", entity_type: "joining_pdf", entity_id: pdf.id, new_state: { version: pdf.version } });
    return ok({ url: data.signedUrl, fileName: pdf.file_name, version: pdf.version });
  }

  return fail("VALIDATION_ERROR", "Unknown action.", 422);
});
