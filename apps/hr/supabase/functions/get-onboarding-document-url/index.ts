// POST /functions/v1/get-onboarding-document-url
// Auth: hr/admin (browser-callable). The file lives in the recruitment
// project's storage, not this one, so this proxies the request there with
// the service-to-service secret — that secret can never reach the browser
// directly.
//
// Body: { onboardingDocumentId }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("FORBIDDEN", "HR access required.", 403);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }
  if (!body.onboardingDocumentId) return fail("VALIDATION_ERROR", "Missing document.", 422);

  // A form approved by HR has its own printable PDF here; use that.
  const svc = serviceClient();
  const { data: doc } = await svc
    .from("onboarding_documents")
    .select("approved_pdf_path, approved_pdf_name")
    .eq("id", body.onboardingDocumentId)
    .maybeSingle();
  if (doc?.approved_pdf_path) {
    const { data: signed, error: signErr } = await svc.storage
      .from("joining-pdfs")
      .createSignedUrl(doc.approved_pdf_path, 300, { download: doc.approved_pdf_name ?? undefined });
    if (signErr || !signed) return fail("FILE_UNAVAILABLE", "Could not open this document. Please try again.", 500);
    return ok({ url: signed.signedUrl, fileName: doc.approved_pdf_name, source: "approved_pdf" });
  }

  const baseUrl = Deno.env.get("RECRUITMENT_FUNCTIONS_URL");
  const secret = Deno.env.get("INTEGRATION_SHARED_SECRET");
  if (!baseUrl || !secret) return fail("NOT_CONFIGURED", "Cross-app integration isn't configured yet.", 500);
  // See verify-document for why the anon key is also sent: it satisfies
  // Supabase's own gateway JWT check without weakening it, independent of our
  // X-Integration-Secret check below.
  const recruitmentAnonKey = Deno.env.get("RECRUITMENT_ANON_KEY");

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/integration-onboarding-document-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Integration-Secret": secret,
        ...(recruitmentAnonKey ? { Authorization: `Bearer ${recruitmentAnonKey}`, apikey: recruitmentAnonKey } : {}),
      },
      body: JSON.stringify({ hrDocumentId: body.onboardingDocumentId }),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !payload?.success) {
      return fail("UPSTREAM_ERROR", payload?.error?.message || "Could not fetch the file.", res.status || 502);
    }
    return ok(payload.data);
  } catch {
    return fail("UPSTREAM_ERROR", "Could not reach the recruitment app.", 502);
  }
});
