'use strict';
// One-time passwords for patient login and for opening a report link.
//  * 6 digits from crypto.randomInt, stored only as an HMAC
//  * valid 5 minutes, 5 wrong attempts then locked, new OTP voids the old one
//  * send limits: 30 s cooldown and 5 per hour per mobile
const { nowIso } = require('../db');
const { hmac, newOtp, safeEqual } = require('../lib/crypto');

class OtpRateLimited extends Error {
  constructor(message, retryAfterSec) { super(message); this.retryAfterSec = retryAfterSec; }
}

const codeHash = (cfg, mobile, purpose, linkId, code) => hmac(cfg.appSecret, 'otp', mobile, purpose, linkId ?? '', code);

function issue(db, cfg, { mobile, purpose, linkId = null }) {
  const now = Date.now();
  const last = db.prepare('SELECT created_at FROM otps WHERE mobile = ? ORDER BY id DESC LIMIT 1').get(mobile);
  if (last) {
    const wait = cfg.otpResendCooldownMs - (now - Date.parse(last.created_at));
    if (wait > 0) throw new OtpRateLimited('Please wait before asking for another OTP.', Math.ceil(wait / 1000));
  }
  const hourAgo = new Date(now - 3600_000).toISOString();
  const sent = db.prepare('SELECT COUNT(*) AS c FROM otps WHERE mobile = ? AND created_at > ?').get(mobile, hourAgo).c;
  if (sent >= cfg.otpMaxSendsPerHour) throw new OtpRateLimited('Too many OTP requests. Try again in an hour.', 3600);

  db.prepare('UPDATE otps SET consumed_at = ? WHERE mobile = ? AND purpose = ? AND consumed_at IS NULL')
    .run(nowIso(), mobile, purpose);
  const code = newOtp();
  db.prepare(`INSERT INTO otps (mobile, purpose, link_id, code_hash, created_at, expires_at) VALUES (?,?,?,?,?,?)`)
    .run(mobile, purpose, linkId, codeHash(cfg, mobile, purpose, linkId, code), nowIso(), new Date(now + cfg.otpTtlMs).toISOString());
  return { code };
}

/** @returns {{ok:true}|{ok:false, reason:'none'|'expired'|'locked'|'invalid'}} */
function verify(db, cfg, { mobile, purpose, linkId = null, code }) {
  const row = db.prepare(`SELECT * FROM otps WHERE mobile = ? AND purpose = ? AND consumed_at IS NULL
                          AND COALESCE(link_id, 0) = COALESCE(?, 0) ORDER BY id DESC LIMIT 1`).get(mobile, purpose, linkId);
  if (!row) return { ok: false, reason: 'none' };
  if (Date.parse(row.expires_at) < Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= cfg.otpMaxAttempts) return { ok: false, reason: 'locked' };
  db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(row.id); // count before comparing
  const given = String(code ?? '').replace(/\s+/g, '');
  const good = /^\d{6}$/.test(given) && safeEqual(codeHash(cfg, mobile, purpose, linkId, given), row.code_hash);
  if (!good) return { ok: false, reason: row.attempts + 1 >= cfg.otpMaxAttempts ? 'locked' : 'invalid' };
  db.prepare('UPDATE otps SET consumed_at = ? WHERE id = ?').run(nowIso(), row.id);
  return { ok: true };
}

module.exports = { issue, verify, OtpRateLimited };
