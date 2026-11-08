'use strict';
// Expiring report links. The token is 256 random bits; only its SHA-256 is
// stored. A link never opens a report by itself: it leads to an OTP check
// against the mobile number on file (see routes/patient.js).
const { nowIso } = require('../db');
const { newToken, sha256 } = require('../lib/crypto');

/** Create a fresh link for an order. Older links for the order are revoked. */
function create(db, cfg, orderId, createdBy) {
  const token = newToken();
  const now = nowIso();
  db.prepare('UPDATE report_links SET revoked_at = ? WHERE order_id = ? AND revoked_at IS NULL').run(now, orderId);
  const expiresAt = new Date(Date.now() + cfg.linkTtlMs).toISOString();
  const info = db.prepare(`INSERT INTO report_links (order_id, token_hash, created_at, expires_at, created_by) VALUES (?,?,?,?,?)`)
    .run(orderId, sha256(token), now, expiresAt, createdBy);
  return { id: Number(info.lastInsertRowid), token, expiresAt, url: `${cfg.baseUrl}/r/${token}` };
}

/**
 * @returns {{state:'unknown'}|{state:'expired'|'revoked'|'valid', link, order, mobile}}
 */
function find(db, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: 'unknown' };
  const link = db.prepare('SELECT * FROM report_links WHERE token_hash = ?').get(sha256(token));
  if (!link) return { state: 'unknown' };
  const order = db.prepare(`SELECT o.*, p.mobile, p.name AS patient_name FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = ?`).get(link.order_id);
  if (!order) return { state: 'unknown' };
  const base = { link, order, mobile: order.mobile };
  if (link.revoked_at) return { state: 'revoked', ...base };
  if (Date.parse(link.expires_at) < Date.now()) return { state: 'expired', ...base };
  return { state: 'valid', ...base };
}

function recordOpen(db, linkId) {
  db.prepare(`UPDATE report_links SET open_count = open_count + 1, first_opened_at = COALESCE(first_opened_at, ?) WHERE id = ?`)
    .run(nowIso(), linkId);
}

module.exports = { create, find, recordOpen };
