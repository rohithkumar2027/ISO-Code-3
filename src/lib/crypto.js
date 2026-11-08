'use strict';
const crypto = require('node:crypto');

/** 256-bit URL-safe random token. */
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** SHA-256 hex. Used for storing high-entropy tokens (links, session ids). */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Keyed hash for low-entropy secrets such as 6-digit OTPs. */
const hmac = (secret, ...parts) =>
  crypto.createHmac('sha256', secret).update(parts.join('\u0000')).digest('hex');

/** Constant-time string comparison. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Uniformly random 6-digit code. */
const newOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return safeEqual(key.toString('hex'), keyHex);
}

module.exports = { newToken, sha256, hmac, safeEqual, newOtp, hashPassword, verifyPassword };
