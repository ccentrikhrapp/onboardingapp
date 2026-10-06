const YEAR = 2026;

function pad(n, len = 6) {
  return String(n).padStart(len, '0');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
