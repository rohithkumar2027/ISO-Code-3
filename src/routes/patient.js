'use strict';
const express = require('express');
const { t } = require('../i18n');
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
const { errorPage } = require('../views/layout');
const V = require('../views/patient');

const ORDER_ID = /^[A-Z]{2,5}-\d{3,10}$/;

function patientRoutes(ctx) {
  const { db, cfg, provider, limiter } = ctx;
  const r = express.Router();
  const secure = cfg.baseUrl.startsWith('https');
  const lim = { idleMs: cfg.patientIdleMs, maxMs: cfg.patientMaxMs };

  // ---- helpers ------------------------------------------------------------
  const who = (mobile) => ({ type: 'patient', ref: logMobile(mobile) });
  const knownMobile = (m) => !!db.prepare('SELECT 1 FROM patients WHERE mobile = ? LIMIT 1').get(m);
  const account = (m) => db.prepare('SELECT * FROM accounts WHERE mobile = ?').get(m);
  const hasConsent = (m) => { const a = account(m); return !!(a && a.consent_version === cfg.consentVersion && !a.withdrawn_at); };

  function startSession(req, res, mobile) {
    sessions.destroy(db, req.cookies.sid);
    const { token } = sessions.create(db, { kind: 'patient', mobile });
    setCookie(res, 'sid', token, { secure });
    const a = account(mobile);
    if (a && !req.cookies.lang) { setCookie(res, 'lang', a.lang, { maxAgeSec: 31536000, secure }); req.lang = a.lang; }
  }

  function loadSession(req) {
    const s = sessions.load(db, req.cookies.sid, 'patient', lim);
    req.session = s;
    return s;
  }

  function requirePatient({ consent = true } = {}) {
    return (req, res, next) => {
      const s = loadSession(req);
      if (!s) {
        if (req.cookies.sid) clearCookie(res, 'sid', secure);
        return res.redirect(req.cookies.sid ? '/login?expired=1' : '/login');
      }
      if (consent && !hasConsent(s.mobile)) return res.redirect('/consent');
      if (req.query.lang && account(s.mobile)) db.prepare('UPDATE accounts SET lang = ? WHERE mobile = ?').run(req.lang, s.mobile);
      next();
    };
  }

  function csrfOk(req) {
    return !!req.session && typeof req.body?._csrf === 'string' && safeEqual(req.body._csrf, req.session.csrf);
  }

  function ownedOrder(mobile, id) {
    if (!ORDER_ID.test(id)) return null;
    return db.prepare(`SELECT o.*, p.name AS patient_name, p.age, p.sex, p.mobile FROM orders o JOIN patients p ON p.id = o.patient_id
                       WHERE o.id = ? AND p.mobile = ?`).get(id, mobile) ?? null; // not yours = not found
  }

  function sendCode(req, mobile, purpose, linkId) {
    // Same observable behaviour for known and unknown numbers (no account enumeration).
    if (cfg.otpResendCooldownMs > 0) {
      const a = limiter.hit(`cool:${mobile}`, 1, cfg.otpResendCooldownMs);
      if (!a.ok) return { error: 'wait', n: a.retryAfterSec };
    }
    const b = limiter.hit(`hour:${mobile}`, cfg.otpMaxSendsPerHour, 3600_000);
    if (!b.ok) return { error: 'too_many' };
    if (!knownMobile(mobile)) return { ok: true };
    try {
      const { code } = otp.issue(db, cfg, { mobile, purpose, linkId });
      messaging.sendOtp(ctx, { mobile, code });
      logAccess(db, { ...who(mobile), action: 'otp_sent', detail: purpose, req });
      return { ok: true };
    } catch (e) {
      if (e instanceof otp.OtpRateLimited) return { error: 'wait', n: e.retryAfterSec };
      throw e;
    }
  }

  const errText = (lang, e) => (e.error === 'wait' ? t(lang, 'wait', { n: e.n }) : t(lang, 'too_many'));
  const demoCode = (mobile) => (cfg.demo ? provider.lastOtp(mobile) : null);
  const failText = (lang, reason) => t(lang, reason === 'locked' ? 'code_locked' : 'code_wrong');

  // ---- login by mobile + OTP -------------------------------------------------
  r.get('/', (req, res) => res.redirect('/reports'));

  r.get('/login', (req, res) => {
    if (loadSession(req)) return res.redirect('/reports');
    res.send(String(V.loginPage({ lang: req.lang, error: req.query.expired ? t(req.lang, 'session_ended') : null })));
  });

  r.post('/login', (req, res) => {
    const ip = limiter.hit(`login:${req.ip}`, 20, 10 * 60_000);
    if (!ip.ok) return res.status(429).send(String(V.loginPage({ lang: req.lang, error: t(req.lang, 'too_many') })));
    const mobile = normalizeMobile(req.body.mobile);
    if (!mobile) return res.status(400).send(String(V.loginPage({ lang: req.lang, error: t(req.lang, 'mobile_invalid'), mobile: String(req.body.mobile ?? '').slice(0, 16) })));
    const sent = sendCode(req, mobile, 'login', null);
    if (sent.error) return res.status(429).send(String(V.loginPage({ lang: req.lang, error: errText(req.lang, sent), mobile })));
    setCookie(res, 'pl', sign(cfg.appSecret, { m: mobile }, 10 * 60_000), { maxAgeSec: 600, secure });
    res.redirect('/login/verify');
  });

  const pre = (req) => unsign(cfg.appSecret, req.cookies.pl);

  r.get('/login/verify', (req, res) => {
    const p = pre(req);
    if (!p) return res.redirect('/login');
    res.send(String(V.verifyPage({
      lang: req.lang, action: '/login/verify', path: '/login/verify', resendAction: '/login/resend',
      maskedMobile: maskMobile(p.m), demoCode: demoCode(p.m),
    })));
  });

  r.post('/login/resend', (req, res) => {
    const p = pre(req);
    if (!p) return res.redirect('/login');
    const sent = sendCode(req, p.m, 'login', null);
    res.send(String(V.verifyPage({
      lang: req.lang, action: '/login/verify', path: '/login/verify', resendAction: '/login/resend',
      maskedMobile: maskMobile(p.m), error: sent.error ? errText(req.lang, sent) : null, demoCode: demoCode(p.m),
    })));
  });

  r.post('/login/verify', (req, res) => {
    const p = pre(req);
    if (!p) return res.redirect('/login');
    const page = (error, status = 401) => res.status(status).send(String(V.verifyPage({
      lang: req.lang, action: '/login/verify', path: '/login/verify', resendAction: '/login/resend',
      maskedMobile: maskMobile(p.m), error, demoCode: demoCode(p.m),
    })));
    if (!limiter.hit(`verify:${req.ip}`, 30, 10 * 60_000).ok) return page(t(req.lang, 'too_many'), 429);
    const v = otp.verify(db, cfg, { mobile: p.m, purpose: 'login', code: req.body.code });
    if (!v.ok) {
      logAccess(db, { ...who(p.m), action: 'otp_failed', detail: v.reason, req });
      return page(failText(req.lang, v.reason));
    }
    clearCookie(res, 'pl', secure);
    startSession(req, res, p.m);
    logAccess(db, { ...who(p.m), action: 'login', req });
    res.redirect(hasConsent(p.m) ? '/reports' : '/consent');
  });

  // ---- report link: always ends in an OTP check ------------------------------------
  function linkOr(req, res) {
    const found = links.find(db, req.params.token);
    if (found.state === 'valid') return found;
    const key = found.state === 'expired' ? 'link_expired' : 'link_invalid';
    logAccess(db, { type: 'anonymous', action: `link_${found.state}`, orderId: found.order?.id ?? null, req });
    res.status(found.state === 'expired' ? 410 : 404);
    res.set('X-Robots-Tag', 'noindex');
    res.send(String(errorPage(req.lang, `${key}_title`, `${key}_body`, '/login')));
    return null;
  }

  r.get('/r/:token', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    logAccess(db, { ...who(f.mobile), action: 'link_opened', orderId: f.order.id, req });
    res.send(String(V.linkLandingPage({ lang: req.lang, token: req.params.token, maskedMobile: maskMobile(f.mobile) })));
  });

  r.post('/r/:token/send', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    if (!limiter.hit(`linksend:${req.ip}`, 20, 10 * 60_000).ok) return res.status(429).send(String(V.linkLandingPage({ lang: req.lang, token: req.params.token, maskedMobile: maskMobile(f.mobile), error: t(req.lang, 'too_many') })));
    const sent = sendCode(req, f.mobile, 'link', f.link.id);
    if (sent.error) return res.status(429).send(String(V.linkLandingPage({ lang: req.lang, token: req.params.token, maskedMobile: maskMobile(f.mobile), error: errText(req.lang, sent) })));
    res.redirect(`/r/${req.params.token}/verify`);
  });

  const linkVerifyView = (req, f, error) => V.verifyPage({
    lang: req.lang, action: `/r/${req.params.token}/verify`, path: `/r/${req.params.token}/verify`,
    resendAction: `/r/${req.params.token}/send`, maskedMobile: maskMobile(f.mobile), error, demoCode: demoCode(f.mobile),
  });

  r.get('/r/:token/verify', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    res.send(String(linkVerifyView(req, f, null)));
  });

  r.post('/r/:token/verify', (req, res) => {
    const f = linkOr(req, res);
    if (!f) return;
    const fail = (msg, status = 401) => res.status(status).send(String(linkVerifyView(req, f, msg)));
    if (!limiter.hit(`verify:${req.ip}`, 30, 10 * 60_000).ok) return fail(t(req.lang, 'too_many'), 429);
    const v = otp.verify(db, cfg, { mobile: f.mobile, purpose: 'link', linkId: f.link.id, code: req.body.code });
    if (!v.ok) {
      logAccess(db, { ...who(f.mobile), action: 'otp_failed', orderId: f.order.id, detail: `link:${v.reason}`, req });
      return fail(failText(req.lang, v.reason));
    }
    links.recordOpen(db, f.link.id);
    startSession(req, res, f.mobile);
    logAccess(db, { ...who(f.mobile), action: 'link_otp_verified', orderId: f.order.id, req });
    res.redirect(hasConsent(f.mobile) ? `/reports/${f.order.id}` : `/consent?next=${f.order.id}`);
  });

  // ---- consent (DPDP) ----------------------------------------------------------------
  r.get('/consent', requirePatient({ consent: false }), (req, res) => {
    if (hasConsent(req.session.mobile)) return res.redirect('/reports');
    const next = ORDER_ID.test(String(req.query.next ?? '')) ? req.query.next : '';
    res.send(String(V.consentPage({ lang: req.lang, csrf: req.session.csrf, next })));
  });

  r.post('/consent', requirePatient({ consent: false }), (req, res) => {
    if (!csrfOk(req)) return res.status(403).send(String(errorPage(req.lang, 'err_title', 'err_body')));
    const mobile = req.session.mobile;
    if (req.body.decision !== 'agree') {
      logAccess(db, { ...who(mobile), action: 'consent_declined', req });
      sessions.destroy(db, req.cookies.sid);
      clearCookie(res, 'sid', secure);
      return res.redirect('/login');
    }
    db.prepare(`INSERT INTO accounts (mobile, lang, consent_version, consented_at, withdrawn_at) VALUES (?,?,?,?,NULL)
                ON CONFLICT (mobile) DO UPDATE SET consent_version = excluded.consent_version, consented_at = excluded.consented_at,
                withdrawn_at = NULL, lang = excluded.lang`)
      .run(mobile, req.lang, cfg.consentVersion, new Date().toISOString());
    logAccess(db, { ...who(mobile), action: 'consent_given', detail: cfg.consentVersion, req });
    const next = ORDER_ID.test(String(req.body.next ?? '')) ? `/reports/${req.body.next}` : '/reports';
    res.redirect(next);
  });

  r.post('/logout', requirePatient({ consent: false }), (req, res) => {
    if (!csrfOk(req)) return res.status(403).send(String(errorPage(req.lang, 'err_title', 'err_body')));
    logAccess(db, { ...who(req.session.mobile), action: 'logout', req });
    sessions.destroy(db, req.cookies.sid);
    clearCookie(res, 'sid', secure);
    res.redirect('/login');
  });

  // ---- reports ---------------------------------------------------------------------------
  r.get('/reports', requirePatient(), (req, res) => {
    const mobile = req.session.mobile;
    const people = db.prepare('SELECT id, name FROM patients WHERE mobile = ? ORDER BY name').all(mobile).map((p) => ({
      name: p.name,
      orders: db.prepare(`SELECT id, status, referring_doctor, signed_at FROM orders WHERE patient_id = ?
                          ORDER BY COALESCE(signed_at, collected_at, imported_at) DESC`).all(p.id),
    }));
    res.send(String(V.reportsPage({ lang: req.lang, csrf: req.session.csrf, people })));
  });

  r.get('/reports/:id', requirePatient(), (req, res) => {
    const o = ownedOrder(req.session.mobile, req.params.id);
    if (!o) return res.status(404).send(String(errorPage(req.lang, 'nf_title', 'nf_body')));
    if (o.status === 'processing') return res.send(String(V.notReadyPage({ lang: req.lang, csrf: req.session.csrf, order: o })));
    const results = db.prepare('SELECT * FROM results WHERE order_id = ? ORDER BY position').all(o.id);
    logAccess(db, { ...who(req.session.mobile), action: 'report_viewed', orderId: o.id, detail: req.lang, req });
    res.send(String(V.reportPage({
      lang: req.lang, csrf: req.session.csrf, order: o, patient: { name: o.patient_name }, results,
      sums: summaries.forOrder(db, o.id, req.lang),
      notice: req.query.flagged ? t(req.lang, 'flag_thanks') : null,
    })));
  });

  r.get('/reports/:id/pdf', requirePatient(), (req, res) => {
    const o = ownedOrder(req.session.mobile, req.params.id);
    if (!o || o.status === 'processing') return res.status(404).send(String(errorPage(req.lang, 'nf_title', 'nf_body')));
    const results = db.prepare('SELECT * FROM results WHERE order_id = ? ORDER BY position').all(o.id);
    logAccess(db, { ...who(req.session.mobile), action: 'pdf_downloaded', orderId: o.id, req });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="report-${o.id}.pdf"` });
    renderReport(res, { cfg, order: o, patient: { name: o.patient_name, age: o.age, sex: o.sex }, results });
  });

  r.post('/reports/:id/flag/:rid', requirePatient(), (req, res) => {
    if (!csrfOk(req)) return res.status(403).send(String(errorPage(req.lang, 'err_title', 'err_body')));
    const o = ownedOrder(req.session.mobile, req.params.id);
    const rid = Number(req.params.rid);
    if (!o || !Number.isInteger(rid)) return res.status(404).send(String(errorPage(req.lang, 'nf_title', 'nf_body')));
    const s = db.prepare('SELECT id FROM summaries WHERE order_id = ? AND result_id = ? ORDER BY (lang = ?) DESC LIMIT 1').get(o.id, rid, req.lang);
    if (s) {
      summaries.flag(db, s.id, req.session.mobile);
      logAccess(db, { ...who(req.session.mobile), action: 'summary_flagged', orderId: o.id, detail: `result ${rid}`, req });
    }
    res.redirect(`/reports/${o.id}?flagged=1`);
  });

  return r;
}

module.exports = { patientRoutes };
