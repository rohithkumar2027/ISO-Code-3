'use strict';

/**
 * RFC 4180-style CSV parser: quoted fields, escaped quotes, CRLF/LF, BOM.
 * Returns an array of rows (arrays of strings). Blank lines are skipped.
 * Throws on an unterminated quote so a truncated file is never half-imported.
 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => {
    pushField();
    if (!(row.length === 1 && row[0].trim() === '')) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { inQuotes = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (inQuotes) throw new Error('Unterminated quoted field: file looks truncated');
  if (field !== '' || row.length) pushRow();
  return rows;
}

/** Parse into objects keyed by trimmed header names. */
function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r, idx) => {
    const o = { __line: idx + 2 };
    headers.forEach((h, k) => { o[h] = (r[k] ?? '').trim(); });
    return o;
  });
  return { headers, records };
}

module.exports = { parseCsv, parseCsvObjects };
