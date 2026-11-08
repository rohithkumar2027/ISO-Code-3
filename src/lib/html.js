'use strict';
// Minimal auto-escaping template helper. Every interpolated value is escaped
// unless it was produced by html`` itself or wrapped with raw().

class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  if (v === false || v === null || v === undefined) return '';
  return escape(v);
}

function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return new Safe(out);
}

const raw = (s) => new Safe(String(s));

module.exports = { html, raw, escape, Safe };
