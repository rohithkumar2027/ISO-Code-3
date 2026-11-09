'use strict';
// JSON API for the React patient app. Same services, same security model as
// the server-rendered version it replaces (routes/patient.js, now removed):
// hashed OTPs, hashed link tokens, server-side sessions, DPDP consent gate,
// access log. Only the response shape changed (JSON instead of HTML) and the
// error reporting (stable string codes instead of pre-translated text), so
// the React app owns all wording and the three languages.
const express = require('express');
const multer = require('multer');
const { maskMobile, normalizeMobile, logMobile } = require('../lib/phone');
const { safeEqual, verifyPassword, hashPassword } = require('../lib/crypto');
const { setCookie, clearCookie, sign, unsign } = require('../lib/web');
const sessions = require('../services/sessions');
const otp = require('../services/otp');
const links = require('../services/links');
const broadcastLinks = require('../services/broadcastLinks');
const broadcast = require('../services/broadcast');
const documents = require('../services/documents');
const messaging = require('../services/messaging');
const summaries = require('../services/summaries');
const delivery = require('../services/delivery');
const { logAccess } = require('../services/audit');
const { renderReport } = require('../services/pdf');

const ORDER_ID = /^[A-Z]{2,5}-\d{3,10}$/;
const LANGS = ['en', 'te', 'hi'];
const DUMMY_HASH = hashPassword('not-a-real-password'); // equalises timing when the username does not exist

