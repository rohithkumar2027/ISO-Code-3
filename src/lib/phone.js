'use strict';

/**
 * Normalise an Indian mobile number to its 10 digits.
 * Accepts "98765 43210", "+91 98765-43210", "0919876543210", "09876543210".
 * Returns null when it cannot be a valid Indian mobile (must start 6-9).
 */
function normalizeMobile(input) {
  let d = String(input ?? '').replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 13 && d.startsWith('091')) d = d.slice(3);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** "9000000001" -> "+91 ••••• ••001" (last three digits only) */
const maskMobile = (m) => `+91 ••••• ••${String(m).slice(-3)}`;

/** Compact form for logs: "••••••0001" */
const logMobile = (m) => `••••••${String(m).slice(-4)}`;

module.exports = { normalizeMobile, maskMobile, logMobile };
