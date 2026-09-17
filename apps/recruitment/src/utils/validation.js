/**
 * Shared field validators. Every form in this app should import from here
 * rather than re-implementing its own regex — keeps the rules consistent
 * and in one place to change.
 *
 * Each `isValid*` returns a boolean. Each `*Error` returns '' when the
 * value is fine, or a user-facing message when it isn't — so a form can do
 * `setErrors(e => ({ ...e, email: emailError(value) }))` directly.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers: exactly 10 digits, optionally written with a
// leading +91 / 91 / 0 country/trunk prefix which is stripped before the
// length check (so "+91 98765 43210" and "9876543210" both pass).
const PHONE_DIGITS_RE = /^(?:\+?91[\s-]?|0)?([6-9]\d{9})$/;
const NAME_RE = /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)*$/;
const PIN_RE = /^[1-9]\d{5}$/; // Indian PIN code: 6 digits, can't start with 0
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]{2,}$/i;

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value ?? '').trim());
}
export function emailError(value, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? 'Please enter an email address.' : '';
  if (!isValidEmail(v)) return 'Please enter a valid email address.';
  return '';
}

export function isValidPhone(value) {
  return PHONE_DIGITS_RE.test(String(value ?? '').trim());
}
export function phoneError(value, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? 'Please enter a phone number.' : '';
  if (!isValidPhone(v)) return 'Please enter a valid 10-digit Indian mobile number.';
  return '';
}

/** Person names: letters/spaces/., '-, at least one letter, no digits. */
export function isValidName(value) {
  const v = String(value ?? '').trim();
  return v.length > 0 && v.length <= 60 && NAME_RE.test(v);
}
export function nameError(value, { required = false, label = 'name' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please enter a ${label}.` : '';
  if (v.length > 60) return `That ${label} is too long.`;
  if (!NAME_RE.test(v)) return `Please enter a valid ${label}.`;
  return '';
}

export function isValidUrl(value) {
  return URL_RE.test(String(value ?? '').trim());
}
export function urlError(value, { required = false, label = 'URL' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please enter a ${label}.` : '';
  if (!isValidUrl(v)) return `Please enter a valid ${label} (starting with http:// or https://).`;
  return '';
}

/** Place names (city/state/country, "Bengaluru, India"): needs a letter, no digits, not just punctuation. */
export function isValidLocation(value) {
  const v = String(value ?? '').trim();
  return v.length > 0 && v.length <= 100 && /[A-Za-z]/.test(v) && !/\d/.test(v);
}
export function locationError(value, { required = false, label = 'location' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please enter a ${label}.` : '';
  if (v.length > 100) return `That ${label} is too long.`;
  if (!isValidLocation(v)) return `Please enter a valid ${label}.`;
  return '';
}

export function isValidPincode(value) {
  return PIN_RE.test(String(value ?? '').trim());
}
export function pincodeError(value, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? 'Please enter a PIN code.' : '';
  if (!PIN_RE.test(v)) return 'Please enter a valid 6-digit PIN code.';
  return '';
}

/** Non-negative whole/decimal number within an optional range. */
export function numberError(value, { required = false, label = 'value', min, max, integer = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please enter a ${label}.` : '';
  if (!/^\d+(\.\d+)?$/.test(v)) return `Please enter a valid ${label}.`;
  const n = Number(v);
  if (integer && !Number.isInteger(n)) return `${label} must be a whole number.`;
  if (min !== undefined && n < min) return `${label} must be at least ${min}.`;
  if (max !== undefined && n > max) return `${label} must be at most ${max}.`;
  return '';
}

/** A date string (yyyy-mm-dd from <input type="date">) that must not be in the future. */
export function notFutureDateError(value, { required = false, label = 'date' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please select a ${label}.` : '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return `Please enter a valid ${label}.`;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (d.getTime() > today.getTime()) return `${label} cannot be in the future.`;
  return '';
}

/** A date string that must not be in the past (e.g. a joining/deadline date). */
export function notPastDateError(value, { required = false, label = 'date' } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? `Please select a ${label}.` : '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return `Please enter a valid ${label}.`;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) return `${label} cannot be in the past.`;
  return '';
}

export function requiredError(value, label = 'field') {
  const v = typeof value === 'string' ? value.trim() : value;
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
    return `Please provide ${label}.`;
  }
  return '';
}

// A renamed-extension trick (foo.exe -> foo.pdf) still reports its real MIME
// type in most browsers, so cross-checking `file.type` against what the
// extension claims catches what the extension check alone can't.
const EXT_MIME_MAP = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
};

/**
 * File upload: extension allow-list + max size, one place instead of three.
 * An empty/missing `allowedExt` means "no type restriction" (some document
 * requirements are structured-data rather than a real file).
 */
export function fileUploadError(file, { allowedExt = ['pdf', 'doc', 'docx'], maxMB = 5 } = {}) {
  if (!file) return 'Please choose a file.';
  if (allowedExt?.length) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExt.includes(ext)) {
      return `Unsupported file type. Please upload a ${allowedExt.join(', ').toUpperCase()} file.`;
    }
    // Some upload paths (older browsers, some drag-drop sources) report an
    // empty file.type — that's not evidence of spoofing, so only reject when
    // the browser did report a type and it disagrees with the extension.
    const expectedMime = EXT_MIME_MAP[ext];
    if (expectedMime && file.type && !expectedMime.includes(file.type)) {
      return `This file doesn't look like a valid ${ext.toUpperCase()} file.`;
    }
  }
  if (file.size === 0) return 'That file appears to be empty. Please choose a different file.';
  if (file.size > maxMB * 1024 * 1024) return `File size exceeds the ${maxMB} MB limit.`;
  return '';
}
