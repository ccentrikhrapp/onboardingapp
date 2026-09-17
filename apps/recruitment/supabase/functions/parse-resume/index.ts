// POST /functions/v1/parse-resume  { path: "resumes/<uid>/<file>" }
// Auth: the signed-in candidate (path must be under their own folder).
//
// Real extraction: downloads the file from storage, pulls text out of PDF /
// DOCX, then runs a heuristic parser. The candidate reviews everything on the
// form, so "best effort" is fine — nothing here is trusted as final.

import { fail, ok, preflight } from "../_shared/http.ts";
import { currentProfile, serviceClient } from "../_shared/supabase.ts";
import { extractResumeText } from "../_shared/resumeText.ts";

const SKILL_DICT = [
  "javascript", "typescript", "react", "redux", "node.js", "node", "next.js", "vue",
  "angular", "html", "css", "sass", "tailwind", "graphql", "rest", "python", "django",
  "flask", "java", "spring", "go", "rust", "c++", "c#", ".net", "sql", "postgresql",
  "mysql", "mongodb", "redis", "kafka", "rabbitmq", "docker", "kubernetes", "aws",
  "gcp", "azure", "terraform", "ci/cd", "jenkins", "git", "playwright", "cypress",
  "jest", "testing", "accessibility", "figma", "sap", "sap cap", "odata", "fiori",
  "abap", "power bi", "tableau", "excel", "salesforce", "workday",
];

const DEGREE_RE =
  /\b(b\.?tech|b\.?e\.?|b\.?sc|bca|b\.?com|bba|m\.?tech|m\.?e\.?|m\.?sc|mca|mba|ph\.?d|bachelor|master|diploma)\b/i;

// Words that can follow a name in the header but are never PART of a name —
// used to stop name/location matching from over-running onto the job title
// when the extractor gives us no line breaks to rely on (some PDFs come
// back from PDF.js as one unbroken line — confirmed in production; see
// docs/BACKEND_SETUP.md's note on parse-resume for how this was diagnosed).
const TITLE_STOPWORDS =
  /^(senior|junior|lead|staff|principal|chief|head|director|associate|assistant|software|full-?stack|backend|front-?end|frontend|cloud|stack|systems?|solutions|technologies|network|data|product|project|program|business|hr|human|resources?|engineer|developer|consultant|manager|analyst|designer|architect|specialist|executive|officer|intern|aspiring|group|labs?|inc|ltd|llp|pvt|company|corp)$/i;

