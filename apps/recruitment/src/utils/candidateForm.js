import { uid } from './ids.js';
import { nameError, emailError, phoneError, locationError, urlError, numberError, notPastDateError } from './validation.js';

/* The candidate application form's fields, options, validation and mapping —
   shared by the Job Portal form (ApplyPage) and the TA "Add Candidate" form so
   the two can never drift apart. */

export const EXP_OPTIONS = ['Fresher', '0–2 years', '2–5 years', '5–8 years', '8+ years'];
export const NOTICE_OPTIONS = ['Immediate', '15 Days', '30 Days', '60 Days', '90 Days'];
export const ANALYZE_STEPS = ['Uploading resume', 'Extracting text', 'Reading details', 'Populating the form'];

export function expBucket(y) {
  const n = Number(y) || 0;
  if (n <= 0) return 'Fresher';
  if (n <= 2) return '0–2 years';
  if (n <= 5) return '2–5 years';
  if (n <= 8) return '5–8 years';
  return '8+ years';
}
export function expToNumber(b) {
  return { Fresher: '0', '0–2 years': '1', '2–5 years': '3', '5–8 years': '6', '8+ years': '9' }[b] || '';
}

export const REQUIRED = ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'experience'];
export const LABELS = {
  firstName: 'First name', lastName: 'Last name', email: 'Email', phone: 'Phone number',
  currentLocation: 'Current location', experience: 'Total experience', noticePeriod: 'Notice period',
};

// Format checks layered on top of the plain required-field check.
// `req` is whether the field is required (see isFieldRequired).
export const FIELD_VALIDATORS = {
  firstName: (v, req) => nameError(v, { required: req, label: 'first name' }),
  lastName: (v, req) => nameError(v, { required: req, label: 'last name' }),
  email: (v, req) => emailError(v, { required: req }),
  phone: (v, req) => phoneError(v, { required: req }),
  currentLocation: (v, req) => locationError(v, { required: req, label: 'current location' }),
  portfolio: (v) => urlError(v, { required: false, label: 'portfolio/LinkedIn URL' }),
  relevantExperience: (v) => numberError(v, { required: false, label: 'relevant experience', min: 0, max: 60 }),
  lastWorkingDay: (v) => notPastDateError(v, { required: false, label: 'last working day' }),
};

// Notice period only makes sense for someone leaving a current job — a fresher
// has none to give, so it is required only once experience is non-zero.
export const isFieldRequired = (form, k) =>
  REQUIRED.includes(k) || (k === 'noticePeriod' && Number(expToNumber(form.experience)) > 0);

export function fieldError(form, k, v = form[k]) {
  const required = isFieldRequired(form, k);
  const validator = FIELD_VALIDATORS[k];
  return validator ? validator(v, required) : required && !String(v).trim() ? `${LABELS[k]} is required.` : '';
}

/** Errors for every form field (resume + documents are checked by each form). */
export function validateFormFields(form) {
  const e = {};
  new Set([...REQUIRED, ...Object.keys(FIELD_VALIDATORS), 'noticePeriod']).forEach((k) => {
    const msg = fieldError(form, k);
    if (msg) e[k] = msg;
  });
  return e;
}

export const RESET_ON_NEW_RESUME = {
  firstName: '', lastName: '', email: '', phone: '', currentLocation: '', experience: '',
  currentCompany: '', currentJobTitle: '', highestQualification: '', portfolio: '',
  skills: [], autofilled: [],
};

/** Form patch from the resume parser's `fields` (same mapping for both forms). */
export function parsedToFormPatch(form, p) {
  return {
    firstName: p.firstName || form.firstName,
    lastName: p.lastName || form.lastName,
    email: p.email || form.email,
    phone: p.mobile || form.phone,
    currentLocation: p.currentLocation || form.currentLocation,
    experience: p.totalExperience ? expBucket(p.totalExperience) : form.experience,
    currentCompany: p.currentCompany || form.currentCompany,
    currentJobTitle: p.currentJobTitle || form.currentJobTitle,
    highestQualification: p.education?.[0]?.qualification || form.highestQualification,
    portfolio: p.portfolio || p.linkedin || form.portfolio,
    skills: p.skills?.length ? [...p.skills] : form.skills,
    autofilled: ['firstName', 'lastName', 'email', 'phone', 'currentLocation', 'experience', 'currentCompany', 'currentJobTitle', 'highestQualification']
      .filter((k) => (k === 'phone' ? p.mobile : p[k])),
  };
}

/** The personal / professional / education / additional blocks stored on an application. */
export function formToApplicationBlocks(form) {
  return {
    personal: {
      firstName: form.firstName, middleName: '', lastName: form.lastName,
      email: form.email, mobile: form.phone, dob: '', gender: '', nationality: '',
      currentLocation: form.currentLocation, preferredLocation: form.currentLocation,
      address: { line1: '', line2: '', city: form.currentLocation, state: '', country: 'India', postalCode: '' },
    },
    professional: {
      currentJobTitle: form.currentJobTitle, currentCompany: form.currentCompany,
      totalExperience: expToNumber(form.experience), relevantExperience: form.relevantExperience || '',
      employmentStatus: form.currentCompany ? 'Employed' : '', currentCTC: '',
      expectedCTC: '', noticePeriod: form.noticePeriod, lastWorkingDay: form.lastWorkingDay || '',
      preferredJobLocation: form.currentLocation,
      skills: form.skills, certifications: [], languages: [],
    },
    education: [{ id: uid('edu'), qualification: form.highestQualification, university: '', specialization: '', year: '', grade: '' }],
    additional: { coverNote: form.coverNote, referral: '', portfolio: form.portfolio, howHeard: form.source },
  };
}
