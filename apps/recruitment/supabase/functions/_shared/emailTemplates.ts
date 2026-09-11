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

  interview_scheduled: (v) => ({
    subject: `Interview scheduled — ${v.job_title}`,
    html: shell(
      "Your interview is scheduled",
      `<p>Hi ${v.candidate_name},</p>
       <p>Your <strong>${v.round_name}</strong> for <strong>${v.job_title}</strong> is scheduled.</p>
       <div style="background:#f4f6ff;border:1px solid #dbe3ff;border-radius:8px;padding:12px 14px;font-size:14px">
         <div><strong>Round:</strong> ${v.round_name}</div>
         <div><strong>When:</strong> ${v.when}</div>
         ${v.meeting_info ? `<div><strong>Where:</strong> ${v.meeting_info}</div>` : ""}
       </div>
       ${v.instructions ? `<p style="font-size:13px;color:#6b7280">${v.instructions}</p>` : ""}
       ${button("View your application", v.application_link)}`,
    ),
    text: `Hi ${v.candidate_name},\n\n${v.round_name} for ${v.job_title} is scheduled: ${v.when}${v.meeting_info ? ` (${v.meeting_info})` : ""}.\n\n— Ccentrik`,
  }),

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
