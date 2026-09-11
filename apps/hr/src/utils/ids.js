const YEAR = 2026;

function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}

export function makeCandidateId(seq) {
  return `CAN-${YEAR}-${pad(seq)}`;
}
export function makeApplicationId(seq) {
  return `APP-${YEAR}-${pad(seq)}`;
}
export function makeEmployeeId(seq) {
  return `EMP-${YEAR}-${pad(seq, 5)}`;
}
export function makeOfferId(seq) {
  return `OFR-${YEAR}-${pad(seq)}`;
}
export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
