/* Minimal CSV parse/generate — handles quoted fields (with embedded commas,
   quotes, newlines) without pulling in a dependency for what's a small,
   well-understood format here. */

/* Tokenizes CSV text into raw rows of fields (no header interpretation) —
   shared by the normal row/column parser below and the transposed one. */
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  const s = text.replace(/^﻿/, ''); // strip a BOM from Excel-saved files
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\r') {
      // skip — \n (or end of string) closes the row
    } else if (c === '\n') {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function parseCsv(text) {
  const clean = parseCsvRows(text);
  if (!clean.length) return [];
  const headers = clean[0].map((h) => h.trim());
  return clean.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers, rows) {
  const lines = [headers.map(csvField).join(',')];
  for (const r of rows) lines.push(headers.map((h) => csvField(r[h])).join(','));
  return lines.join('\r\n');
}

/* Transposed table — field labels down column A, one additional column per
   record (matches a layout some TAs already paste candidates into: Name,
   Number, Email id... as row labels, with each candidate going across).
   Still real comma-separated CSV, just transposed, and round-trips through
   the same { header: value } row shape as the normal functions above, so
   every existing form-mapping/validation function works unchanged. */
export function toTransposedCsv(headers, rows) {
  const lines = headers.map((h) => [h, ...rows.map((r) => String(r[h] ?? ''))].map(csvField).join(','));
  return lines.join('\r\n');
}

export function parseTransposedCsv(text) {
  const grid = parseCsvRows(text);
  if (!grid.length) return [];
  const count = Math.max(0, ...grid.map((r) => r.length - 1));
  const records = Array.from({ length: count }, () => ({}));
  grid.forEach((r) => {
    const label = (r[0] ?? '').trim();
    if (!label) return;
    for (let i = 0; i < count; i++) records[i][label] = (r[i + 1] ?? '').trim();
  });
  return records;
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
