'use strict';
// Expiring links for broadcast documents — the same hashed-token, 72h-expiry,
// OTP-gated pattern as src/services/links.js (report links), kept as a
// separate table/service on purpose: a document broadcast is not a patient
// order, and this way the new feature can never touch the already-hardened
// report-delivery path.
const { nowIso } = require('../db');
const { newToken, sha256 } = require('../lib/crypto');

function create(db, cfg, { runId, documentId, mobile }) {
  const token = newToken();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + cfg.linkTtlMs).toISOString();
  const info = db.prepare(`INSERT INTO broadcast_links (run_id, document_id, mobile, token_hash, created_at, expires_at, send_status)
                           VALUES (?,?,?,?,?,?,'sent')`)
    .run(runId, documentId, mobile, sha256(token), now, expiresAt);
  return { id: Number(info.lastInsertRowid), token, url: `${cfg.baseUrl}/d/${token}` };
}

/** @returns {{state:'unknown'}|{state:'expired'|'revoked'|'valid', link, document}} */
function find(db, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: 'unknown' };
  const link = db.prepare('SELECT * FROM broadcast_links WHERE token_hash = ?').get(sha256(token));
  if (!link) return { state: 'unknown' };
  const document = db.prepare('SELECT * FROM broadcast_documents WHERE id = ?').get(link.document_id);
  if (!document) return { state: 'unknown' };
  const base = { link, document };
  if (link.revoked_at) return { state: 'revoked', ...base };
  if (Date.parse(link.expires_at) < Date.now()) return { state: 'expired', ...base };
  return { state: 'valid', ...base };
}

function recordOpen(db, linkId) {
  db.prepare(`UPDATE broadcast_links SET open_count = open_count + 1, first_opened_at = COALESCE(first_opened_at, ?) WHERE id = ?`)
    .run(nowIso(), linkId);
}

function setSendResult(db, linkId, { status, channel, error }) {
  db.prepare('UPDATE broadcast_links SET send_status = ?, send_channel = ?, send_error = ? WHERE id = ?')
    .run(status, channel ?? null, error ?? null, linkId);
}

module.exports = { create, find, recordOpen, setSendResult };
