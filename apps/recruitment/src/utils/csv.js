/* Minimal CSV parse/generate — handles quoted fields (with embedded commas,
   quotes, newlines) without pulling in a dependency for what's a small,
   well-understood format here. */

export function parseCsv(text) {
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

  const clean = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
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

/* Vertical "Label: value" block format — one record per block, blocks
   separated by a blank line. Values round-trip through the same
   { header: value } shape the row/column functions above produce, so every
   existing form-mapping/validation function works unchanged either way. */
export function toVerticalBlocks(headers, rows) {
  const block = (r) => headers.map((h) => `${h}: ${String(r[h] ?? '')}`).join('\n');
  return rows.map(block).join('\n\n');
}

export function parseVerticalBlocks(text) {
  const s = text.replace(/^﻿/, '').replace(/\r\n/g, '\n'); // strip a BOM from Excel-saved files
  const blocks = s.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const row = {};
    block.split('\n').forEach((line) => {
      const i = line.indexOf(':');
      if (i === -1) return;
      const label = line.slice(0, i).trim();
      if (label) row[label] = line.slice(i + 1).trim();
    });
    return row;
  });
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob(['﻿' + csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
