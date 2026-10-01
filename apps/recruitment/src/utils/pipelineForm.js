import { nameError, emailError, phoneError, locationError } from './validation.js';

/* Pipeline Candidate form: fields, validation and CSV mapping — shared by the
   manual Add/Edit form and the CSV bulk upload so both apply identical rules. */

export const PIPELINE_CSV_HEADERS = [
  'Name', 'Number', 'Email id', 'Position', 'Organisation', 'Total Exp', 'Relevant Exp',
  'Current CTC', 'Offer in hand', 'Expected CTC', 'Notice', 'Current Location', 'Hiring Location',
];

export function blankPipelineForm() {
  return {
    name: '', phone: '', email: '', position: '', organisation: '', totalExp: '', relevantExp: '',
    currentCtc: '', offerInHand: '', expectedCtc: '', noticeDays: '', currentLocation: '', hiringLocation: '',
  };
}

export function formFromPipeline(c) {
  return {
    name: c.name, phone: c.phone, email: c.email, position: c.position, organisation: c.organisation,
    totalExp: String(c.totalExp), relevantExp: String(c.relevantExp), currentCtc: String(c.currentCtc),
    offerInHand: c.offerInHand ? 'Yes' : 'No', expectedCtc: String(c.expectedCtc),
    noticeDays: String(c.noticeDays), currentLocation: c.currentLocation, hiringLocation: c.hiringLocation,
  };
}

const textError = (v, label, max = 100) => {
  const s = String(v ?? '').trim();
  if (!s) return `Please enter ${label}.`;
  if (s.length > max) return `${label[0].toUpperCase()}${label.slice(1)} is too long.`;
  return '';
};

function amountError(v, label, { max = 1000 } = {}) {
  const s = String(v ?? '').trim();
  if (s === '') return `Please enter ${label}.`;
  const n = Number(s);
  if (!Number.isFinite(n)) return `${label[0].toUpperCase()}${label.slice(1)} must be a valid number.`;
  if (n < 0) return `${label[0].toUpperCase()}${label.slice(1)} can't be negative.`;
  if (n > max) return `${label[0].toUpperCase()}${label.slice(1)} looks too large.`;
  return '';
}

export const parseYesNo = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (['yes', 'y', 'true'].includes(s)) return 'Yes';
  if (['no', 'n', 'false'].includes(s)) return 'No';
  return '';
};

/** Per-field errors ({} when valid). */
export function validatePipelineForm(f) {
  const e = {};
  const nm = nameError(f.name, { required: true, label: 'name' });
  if (nm) e.name = nm;
  else if (String(f.name).trim().split(/\s+/).length < 2) e.name = 'Enter first and last name (needed to move them to a job later).';
  const ph = phoneError(f.phone, { required: true });
  if (ph) e.phone = ph;
  const em = emailError(f.email, { required: true });
  if (em) e.email = em;
  const pos = textError(f.position, 'a position');
  if (pos) e.position = pos;
  const org = textError(f.organisation, 'an organisation');
  if (org) e.organisation = org;
  const te = amountError(f.totalExp, 'total experience', { max: 60 });
  if (te) e.totalExp = te;
  const re = amountError(f.relevantExp, 'relevant experience', { max: 60 });
  if (re) e.relevantExp = re;
  else if (!te && Number(f.relevantExp) > Number(f.totalExp)) e.relevantExp = "Relevant experience can't exceed total experience.";
  const cc = amountError(f.currentCtc, 'current CTC');
  if (cc) e.currentCtc = cc;
  const ec = amountError(f.expectedCtc, 'expected CTC');
  if (ec) e.expectedCtc = ec;
  if (!parseYesNo(f.offerInHand)) e.offerInHand = 'Choose Yes or No.';
  const nd = amountError(f.noticeDays, 'notice period', { max: 365 });
  if (nd) e.noticeDays = nd.replace('a valid number', 'a valid number of days');
  else if (!Number.isInteger(Number(f.noticeDays))) e.noticeDays = 'Notice period must be a whole number of days.';
  const cl = locationError(f.currentLocation, { required: true, label: 'current location' });
  if (cl) e.currentLocation = cl;
  const hl = locationError(f.hiringLocation, { required: true, label: 'hiring location' });
  if (hl) e.hiringLocation = hl;
  return e;
}

/** A parsed CSV row (keyed by header) → form shape. Offer-in-hand is normalised to Yes/No when recognisable. */
export function pipelineFormFromCsvRow(r) {
  return {
    name: r['Name'] || '', phone: r['Number'] || '', email: r['Email id'] || '', position: r['Position'] || '',
    organisation: r['Organisation'] || '', totalExp: r['Total Exp'] || '', relevantExp: r['Relevant Exp'] || '',
    currentCtc: r['Current CTC'] || '', offerInHand: parseYesNo(r['Offer in hand']) || r['Offer in hand'] || '',
    expectedCtc: r['Expected CTC'] || '', noticeDays: r['Notice'] || '',
    currentLocation: r['Current Location'] || '', hiringLocation: r['Hiring Location'] || '',
  };
}

// Field key → the CSV column it came from, so a row error can name the column.
export const PIPELINE_FIELD_COLUMN = {
  name: 'Name', phone: 'Number', email: 'Email id', position: 'Position', organisation: 'Organisation',
  totalExp: 'Total Exp', relevantExp: 'Relevant Exp', currentCtc: 'Current CTC', offerInHand: 'Offer in hand',
  expectedCtc: 'Expected CTC', noticeDays: 'Notice', currentLocation: 'Current Location', hiringLocation: 'Hiring Location',
};

export const normPhone10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

// Keep in step with the default window in pipeline_check_reminders (migration).
export const REMINDER_WINDOW_DAYS = 7;

export function daysUntil(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

/** The status shown in the table/drawer (a reminder-due candidate is still "active" in the database). */
export function pipelineStatus(c) {
  if (c.status === 'archived') return 'Archived';
  if (c.status === 'moved') return 'Moved to Job Candidate';
  return daysUntil(c.expectedAvailability) <= REMINDER_WINDOW_DAYS ? 'Reminder Due' : 'Active';
}

export const PIPELINE_STATUS_TONE = {
  Active: 'green', 'Reminder Due': 'amber', 'Moved to Job Candidate': 'blue', Archived: 'grey',
};
