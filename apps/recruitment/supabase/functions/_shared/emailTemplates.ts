// Email templates. Each returns { subject, html, text }. Keep them plain and
// professional — the master prompt's wording. Variables are interpolated by the
// caller, not with a templating engine.

type Vars = Record<string, string>;

// Ccentrik brand system (matches the app's primary colour).
const BRAND = "#3157D5";
const FONT = "Inter,'Segoe UI',Arial,Helvetica,sans-serif";

// Hosted copy of the official logo (public/ccentrik-logo.png), so it renders in
// every mail client and on every send path, not only the inline-attachment one.
function logoUrl(): string {
  const site = (Deno.env.get("PUBLIC_SITE_URL") ?? "https://ccentrik-recruitment.vercel.app").replace(/\/$/, "");
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
        <strong style="color:#374151">Ccentrik</strong><br/>Ccentrik HR Portal<br/>This is an automated email from the Ccentrik HR Portal. Please do not reply directly to this email.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Key/value details block: labels muted, values bold, hairline separators.
function details(rows: [string, string][]): string {
  const cells = rows
    .map(([label, value], i) => {
      const rule = i < rows.length - 1 ? "border-bottom:1px solid #EEF0F4;" : "";
      return `<tr>
        <td style="padding:12px 16px 12px 0;width:40%;font-size:13px;color:#6B7280;vertical-align:top;${rule}">${label}</td>
        <td style="padding:12px 0;font-size:14px;font-weight:600;color:#1F2937;vertical-align:top;${rule}">${value}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:20px 0;border-top:1px solid #EEF0F4;border-bottom:1px solid #EEF0F4"><tbody>${cells}</tbody></table>`;
}

// A reason or instruction the candidate must act on.
function notice(text: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:#FFF8EB;border:1px solid #FDE7B8;border-radius:6px;font-size:14px;line-height:1.6;color:#1F2937;white-space:pre-wrap">${text}</div>`;
}

// Compact status pill. Tones: approved (green), pending (amber), info (brand), rejected (red).
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

export const templates: Record<string, (v: Vars) => { subject: string; html: string; text: string }> = {
  // TA-created candidate — the resume-derived application already exists;
  // this link signs the candidate in (Supabase magic link) straight to it.
  ta_candidate_verification: (v) => ({
    subject: "Action Required: Please Verify Your Recruitment Application",
    html: shell(
      "Please verify your application",
      `<p>Hi ${v.candidate_name},</p>
       <p>Our Talent Acquisition team has created your application based on the resume provided to us.</p>
       <p>Please review and verify your information using the secure link below.</p>
       ${button("Verify My Application", v.verify_link)}
       <p style="font-size:13px;color:#6b7280">You'll be able to:</p>
       <ul style="font-size:13px;color:#6b7280;padding-left:18px;margin:4px 0 14px">
         <li>Review your personal details</li>
         <li>Correct inaccurate information</li>
         <li>Add missing information</li>
         <li>Confirm your professional details</li>
         <li>Review your resume</li>
         <li>Submit your verified application</li>
       </ul>
       <p style="font-size:13px;color:#6b7280">You do not need to enter your application details from scratch.</p>
       <p style="font-size:12px;color:#9aa3b2">This link is time-limited. If it has expired, just sign in with Google on our careers site using this same email address and your application will be waiting for you.</p>`,
    ),
    text:
      `Hi ${v.candidate_name},\n\nOur Talent Acquisition team has created your application based on the resume provided to us. ` +
      `Please review and verify your information using the secure link below.\n\n${v.verify_link}\n\n` +
      `You will be able to review, correct, add missing information, confirm your professional details, review your resume, ` +
      `and submit your verified application. You do not need to enter your application details from scratch.\n\n` +
      `This link is time-limited. If it has expired, just sign in with Google on our careers site using this same email address and your application will be waiting for you.\n\n` +
      `Regards,\nTalent Acquisition Team\nCcentrik`,
  }),

  application_submitted: (v) => ({
    subject: `Application received — ${v.job_title}`,
    html: shell(
      "We've received your application",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thank you for applying. Our Talent Acquisition team will review your application and get back to you.</p>
       ${details([
         ["Position", v.job_title],
         ["Application reference", v.application_code],
         ["Status", badge("Received", "info")],
       ])}
       ${button("Track your application", v.application_link)}
       <p style="font-size:13px;color:#6B7280;margin-top:8px">You can check the status of your application at any time using the link above.</p>`,
    ),
    text:
      `Hi ${v.candidate_name},\n\nThanks for applying for ${v.job_title}. ` +
      `Your reference is ${v.application_code}.\n\nTrack it: ${v.application_link}\n\n— Ccentrik`,
  }),

  application_approved: (v) => ({
    subject: `Application update — ${v.job_title}`,
    html: shell(
      "Your application has progressed",
      `<p>Hi ${v.candidate_name},</p>
       <p>Good news. Your application has moved to the next stage. We will be in touch with the next steps shortly.</p>
       ${details([
         ["Position", v.job_title],
         ["Status", badge("Progressed to next stage", "approved")],
       ])}
       ${button("View your application", v.application_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nYour application for ${v.job_title} has progressed to the next stage.\n\n${v.application_link}\n\n— Ccentrik`,
  }),

  application_rejected: (v) => ({
    subject: `Application update — ${v.job_title}`,
    html: shell(
      "Application update",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thank you for your interest in ${v.job_title} and for the time you invested in your application. After careful consideration, we will not be taking your application forward on this occasion.</p>
       ${details([
         ["Position", v.job_title],
         ["Status", badge("Not progressing", "rejected")],
       ])}
       <p>We would be glad to consider you for future roles that match your experience.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nThank you for applying for ${v.job_title}. We won't be taking your application forward on this occasion.\n\n— Ccentrik`,
  }),

  application_update_required: (v) => ({
    subject: `Action required — ${v.job_title} application`,
    html: shell(
      "Your application needs an update",
      `<p>Hi ${v.candidate_name},</p>
       <p>Before we can continue reviewing your application, please update the item below.</p>
       ${details([
         ["Position", v.job_title],
         ["Status", badge("Action required", "pending")],
       ])}
       <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6B7280">What needs to change</p>
       ${notice(v.reason)}
       ${button("Update your application", v.application_link)}
       <p style="font-size:13px;color:#6B7280">Your previous submission is kept. Updating creates a new version for review.</p>`,
    ),
    text:
      `Hi ${v.candidate_name},\n\nYour application for ${v.job_title} needs an update:\n\n${v.reason}\n\n` +
      `Update it here: ${v.application_link}\n\n— Ccentrik`,
  }),

  documents_requested: (v) => ({
    subject: `Documents requested — ${v.job_title}`,
    html: shell(
      "Please submit your pre-offer documents",
      `<p>Hi ${v.candidate_name},</p>
       <p>Congratulations on clearing the interview process. The next step is document verification.</p>
       ${details([
         ["Position", v.job_title],
         ["Next step", "Upload the checklist items in your document centre"],
         ["Status", badge("Documents pending", "pending")],
       ])}
       <p>Where a document does not apply to you, you can mark it as not applicable and give a short reason.</p>
       ${button("Open document centre", v.document_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nPlease submit your pre-offer documents for ${v.job_title}:\n${v.document_link}\n\n— Ccentrik`,
  }),

  document_correction_required: (v) => ({
    subject: `Document correction needed — ${v.job_title}`,
    html: shell(
      "A document needs a correction",
      `<p>Hi ${v.candidate_name},</p>
       <p>Our HR team reviewed your documents and needs a correction on the item below.</p>
       ${details([
         ["Position", v.job_title],
         ["Status", badge("Correction required", "pending")],
       ])}
       <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6B7280">What needs to change</p>
       ${notice(v.reason)}
       ${button("Re-upload document", v.document_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nA document needs correction:\n${v.reason}\n\n${v.document_link}\n\n— Ccentrik`,
  }),

  documents_verified: (v) => ({
    subject: `Documents verified — ${v.job_title}`,
    html: shell(
      "Your documents are verified",
      `<p>Hi ${v.candidate_name},</p>
       <p>All required documents have been verified. We will be in touch with your offer shortly.</p>
       ${details([
         ["Position", v.job_title],
         ["Status", badge("Verified", "approved")],
       ])}`,
    ),
    text: `Hi ${v.candidate_name},\n\nAll required documents for ${v.job_title} have been verified.\n\n— Ccentrik`,
  }),

  onboarding_documents_requested: (v) => ({
    subject: `Welcome aboard — please submit your onboarding documents`,
    html: shell(
      "Complete your onboarding",
      `<p>Hi ${v.candidate_name},</p>
       <p>Congratulations again on joining. HR needs a few documents and details to complete your onboarding.</p>
       ${details([
         ["Position", v.job_title],
         ["Next step", "Open your checklist and complete each item"],
         ["Status", badge("Onboarding pending", "pending")],
       ])}
       ${button("Open onboarding checklist", v.onboarding_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nPlease submit your onboarding documents for ${v.job_title}:\n${v.onboarding_link}\n\n— Ccentrik`,
  }),

  onboarding_document_correction_required: (v) => ({
    subject: `Onboarding document needs a correction`,
    html: shell(
      "An onboarding item needs a correction",
      `<p>Hi ${v.candidate_name},</p>
       <p>HR reviewed your onboarding documents and needs a correction on the item below.</p>
       ${details([["Status", badge("Correction required", "pending")]])}
       <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#6B7280">What needs to change</p>
       ${notice(v.reason)}
       ${button("Re-upload document", v.onboarding_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nAn onboarding document needs correction:\n${v.reason}\n\n${v.onboarding_link}\n\n— Ccentrik`,
  }),

  onboarding_documents_completed: (v) => ({
    subject: `Onboarding documents verified`,
    html: shell(
      "Your onboarding documents are verified",
      `<p>Hi ${v.candidate_name},</p>
       <p>All your onboarding documents have been verified. HR will be in touch with next steps ahead of your joining date.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nAll your onboarding documents have been verified. HR will be in touch with next steps.\n\n— Ccentrik`,
  }),

  // v.meeting_type: 'Virtual' | 'In-Person'. Virtual carries platform_label +
  // meeting_link; In-Person carries location + location_details.
  interview_scheduled: (v) => {
    const isVirtual = v.meeting_type === "Virtual";
    const modeLabel = isVirtual ? v.platform_label : "In-Person";
    const meetingRow = isVirtual
      ? `<tr><td style="padding:5px 0;color:#6b7280;width:110px;vertical-align:top">Meeting Link</td><td style="padding:5px 0;font-weight:600"><a href="${v.meeting_link}" style="color:#3157D5">${v.meeting_link}</a></td></tr>`
      : `<tr><td style="padding:5px 0;color:#6b7280;width:110px;vertical-align:top">Location</td><td style="padding:5px 0;font-weight:600">${v.location}${v.location_details ? `<br/><span style="font-weight:400;color:#6b7280">${v.location_details}</span>` : ""}</td></tr>`;
    const joinButton = isVirtual ? button("Join Meeting", v.meeting_link) : "";
    return {
      subject: `Interview Scheduled – ${v.round_name} | Ccentrik`,
      html: shell(
        "Interview Invitation",
        `<p>Hi ${v.candidate_name},</p>
         <p>You're invited to an interview for <strong>${v.job_title}</strong>.</p>
         <table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0">
           <tr>
             <td style="vertical-align:top;width:76px;padding-right:16px">
               <div style="background:#3157D5;color:#fff;border-radius:8px 8px 0 0;text-align:center;padding:5px 0;font-size:10px;font-weight:700;letter-spacing:.04em">${v.month_short} ${v.year}</div>
               <div style="border:1px solid #DCE4FB;border-top:none;border-radius:0 0 8px 8px;text-align:center;padding:8px 0">
                 <div style="font-size:26px;font-weight:800;color:#0f1729;line-height:1">${v.day_of_month}</div>
                 <div style="font-size:10px;color:#6b7280;margin-top:2px">${v.weekday}</div>
               </div>
             </td>
             <td style="vertical-align:top">
               <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em">${v.round_name}</div>
               <div style="font-weight:700;font-size:16px;color:#0f1729;margin:2px 0 6px">${v.time} · ${v.duration}</div>
               <span style="background:#DCE4FB;color:#2A4BBF;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700">${modeLabel}</span>
             </td>
           </tr>
         </table>
         <table role="presentation" style="width:100%;border-collapse:collapse;background:#EEF2FD;border:1px solid #DCE4FB;border-radius:8px;padding:14px;font-size:13px">
           <tr><td style="padding:14px 0 5px 14px;color:#6b7280;width:110px">Position</td><td style="padding:14px 14px 5px 0;font-weight:600">${v.job_title}</td></tr>
           <tr><td style="padding:5px 0 14px 14px;color:#6b7280;vertical-align:top">Organizer</td><td style="padding:5px 14px 14px 0;font-weight:600">Ccentrik Talent Acquisition</td></tr>
         </table>
         <table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;margin-top:4px">${meetingRow}</table>
         <div style="text-align:center">${joinButton}</div>
         <p style="margin:22px 0 10px;font-size:13px;color:#374151">Let us know if you can make it:</p>
         <table role="presentation" style="width:100%;border-collapse:separate;border-spacing:8px 0">
           <tr>
             <td style="text-align:center"><a href="${v.accept_link}" style="display:block;padding:11px 0;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px">Accept</a></td>
             <td style="text-align:center"><a href="${v.reschedule_link}" style="display:block;padding:11px 0;background:#f59e0b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px">Reschedule</a></td>
             <td style="text-align:center"><a href="${v.decline_link}" style="display:block;padding:11px 0;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:13px">Decline</a></td>
           </tr>
         </table>
         <p style="margin-top:18px"><a href="${v.application_link}" style="color:#3157D5;font-size:13px">View your application →</a></p>`,
      ),
      text:
        `Hi ${v.candidate_name},\n\nYou're invited to an interview for ${v.job_title}.\n\n` +
        `Interview Round: ${v.round_name}\nDate: ${v.date}\nTime: ${v.time}\nDuration: ${v.duration}\nMeeting Type: ${v.meeting_type}\n` +
        (isVirtual
          ? `Platform: ${v.platform_label}\nMeeting Link: ${v.meeting_link}\n`
          : `Location: ${v.location}\n${v.location_details ? `Location Details: ${v.location_details}\n` : ""}`) +
        `\nAccept: ${v.accept_link}\nReschedule: ${v.reschedule_link}\nDecline: ${v.decline_link}\n\nRegards,\nTalent Acquisition Team\nCcentrik`,
    };
  },

  interview_scheduled_panelist: (v) => ({
    subject: `Interview panel — ${v.candidate_name} for ${v.job_title}`,
    html: shell(
      "You've been added to an interview panel",
      `<p>Hi ${v.panelist_name},</p>
       <p>You've been added to the panel for <strong>${v.round_name}</strong> — ${v.candidate_name} for <strong>${v.job_title}</strong>.</p>
       <div style="background:#EEF2FD;border:1px solid #DCE4FB;border-radius:8px;padding:12px 14px;font-size:14px">
         <div><strong>When:</strong> ${v.when}</div>
         ${v.meeting_info ? `<div><strong>Where:</strong> ${v.meeting_info}</div>` : ""}
       </div>`,
    ),
    text: `Hi ${v.panelist_name},\n\nYou're on the panel for ${v.round_name} — ${v.candidate_name} (${v.job_title}) at ${v.when}.\n\n— Ccentrik`,
  }),

  interview_advance: (v) => ({
    subject: `Interview update — ${v.job_title}`,
    html: shell(
      "You've moved forward",
      `<p>Hi ${v.candidate_name},</p>
       <p>Good news — you've cleared <strong>${v.round_name}</strong> for <strong>${v.job_title}</strong>. We'll follow up with next steps.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nYou've cleared ${v.round_name} for ${v.job_title}.\n\n— Ccentrik`,
  }),

  interview_not_progressing: (v) => ({
    subject: `Interview update — ${v.job_title}`,
    html: shell(
      "Interview update",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thank you for the time you invested in the interview process for <strong>${v.job_title}</strong>. We won't be moving forward on this occasion.</p>
       <p>We'd be glad to consider you for future roles that match your experience.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nWe won't be moving forward with your application for ${v.job_title}.\n\n— Ccentrik`,
  }),

  offer_sent: (v) => ({
    subject: `Your offer — ${v.job_title}`,
    html: shell(
      "We're pleased to offer you this role",
      `<p>Dear ${v.candidate_name},</p>
       <p>We are pleased to share your offer for the position of <strong>${v.job_title}</strong>.</p>
       ${v.note ? `<p style="white-space:pre-wrap">${v.note}</p>` : ""}
       <p>Please review the full offer details and use the link below to review and respond.</p>
       ${button("Review your offer", v.offer_link)}
       <p>Regards,<br/>Ccentrik Talent Acquisition Team</p>`,
    ),
    text: `Dear ${v.candidate_name},\n\nYour offer for ${v.job_title} is ready: ${v.offer_link}\n\n— Ccentrik Talent Acquisition Team`,
  }),

  offer_accepted_ack: (v) => ({
    subject: `Offer accepted — ${v.job_title}`,
    html: shell(
      "Your acceptance is confirmed",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thanks for accepting the offer for <strong>${v.job_title}</strong>. Our HR team will be in touch shortly to begin onboarding.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nYour acceptance for ${v.job_title} is confirmed. HR will be in touch to begin onboarding.\n\n— Ccentrik`,
  }),
};

export function render(template: string, vars: Vars) {
  const t = templates[template];
  if (!t) {
    return {
      subject: vars.subject ?? "Ccentrik notification",
      html: shell(vars.subject ?? "Notification", `<p>${vars.message ?? ""}</p>`),
      text: vars.message ?? "",
    };
  }
  return t(vars);
}
