// Employee Onboarding PDF — generated on the server from the submitted joining record.
// Pure rendering: it reads the record, never writes to it, and never marks HR checks as done.
// Helvetica (WinAnsi) only, so every character is sanitised first.

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "npm:pdf-lib@1.17.1";
import { getPath, maskValue, normalizeData, SECTIONS, STATUS_LABEL } from "./joiningSchema.ts";

export const COMPANY = "Ccentrik";
export const DOC_STATUS: Record<string, string> = {
  not_started: "DRAFT", in_progress: "DRAFT", submitted: "SUBMITTED", under_review: "UNDER HR REVIEW",
  resubmitted: "UNDER HR REVIEW", correction_required: "PENDING CLARIFICATION", verified: "APPROVED",
  approved_with_remarks: "APPROVED WITH REMARKS", rejected: "REJECTED", completed: "FINALIZED",
};

const safe = (v: unknown) => String(v ?? "").replace(/[^\x20-\x7E -ÿ]/g, "-");
const fmtDate = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return safe(v);
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")}-${m}-${d.getUTCFullYear()}`;
};
const fmtDateTime = (v: unknown) => {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return safe(v);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${fmtDate(v)} ${hh}:${mm} UTC`;
};
const has = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";
const yn = (v: unknown) => (v === "Yes" ? "Yes" : v === "No" ? "No" : safe(v));

export type PdfInput = {
  referenceNo: string;
  statusKey: string;
  version: number;
  profile: any;      // joining_profiles row (data, hr_fields, timestamps, decision fields)
  caseInfo: any;     // onboarding_cases row
  items: any[];      // joining_document_items rows
  generatedAt: string;
  submittedBy: string;
};

export async function renderOnboardingPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const INK = rgb(0.1, 0.1, 0.1);
  const MUTED = rgb(0.4, 0.4, 0.4);
  const RULE = rgb(0.6, 0.6, 0.6);
  const M = 48;
  const W = 595.28;
  const H = 841.89;
  const CONTENT_BOTTOM = 70;

  const data = normalizeData(input.profile.data ?? {});
  const hr = input.profile.hr_fields ?? {};
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    pages.push(page);
    y = H - M;
    if (pages.length > 1) {
      page.drawText(safe(`${COMPANY} - Employee Onboarding Form and HR Verification & Approval`), { x: M, y: H - 30, size: 8, font, color: MUTED });
      page.drawText(safe(`Ref. ${input.referenceNo}`), { x: W - M - 120, y: H - 30, size: 8, font, color: MUTED });
      page.drawLine({ start: { x: M, y: H - 36 }, end: { x: W - M, y: H - 36 }, thickness: 0.5, color: RULE });
      y = H - M - 10;
    }
  };
  const ensure = (h: number) => { if (y - h < CONTENT_BOTTOM) newPage(); };
  const text = (s: string, x: number, size: number, f: PDFFont = font, color = INK) => page.drawText(safe(s), { x, y, size, font: f, color });
  const rule = (weight = 0.5) => page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: weight, color: RULE });
  const gap = (n: number) => { y -= n; };

  const heading = (t: string) => {
    ensure(40);
    gap(10);
    text(t.toUpperCase(), M, 10, bold);
    gap(6);
    rule(0.8);
    gap(12);
  };
  const wrap = (s: string, width: number, size: number, f: PDFFont) => {
    const words = safe(s).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  };

  // two-column label / value grid; empty values are omitted
  const grid = (rows: [string, unknown][], cols = 2) => {
    const shown = rows.filter(([, v]) => has(v));
    if (!shown.length) { ensure(16); text("Not provided", M, 9, font, MUTED); gap(16); return; }
    const colW = (W - 2 * M) / cols;
    for (let i = 0; i < shown.length; i += cols) {
      const chunk = shown.slice(i, i + cols);
      const lines = chunk.map(([l, v]) => ({ l, v: wrap(String(v), colW - 150, 9, font) }));
      const h = Math.max(...lines.map((x) => Math.max(1, x.v.length))) * 12 + 6;
      ensure(h);
      chunk.forEach(([l], j) => {
        const x = M + j * colW;
        page.drawText(safe(l), { x, y, size: 8, font: bold, color: MUTED });
        lines[j].v.forEach((ln, k) => page.drawText(ln, { x: x + 150, y: y - k * 12, size: 9, font, color: INK }));
      });
      gap(h);
    }
    gap(4);
  };

  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const total = W - 2 * M;
    const scaled = widths.map((w) => (w / widths.reduce((a, b) => a + b, 0)) * total);
    const drawHead = () => {
      ensure(18);
      let x = M;
      headers.forEach((h, i) => { page.drawText(safe(h), { x: x + 4, y: y - 11, size: 8, font: bold, color: INK }); x += scaled[i]; });
      page.drawRectangle({ x: M, y: y - 16, width: total, height: 16, color: rgb(0.93, 0.93, 0.93) });
      gap(18);
    };
    drawHead();
    if (!rows.length) { ensure(16); text("None recorded.", M + 4, 9, font, MUTED); gap(16); return; }
    for (const r of rows) {
      const cells = r.map((c, i) => wrap(c, scaled[i] - 10, 8.5, font));
      const h = Math.max(...cells.map((c) => c.length)) * 11 + 8;
      if (y - h < CONTENT_BOTTOM) { newPage(); drawHead(); }
      let x = M;
      cells.forEach((lines, i) => { lines.forEach((ln, k) => page.drawText(ln, { x: x + 4, y: y - 10 - k * 11, size: 8.5, font, color: INK })); x += scaled[i]; });
      gap(h);
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.3, color: RULE });
    }
    gap(8);
  };

  const box = (x: number, yy: number, filled = false) => {
    page.drawRectangle({ x, y: yy, width: 9, height: 9, borderColor: INK, borderWidth: 0.8, color: filled ? INK : undefined });
  };

  // ---------- page 1 header ----------
  newPage();
  text(COMPANY, M, 16, bold);
  gap(22);
  text("EMPLOYEE ONBOARDING FORM", M, 15, bold);
  gap(18);
  text("HR VERIFICATION & APPROVAL DOCUMENT", M, 11, bold);
  gap(14);
  rule(1.2);
  gap(14);
  grid([
    ["Document reference", input.referenceNo],
    ["Employee ID", hr.employeeCode],
    ["Generated", fmtDateTime(input.generatedAt)],
    ["Version", `${input.version}.0`],
    ["Status", DOC_STATUS[input.statusKey] ?? input.statusKey],
    ["Candidate", input.caseInfo?.candidate_name],
  ], 2);
  rule(1.2);

  // ---------- 1 employee information ----------
  heading("1. Employee information");
  grid([
    ["Employee name", getPath(data, "personal.main.fullName") || input.caseInfo?.candidate_name],
    ["Employee ID", hr.employeeCode],
    ["Date of joining", fmtDate(hr.dateOfJoining || input.caseInfo?.joining_date)],
    ["Designation", hr.designation || input.caseInfo?.designation],
    ["Department", hr.department || input.caseInfo?.department],
    ["Branch / business unit", hr.branchName],
    ["Grade / level", hr.grade],
    ["Reporting manager", hr.reportingManager],
    ["Employment type", getPath(data, "employment.summary.isFresher") === "Yes" ? "Fresher" : getPath(data, "employment.summary.isFresher") === "No" ? "Experienced" : ""],
    ["Client", hr.clientName],
    ["Client work location", hr.clientWorkLocation],
    ["Project", hr.projectName],
  ]);

  // ---------- 2 personal ----------
  heading("2. Personal information");
  const cur = getPath(data, "address.current") ?? {};
  const perm = getPath(data, "address.permanent") ?? {};
  const addr = (a: any) => [a.line1, a.line2, a.locality, a.landmark, a.city, a.district, a.state, a.pin, a.country].filter(has).join(", ");
  grid([
    ["Full name", getPath(data, "personal.main.fullName")],
    ["Date of birth", fmtDate(getPath(data, "personal.main.dob"))],
    ["Gender", getPath(data, "personal.main.gender")],
    ["Marital status", getPath(data, "personal.main.maritalStatus")],
    ["Blood group", getPath(data, "personal.main.bloodGroup")],
    ["Father's name", getPath(data, "personal.main.fatherName")],
    ["Mobile", getPath(data, "contact.main.mobile")],
    ["Alternate mobile", getPath(data, "contact.main.alternateMobile")],
    ["Personal email", getPath(data, "contact.main.personalEmail")],
    ["Current address", addr(cur)],
    ["Permanent address", getPath(data, "address.sameAs.permanentSameAsCurrent") === "Yes" ? "Same as current address" : addr(perm)],
  ], 1);
  const em = getPath(data, "emergency.main") ?? {};
  grid([
    ["Emergency contact", em.name],
    ["Relationship", em.relationship],
    ["Contact number", em.contactNumber],
    ["Alternate number", em.alternateNumber],
    ["Emergency address", [em.address, em.city, em.state, em.pin].filter(has).join(", ")],
  ]);

  // ---------- 3 identity & statutory ----------
  heading("3. Identity and statutory information");
  grid([
    ["PAN", maskValue("pan", getPath(data, "identity.pan.number"))],
    ["Name as per PAN", getPath(data, "identity.pan.nameAsPerPan")],
    ["Aadhaar", maskValue("aadhaar", getPath(data, "identity.aadhaar.number"))],
    ["Name as per Aadhaar", getPath(data, "identity.aadhaar.nameAsPerAadhaar")],
    ["UAN", maskValue("uan", getPath(data, "identity.uan.number"))],
    ["Passport number", maskValue("passport", getPath(data, "personal.passport.number"))],
    ["Passport place of issue", getPath(data, "personal.passport.placeOfIssue")],
    ["Passport expiry", fmtDate(getPath(data, "personal.passport.dateOfExpiry"))],
    ["Other ID", getPath(data, "identity.other.documentType")],
    ["Other ID number", maskValue("passport", getPath(data, "identity.other.documentNumber"))],
  ]);

  // ---------- 4 bank ----------
  heading("4. Bank and payroll information");
  grid([
    ["Account holder", getPath(data, "bank.main.accountHolder")],
    ["Bank name", getPath(data, "bank.main.bankName")],
    ["Account number", maskValue("bank", getPath(data, "bank.main.accountNumber"))],
    ["IFSC", getPath(data, "bank.main.ifsc")],
    ["Branch", getPath(data, "bank.main.branch")],
  ]);

  // ---------- 5 education & professional ----------
  heading("5. Education and professional information");
  const hi = getPath(data, "education.highest") ?? {};
  grid([
    ["Highest qualification", hi.qualification],
    ["Course", hi.course],
    ["Specialization", hi.specialization],
    ["Institution", hi.institution],
    ["Year of passing", hi.yearOfPassing],
    ["Total experience (years)", getPath(data, "employment.summary.totalExperience")],
    ["Relevant experience (years)", getPath(data, "employment.summary.relevantExperience")],
    ["Primary skill", getPath(data, "employment.summary.primarySkill")],
    ["Secondary skill", getPath(data, "employment.summary.secondarySkill")],
  ]);
  const others = (getPath(data, "education.others") ?? []) as any[];
  if (others.length) {
    text("Other qualifications and certifications", M, 9, bold); gap(14);
    table(["Qualification", "Course", "Institution", "Year"], others.map((q) => [q.qualification, q.course, q.institution, q.yearOfPassing]), [3, 2.5, 3.5, 1.5]);
  }
  const prev = (getPath(data, "employment.previous") ?? []) as any[];
  text("Previous employment", M, 9, bold); gap(14);
  table(["Employer", "Designation", "Period", "Reason for leaving"],
    prev.map((e) => [e.employerName, e.designation, [e.startMonth, e.endMonth].filter(has).join(" to "), e.reasonForLeaving]),
    [3, 2.5, 2.5, 3]);
  const other = getPath(data, "employment.otherOffer") ?? {};
  if (has(other.holdingOtherOffer)) {
    grid([["Holding another offer", yn(other.holdingOtherOffer)], ["Offer company", other.company], ["Offer designation", other.designation], ["Offer date", fmtDate(other.offerDate)]]);
  }

  // ---------- 6 family ----------
  heading("6. Family details");
  table(["Relationship", "Name", "Date of birth", "Dependent"],
    ((getPath(data, "family.members") ?? []) as any[]).map((m) => [m.relationship, m.fullName, fmtDate(m.dob), yn(m.dependent)]),
    [2, 4, 2, 1.5]);

  // ---------- 7 document checklist ----------
  heading("7. Document submission checklist");
  const label = (s: string) => ({
    awaiting: "Not provided", submitted: "Submitted", reason_submitted: "Reason given", approved: "Verified",
    approved_with_reason: "Verified (reason)", na_accepted: "Not applicable", rejected: "Rejected", clarification_required: "Pending",
  } as Record<string, string>)[s] ?? s;
  const rows = (input.items ?? []).filter((i) => i.applicability !== "not_applicable" || i.status === "na_accepted").map((i) => [
    i.label || i.ref_key,
    i.applicability === "optional" ? "Optional" : i.applicability === "applicable" ? "Yes" : "No",
    ["awaiting"].includes(i.status) ? "No" : "Yes",
    label(i.status),
    i.hr_remarks || i.reason_text || "",
  ]);
  table(["Document", "Required", "Submitted", "HR status", "Remarks"], rows, [4, 1.3, 1.3, 2.2, 3.5]);
  text("Items marked Not applicable are not shown. Pending items must be resolved before approval.", M, 8, font, MUTED); gap(12);

  // ---------- 8 HR verification checklist (blank by design) ----------
  heading("8. HR verification checklist");
  text("To be completed by the HR reviewer. Not marked automatically on submission.", M, 8, font, MUTED); gap(14);
  const checks = [
    "Employee information reviewed", "Personal information reviewed", "Identity documents verified",
    "Educational documents verified", "Previous employment documents verified", "Bank information verified",
    "Statutory information verified", "Mandatory documents received", "All required onboarding information completed",
  ];
  for (let i = 0; i < checks.length; i += 2) {
    ensure(18);
    for (let j = 0; j < 2; j++) {
      const c = checks[i + j];
      if (!c) continue;
      const x = M + j * ((W - 2 * M) / 2);
      box(x, y - 8);
      page.drawText(safe(c), { x: x + 16, y: y - 7, size: 9, font, color: INK });
    }
    gap(18);
  }
  gap(6);

  // ---------- 9 HR review & approval ----------
  heading("9. HR review and approval");
  const opts = ["Approved", "Approved with remarks", "Pending clarification", "Rejected"];
  const current = input.statusKey;
  const selected = current === "verified" ? 0 : current === "approved_with_remarks" ? 1 : current === "correction_required" ? 2 : current === "rejected" ? 3 : -1;
  ensure(20);
  opts.forEach((o, i) => {
    const x = M + i * ((W - 2 * M) / 4);
    page.drawCircle({ x: x + 5, y: y - 5, size: 4.5, borderColor: INK, borderWidth: 0.8, color: i === selected ? INK : undefined });
    page.drawText(safe(o), { x: x + 14, y: y - 8, size: 9, font, color: INK });
  });
  gap(24);
  text("HR remarks", M, 9, bold); gap(14);
  const remarks = wrap(input.profile.decision_remarks || "", W - 2 * M, 9, font);
  const remarkLines = Math.max(3, remarks.length);
  for (let i = 0; i < remarkLines; i++) {
    ensure(16);
    if (remarks[i]) page.drawText(remarks[i], { x: M, y: y - 9, size: 9, font, color: INK });
    page.drawLine({ start: { x: M, y: y - 14 }, end: { x: W - M, y: y - 14 }, thickness: 0.4, color: RULE });
    gap(18);
  }
  gap(4);
  grid([
    ["HR reviewer name", input.profile.decided_by],
    ["HR employee ID", ""],
    ["Review date", fmtDate(input.profile.decided_at)],
    ["Review time", input.profile.decided_at ? fmtDateTime(input.profile.decided_at).slice(-10) : ""],
  ]);

  // ---------- 10 signatures ----------
  heading("10. Signatures");
  const sig = (title: string, rows: [string, string][]) => {
    ensure(120);
    text(title, M, 9, bold); gap(12);
    for (const [l, v] of rows) {
      ensure(30);
      text(`${l}:`, M, 9, bold);
      if (v) text(v, M + 110, 9, font);
      page.drawLine({ start: { x: M + 110, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: RULE });
      gap(22);
    }
    gap(10);
  };
  const signedName = input.profile.signature?.name ?? "";
  const signedAt = input.profile.signature?.at ? fmtDate(input.profile.signature.at) : "";
  sig("EMPLOYEE / CANDIDATE", [["Name", signedName], ["Signature", ""], ["Date", signedAt]]);
  sig("HR REPRESENTATIVE", [["Name", input.profile.decided_by ?? ""], ["Employee ID", ""], ["Signature", ""], ["Date", ""]]);
  sig("AUTHORISED APPROVER", [["Name", ""], ["Designation", ""], ["Signature", ""], ["Date", ""]]);

  // ---------- 11 audit summary ----------
  heading("11. Record history (summary)");
  const events: [string, string][] = [
    ["Submitted", fmtDateTime(input.profile.submitted_at)],
    ["Resubmitted", fmtDateTime(input.profile.resubmitted_at)],
    ["HR review started", fmtDateTime(input.profile.review_started_at)],
    ["HR decision", fmtDateTime(input.profile.decided_at || input.profile.verified_at)],
    ["Finalised", fmtDateTime(input.profile.completed_at)],
  ].filter(([, v]) => has(v)) as [string, string][];
  table(["Event", "Date and time"], events.map(([a, b]) => [a, b]), [3, 3]);
  text("The full field-level history is held in the HROTA system and is available to authorised HR staff.", M, 8, font, MUTED);

  // ---------- footers: company, document, reference, page X of Y, confidentiality ----------
  const total = pages.length;
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: M, y: 52 }, end: { x: W - M, y: 52 }, thickness: 0.4, color: RULE });
    pg.drawText(safe(`${COMPANY}  |  Employee Onboarding Document  |  Ref. ${input.referenceNo}`), { x: M, y: 38, size: 7.5, font, color: MUTED });
    pg.drawText(safe(`Page ${i + 1} of ${total}`), { x: W - M - 60, y: 38, size: 7.5, font, color: MUTED });
    pg.drawText("CONFIDENTIAL - FOR INTERNAL HR USE ONLY", { x: M, y: 26, size: 7, font: bold, color: MUTED });
  });

  return await pdf.save();
}

export function referenceFor(profileId: string, createdAt?: string) {
  const y = new Date(createdAt ?? Date.now()).getUTCFullYear();
  return `ONB-${y}-${profileId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function fileNameFor(employeeId: string, name: string, at: string) {
  const d = new Date(at);
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const clean = (s: string) => safe(s).replace(/[^A-Za-z0-9]+/g, "") || "Unknown";
  return `Employee_Onboarding_${clean(employeeId)}_${clean(name)}_${ymd}.pdf`;
}

export { SECTIONS, STATUS_LABEL };
