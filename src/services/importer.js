'use strict';
// LIS CSV import. The LIS is not changed: it already exports CSV files into a
// folder (or staff upload one). One CSV row = one result parameter.
//
// Rules that matter:
//  * an order is imported all-or-nothing; one bad row rejects that order only
//  * re-importing the same file is harmless (idempotent)
//  * a signed order is never silently changed by a later export
//  * unsigned ("Processing") results are stored but never shown to patients

const crypto = require('node:crypto');
const { tx, nowIso } = require('../db');
const { parseCsvObjects } = require('../lib/csv');
const { normalizeMobile } = require('../lib/phone');
const { evaluate, mapStatus } = require('./rules');

const REQUIRED = ['Order ID', 'Patient', 'Parameter', 'Result', 'Reference Range', 'Status', 'Referring Doctor', 'Mobile'];
const OPTIONAL = ['Age', 'Sex', 'Collected At', 'Signed At'];

const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const nameKey = (s) => clean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function parseDate(raw) {
  const s = clean(raw);
  if (!s) return { value: null };
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return { error: `date "${s}" must look like 2026-11-07 17:40` };
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '00'}:${m[5] ?? '00'}:00+05:30`; // LIS time is IST
  if (Number.isNaN(Date.parse(iso))) return { error: `date "${s}" is not a real date` };
  return { value: new Date(iso).toISOString() };
}

/** Validate one CSV record. Returns { row } or { errors: [] }. */
function validateRow(rec) {
  const errors = [];
  const orderId = clean(rec['Order ID']).toUpperCase();
  if (!/^[A-Z]{2,5}-\d{3,10}$/.test(orderId)) errors.push(`Order ID "${orderId}" is not in the form ORD-12345`);

  const patient = clean(rec['Patient']);
  if (patient.length < 2 || patient.length > 80 || !/^[\p{L}\p{M}.' -]+$/u.test(patient)) {
    errors.push('Patient name is missing or has unusual characters');
  }
  const mobile = normalizeMobile(rec['Mobile']);
  if (!mobile) errors.push('Mobile is not a valid 10-digit Indian number');

  const parameter = clean(rec['Parameter']);
  if (!parameter || parameter.length > 80) errors.push('Parameter is missing or too long');
  const result = clean(rec['Result']);
  if (!result || result.length > 40) errors.push('Result is missing or too long');
  const ref = clean(rec['Reference Range']);
  if (ref.length > 40) errors.push('Reference Range is too long');

  const status = mapStatus(rec['Status']);
  if (!status) errors.push(`Status "${clean(rec['Status'])}" is not Processing, Ready or Ready (critical)`);

  const doctor = clean(rec['Referring Doctor']);
  if (doctor.length > 80) errors.push('Referring Doctor is too long');

  let age = null;
  if (clean(rec['Age'])) {
    age = Number(clean(rec['Age']));
    if (!Number.isInteger(age) || age < 0 || age > 120) errors.push('Age must be a whole number from 0 to 120');
  }
  let sex = null;
  if (clean(rec['Sex'])) {
    sex = { m: 'M', male: 'M', f: 'F', female: 'F', o: 'O', other: 'O' }[clean(rec['Sex']).toLowerCase()] ?? null;
    if (!sex) errors.push('Sex must be M, F or O');
  }
  const collected = parseDate(rec['Collected At']);
  if (collected.error) errors.push(`Collected At: ${collected.error}`);
  const signed = parseDate(rec['Signed At']);
  if (signed.error) errors.push(`Signed At: ${signed.error}`);

  if (errors.length) return { errors };
  return {
    row: {
      orderId, patient, mobile, parameter, result, ref, status, doctor: doctor || null, age, sex,
      collectedAt: collected.value, signedAt: signed.value,
    },
  };
}

const fingerprint = (rows) =>
  crypto.createHash('sha256')
    .update(JSON.stringify(rows.map((r) => [r.parameter, r.result, r.ref]).sort()))
    .digest('hex');

function aggregateStatus(rows) {
  if (rows.some((r) => r.status === 'processing')) return 'processing';
  return rows.some((r) => r.status === 'ready_critical') ? 'ready_critical' : 'ready';
}

function upsertPatient(db, first, now) {
  const key = nameKey(first.patient);
  db.prepare(`INSERT INTO patients (mobile, name, name_key, age, sex, created_at) VALUES (?,?,?,?,?,?)
              ON CONFLICT (mobile, name_key) DO UPDATE SET
                age = COALESCE(excluded.age, age), sex = COALESCE(excluded.sex, sex)`)
    .run(first.mobile, first.patient, key, first.age, first.sex, now);
  return db.prepare('SELECT id FROM patients WHERE mobile = ? AND name_key = ?').get(first.mobile, key).id;
}

function writeResults(db, orderId, rows) {
  db.prepare('DELETE FROM results WHERE order_id = ?').run(orderId);
  const ins = db.prepare(`INSERT INTO results
    (order_id, position, parameter, name, unit, value_raw, value_num, ref_raw, ref_low, ref_high, flag)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  rows.forEach((r, i) => {
    const e = evaluate(r.parameter, r.result, r.ref);
    ins.run(orderId, i, r.parameter, e.name, e.unit, r.result, e.valueNum, r.ref || null, e.refLow, e.refHigh, e.flag);
  });
}

