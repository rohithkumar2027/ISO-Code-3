'use strict';
const { nowIso } = require('../db');

/**
 * Append-only access log (DPDP: who looked at which health record, when).
 * type: patient | staff | system | anonymous. ref: masked mobile or staff username.
 * `req` is optional; when present the client IP and a trimmed user agent are stored.
 */
function logAccess(db, { type, ref = null, action, orderId = null, detail = null, req = null }) {
  const ip = req ? String(req.ip ?? '').slice(0, 64) : null;
  const ua = req ? String(req.get?.('user-agent') ?? '').slice(0, 160) : null;
  db.prepare(`INSERT INTO access_log (at, actor_type, actor_ref, action, order_id, detail, ip, ua)
              VALUES (?,?,?,?,?,?,?,?)`)
    .run(nowIso(), type, ref, action, orderId, detail ? String(detail).slice(0, 300) : null, ip, ua);
}

module.exports = { logAccess };