function apiRoutes(ctx) {
  const { db, cfg, provider, limiter } = ctx;
  const r = express.Router();
  const secure = cfg.baseUrl.startsWith('https');
  const lim = { idleMs: cfg.patientIdleMs, maxMs: cfg.patientMaxMs };
  const staffLim = { idleMs: cfg.staffIdleMs, maxMs: cfg.staffMaxMs };
  const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxPdfBytes, files: 1 } });

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

  // ---- doctor auth: same staff_users table + scrypt passwords + server sessions as
  // the HTML staff console (/staff/login), just a JSON login for the React doctor
  // portal. A doctor and a front-desk/ops login share one session store (cookie
  // "stf"), so signing in on either surface signs you in on both. ---------------------
  function loadDoctorSession(req) {
    const s = sessions.load(db, req.cookies.stf, 'staff', staffLim);
    if (!s) return null;
    const u = db.prepare('SELECT id, username, name, role FROM staff_users WHERE id = ? AND active = 1').get(s.staff_id);
    return u && u.role === 'pathologist' ? { ...s, user: u } : null;
  }
  function requireDoctor(req, res, next) {
    const s = loadDoctorSession(req);
    if (!s) { if (req.cookies.stf) clearCookie(res, 'stf', secure); return fail(res, 401, 'no_session'); }
    req.doctorSession = s;
    next();
  }
  function requireDoctorCsrf(req, res, next) {
    const token = req.get('x-csrf-token');
    if (!token || !safeEqual(token, req.doctorSession.csrf)) return fail(res, 403, 'bad_csrf');
    next();
  }

  r.get('/doctor/session', (req, res) => {
    const s = loadDoctorSession(req);
    if (!s) return res.json({ doctor: null });
    res.json({ doctor: { username: s.user.username, name: s.user.name, role: s.user.role, csrf: s.csrf } });
  });

  r.post('/doctor/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim().slice(0, 60);
    const lkey = `doctorlogin:${req.ip}:${username.toLowerCase()}`; // only failed attempts count
    if (limiter.blocked(lkey, 8)) return fail(res, 429, 'too_many');
    const u = db.prepare("SELECT * FROM staff_users WHERE username = ? AND role = 'pathologist' AND active = 1").get(username);
    const ok = verifyPassword(String(req.body?.password ?? '').slice(0, 200), u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) {
      limiter.hit(lkey, 8, 15 * 60_000);
      logAccess(db, { type: 'anonymous', action: 'doctor_login_failed', detail: username.slice(0, 40), req });
      return fail(res, 401, 'invalid_credentials');
    }
    limiter.reset(lkey);
    sessions.destroy(db, req.cookies.stf);
    const { token } = sessions.create(db, { kind: 'staff', staffId: u.id });
    setCookie(res, 'stf', token, { secure });
    logAccess(db, { type: 'staff', ref: u.username, action: 'doctor_login', req });
    res.json({ ok: true, doctor: { username: u.username, name: u.name, role: u.role } });
  });

  r.post('/doctor/logout', requireDoctor, requireDoctorCsrf, (req, res) => {
    logAccess(db, { type: 'staff', ref: req.doctorSession.user.username, action: 'doctor_logout', req });
    sessions.destroy(db, req.cookies.stf);
    clearCookie(res, 'stf', secure);
    res.json({ ok: true });
  });

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

  // ---- doctor / lab console (all routes below require a signed-in pathologist) ------
  r.get('/doctor/orders', requireDoctor, (req, res) => {
    const orders = db.prepare(`
      SELECT o.id, o.status, o.referring_doctor, o.collected_at, o.signed_at, o.delivered_at, o.imported_at,
             p.id AS patient_id, p.name AS patient_name, p.mobile, p.age, p.sex,
             (SELECT COUNT(*) FROM results r WHERE r.order_id = o.id) AS total_tests,
             (SELECT COUNT(*) FROM results r WHERE r.order_id = o.id AND r.flag IN ('low', 'high')) AS abnormal_count
      FROM orders o
      JOIN patients p ON p.id = o.patient_id
      ORDER BY CASE WHEN o.status = 'processing' THEN 0 WHEN o.status = 'ready_critical' THEN 1 ELSE 2 END,
               COALESCE(o.signed_at, o.collected_at, o.imported_at) DESC
    `).all();
    res.json({ orders });
  });

  r.get('/doctor/orders/:id', requireDoctor, (req, res) => {
    const o = db.prepare(`
      SELECT o.*, p.name AS patient_name, p.mobile, p.age, p.sex
      FROM orders o JOIN patients p ON p.id = o.patient_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!o) return fail(res, 404, 'not_found');

    const raw = db.prepare('SELECT * FROM results WHERE order_id = ? ORDER BY position').all(o.id);
    const sumByLang = Object.fromEntries(LANGS.map((l) => [l, summaries.forOrder(db, o.id, l)]));
    const results = raw.map((r2) => {
      const odd = r2.flag === 'low' || r2.flag === 'high';
      const localNames = Object.fromEntries(LANGS.map((l) => [l, summaries.localName(r2.name, l) ?? r2.name]));
      const texts = {};
      if (odd) {
        for (const l of LANGS) {
          const s = sumByLang[l].get(r2.id);
          texts[l] = s ? { text: s.text, status: s.status, source: s.source, summaryId: s.id } : null;
        }
      }
      return {
        id: r2.id, name: r2.name, localNames, unit: r2.unit, value: r2.value_raw, valueNum: r2.value_num,
        flag: r2.flag, refLow: r2.ref_low, refHigh: r2.ref_high, refRaw: r2.ref_raw,
        summary: odd ? texts : null,
      };
    });

    const messages = db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id DESC').all(o.id);
    const linksList = db.prepare('SELECT * FROM report_links WHERE order_id = ? ORDER BY id DESC').all(o.id);
    const task = db.prepare('SELECT * FROM tasks WHERE order_id = ?').get(o.id) ?? null;

    res.json({
      order: o,
      results,
      messages,
      links: linksList,
      task,
    });
  });

  r.post('/doctor/orders/:id/sign-and-send', requireDoctor, requireDoctorCsrf, async (req, res, next) => {
    try {
      const orderId = req.params.id;
      if (!ORDER_ID.test(orderId)) return fail(res, 404, 'not_found');
      const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!o) return fail(res, 404, 'not_found');

      const now = new Date().toISOString();
      const targetStatus = req.body?.status === 'ready_critical' ? 'ready_critical' : 'ready';
      const doctorRef = { id: req.doctorSession.user.id, username: req.doctorSession.user.username };

      if (o.status === 'processing') {
        db.prepare('UPDATE orders SET status = ?, signed_at = ?, updated_at = ? WHERE id = ?').run(targetStatus, now, now, orderId);
      } else if (targetStatus !== o.status) {
        db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(targetStatus, now, orderId);
      }

      const deliveryResult = o.delivered_at
        ? delivery.resend(ctx, orderId, doctorRef, req)
        : await delivery.deliverOrder(ctx, orderId);

      logAccess(db, {
        type: 'staff', ref: doctorRef.username, action: 'doctor_signed_and_sent', orderId,
        detail: `status=${targetStatus}, channel=${deliveryResult?.attempts?.[0]?.channel || deliveryResult?.channel || 'system'}`, req,
      });

      const updatedOrder = db.prepare(`SELECT o.*, p.name AS patient_name, p.mobile FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = ?`).get(orderId);
      const messages = db.prepare('SELECT * FROM messages WHERE order_id = ? ORDER BY id DESC').all(orderId);
      const latestLink = db.prepare('SELECT id, created_at, expires_at FROM report_links WHERE order_id = ? ORDER BY id DESC LIMIT 1').get(orderId);

      res.json({ ok: true, order: updatedOrder, delivery: deliveryResult, messages, latestLink });
    } catch (err) {
      next(err);
    }
  });

  // ---- doctor: broadcast documents (PDF "templates" the doctor keeps, + custom one-off uploads) --
  r.get('/doctor/documents', requireDoctor, (req, res) => {
    const docs = db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM broadcast_runs r WHERE r.document_id = d.id) AS runs
                             FROM broadcast_documents d ORDER BY d.created_at DESC`).all();
    res.json({ documents: docs });
  });

  r.post('/doctor/documents', requireDoctor, requireDoctorCsrf, (req, res) => {
    pdfUpload.single('file')(req, res, (err) => {
      if (err) return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_failed');
      const name = String(req.body?.name ?? '').trim();
      if (!req.file || !name) return fail(res, 400, 'missing_fields');
      try {
        const saved = documents.save(cfg, {
          buffer: req.file.buffer, originalName: req.file.originalname, name,
          description: req.body?.description ?? '', createdBy: req.doctorSession.user.username,
        });
        const doc = documents.insert(db, cfg, saved);
        logAccess(db, { type: 'staff', ref: req.doctorSession.user.username, action: 'document_uploaded', detail: doc.name, req });
        res.json({ ok: true, document: doc });
      } catch (e) {
        fail(res, 400, e.code ?? 'bad_file');
      }
    });
  });

  r.delete('/doctor/documents/:id', requireDoctor, requireDoctorCsrf, (req, res) => {
    const out = documents.remove(db, cfg, Number(req.params.id));
    if (!out.ok) return fail(res, out.reason === 'not_found' ? 404 : 409, out.reason);
    logAccess(db, { type: 'staff', ref: req.doctorSession.user.username, action: 'document_deleted', detail: req.params.id, req });
    res.json({ ok: true });
  });

  // ---- doctor: broadcast runs (send a document to a list of mobile numbers) -----------------------
  r.get('/doctor/broadcasts', requireDoctor, (req, res) => {
    const runs = db.prepare(`SELECT r.*, d.name AS document_name FROM broadcast_runs r
                             JOIN broadcast_documents d ON d.id = r.document_id ORDER BY r.id DESC LIMIT 100`).all();
    res.json({ runs });
  });

  r.get('/doctor/broadcasts/:id', requireDoctor, (req, res) => {
    const run = db.prepare(`SELECT r.*, d.name AS document_name FROM broadcast_runs r
                            JOIN broadcast_documents d ON d.id = r.document_id WHERE r.id = ?`).get(Number(req.params.id));
    if (!run) return fail(res, 404, 'not_found');
    const recipients = db.prepare('SELECT mobile, send_status, send_channel, send_error, open_count, first_opened_at, expires_at, revoked_at FROM broadcast_links WHERE run_id = ? ORDER BY id').all(run.id)
      .map((l) => ({ ...l, mobile: maskMobile(l.mobile) }));
    res.json({ run, recipients });
  });

  /** Accepts either an existing document_id, or a fresh one-off `file` + `name` to create and send in one step. */
  r.post('/doctor/broadcast', requireDoctor, requireDoctorCsrf, (req, res, next) => {
    pdfUpload.single('file')(req, res, (err) => {
      if (err) return fail(res, 400, err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_failed');
      try {
        let documentId = Number(req.body?.document_id) || null;
        if (!documentId && req.file) {
          const name = String(req.body?.name ?? '').trim() || req.file.originalname.replace(/\.pdf$/i, '');
          const saved = documents.save(cfg, {
            buffer: req.file.buffer, originalName: req.file.originalname, name,
            description: req.body?.description ?? '', createdBy: req.doctorSession.user.username,
          });
          documentId = documents.insert(db, cfg, saved).id;
        }
        if (!documentId) return fail(res, 400, 'missing_document');
        const result = broadcast.runBroadcast(ctx, {
          documentId, title: req.body?.title, recipientsText: req.body?.recipients ?? '',
          createdBy: req.doctorSession.user.username,
        });
        res.json({
          ok: true, run: result.run, document: { id: result.document.id, name: result.document.name },
          invalidSamples: result.invalidSamples,
          recipients: result.recipients.map((r2) => ({ ...r2, mobile: maskMobile(r2.mobile) })),
        });
      } catch (e) {
        if (['not_found', 'no_recipients', 'too_many', 'bad_file'].includes(e.code)) return fail(res, 400, e.code, { message: e.message });
        next(e);
      }
    });
  });

  // ---- public: open a broadcast document link (GET = status only; verify = OTP to the number it was sent to) ---
  function docLinkOr(req, res) {
    const found = broadcastLinks.find(db, req.params.token);
    if (found.state === 'valid') return found;
    logAccess(db, { type: 'anonymous', action: `doc_link_${found.state}`, req });
    res.status(found.state === 'expired' ? 410 : 404).json({ error: found.state });
    return null;
  }

  r.get('/d/:token', (req, res) => {
    const f = docLinkOr(req, res);
    if (!f) return;
    res.json({ maskedMobile: maskMobile(f.link.mobile), documentName: f.document.name, description: f.document.description });
  });

  r.post('/d/:token/send', (req, res) => {
    const f = docLinkOr(req, res);
    if (!f) return;
    if (!limiter.hit(`docsend:${req.ip}`, 20, 10 * 60_000).ok) return fail(res, 429, 'too_many');
    try {
      const { code } = otp.issue(db, cfg, { mobile: f.link.mobile, purpose: 'doc', linkId: f.link.id });
      messaging.sendOtp(ctx, { mobile: f.link.mobile, code });
      logAccess(db, { type: 'anonymous', ref: logMobile(f.link.mobile), action: 'doc_otp_sent', req });
      res.json({ ok: true, maskedMobile: maskMobile(f.link.mobile), demoCode: demoCode(f.link.mobile) });
    } catch (e) {
      if (e instanceof otp.OtpRateLimited) return fail(res, 429, 'wait', { retryAfterSec: e.retryAfterSec });
      throw e;
    }
  });

  r.post('/d/:token/verify', (req, res) => {
    const f = docLinkOr(req, res);
    if (!f) return;
    if (!limiter.hit(`verify:${req.ip}`, 30, 10 * 60_000).ok) return fail(res, 429, 'too_many');
    const v = otp.verify(db, cfg, { mobile: f.link.mobile, purpose: 'doc', linkId: f.link.id, code: req.body?.code });
    if (!v.ok) {
      logAccess(db, { type: 'anonymous', ref: logMobile(f.link.mobile), action: 'otp_failed', detail: `doc:${v.reason}`, req });
      return fail(res, 401, v.reason);
    }
    broadcastLinks.recordOpen(db, f.link.id);
    logAccess(db, { type: 'anonymous', ref: logMobile(f.link.mobile), action: 'doc_otp_verified', req });
    // Short-lived, token-bound cookie: proves "OTP just passed for this exact
    // link", without creating a full patient session for a one-off document.
    setCookie(res, 'dunlock', sign(cfg.appSecret, { tok: req.params.token }, 10 * 60_000), { maxAgeSec: 600, secure });
    res.json({ ok: true });
  });

  r.get('/d/:token/file', (req, res) => {
    const f = docLinkOr(req, res);
    if (!f) return;
    const unlocked = unsign(cfg.appSecret, req.cookies.dunlock);
    if (!unlocked || unlocked.tok !== req.params.token) return fail(res, 401, 'otp_required');
    logAccess(db, { type: 'anonymous', ref: logMobile(f.link.mobile), action: 'doc_downloaded', req });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${f.document.original_name.replace(/["\r\n]/g, '')}"` });
    res.sendFile(documents.filePath(cfg, f.document));
  });

  return r;
}

module.exports = { apiRoutes };
