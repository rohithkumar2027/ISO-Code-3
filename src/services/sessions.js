'use strict';
// Server-side sessions. The cookie carries a random id; only its SHA-256 is
// stored, so a leaked database does not leak live sessions.
const { nowIso } = require('../db');
const { newToken, sha256 } = require('../lib/crypto');

function create(db, { kind, mobile = null, staffId = null }) {
  const token = newToken();
  const csrf = newToken();
  const now = nowIso();
  db.prepare(`INSERT INTO sessions (id_hash, kind, mobile, staff_id, csrf, created_at, last_seen) VALUES (?,?,?,?,?,?,?)`)
    .run(sha256(token), kind, mobile, staffId, csrf, now, now);
  return { token, csrf };
}

/** Returns the session row if present, of the expected kind and within idle/absolute limits. */
function load(db, token, kind, { idleMs, maxMs }) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const id = sha256(token);
  const s = db.prepare('SELECT * FROM sessions WHERE id_hash = ? AND kind = ?').get(id, kind);
  if (!s) return null;
  const now = Date.now();
  if (now - Date.parse(s.last_seen) > idleMs || now - Date.parse(s.created_at) > maxMs) {
    db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(id);
    return null;
  }
  if (now - Date.parse(s.last_seen) > 30_000) {
    db.prepare('UPDATE sessions SET last_seen = ? WHERE id_hash = ?').run(nowIso(), id);
  }
  return s;
}

function destroy(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE id_hash = ?').run(sha256(token));
}

function purgeExpired(db, maxAgeMs) {
  db.prepare('DELETE FROM sessions WHERE last_seen < ?').run(new Date(Date.now() - maxAgeMs).toISOString());
}

module.exports = { create, load, destroy, purgeExpired };
