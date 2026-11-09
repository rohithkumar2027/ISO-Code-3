'use strict';
// JSON API for the React patient app. Same services, same security model as
// the server-rendered version it replaces (routes/patient.js, now removed):
// hashed OTPs, hashed link tokens, server-side sessions, DPDP consent gate,
// access log. Only the response shape changed (JSON instead of HTML) and the
// error reporting (stable string codes instead of pre-translated text), so
// the React app owns all wording and the three languages.
const express = require('express');
const { maskMobile, normalizeMobile, logMobile } = require('../lib/phone');
const { safeEqual } = require('../lib/crypto');
const { setCookie, clearCookie, sign, unsign } = require('../lib/web');
const sessions = require('../services/sessions');
const otp = require('../services/otp');
const links = require('../services/links');
const messaging = require('../services/messaging');
const summaries = require('../services/summaries');
const { logAccess } = require('../services/audit');
const { renderReport } = require('../services/pdf');

const ORDER_ID = /^[A-Z]{2,5}-\d{3,10}$/;
const LANGS = ['en', 'te', 'hi'];

function apiRoutes(ctx) {
  const { db, cfg, provider, limiter } = ctx;
  const r = express.Router();
  const secure = cfg.baseUrl.startsWith('https');
  const lim = { idleMs: cfg.patientIdleMs, maxMs: cfg.patientMaxMs };

  const who = (mobile) => ({ type: 'patient', ref: logMobile(mobile) });
  const knownMobile = (m) => !!db.prepare('SELECT 1 FROM patients WHERE mobile = ? LIMIT 1').get(m);
  const account = (m) => db.prepare('SELECT * FROM accounts WHERE mobile = ?').get(m);
  const hasConsent = (m) => { const a = account(m); return !!(a && a.consent_version === cfg.consentVersion && !a.withdrawn_at); };
  const lang = (req) => (LANGS.includes(req.cookies.lang) ? req.cookies.lang : 'en');
  const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

  function startSession(req, res, mobile) {
    sessions.destroy(db, req.cookies.sid);
    const { token } = sessions.create(db, { kind: 'patient', mobile });
    setCookie(res, 'sid', token, { secure });
  }

  function loadSession(req) {
    return sessions.load(db, req.cookies.sid, 'patient', lim);
  }

  /** Every mutating call must echo the csrf token the session endpoint handed out. */
  function requireSession(req, res, next) {
    const s = loadSession(req);
    if (!s) { if (req.cookies.sid) clearCookie(res, 'sid', secure); return fail(res, 401, 'no_session'); }
    req.session = s;
    next();
  }
  function requireCsrf(req, res, next) {
    const token = req.get('x-csrf-token');
    if (!token || !safeEqual(token, req.session.csrf)) return fail(res, 403, 'bad_csrf');
    next();
  }

  function ownedOrder(mobile, id) {
    if (!ORDER_ID.test(id)) return null;
    return db.prepare(`SELECT o.*, p.name AS patient_name, p.age, p.sex, p.mobile FROM orders o JOIN patients p ON p.id = o.patient_id
                       WHERE o.id = ? AND p.mobile = ?`).get(id, mobile) ?? null;
  }

  function sendCode(req, mobile, purpose, linkId) {
    if (cfg.otpResendCooldownMs > 0) {
      const a = limiter.hit(`cool:${mobile}`, 1, cfg.otpResendCooldownMs);
      if (!a.ok) return { error: 'wait', retryAfterSec: a.retryAfterSec };
    }
    const b = limiter.hit(`hour:${mobile}`, cfg.otpMaxSendsPerHour, 3600_000);
    if (!b.ok) return { error: 'too_many' };
    if (!knownMobile(mobile)) return { ok: true }; // same shape for unknown numbers: no account enumeration
    try {
      const { code } = otp.issue(db, cfg, { mobile, purpose, linkId });
      messaging.sendOtp(ctx, { mobile, code });
      logAccess(db, { ...who(mobile), action: 'otp_sent', detail: purpose, req });
      return { ok: true };
    } catch (e) {
      if (e instanceof otp.OtpRateLimited) return { error: 'wait', retryAfterSec: e.retryAfterSec };
      throw e;
    }
  }
  const demoCode = (mobile) => (cfg.demo ? provider.lastOtp(mobile) : null);

  // ---- session probe: what the app shows on load / after a refresh -------------------
  r.get('/session', (req, res) => {
    const s = loadSession(req);
    if (!s) return res.json({ patient: null });
    res.json({ patient: { maskedMobile: maskMobile(s.mobile), csrf: s.csrf, consent: hasConsent(s.mobile) } });
  });

  r.post('/lang', (req, res) => {
    if (!LANGS.includes(req.body?.lang)) return fail(res, 400, 'bad_lang');
    setCookie(res, 'lang', req.body.lang, { maxAgeSec: 31536000, secure });
    const s = loadSession(req);
    if (s && account(s.mobile)) db.prepare('UPDATE accounts SET lang = ? WHERE mobile = ?').run(req.body.lang, s.mobile);
    res.json({ ok: true });
  });

  // ---- login by mobile + OTP ------------------------------------------------------------
  r.post('/login', (req, res) => {
    const ip = limiter.hit(`login:${req.ip}`, 20, 10 * 60_000);
    if (!ip.ok) return fail(res, 429, 'too_many');
    const mobile = normalizeMobile(req.body?.mobile);
    if (!mobile) return fail(res, 400, 'mobile_invalid');
    const sent = sendCode(req, mobile, 'login', null);
    if (sent.error) return fail(res, 429, sent.error, { retryAfterSec: sent.retryAfterSec });
    setCookie(res, 'pl', sign(cfg.appSecret, { m: mobile }, 10 * 60_000), { maxAgeSec: 600, secure });
    res.json({ ok: true, maskedMobile: maskMobile(mobile), demoCode: demoCode(mobile) });
  });

  r.post('/login/resend', (req, res) => {
    const p = unsign(cfg.appSecret, req.cookies.pl);
    if (!p) return fail(res, 400, 'expired');
    const sent = sendCode(req, p.m, 'login', null);
    if (sent.error) return fail(res, 429, sent.error, { retryAfterSec: sent.retryAfterSec });
    res.json({ ok: true, demoCode: demoCode(p.m) });
  });

  r.post('/login/verify', (req, res) => {
    const p = unsign(cfg.appSecret, req.cookies.pl);
    if (!p) return fail(res, 400, 'expired');
    if (!limiter.hit(`verify:${req.ip}`, 30, 10 * 60_000).ok) return fail(res, 429, 'too_many');
    const v = otp.verify(db, cfg, { mobile: p.m, purpose: 'login', code: req.body?.code });
    if (!v.ok) {
      logAccess(db, { ...who(p.m), action: 'otp_failed', detail: v.reason, req });
      return fail(res, 401, v.reason); // 'invalid' | 'locked' | 'expired' | 'none'
    }
    clearCookie(res, 'pl', secure);
    startSession(req, res, p.m);
    logAccess(db, { ...who(p.m), action: 'login', req });
    res.json({ ok: true, consent: hasConsent(p.m) });
  });

  // ---- report link: GET = status only, never reveals data; verify = OTP to the number on file ----
  function linkOr(req, res) {
    const found = links.find(db, req.params.token);
    if (found.state === 'valid') return found;
    logAccess(db, { type: 'anonymous', action: `link_${found.state}`, orderId: found.order?.id ?? null, req });
    res.status(found.state === 'expired' ? 410 : 404).json({ error: found.state }); // 'expired' | 'revoked' | 'unknown'
    return null;
  }

  r.get('/links/:token', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    logAccess(db, { ...who(f.mobile), action: 'link_opened', orderId: f.order.id, req });
    res.json({ maskedMobile: maskMobile(f.mobile) });
  });

  r.post('/links/:token/send', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    if (!limiter.hit(`linksend:${req.ip}`, 20, 10 * 60_000).ok) return fail(res, 429, 'too_many');
    const sent = sendCode(req, f.mobile, 'link', f.link.id);
    if (sent.error) return fail(res, 429, sent.error, { retryAfterSec: sent.retryAfterSec });
    res.json({ ok: true, maskedMobile: maskMobile(f.mobile), demoCode: demoCode(f.mobile) });
  });

  r.post('/links/:token/verify', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    if (!limiter.hit(`verify:${req.ip}`, 30, 10 * 60_000).ok) return fail(res, 429, 'too_many');
    const v = otp.verify(db, cfg, { mobile: f.mobile, purpose: 'link', linkId: f.link.id, code: req.body?.code });
    if (!v.ok) {
      logAccess(db, { ...who(f.mobile), action: 'otp_failed', orderId: f.order.id, detail: `link:${v.reason}`, req });
      return fail(res, 401, v.reason);
    }
    links.recordOpen(db, f.link.id);
    startSession(req, res, f.mobile);
    logAccess(db, { ...who(f.mobile), action: 'link_otp_verified', orderId: f.order.id, req });
    res.json({ ok: true, consent: hasConsent(f.mobile), orderId: f.order.id });
  });

  // ---- consent (DPDP) --------------------------------------------------------------------
  r.post('/consent', requireSession, requireCsrf, (req, res) => {
    const mobile = req.session.mobile;
    if (req.body?.decision !== 'agree') {
      logAccess(db, { ...who(mobile), action: 'consent_declined', req });
      sessions.destroy(db, req.cookies.sid);
      clearCookie(res, 'sid', secure);
      return res.json({ ok: true, loggedOut: true });
    }
    db.prepare(`INSERT INTO accounts (mobile, lang, consent_version, consented_at, withdrawn_at) VALUES (?,?,?,?,NULL)
                ON CONFLICT (mobile) DO UPDATE SET consent_version = excluded.consent_version, consented_at = excluded.consented_at,
                withdrawn_at = NULL, lang = COALESCE(accounts.lang, excluded.lang)`)
      .run(mobile, lang(req), cfg.consentVersion, new Date().toISOString());
    logAccess(db, { ...who(mobile), action: 'consent_given', detail: cfg.consentVersion, req });
    res.json({ ok: true });
  });

  r.post('/logout', requireSession, requireCsrf, (req, res) => {
    logAccess(db, { ...who(req.session.mobile), action: 'logout', req });
    sessions.destroy(db, req.cookies.sid);
    clearCookie(res, 'sid', secure);
    res.json({ ok: true });
  });

  // ---- reports ----------------------------------------------------------------------------
  r.get('/reports', requireSession, (req, res) => {
    if (!hasConsent(req.session.mobile)) return fail(res, 403, 'consent_required');
    const mobile = req.session.mobile;
    const people = db.prepare('SELECT id, name FROM patients WHERE mobile = ? ORDER BY name').all(mobile).map((p) => ({
      name: p.name,
      orders: db.prepare(`SELECT id, status, referring_doctor, signed_at FROM orders WHERE patient_id = ?
                          ORDER BY COALESCE(signed_at, collected_at, imported_at) DESC`).all(p.id),
    }));
    res.json({ people });
  });

  r.get('/reports/:id', requireSession, (req, res) => {
    if (!hasConsent(req.session.mobile)) return fail(res, 403, 'consent_required');
    const o = ownedOrder(req.session.mobile, req.params.id);
    if (!o) return fail(res, 404, 'not_found');
    if (o.status === 'processing') return res.json({ status: 'processing', id: o.id });
    const raw = db.prepare('SELECT * FROM results WHERE order_id = ? ORDER BY position').all(o.id);
    const sumByLang = Object.fromEntries(LANGS.map((l) => [l, summaries.forOrder(db, o.id, l)]));
    const results = raw.map((r2) => {
      const odd = r2.flag === 'low' || r2.flag === 'high';
      const localNames = Object.fromEntries(LANGS.map((l) => [l, summaries.localName(r2.name, l) ?? r2.name]));
      const texts = {};
      if (odd && o.status !== 'ready_critical') {
        for (const l of LANGS) {
          const s = sumByLang[l].get(r2.id);
          texts[l] = s ? { text: s.text, status: s.status, source: s.source, summaryId: s.id } : null;
        }
      }
      return {
        id: r2.id, name: r2.name, localNames, unit: r2.unit, value: r2.value_raw, valueNum: r2.value_num,
        flag: r2.flag, refLow: r2.ref_low, refHigh: r2.ref_high, refRaw: r2.ref_raw,
        summary: odd && o.status !== 'ready_critical' ? texts : null,
      };
    });
    logAccess(db, { ...who(req.session.mobile), action: 'report_viewed', orderId: o.id, detail: lang(req), req });
    res.json({
      status: o.status, id: o.id, patientName: o.patient_name, referringDoctor: o.referring_doctor,
      signedAt: o.signed_at, results,
    });
  });

  r.get('/reports/:id/pdf', requireSession, (req, res) => {
    const o = ownedOrder(req.session.mobile, req.params.id);
    if (!o || o.status === 'processing') return fail(res, 404, 'not_found');
    const results = db.prepare('SELECT * FROM results WHERE order_id = ? ORDER BY position').all(o.id);
    logAccess(db, { ...who(req.session.mobile), action: 'pdf_downloaded', orderId: o.id, req });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="report-${o.id}.pdf"` });
    renderReport(res, { cfg, order: o, patient: { name: o.patient_name, age: o.age, sex: o.sex }, results });
  });

  r.post('/reports/:id/flag/:rid', requireSession, requireCsrf, (req, res) => {
    const o = ownedOrder(req.session.mobile, req.params.id);
    const rid = Number(req.params.rid);
    if (!o || !Number.isInteger(rid)) return fail(res, 404, 'not_found');
    const s = db.prepare('SELECT id FROM summaries WHERE order_id = ? AND result_id = ?').all(o.id, rid);
    for (const row of s) summaries.flag(db, row.id, req.session.mobile);
    if (s.length) logAccess(db, { ...who(req.session.mobile), action: 'summary_flagged', orderId: o.id, detail: `result ${rid}`, req });
    res.json({ ok: true });
  });

  return r;
}

module.exports = { apiRoutes };
