'use strict';
// Deterministic rules: split "Haemoglobin g/dL" into name + unit, parse the
// reference range and decide low / normal / high. No AI is involved here:
// out-of-range flags always come from the report's own reference range.

const UNIT_RE = /^(%|fL|pg|[A-Za-zµμ0-9^.*]+\/[A-Za-zµμ0-9^.*]+)$/;

function splitParameter(parameter) {
  const p = String(parameter).trim().replace(/\s+/g, ' ');
  const idx = p.lastIndexOf(' ');
  if (idx > 0) {
    const tail = p.slice(idx + 1);
    if (UNIT_RE.test(tail)) return { name: p.slice(0, idx), unit: tail };
  }
  return { name: p, unit: null };
}

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const DASH = '\\s*[-–—]\\s*';

/**
 * Parse "12.0-15.5", "3.5 - 5.1", "<5.7", "≤ 200", ">40", ">=30".
 * Returns { low, high } (either may be null) or null if unparseable.
 */
function parseRange(raw) {
  const s = String(raw ?? '').trim();
  let m;
  if ((m = s.match(new RegExp(`^${NUM}${DASH}${NUM}$`)))) {
    const low = Number(m[1]);
    const high = Number(m[2]);
    return low <= high ? { low, high } : null;
  }
  if ((m = s.match(new RegExp(`^(?:<|<=|≤)\\s*${NUM}$`)))) return { low: null, high: Number(m[1]) };
  if ((m = s.match(new RegExp(`^(?:>|>=|≥)\\s*${NUM}$`)))) return { low: Number(m[1]), high: null };
  return null;
}

/** Parse a plain numeric result. Anything else ("Reactive", "<0.5", "Trace") is not evaluated. */
function parseValue(raw) {
  const s = String(raw ?? '').trim().replace(/,/g, '');
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
}

/** @returns {'low'|'high'|'normal'|'unknown'} */
function flagFor(value, range) {
  if (value === null || !range) return 'unknown';
  if (range.low !== null && value < range.low) return 'low';
  if (range.high !== null && value > range.high) return 'high';
  return 'normal';
}

function evaluate(parameter, resultRaw, refRaw) {
  const { name, unit } = splitParameter(parameter);
  const value = parseValue(resultRaw);
  const range = parseRange(refRaw);
  return {
    name,
    unit,
    valueNum: value,
    refLow: range ? range.low : null,
    refHigh: range ? range.high : null,
    flag: flagFor(value, range),
  };
}

/** Map the LIS "Status" text to our order status, or null if unknown. */
function mapStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (s === 'processing') return 'processing';
  if (s === 'ready') return 'ready';
  if (s === 'ready (critical)' || s === 'ready critical' || s === 'critical') return 'ready_critical';
  return null;
}

module.exports = { splitParameter, parseRange, parseValue, flagFor, evaluate, mapStatus };