function parse(text: string) {
  const flat = text.replace(/\r/g, "");
  const lower = flat.toLowerCase();

  const email = flat.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  // [Xx] tolerated alongside digits: sample/demo resumes commonly mask part
  // of the number (e.g. "+91-98XXXXXX45") — real numbers still match fine.
  const phone =
    flat.match(/(\+?\d[\d\sXx()-]{8,}\d)/)?.[0]?.replace(/\s{2,}/g, " ").trim() ?? "";
  const linkedin = flat.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s)]+/i)?.[0] ?? "";
  const portfolio =
    flat.match(/https?:\/\/(?!(www\.)?linkedin\.com)[^\s)]+\.[a-z]{2,}[^\s)]*/i)?.[0] ?? "";

  // Name: the leading capitalised run at the very start of the document.
  // Word separator is space/tab only (not \s, which also matches newlines)
  // so a preserved line break still stops it — but since that break isn't
  // always there, anything from TITLE_STOPWORDS onward is trimmed off too,
  // so "ROHAN VERMA Senior Software" can never end up keeping "Software"
  // as a surname.
  const leading = flat.trimStart();
  const leadingOffset = flat.length - leading.length;
  const rawNameMatch = leading.match(/^([A-Z][A-Za-z.'-]{1,24}(?:[ \t]+[A-Z][A-Za-z.'-]{1,24}){0,3})/);
  let nameWords = rawNameMatch ? rawNameMatch[1].split(/[ \t]+/) : [];
  const stopIdx = nameWords.findIndex((w, i) => i > 0 && TITLE_STOPWORDS.test(w));
  if (stopIdx !== -1) nameWords = nameWords.slice(0, stopIdx);
  if (nameWords.length > 3) nameWords = nameWords.slice(0, 2);
  const firstName = nameWords[0] ?? "";
  const lastName = nameWords.length > 1 ? nameWords[nameWords.length - 1] : "";
  const nameEndAbs = nameWords.length ? leadingOffset + nameWords.join(" ").length : 0;

  // Location: a "City, State[, Country]" run found by anchoring to the
  // email/phone (location conventionally sits right before it in the
  // header) rather than scanning lines — robust whether or not the
  // extractor kept a line break between the title and the location. Any
  // leading job-title-ish word the regex over-captures gets stripped.
  const contactAnchor = email ? flat.indexOf(email) : phone ? flat.indexOf(phone) : -1;
  let currentLocation = "";
  if (contactAnchor > nameEndAbs) {
    const headerWindow = flat.slice(nameEndAbs, contactAnchor);
    const locMatch = headerWindow.match(
      /([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*),[ \t]*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*)(?:,[ \t]*([A-Z][A-Za-z.'-]+(?:[ \t]+[A-Z][A-Za-z.'-]+)*))?/
    );
    if (locMatch) {
      let cityWords = locMatch[1].trim().split(/[ \t]+/);
      while (cityWords.length > 1 && TITLE_STOPWORDS.test(cityWords[0])) cityWords.shift();
      currentLocation = [cityWords.join(" "), locMatch[2], locMatch[3]].filter(Boolean).join(", ").trim();
    }
  }

  const skills = SKILL_DICT.filter((s) => lower.includes(s))
    .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 20);

  // Highest qualification: a window starting exactly at the degree keyword
  // (not a line, which — per above — might be the entire document), cut
  // off at the next bullet or blank-line break if one shows up first.
  let education: { qualification: string; university: string; specialization: string; year: string; grade: string }[] = [];
  const degreeMatch = flat.match(DEGREE_RE);
  if (degreeMatch && degreeMatch.index !== undefined) {
    let windowText = flat.slice(degreeMatch.index, degreeMatch.index + 160);
    const cutAt = windowText.search(/[••]|\n{2,}/);
    if (cutAt > 20) windowText = windowText.slice(0, cutAt);
    const qualification = windowText.replace(/\s+/g, " ").trim();
    const year = (qualification.match(/\b(19|20)\d{2}\b/) ?? [""])[0];
    education = [{ qualification: qualification.slice(0, 140), university: "", specialization: "", year, grade: "" }];
  }

  const expMatch = lower.match(/(\d{1,2})\+?\s*(years?|yrs?)\s+(of\s+)?(experience|exp)/);
  const totalExperience = expMatch ? expMatch[1] : "";

  // Job title: whatever sits between the name and the location (or the
  // contact anchor, if no location was found) — again anchored by
  // position rather than a line, which may not exist as a separate line.
  let currentJobTitle = "";
  if (nameEndAbs > 0) {
    let titleEndAbs = contactAnchor > nameEndAbs ? contactAnchor : nameEndAbs + 90;
    if (currentLocation) {
      const locIdx = flat.indexOf(currentLocation, nameEndAbs);
      if (locIdx > nameEndAbs) titleEndAbs = locIdx;
    }
    const candidate = flat
      .slice(nameEndAbs, Math.min(titleEndAbs, nameEndAbs + 100))
      .trim()
      .replace(/^[|,\-–—\s]+/, "")
      .replace(/[|,\-–—\s]+$/, "");
    if (candidate.length > 2 && candidate.length < 90) currentJobTitle = candidate;
  }
  if (!currentJobTitle) {
    const lines = flat.split("\n").map((l) => l.trim()).filter(Boolean);
    currentJobTitle =
      lines.find((l) => /\b(engineer|developer|consultant|manager|analyst|designer|lead|architect)\b/i.test(l) && l.length < 60) ?? "";
  }

  return {
    firstName,
    lastName,
    email,
    mobile: phone,
    linkedin,
    portfolio,
    currentLocation,
    currentJobTitle,
    currentCompany: "",
    totalExperience,
    skills,
    education,
  };
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return fail("METHOD", "POST only.", 405);

  let path = "";
  try {
    path = (await req.json()).path ?? "";
  } catch {
    return fail("INVALID_JSON", "Malformed body.", 400);
  }

  // A resume picked before the candidate has signed in at all lives under
  // resumes/pending-anon/{draftId}/... — draftId is a random, unguessable
  // token the browser generated, not an account, so no auth is required to
  // parse it (nothing sensitive is exposed beyond what the file itself
  // already contains, and the caller had to know the exact token/path).
  // Anything else must belong to the signed-in caller.
  const isAnonPending = path.startsWith("resumes/pending-anon/") || path.startsWith("pending-anon/");
  if (!isAnonPending) {
    const profile = await currentProfile(req);
    if (!profile) return fail("UNAUTHENTICATED", "Please sign in.", 401);
    if (!path.startsWith(`resumes/${profile.id}/`) && !path.startsWith(`${profile.id}/`)) {
      return fail("FORBIDDEN", "That file does not belong to you.", 403);
    }
  }

  const objectPath = path.replace(/^resumes\//, "");
  const svc = serviceClient();
  const { data: file, error } = await svc.storage.from("resumes").download(objectPath);
  if (error || !file) return fail("NOT_FOUND", "Resume file not found.", 404);

  const bytes = new Uint8Array(await file.arrayBuffer());

  let text = "";
  try {
    text = await extractResumeText(bytes, path);
  } catch (_e) {
    return fail("PARSE_FAILED", "We couldn't read that file. Please fill the form manually.", 200);
  }

  if (text.trim().length < 30) {
    return ok({ fields: {}, extracted: [], note: "Not enough text found — please fill the form manually." });
  }

  const fields = parse(text);
  const extracted = Object.entries(fields)
    .filter(([, v]) => (Array.isArray(v) ? v.length : String(v).trim()))
    .map(([k]) => k);

  return ok({ fields, extracted });
});
