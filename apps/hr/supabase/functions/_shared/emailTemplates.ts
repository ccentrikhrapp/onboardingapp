// HR-side email templates for the onboarding workflow. Same house style as
// the recruitment app's templates (shell/details/badge/button), duplicated
// rather than imported because the two Supabase projects can't share a Deno
// import graph — see that file's own comment for the same note.

type Vars = Record<string, string | null | undefined>;

const BRAND = "#3157D5";
const FONT = "Inter,'Segoe UI',Arial,Helvetica,sans-serif";

function logoUrl(): string {
  const site = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ccentrik-hr.vercel.app").replace(/\/$/, "");
  return `${site}/ccentrik-logo.png`;
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F5F7FA;font-family:${FONT};color:#1F2937">
  <table role="presentation" width="100%" style="background:#F5F7FA;border-collapse:collapse"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" style="max-width:620px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;border-collapse:separate">
      <tr><td style="padding:24px 32px 18px;border-bottom:2px solid ${BRAND}">
        <img src="${logoUrl()}" width="100" alt="Ccentrik" style="display:block;border:0;height:auto;max-width:100px" />
      </td></tr>
      <tr><td style="padding:28px 32px 28px">
        <h1 style="margin:0 0 14px;font-size:24px;line-height:1.3;font-weight:600;color:#1F2937">${title}</h1>
        <div style="font-size:15px;line-height:1.6;color:#1F2937">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:16px 32px;border-top:1px solid #E5E7EB;font-size:12px;line-height:1.5;color:#6B7280;text-align:center">
        <strong style="color:#374151">Ccentrik</strong><br/>Ccentrik HR Portal<br/>This is an automated email from the Ccentrik HR Portal. Confidential — for authorised personnel only. Please do not reply directly to this email.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function details(rows: [string, string | null | undefined][]): string {
  const shown = rows.filter(([, v]) => v);
  const cells = shown
    .map(([label, value], i) => {
      const rule = i < shown.length - 1 ? "border-bottom:1px solid #EEF0F4;" : "";
      return `<tr>
        <td style="padding:12px 16px 12px 0;width:40%;font-size:13px;color:#6B7280;vertical-align:top;${rule}">${label}</td>
        <td style="padding:12px 0;font-size:14px;font-weight:600;color:#1F2937;vertical-align:top;${rule}">${value}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:20px 0;border-top:1px solid #EEF0F4;border-bottom:1px solid #EEF0F4"><tbody>${cells}</tbody></table>`;
}

function notice(text: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:#FFF8EB;border:1px solid #FDE7B8;border-radius:6px;font-size:14px;line-height:1.6;color:#1F2937;white-space:pre-wrap">${text}</div>`;
}

function badge(label: string, tone: "approved" | "pending" | "info" | "rejected"): string {
  const t = {
    approved: ["#E8F7EF", "#12703F"],
    pending: ["#FFF4E0", "#8A5A00"],
    info: ["#EEF2FD", BRAND],
    rejected: ["#FDECEC", "#B42318"],
  }[tone];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${t[0]};color:${t[1]};font-size:12px;font-weight:600">&#9679;&nbsp;${label}</span>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin:16px 0;padding:12px 22px;background:${BRAND};color:#FFFFFF;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">${label}</a>`;
}

function checklist(items: string[]): string {
  return `<ul style="margin:10px 0 0;padding-left:20px;font-size:13.5px;color:#374151;line-height:1.8">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

export const templates: Record<string, (v: Vars) => { subject: string; html: string; text: string }> = {
  // Section 1 (account-creation refinement) — Super Admin request. Exactly
  // three employee details, per the specified copy — nothing else.
  employee_onboarded_super_admin: (v) => ({
    subject: `Organizational Email Account Creation Request – ${v.employee_name}`,
    html: shell(
      "Organizational Email Account Creation Request",
      `<p>Dear ${v.admin_name || "Super Admin"},</p>
       <p>A new employee has joined CCENTRIK. Kindly create an official organizational email account for the following employee.</p>
       ${details([
         ["Employee Name", v.employee_name],
         ["Designation", v.designation],
         ["Mobile Number", v.mobile],
       ])}
       <p>Please process the request and update the existing request status once the organizational email account has been created.</p>
       <p>Thank you.</p>
       <p>Regards,<br/>CCENTRIK HR Team</p>`,
    ),
    text: `Dear ${v.admin_name || "Super Admin"},\n\n` +
      `A new employee has joined CCENTRIK. Kindly create an official organizational email account for the following employee.\n\n` +
      `Employee Name: ${v.employee_name}\nDesignation: ${v.designation || "—"}\nMobile Number: ${v.mobile || "—"}\n\n` +
      `Please process the request and update the existing request status once the organizational email account has been created.\n\n` +
      `Thank you.\n\nRegards,\nCCENTRIK HR Team`,
  }),

  // Sections 4 & 5 — one reusable template for Accounts/IT and Joining
  // Arrangements requests; only the heading, checklist and link differ.
  // blood_group/address/phone/photo_link are additional, all-optional rows
  // (filtered out by details() when absent) — used only by the ID card
  // creation request, which needs a few more employee details than the
  // generic laptop-allocation/joining-arrangements ones do.
  onboarding_task_request: (v) => ({
    subject: v.subject_line || `Action Required: New Employee Joining Setup — ${v.employee_name} | ${v.employee_code}`,
    html: shell(
      v.heading || "New employee joining setup required",
      `<p>${v.employee_name} is joining Ccentrik and the items below need your team's action before/around the joining date.</p>
       ${details([
         ["Employee", `${v.employee_name} (${v.employee_code})`],
         ["Designation", v.designation],
         ["Department", v.department],
         ["Joining Date", v.joining_date],
         ["Work Location", v.location],
         ["Reporting Manager", v.reporting_manager],
         ["Phone", v.phone],
         ["Blood Group", v.blood_group],
         ["Address", v.address],
         ["Status", badge(v.status_label || "Action required", "pending")],
       ])}
       <p style="font-size:13.5px;font-weight:600;color:#1F2937;margin:18px 0 0">Checklist</p>
       ${checklist((v.checklist_items || "").split("|||").filter(Boolean))}
       ${v.photo_link ? button("View employee photo", v.photo_link) : ""}
       ${button("Open onboarding request", v.task_link)}`,
    ),
    text: `${v.heading || "New employee joining setup required"}\n\n${v.employee_name} (${v.employee_code}) is joining Ccentrik.\n` +
      `Designation: ${v.designation || "—"}\nDepartment: ${v.department || "—"}\nJoining date: ${v.joining_date || "—"}\n` +
      `Location: ${v.location || "—"}\nReporting manager: ${v.reporting_manager || "—"}` +
      `${v.phone ? `\nPhone: ${v.phone}` : ""}${v.blood_group ? `\nBlood Group: ${v.blood_group}` : ""}${v.address ? `\nAddress: ${v.address}` : ""}\n\n` +
      `Checklist:\n${(v.checklist_items || "").split("|||").filter(Boolean).map((i) => `- ${i}`).join("\n")}\n\n` +
      `${v.photo_link ? `Employee photo: ${v.photo_link}\n\n` : ""}${v.task_link}\n\n— Ccentrik HR Portal`,
  }),

  // Cross-portal handoff — the TA portal scheduled (or rescheduled) this
  // candidate's HR-final interview round. hr_recipient_name is personalised
  // per recipient (one send per active hr/admin profile); every other field
  // comes straight from the recruitment app's own interview_rounds row via
  // the integration call, never invented here.
  hr_interview_scheduled: (v) => ({
    subject: `HR Interview ${v.rescheduled === "true" ? "Rescheduled" : "Scheduled"} — ${v.candidate_name} — ${v.job_title}`,
    html: shell(
      `HR Interview ${v.rescheduled === "true" ? "Rescheduled" : "Scheduled"}`,
      `<p>Hello ${v.hr_recipient_name || "there"},</p>
       <p>An HR interview has been ${v.rescheduled === "true" ? "rescheduled" : "scheduled"} for the following candidate.</p>
       ${details([
         ["Candidate", v.candidate_name],
         ["Application ID", v.application_code],
         ["Position", v.job_title],
         ["Interview Round", v.round_name],
         ["Date", v.date],
         ["Time", v.time],
         ["Meeting Platform", v.platform_label],
         ["Joining Link", v.meeting_url ? `<a href="${v.meeting_url}">${v.meeting_url}</a>` : null],
         ["Location", v.location],
         ["Assigned Recruiter", v.recruiter_name],
       ])}
       <p>Please review the candidate details and join the meeting at the scheduled time.</p>
       ${v.meeting_url ? button("Join Meeting", v.meeting_url) : ""}`,
    ),
    text: `Hello ${v.hr_recipient_name || "there"},\n\n` +
      `An HR interview has been ${v.rescheduled === "true" ? "rescheduled" : "scheduled"} for the following candidate.\n\n` +
      `Candidate: ${v.candidate_name}\nApplication ID: ${v.application_code || "—"}\nPosition: ${v.job_title}\n` +
      `Interview Round: ${v.round_name}\nDate: ${v.date}\nTime: ${v.time}\nMeeting Platform: ${v.platform_label || "—"}\n` +
      `${v.meeting_url ? `Joining Link: ${v.meeting_url}\n` : ""}${v.location ? `Location: ${v.location}\n` : ""}` +
      `Assigned Recruiter: ${v.recruiter_name || "—"}\n\n` +
      `Please review the candidate details and join the meeting at the scheduled time.\n\nRegards,\nCcentrik Recruitment System`,
  }),
};

export function render(name: string, vars: Vars) {
  const fn = templates[name];
  if (!fn) throw new Error(`Unknown email template: ${name}`);
  return fn(vars);
}
