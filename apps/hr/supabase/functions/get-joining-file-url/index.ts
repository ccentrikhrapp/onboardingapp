// POST /functions/v1/get-joining-file-url
// Auth: HR / Super Admin. Opens a file an employee uploaded for a joining
// document requirement. The path must belong to that profile's own items —
// HR can't ask for an arbitrary storage path — and the recruitment project
// (where the file physically lives) signs the URL.
//
// Body: { profileId, itemKey, fileIndex? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);
  const me = await currentProfile(req);
  if (!me) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  if (!body.profileId || !body.itemKey) return fail("VALIDATION_ERROR", "Missing document.", 422);

  const svc = serviceClient();
  const { data: item } = await svc.from("joining_document_items").select("files").eq("joining_profile_id", body.profileId).eq("item_key", body.itemKey).maybeSingle();
  const files: any[] = item?.files ?? [];
  const file = files[Number(body.fileIndex ?? 0)];
  if (!file?.path) return fail("NOT_FOUND", "No file uploaded for this requirement.", 404);

  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) return fail("NOT_CONFIGURED", "File viewing isn't configured.", 503);
  const anon = Deno.env.get("RECRUITMENT_ANON_KEY");
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-joining-file-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Integration-Secret": secret, ...(anon ? { Authorization: `Bearer ${anon}`, apikey: anon } : {}) },
    body: JSON.stringify({ path: file.path }),
  }).catch(() => null);
  const json = await res?.json().catch(() => ({}));
  if (!res?.ok || !json?.data?.url) return fail("FILE_UNAVAILABLE", "Could not open this file.", 502);
  return ok({ url: json.data.url, fileName: file.name, files: files.map((f) => f.name) });
});
