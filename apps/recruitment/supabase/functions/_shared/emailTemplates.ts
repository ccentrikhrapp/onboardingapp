// Email templates. Each returns { subject, html, text }. Keep them plain and
// professional — the master prompt's wording. Variables are interpolated by the
// caller, not with a templating engine.

type Vars = Record<string, string>;

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e8ec;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #eef0f3;font-weight:700;font-size:15px;color:#0f1729">Ccentrik</div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:17px;color:#0f1729">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #eef0f3;font-size:12px;color:#8a93a3">
      Ccentrik — Talent Acquisition. This is an automated message.
    </div>
  </div>
</body></html>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;margin:14px 0;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">${label}</a>`;
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
       <p style="font-size:13px;color:#6b7280">You do not need to enter your application details from scratch.</p>`,
    ),
    text:
      `Hi ${v.candidate_name},\n\nOur Talent Acquisition team has created your application based on the resume provided to us. ` +
      `Please review and verify your information using the secure link below.\n\n${v.verify_link}\n\n` +
      `You will be able to review, correct, add missing information, confirm your professional details, review your resume, ` +
      `and submit your verified application. You do not need to enter your application details from scratch.\n\n` +
      `Regards,\nTalent Acquisition Team\nCcentrik`,
  }),

  application_submitted: (v) => ({
    subject: `Application received — ${v.job_title}`,
    html: shell(
      "We've received your application",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thanks for applying for <strong>${v.job_title}</strong>. Your application reference is <strong>${v.application_code}</strong>.</p>
       <p>Our Talent Acquisition team will review it and get back to you. You can track the status any time.</p>
       ${button("Track your application", v.application_link)}`,
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
       <p>Good news — your application for <strong>${v.job_title}</strong> has progressed to the next stage. We'll be in touch with the next steps shortly.</p>
       ${button("View your application", v.application_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nYour application for ${v.job_title} has progressed to the next stage.\n\n${v.application_link}\n\n— Ccentrik`,
  }),

  application_rejected: (v) => ({
    subject: `Application update — ${v.job_title}`,
    html: shell(
      "Application update",
      `<p>Hi ${v.candidate_name},</p>
       <p>Thank you for your interest in <strong>${v.job_title}</strong> and for the time you invested in your application. After careful consideration, we won't be taking your application forward on this occasion.</p>
       <p>We'd be glad to consider you for future roles that match your experience.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nThank you for applying for ${v.job_title}. We won't be taking your application forward on this occasion.\n\n— Ccentrik`,
  }),

  application_update_required: (v) => ({
    subject: `Action required — ${v.job_title} application`,
    html: shell(
      "Your application needs an update",
      `<p>Hi ${v.candidate_name},</p>
       <p>Before we can continue reviewing your application for <strong>${v.job_title}</strong>, we need you to update the following:</p>
       <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${v.reason}</div>
       ${button("Update your application", v.application_link)}
       <p style="font-size:13px;color:#6b7280">Your previous submission is kept — updating creates a new version for review.</p>`,
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
       <p>Congratulations on clearing the interview process for <strong>${v.job_title}</strong>. The next step is document verification.</p>
       <p>Open your document centre to see the checklist and upload each item. Where a document genuinely doesn't apply to you, you can mark it and give a reason.</p>
       ${button("Open document centre", v.document_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nPlease submit your pre-offer documents for ${v.job_title}:\n${v.document_link}\n\n— Ccentrik`,
  }),

  document_correction_required: (v) => ({
    subject: `Document correction needed — ${v.job_title}`,
    html: shell(
      "One or more documents need a correction",
      `<p>Hi ${v.candidate_name},</p>
       <p>Our HR team reviewed your documents and needs a correction on:</p>
       <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${v.reason}</div>
       ${button("Re-upload document", v.document_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nA document needs correction:\n${v.reason}\n\n${v.document_link}\n\n— Ccentrik`,
  }),

  documents_verified: (v) => ({
    subject: `Documents verified — ${v.job_title}`,
    html: shell(
      "Your documents are verified",
      `<p>Hi ${v.candidate_name},</p>
       <p>All required documents for <strong>${v.job_title}</strong> have been verified. We'll be in touch with your offer shortly.</p>`,
    ),
    text: `Hi ${v.candidate_name},\n\nAll required documents for ${v.job_title} have been verified.\n\n— Ccentrik`,
  }),

  onboarding_documents_requested: (v) => ({
    subject: `Welcome aboard — please submit your onboarding documents`,
    html: shell(
      "A few documents to complete your onboarding",
      `<p>Hi ${v.candidate_name},</p>
       <p>Congratulations again on joining as <strong>${v.job_title}</strong>! HR needs a few documents to complete your onboarding.</p>
       <p>Open your onboarding checklist below to see what's required and upload each item.</p>
       ${button("Open onboarding checklist", v.onboarding_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\nPlease submit your onboarding documents for ${v.job_title}:\n${v.onboarding_link}\n\n— Ccentrik`,
  }),

  onboarding_document_correction_required: (v) => ({
    subject: `Onboarding document needs a correction`,
    html: shell(
      "One onboarding document needs a correction",
      `<p>Hi ${v.candidate_name},</p>
       <p>HR reviewed your onboarding documents and needs a correction on:</p>
       <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:14px;white-space:pre-wrap">${v.reason}</div>
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
      ? `<tr><td style="padding:5px 0;color:#6b7280;width:110px;vertical-align:top">Meeting Link</td><td style="padding:5px 0;font-weight:600"><a href="${v.meeting_link}" style="color:#2563eb">${v.meeting_link}</a></td></tr>`
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
               <div style="background:#2563eb;color:#fff;border-radius:8px 8px 0 0;text-align:center;padding:5px 0;font-size:10px;font-weight:700;letter-spacing:.04em">${v.month_short} ${v.year}</div>
               <div style="border:1px solid #dbe3ff;border-top:none;border-radius:0 0 8px 8px;text-align:center;padding:8px 0">
                 <div style="font-size:26px;font-weight:800;color:#0f1729;line-height:1">${v.day_of_month}</div>
                 <div style="font-size:10px;color:#6b7280;margin-top:2px">${v.weekday}</div>
               </div>
             </td>
             <td style="vertical-align:top">
               <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em">${v.round_name}</div>
               <div style="font-weight:700;font-size:16px;color:#0f1729;margin:2px 0 6px">${v.time} · ${v.duration}</div>
               <span style="background:#dbe3ff;color:#2540c9;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700">${modeLabel}</span>
             </td>
           </tr>
         </table>
         <table role="presentation" style="width:100%;border-collapse:collapse;background:#f4f6ff;border:1px solid #dbe3ff;border-radius:8px;padding:14px;font-size:13px">
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
         <p style="margin-top:18px"><a href="${v.application_link}" style="color:#2563eb;font-size:13px">View your application →</a></p>`,
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
       <div style="background:#f4f6ff;border:1px solid #dbe3ff;border-radius:8px;padding:12px 14px;font-size:14px">
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
       <p>Please review the attached offer letter and use the link below to review and respond.</p>
       ${button("Review your offer", v.offer_link)}
       <p>Regards,<br/>C-Centrik Talent Acquisition Team</p>`,
    ),
    text: `Dear ${v.candidate_name},\n\nYour offer for ${v.job_title} is ready: ${v.offer_link}\n\n— C-Centrik Talent Acquisition Team`,
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