/** Apply one validated, consistent order. Returns 'new' | 'updated' | 'signed' | 'unchanged' | 'blocked'. */
function applyOrder(db, orderId, rows, now) {
  const first = rows[0];
  const status = aggregateStatus(rows);
  const existing = db.prepare('SELECT o.*, p.mobile AS p_mobile, p.name_key AS p_key FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = ?').get(orderId);
  const signedNow = status !== 'processing';
  const signedAt = first.signedAt ?? (signedNow ? now : null);

  if (!existing) {
    const pid = upsertPatient(db, first, now);
    db.prepare(`INSERT INTO orders (id, patient_id, status, referring_doctor, collected_at, signed_at, imported_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?)`)
      .run(orderId, pid, status, first.doctor, first.collectedAt, signedNow ? signedAt : null, now, now);
    writeResults(db, orderId, rows);
    return { outcome: 'new', signed: signedNow };
  }

  if (existing.status !== 'processing') {
    // Already signed: only an identical re-export is accepted.
    const current = db.prepare('SELECT parameter, value_raw AS result, ref_raw AS ref FROM results WHERE order_id = ?').all(orderId)
      .map((r) => ({ parameter: r.parameter, result: r.result, ref: r.ref ?? '' }));
    const samePatient = existing.p_mobile === first.mobile && existing.p_key === nameKey(first.patient);
    if (samePatient && fingerprint(current) === fingerprint(rows) && status === existing.status) return { outcome: 'unchanged' };
    return { outcome: 'blocked' };
  }

  // Still processing: allow corrections and the sign-off transition.
  const pid = upsertPatient(db, first, now);
  db.prepare(`UPDATE orders SET patient_id = ?, status = ?, referring_doctor = ?, collected_at = COALESCE(?, collected_at),
              signed_at = ?, updated_at = ? WHERE id = ?`)
    .run(pid, status, first.doctor, first.collectedAt, signedNow ? signedAt : null, now, orderId);
  writeResults(db, orderId, rows);
  return { outcome: signedNow ? 'signed' : 'updated', signed: signedNow };
}

/**
 * Import CSV text. Never throws for bad rows; throws only if the file as a
 * whole is unusable (bad headers, truncated quoting).
 */
function importCsv(db, { text, filename, source }) {
  const startedAt = nowIso();
  const fileHash = crypto.createHash('sha256').update(text).digest('hex');
  const { headers, records } = parseCsvObjects(text);
  const lower = new Map(headers.map((h) => [h.toLowerCase(), h]));
  const missing = REQUIRED.filter((h) => !lower.has(h.toLowerCase()));
  if (missing.length) throw new Error(`Missing column(s): ${missing.join(', ')}`);
  if (!records.length) throw new Error('The file has a header but no data rows');
  // Normalise header casing so lookups are exact
  const canon = [...REQUIRED, ...OPTIONAL];
  const rename = new Map(canon.map((c) => [c.toLowerCase(), c]));
  const recs = records.map((r) => {
    const o = { __line: r.__line };
    for (const h of headers) o[rename.get(h.toLowerCase()) ?? h] = r[h];
    return o;
  });

  const errors = [];
  const byOrder = new Map();
  let rowsFailed = 0;
  for (const rec of recs) {
    const v = validateRow(rec);
    if (v.errors) {
      rowsFailed++;
      const id = clean(rec['Order ID']).toUpperCase() || '(no id)';
      errors.push({ line: rec.__line, order: id, message: v.errors.join('; ') });
      const bad = byOrder.get(id) ?? { rows: [], bad: true };
      bad.bad = true; byOrder.set(id, bad);
      continue;
    }
    const g = byOrder.get(v.row.orderId) ?? { rows: [], bad: false };
    g.rows.push(v.row); byOrder.set(v.row.orderId, g);
  }

  let ordersNew = 0;
  let ordersSigned = 0;
  const now = nowIso();
  for (const [orderId, g] of byOrder) {
    if (g.bad) {
      if (!errors.some((e) => e.order === orderId && /rejected/.test(e.message))) {
        errors.push({ line: null, order: orderId, message: 'Order rejected: fix the rows above and export again' });
      }
      continue;
    }
    const f = g.rows[0];
    if (g.rows.some((r) => r.mobile !== f.mobile || nameKey(r.patient) !== nameKey(f.patient))) {
      errors.push({ line: null, order: orderId, message: 'Order rejected: rows disagree on patient or mobile' });
      rowsFailed += g.rows.length;
      continue;
    }
    try {
      const res = tx(db, () => applyOrder(db, orderId, g.rows, now));
      if (res.outcome === 'new') ordersNew++;
      if (res.signed) ordersSigned++;
      if (res.outcome === 'blocked') {
        errors.push({ line: null, order: orderId, message: 'Signed report differs from the new export: not changed (amendments need manual handling)' });
      }
    } catch (e) {
      errors.push({ line: null, order: orderId, message: `Order rejected: ${e.message}` });
      rowsFailed += g.rows.length;
    }
  }

  const info = db.prepare(`INSERT INTO import_runs (source, filename, file_hash, started_at, rows_total, rows_failed, orders_new, orders_signed, errors)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(source, filename.slice(0, 120), fileHash, startedAt, recs.length, rowsFailed, ordersNew, ordersSigned, JSON.stringify(errors.slice(0, 200)));
  return { id: Number(info.lastInsertRowid), rowsTotal: recs.length, rowsFailed, ordersNew, ordersSigned, errors };
}

module.exports = { importCsv, validateRow, REQUIRED, OPTIONAL };
