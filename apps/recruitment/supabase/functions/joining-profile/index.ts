// POST /functions/v1/joining-profile
// Auth: the candidate/employee themself. The joining form's data lives in the
// HR project (single source of truth for HR review); this function only proves
// who the caller is, finds THEIR onboarding application, builds the pre-fill
// from that application, and relays to HR's integration-joining-profile.
//
// Body: { action: 'get' | 'save_section' | 'submit' | 'doc_submit', section?, values?, signatureName?,
//         itemKey?, choice?, files?, reasonCategory?, reasonText? }

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { callHrSync } from "../_shared/hrIntegration.ts";

const ONBOARDING_STATUSES = ["OFFER_ACCEPTED", "ONBOARDING_PENDING", "HR_VERIFICATION", "HR_VERIFICATION_REJECTED", "JOINING_PENDING", "EMPLOYEE"];

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const put = (o: Record<string, string>, k: string, v: unknown) => { const s = str(v); if (s) o[k] = s; };

function seedFromApplication(app: any) {
  const p = app.personal ?? {};
  const pro = app.professional ?? {};
  const edu = Array.isArray(app.education) ? app.education[0] : null;

  const main: Record<string, string> = {};
  put(main, "firstName", p.firstName);
  put(main, "middleName", p.middleName);
  put(main, "lastName", p.lastName);
  put(main, "dob", /^\d{4}-\d{2}-\d{2}$/.test(str(p.dob)) ? p.dob : "");
  const g = str(p.gender).toLowerCase();
  if (g === "male" || g === "female") main.gender = g[0].toUpperCase() + g.slice(1);

  const contact: Record<string, string> = {};
  put(contact, "personalEmail", p.email);
  put(contact, "mobile", p.mobile);

  const current: Record<string, string> = { country: "India" };
  put(current, "city", p.address?.city || p.currentLocation);
  put(current, "state", p.address?.state);
  put(current, "pin", p.address?.postalCode);
  put(current, "line1", p.address?.line1);

  const highest: Record<string, string> = {};
  put(highest, "qualification", edu?.qualification);
  put(highest, "institution", edu?.university);
  put(highest, "specialization", edu?.specialization);
  if (/^\d{4}-\d{2}$/.test(str(edu?.year))) highest.yearOfPassing = edu.year;

  const skills: string[] = Array.isArray(pro.skills) ? pro.skills : [];
  const summary: Record<string, string> = {};
  const exp = Number(pro.totalExperience);
  if (Number.isFinite(exp)) summary.isFresher = exp > 0 ? "No" : "Yes";
  put(summary, "primarySkill", skills[0]);
  put(summary, "secondarySkill", skills[1]);
  const previous: Record<string, string>[] = [];
  if (exp > 0 && str(pro.currentCompany)) {
    const row: Record<string, string> = {};
    put(row, "employerName", pro.currentCompany);
    put(row, "designation", pro.currentJobTitle);
    previous.push(row);
  }

  const data: Record<string, any> = {
    personal: { main },
    contact: { main: contact },
    address: { current },
    education: { highest },
    employment: { summary, previous },
  };
  return { data };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  const profile = await currentProfile(req);
  if (!profile) return fail("UNAUTHENTICATED", "Please sign in.", 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return fail("INVALID_JSON", "Malformed body.", 400); }
  const action = body.action;
  if (!["get", "save_section", "submit", "doc_submit"].includes(action)) return fail("VALIDATION_ERROR", "Invalid request.", 422);

  const svc = serviceClient();
  const { data: cand } = await svc.from("candidates").select("id, first_name, last_name").eq("profile_id", profile.id).maybeSingle();
  if (!cand) return fail("NOT_FOUND", "No application found for your account.", 404);
  const { data: app } = await svc
    .from("applications")
    .select("id, status, personal, professional, education")
    .eq("candidate_id", cand.id)
    .in("status", ONBOARDING_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!app) return fail("NOT_STARTED", "Your joining form opens once your offer is accepted and onboarding starts.", 404);

  const actorName = `${cand.first_name ?? ""} ${cand.last_name ?? ""}`.trim() || profile.full_name || "Employee";
  const payload: Record<string, unknown> = { action, sourceApplicationId: app.id, actorName };
  if (action === "get") payload.seed = seedFromApplication(app);
  if (action === "save_section") { payload.section = body.section; payload.values = body.values; }
  if (action === "submit") payload.signatureName = body.signatureName;
  if (action === "doc_submit") {
    payload.itemKey = body.itemKey;
    payload.choice = body.choice;
    payload.reasonCategory = body.reasonCategory;
    payload.reasonText = body.reasonText;
    // Files are uploaded straight into this application's own folder; refuse anything outside it.
    const files = Array.isArray(body.files) ? body.files : [];
    const prefix = `${app.id}/joining/`;
    if (files.some((f: any) => typeof f?.path !== "string" || !f.path.startsWith(prefix) || f.path.includes(".."))) return fail("VALIDATION_ERROR", "Invalid file.", 422);
    payload.files = files;
  }

  const res = await callHrSync("integration-joining-profile", payload);
  if (!res.ok) {
    const err = res.json?.error ?? {};
    return fail(err.code ?? "HR_ERROR", err.message ?? "Something went wrong. Please try again.", res.status >= 400 && res.status < 600 ? res.status : 500, err.fields ?? {});
  }
  return ok({ ...res.json.data, applicationId: app.id });
});
