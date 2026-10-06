import { COUNTRIES } from '../constants/countries.js';

const PHONE_DIGITS_RE = /^(?:\+?91[\s-]?|0)?([6-9]\d{9})$/;

// Dialling codes, longest first, so "+1684…" is matched before "+1".
const DIALS = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);

/* A phone is stored as "+<country code> <national number>", e.g. "+91 9876543210".
   Numbers saved before the country selector existed have no "+" and are Indian
   mobiles, so they still pass. Validation depends on the country: India needs
   exactly 10 digits starting 6-9; other countries need 4-15 digits in total
   (the international maximum), with at least one digit in the national part. */
export function splitPhone(value) {
  const v = String(value ?? '').replace(/[\s\-().]/g, '');
  if (!v.startsWith('+')) return { dial: '91', national: v.replace(/^(?:91|0)?(?=[6-9]\d{9}$)/, '') };
  const digits = v.slice(1);
  const dial = DIALS.find((d) => digits.startsWith(d)) || '';
  return { dial, national: digits.slice(dial.length) };
}

export function joinPhone(dial, national) {
  const n = String(national ?? '').replace(/\D/g, '');
  return n ? `+${dial} ${n}` : '';
}

export function isValidPhone(value) {
  const v = String(value ?? '').trim();
  if (!v) return false;
  if (!v.startsWith('+')) return PHONE_DIGITS_RE.test(v.replace(/[\s-]/g, ''));
  const { dial, national } = splitPhone(v);
  if (!dial || !/^\d+$/.test(national)) return false;
  if (dial === '91') return /^[6-9]\d{9}$/.test(national);
  const total = dial.length + national.length;
  return national.length >= 1 && total >= 6 && total <= 15;
}

export function phoneError(value, { required = false } = {}) {
  const v = String(value ?? '').trim();
  if (!v) return required ? 'Please enter a phone number.' : '';
  if (!isValidPhone(v)) {
    const { dial } = splitPhone(v);
    if (v.startsWith('+') && !dial) return 'Choose the country code, then enter the number.';
    if (v.startsWith('+') && dial === '91') return 'Enter a valid 10-digit Indian mobile number (starting 6-9).';
    if (!v.startsWith('+')) return 'Please enter a valid 10-digit Indian mobile number.';
    return 'Enter a valid phone number for the selected country.';
  }
  return '';
}
