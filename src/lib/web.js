'use strict';
const crypto = require('node:crypto');
const { hmac, safeEqual } = require('./crypto');

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { /* ignore bad escape */ }
  }
  return out;
}

function setCookie(res, name, value, { maxAgeSec = null, secure = false } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAgeSec !== null) c += `; Max-Age=${maxAgeSec}`;
  if (secure) c += '; Secure';
  res.append('Set-Cookie', c);
}

const clearCookie = (res, name, secure = false) => setCookie(res, name, '', { maxAgeSec: 0, secure });

/** Tamper-proof short-lived value for cookies: base64url(json).hmac */
function sign(secret, payload, ttlMs) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
  return `${body}.${hmac(secret, 'cookie', body)}`;
}

function unsign(secret, value) {
  if (typeof value !== 'string') return null;
  const [body, mac] = value.split('.');
  if (!body || !mac || !safeEqual(hmac(secret, 'cookie', body), mac)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}

/** Small in-memory fixed-window limiter (per process). */
class RateLimiter {
  constructor() { this.hits = new Map(); }
  hit(key, max, windowMs) {
    const now = Date.now();
    const e = this.hits.get(key);
    if (!e || now > e.reset) {
      this.hits.set(key, { n: 1, reset: now + windowMs });
      if (this.hits.size > 5000) this.sweep(now);
      return { ok: true };
    }
    e.n++;
    return e.n > max ? { ok: false, retryAfterSec: Math.ceil((e.reset - now) / 1000) } : { ok: true };
  }
  sweep(now) { for (const [k, v] of this.hits) if (now > v.reset) this.hits.delete(k); }
}

const istFormat = (iso, opts = {}) =>
  iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', ...opts }) : '';
const istDate = (iso) => istFormat(iso);
const istDateTime = (iso) => istFormat(iso, { hour: 'numeric', minute: '2-digit', hour12: true });

const randomId = () => crypto.randomBytes(6).toString('hex');

module.exports = { parseCookies, setCookie, clearCookie, sign, unsign, RateLimiter, istDate, istDateTime, randomId };
