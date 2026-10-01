import { SECTIONS, docLabel, docUnits } from './joiningSchema.ts';
import { addressText, fullNameOf, summarizeSections } from './joiningView.js';

/* Every joining form is generated from the ONE central profile — nothing is
   typed again. Each builder returns printable HTML; openPrint() shows it in a
   clean window ("Save as PDF" from the print dialog). A snapshot passed in
   (the signed version) is what gets printed once the employee has submitted,
   so later edits never silently change a signed form.

   The legal wording lives in LEGAL below, in one place, so HR/legal can change
   it without touching the layout. */

export const LEGAL = {
  company: 'Ccentrik',
  bgv: [
    'I authorise the company and its appointed verification agency to verify my present and previous employment, tenure and remuneration, my education, my address, my professional background and any other check applicable to the package selected.',
    'I confirm that the information and documents I have provided are true and accurate.',
  ],
  pfDeclaration: [
    'The information given above is true to the best of my knowledge.',
    'I authorise the use of my Aadhaar for verification / e-KYC where applicable.',
    'I authorise transfer of my applicable PF and service details from my previous account.',
    'I will inform my employer if any of this information changes.',
  ],
  authorization: [
    'I authorise the company to verify the information in my resume and application.',
    'I authorise the company to make the necessary enquiries.',
    'I authorise relevant persons and organisations to give information about me for this purpose.',
    'I understand that false information can affect my employment or offer, and I accept the company’s decision.',
  ],
  travel: 'I understand that, depending on business requirements, my role may involve domestic or international travel, client locations, branch offices, project sites, temporary or long-term deployment, training, meetings, support activities and relocation or deputation. I understand that a valid passport, visa, identification documents and applicable statutory documents may be required and I will keep them ready.',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dash = (v) => (v === undefined || v === null || String(v).trim() === '' ? '&mdash;' : esc(v));
const dt = (v) => { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); };

const g = (data, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
const kv = (rows) => `<table class="kv">${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${dash(v)}</td></tr>`).join('')}</table>`;
const table = (heads, rows) => `<table class="grid"><thead><tr>${heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
  rows.length ? rows.map((r) => `<tr>${r.map((c) => `<td>${dash(c)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${heads.length}">None</td></tr>`}</tbody></table>`;
const ticks = (lines, on) => `<ul class="ticks">${lines.map((l) => `<li>${on ? '&#9745;' : '&#9744;'} ${esc(l)}</li>`).join('')}</ul>`;
const sign = (sig, who) => `<div class="sign"><div><strong>${sig ? esc(sig.name) : '&nbsp;'}</strong><br/>Signature of ${esc(who)} ${sig ? '(signed digitally)' : '(pending)'}</div><div>Date: <strong>${sig ? esc(dt(sig.at)) : '&nbsp;'}</strong></div></div>`;
const employer = (title, rows) => `<div class="box"><h3>${esc(title)} <small>(to be completed by the employer — HR)</small></h3>${kv(rows)}</div>`;

const sub = (data, hr, extra = {}) => {
  const name = fullNameOf(data);
  const perm = addressText(data?.address?.permanent) || addressText(data?.address?.current);
  const father = g(data, 'personal.main.fatherName');
  const spouse = (data?.family?.members ?? []).find((m) => m?.relationship === 'Spouse')?.fullName;
  return { name, perm, father, spouse, cur: addressText(data?.address?.current), ...extra, hr };
};

export const FORMS = [
  { id: 'joining', title: 'Employee Joining Form' },
  { id: 'pf11', title: 'PF Form 11' },
  { id: 'pf2', title: 'PF Form 2 (EPF / EPS nomination)' },
  { id: 'gratuity', title: 'Gratuity Nomination (Form F)' },
  { id: 'bgv', title: 'Background Verification Consent' },
  { id: 'authorization', title: 'Letter of Authorization' },
  { id: 'travel', title: 'Travel & Mobility Consent' },
  { id: 'checklist', title: 'Supporting Document Checklist' },
];

export function buildForm(id, data, hr = {}, signature = null, caseInfo = {}, docs = null) {
  const s = sub(data, hr);
  const day = signature ? dt(signature.at) : '';
  const yes = (path) => g(data, path) === 'Yes';

  switch (id) {
    case 'joining': {
      const body = summarizeSections(data, { mask: false }).map((sec) => `<h2>${esc(sec.title)}</h2>${sec.groups.map((grp) => `${grp.title ? `<h3>${esc(grp.title)}</h3>` : ''}${
        grp.rows ? kv(grp.rows.map((r) => [r.label, r.value === '—' ? '' : r.value])) : (grp.items || []).map((it) => `<h4>${esc(it.title)}</h4>${kv(it.rows.map((r) => [r.label, r.value === '—' ? '' : r.value]))}`).join('') || '<p>None</p>'}`).join('')}`).join('');
      return `<h1>Employee Joining Form</h1>${employer('HR details', [
        ['Employee code', hr.employeeCode], ['Date of joining', dt(hr.dateOfJoining)], ['Grade', hr.grade], ['Designation', hr.designation || caseInfo.designation],
        ['Ccentrik email', hr.ccentrikEmail], ['Client', hr.clientName], ['Client work location', hr.clientWorkLocation], ['Client email', hr.clientEmail],
        ['Reporting manager', hr.reportingManager], ['Department', hr.department], ['Project', hr.projectName], ['Branch', hr.branchName], ['Zeta card', hr.zetaCard], ['PF: restrict to INR 1800', hr.pfRestrictTo1800],
      ])}${body}${sign(signature, 'employee')}`;
    }
    case 'pf11': {
      const prevPf = g(data, 'pf.previous') || {};
      return `<h1>PF Form 11 &mdash; Declaration by a person taking up employment</h1>
        <h2>Member details</h2>${kv([
          ['Name', s.name], ["Father's / spouse's name", s.father || s.spouse], ['Date of birth', dt(g(data, 'personal.main.dob'))], ['Gender', g(data, 'personal.main.gender')],
          ['Marital status', g(data, 'personal.main.maritalStatus')], ['Email', g(data, 'contact.main.personalEmail')], ['Mobile', g(data, 'contact.main.mobile')],
          ['Aadhaar', g(data, 'identity.aadhaar.number')], ['PAN', g(data, 'identity.pan.number')], ['UAN', g(data, 'identity.uan.number')],
          ['Bank account', g(data, 'bank.main.accountNumber')], ['IFSC', g(data, 'bank.main.ifsc')],
        ])}
        <h2>Previous membership</h2>${kv([
          ['Earlier member of EPF Scheme, 1952?', prevPf.previousEpfMember], ['Earlier member of EPS, 1995?', prevPf.previousEpsMember],
          ['Previous PF account number', prevPf.previousPfAccountNumber], ['Establishment code', prevPf.pfEstablishmentCode], ['PF extension', prevPf.pfExtension], ['PF number', prevPf.pfNumber],
          ['Date of exit', dt(prevPf.dateOfExit)], ['Scheme certificate number', prevPf.schemeCertificateNumber], ['PPO number', prevPf.ppoNumber],
        ])}
        <h2>International worker</h2>${kv([
          ['International worker?', g(data, 'pf.international.internationalWorker')], ['Country of origin', g(data, 'pf.international.countryOfOrigin')],
          ['Passport number', g(data, 'personal.passport.number') || g(data, 'pf.international.passportNumber')],
          ['Passport valid from', dt(g(data, 'personal.passport.dateOfIssue') || g(data, 'pf.international.passportValidFrom'))],
          ['Passport valid to', dt(g(data, 'personal.passport.dateOfExpiry') || g(data, 'pf.international.passportValidTo'))],
        ])}
        <h2>Declaration</h2>${ticks(LEGAL.pfDeclaration, ['declTrue', 'declAadhaar', 'declTransfer', 'declInform'].every((k) => yes(`pf.declaration.${k}`)))}
        <p>Place: <strong>${dash(g(data, 'pf.declaration.place'))}</strong></p>${sign(signature, 'member')}
        ${employer('Employer', [
          ['Employee code', hr.employeeCode], ['Date of joining', dt(hr.dateOfJoining)], ['PF number', hr.pfNumber], ['UAN allotted', hr.uanAllotted],
          ['PF KYC status', hr.pfKycStatus], ['DSC approval status', hr.dscApprovalStatus], ['Transfer request status', hr.transferRequestStatus], ['Form 13', hr.form13Status],
          ['Employer date', dt(hr.pfEmployerDate)], ['Authorised officer', hr.pfEmployerOfficer],
        ])}`;
    }
    case 'pf2': {
      const nominees = (data?.nomination?.epfNominees ?? []).map((n) => [n.name, n.address, n.relationship, dt(n.dob), `${n.share}%`, n.minor === 'Yes' ? `${n.guardianName || ''}, ${n.guardianAddress || ''}` : '']);
      const eps = (data?.nomination?.epsFamily ?? []).map((n, i) => [i + 1, n.name, n.address, n.age, n.relationship]);
      const pen = g(data, 'nomination.epsPension') || {};
      return `<h1>PF Form 2 &mdash; Nomination and declaration</h1>
        <h2>Member</h2>${kv([['Name', s.name], ["Father's / husband's name", s.father || s.spouse], ['Date of birth', dt(g(data, 'personal.main.dob'))],
          ['Account number (UAN)', g(data, 'identity.uan.number') || hr.uanAllotted], ['Sex', g(data, 'personal.main.gender')], ['Marital status', g(data, 'personal.main.maritalStatus')], ['Address', s.perm]])}
        <h2>Part A &mdash; EPF</h2>
        ${kv([['Has a family as defined under the EPF rules?', g(data, 'nomination.epfDecl.hasFamily')], ['Father / mother dependent?', g(data, 'nomination.epfDecl.parentsDependent')]])}
        ${table(['Nominee', 'Address', 'Relationship', 'Date of birth', 'Share of PF', 'Guardian (if minor)'], nominees)}
        <h2>Part B &mdash; EPS</h2>${kv([['Has a family entitled under the EPS?', g(data, 'nomination.epsDecl.hasEpsFamily')]])}
        ${table(['#', 'Name', 'Address', 'Age', 'Relationship'], eps)}
        ${pen.name ? `<h3>Nominee for monthly widow / children pension</h3>${kv([['Name', pen.name], ['Address', pen.address], ['Date of birth', dt(pen.dob)], ['Relationship', pen.relationship]])}` : ''}
        <p>Place: <strong>${dash(g(data, 'nomination.confirm.place'))}</strong></p>${sign(signature, 'member')}
        ${employer('Employer certification', [['Certified that the above declaration is signed by', s.name], ['Authorised officer', hr.pfEmployerOfficer], ['Establishment', hr.pfEstablishmentName], ['Address', hr.pfEstablishmentAddress], ['Date', dt(hr.pfEmployerDate)]])}`;
    }
    case 'gratuity': {
      const rows = (data?.gratuity?.nominees ?? []).map((n) => [n.name, n.address, n.relationship, n.age, `${n.share}%`]);
      return `<h1>Payment of Gratuity &mdash; Form F (Nomination)</h1>
        ${kv([['Company', LEGAL.company], ['Employee name', s.name], ['Gender', g(data, 'personal.main.gender')], ['Religion', g(data, 'gratuity.details.religion')], ['Marital status', g(data, 'personal.main.maritalStatus')],
          ['Department / branch', hr.department || hr.branchName], ['Post held', hr.designation || caseInfo.designation], ['Ticket / serial number', g(data, 'gratuity.details.ticketNumber')],
          ['Date of appointment', dt(hr.dateOfJoining || caseInfo.joiningDate)], ['Permanent address', s.perm]])}
        <h2>Nominees</h2>${table(['Full name', 'Address', 'Relationship', 'Age', 'Share'], rows)}
        ${kv([['Has a family under the gratuity rules?', g(data, 'gratuity.declarations.hasFamily')], ['Parents dependent?', g(data, 'gratuity.declarations.parentsDependent')],
          ['Earlier nomination cancelled by this one', yes('gratuity.declarations.priorNominationVoid') ? 'Yes' : '']])}
        <h2>Witnesses</h2>${table(['Witness', 'Name', 'Address'], [[1, g(data, 'gratuity.witnesses.w1Name'), g(data, 'gratuity.witnesses.w1Address')], [2, g(data, 'gratuity.witnesses.w2Name'), g(data, 'gratuity.witnesses.w2Address')]])}
        <p>Place: <strong>${dash(g(data, 'gratuity.witnesses.place'))}</strong></p>${sign(signature, 'employee')}
        ${employer('Employer certification', [['Reference number', hr.gratuityReference], ['Authorised officer', hr.gratuityOfficer], ['Designation', hr.gratuityOfficerDesignation], ['Date', dt(hr.gratuityDate)]])}
        <p>Acknowledgement: ${yes('gratuity.ack.copyReceived') ? '&#9745;' : '&#9744;'} I acknowledge receipt of a duplicate / certified copy of this nomination.</p>`;
    }
    case 'bgv': {
      const emp = (data?.employment?.previous ?? []).map((e) => [e.employerName, e.designation, `${e.startMonth || ''} to ${e.endMonth || ''}`, e.ctc]);
      const idType = g(data, 'bgv.main.idType');
      const idNo = idType === 'Aadhaar' ? g(data, 'identity.aadhaar.number') : idType === 'PAN Card' ? g(data, 'identity.pan.number') : idType === 'Passport' ? g(data, 'personal.passport.number') : g(data, 'bgv.main.idNumber');
      return `<h1>Background Verification &mdash; Consent</h1>
        ${kv([['Applicant name', s.name], ["Father's name", s.father], ['Current address', s.cur], ['City', g(data, 'address.current.city')], ['Postal code', g(data, 'address.current.pin')],
          ['Phone', g(data, 'contact.main.mobile')], ['Email', g(data, 'contact.main.personalEmail')], ['ID type', idType], ['ID number', idNo]])}
        <h2>Education</h2>${kv([['Highest qualification', [g(data, 'education.highest.qualification'), g(data, 'education.highest.course')].filter(Boolean).join(', ')], ['Institution', g(data, 'education.highest.institution')], ['Year', g(data, 'education.highest.yearOfPassing')]])}
        <h2>Employment history</h2>${table(['Employer', 'Designation', 'Period', 'CTC'], emp)}
        <h2>Consent</h2>${ticks(LEGAL.bgv, ['read', 'authorize', 'accurate'].every((k) => yes(`bgv.consent.${k}`)))}${sign(signature, 'applicant')}`;
    }
    case 'authorization':
      return `<h1>Employee Letter of Authorization</h1>${kv([['Employee', s.name], ['Employee ID', hr.employeeCode]])}
        ${ticks(LEGAL.authorization, ['verifyResume', 'enquiries', 'thirdParties', 'falseInfo'].every((k) => yes(`authorization.main.${k}`)))}${sign(signature, 'employee')}`;
    case 'travel':
      return `<h1>Travel &amp; Mobility Consent</h1>${kv([['Employee', s.name], ['Employee ID', hr.employeeCode], ['Designation', hr.designation || caseInfo.designation], ['Date', dt(signature?.at) || dt(new Date())]])}
        <p>${esc(LEGAL.travel)}</p>${ticks(['I consent to the above.'], yes('travel.main.consent'))}${sign(signature, 'employee')}`;
    default: {
      const reqs = docs?.reqs || [];
      const states = docs?.states || {};
      const units = docUnits(reqs, states);
      const applicable = units.filter((u) => u.applicable);
      const na = units.filter((u) => !u.applicable);
      const rows = applicable.map((u) => [u.name, u.req.classification === 'critical' ? 'Mandatory' : u.req.classification === 'conditional' ? 'Conditional' : 'Optional', u.resolved && u.key === 'identity_proof' ? 'Identity Proof \u2013 Satisfied' : docLabel(u.req, u.state).label]);
      return `<h1>Supporting Document Checklist</h1>${kv([['Employee', s.name], ['Employment', g(data, 'employment.summary.isFresher') === 'Yes' ? 'Fresher' : 'Experienced'], ['Previous employers', String((data?.employment?.previous ?? []).length)]])}
        <h2>Applicable requirements</h2>${table(['Requirement', 'Type', 'Status'], rows)}
        <h2>Not applicable to this employee</h2>${table(['Requirement', 'Reason'], na.map((u) => [u.name, u.req.naReason || '']))}`;
    }
  }
}

const CSS = `body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#111;margin:24px}h1{font-size:19px;margin:0 0 12px;border-bottom:2px solid #111;padding-bottom:6px}
h2{font-size:14px;margin:16px 0 6px;background:#f1f3f5;padding:4px 8px}h3{font-size:13px;margin:10px 0 4px}h4{margin:8px 0 2px;font-size:12px;color:#444}
table{width:100%;border-collapse:collapse;margin:4px 0}th,td{border:1px solid #bbb;padding:4px 7px;text-align:left;vertical-align:top}th{background:#fafafa;width:34%}
table.grid th{width:auto}.box{border:1px dashed #666;padding:6px 10px;margin:14px 0}.box h3 small{font-weight:400;color:#555}.ticks{list-style:none;padding:0}
.sign{display:flex;justify-content:space-between;margin-top:26px;border-top:1px solid #999;padding-top:6px}@media print{body{margin:10mm}}`;

/** Opens a clean printable window (use the browser's "Save as PDF" to keep a copy). */
export function openPrint(title, html) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>${html}<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
  w.document.close();
  return true;
}

export const SECTION_TITLES = Object.fromEntries(SECTIONS.map((s) => [s.id, s.title]));
