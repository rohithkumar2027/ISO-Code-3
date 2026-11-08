'use strict';
const express = require('express');
const multer = require('multer');
const { setCookie, clearCookie } = require('../lib/web');
const { verifyPassword, hashPassword, safeEqual } = require('../lib/crypto');
const sessions = require('../services/sessions');
const delivery = require('../services/delivery');
const messaging = require('../services/messaging');
const summaries = require('../services/summaries');
const { importCsv } = require('../services/importer');
const { scanFolder } = require('../services/ingest');
const { deliveryReport } = require('../services/metrics');
const { dropSignoffBatch } = require('../services/demo');
const { logAccess } = require('../services/audit');
const { html } = require('../lib/html');
const V = require('../views/staff');

const ORDER_ID = /^[A-Z]{2,5}-\d{3,10}$/;
const DUMMY_HASH = hashPassword('not-a-real-password'); // equalises timing when the user does not exist
const like = (s) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function staffRoutes(ctx) {
  const { db, cfg, limiter } = ctx;
  const r = express.Router();
  const secure = cfg.baseUrl.startsWith('https');
  const lim = { idleMs: cfg.staffIdleMs, maxMs: cfg.staffMaxMs };
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: cfg.maxCsvBytes, files: 1, fields: 5 } });

  const isCsrfOk = (req) => typeof req.body?._csrf === 'string' && safeEqual(req.body._csrf, req.staffSession.csrf);

  function auth(...roles) {
    return (req, res, next) => {
      const s = sessions.load(db, req.cookies.stf, 'staff', lim);
      const user = s && db.prepare('SELECT id, username, name, role FROM staff_users WHERE id = ? AND active = 1').get(s.staff_id);
      if (!user) { if (req.cookies.stf) clearCookie(res, 'stf', secure); return res.redirect('/staff/login'); }
      if (roles.length && !roles.includes(user.role)) {
        return res.status(403).send(String(V.staffPage({ title: 'Not allowed', user, here: '', token: s.csrf,
          body: html`<div class="empty"><strong>Your role cannot open this page</strong><a href="/staff">Back</a></div>` })));
      }
      req.staffSession = s; req.staff = user;
      next();
    };
  }
  // Mutations also need the CSRF token from the form.
  const post = (...roles) => [auth(...roles), (req, res, next) => (isCsrfOk(req) ? next() : res.status(403).send('Invalid form token. Go back and try again.'))];
  const actor = (req) => ({ type: 'staff', ref: req.staff.username });
  const home = { frontdesk: '/staff', ops: '/staff/report', pathologist: '/staff/review' };

  // ---- sign in -------------------------------------------------------------------
  r.get('/staff/login', (req, res) => res.send(String(V.loginPage({ error: null }))));

  r.post('/staff/login', (req, res) => {
    const username = String(req.body.username ?? '').trim().slice(0, 60);
    const bad = (msg, code = 401) => res.status(code).send(String(V.loginPage({ error: msg })));
    const lkey = `stafflogin:${req.ip}:${username.toLowerCase()}`; // only FAILED attempts count
    if (limiter.blocked(lkey, 8)) return bad('Too many attempts. Wait 15 minutes.', 429);
    const u = db.prepare('SELECT * FROM staff_users WHERE username = ? AND active = 1').get(username);
    const ok = verifyPassword(String(req.body.password ?? '').slice(0, 200), u ? u.password_hash : DUMMY_HASH);
    if (!u || !ok) {
      limiter.hit(lkey, 8, 15 * 60_000);
      logAccess(db, { type: 'anonymous', action: 'staff_login_failed', detail: username.slice(0, 40), req });
      return bad('Wrong username or password.');
    }
    limiter.reset(lkey);
    sessions.destroy(db, req.cookies.stf);
    const { token } = sessions.create(db, { kind: 'staff', staffId: u.id });
    setCookie(res, 'stf', token, { secure });
    logAccess(db, { type: 'staff', ref: u.username, action: 'staff_login', req });
    res.redirect(home[u.role] ?? '/staff');
  });

  r.post('/staff/logout', auth(), (req, res) => {
    if (!isCsrfOk(req)) return res.status(403).send('Invalid form token.');
    logAccess(db, { ...actor(req), action: 'staff_logout', req });
    sessions.destroy(db, req.cookies.stf);
    clearCookie(res, 'stf', secure);
    res.redirect('/staff/login');
  });

  // ---- find a patient -----------------------------------------------------------------
  r.get('/staff', auth(), (req, res) => {
    if (req.staff.role !== 'frontdesk') return res.redirect(home[req.staff.role]);
    const q = String(req.query.q ?? '').trim().slice(0, 60);
    const tooShort = q.length > 0 && q.length < 3;
    let hits = [];
    if (q.length >= 3) {
      const digits = q.replace(/\D/g, '');
      const params = [like(q), like(q.toUpperCase())];
      let mobileClause = '';
      if (digits.length >= 4) { mobileClause = " OR p.mobile LIKE ? ESCAPE '\\'"; params.push(like(digits)); }
      hits = db.prepare(`SELECT p.id, p.name, p.mobile, COUNT(o.id) AS orders FROM patients p LEFT JOIN orders o ON o.patient_id = p.id
                         WHERE p.name LIKE ? ESCAPE '\\' OR o.id LIKE ? ESCAPE '\\'${mobileClause}
                         GROUP BY p.id ORDER BY p.name LIMIT 25`).all(...params);
      logAccess(db, { ...actor(req), action: 'staff_search', detail: `${hits.length} result(s)`, req });
      if (hits.length === 1 && /^ORD-/i.test(q)) return res.redirect(`/staff/patients/${hits[0].id}`);
    }
    const attention = db.prepare(`SELECT o.id AS order_id, p.id AS patient_id, p.name FROM orders o JOIN patients p ON p.id = o.patient_id
                                  WHERE o.status != 'processing' AND o.delivered_at IS NOT NULL ORDER BY o.signed_at DESC LIMIT 200`).all()
      .map((o) => ({ ...o, d: messaging.deliveryStatus(db, o.order_id) })).filter((o) => o.d.state === 'failed' || o.d.state === 'none')
      .map((o) => ({ ...o, problem: o.d.state === 'none' ? 'Link was never sent' : `Could not deliver: ${o.d.error ?? 'unknown reason'}` }));
    const stats = {
      signedToday: db.prepare("SELECT COUNT(*) c FROM orders WHERE status != 'processing' AND signed_at >= ?").get(new Date(Date.now() - 86400_000).toISOString()).c,
      failed: attention.length,
      callbacks: db.prepare("SELECT COUNT(*) c FROM tasks WHERE status='open'").get().c,
    };
    res.send(String(V.searchPage({ user: req.staff, token: req.staffSession.csrf, q, hits, attention, stats, tooShort })));
  });

  r.get('/staff/patients/:id', auth('frontdesk'), (req, res) => {
    const p = db.prepare('SELECT * FROM patients WHERE id = ?').get(Number(req.params.id));
    if (!p) return res.status(404).send(String(V.staffPage({ title: 'Not found', user: req.staff, here: '/staff', token: req.staffSession.csrf, body: html`<div class="empty"><strong>Patient not found</strong><a href="/staff">Back to search</a></div>` })));
    const family = db.prepare('SELECT id, name FROM patients WHERE mobile = ? AND id != ? ORDER BY name').all(p.mobile, p.id);
    const orders = db.prepare('SELECT * FROM orders WHERE patient_id = ? ORDER BY COALESCE(signed_at, collected_at, imported_at) DESC').all(p.id).map((o) => {
      const link = db.prepare('SELECT * FROM report_links WHERE order_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1').get(o.id);
      return { ...o, delivery: messaging.deliveryStatus(db, o.id), link: link ? { ...link, expired: Date.parse(link.expires_at) < Date.now() } : null };
    });
    logAccess(db, { ...actor(req), action: 'staff_viewed_patient', detail: `patient ${p.id}`, req });
    res.send(String(V.patientPage({ user: req.staff, token: req.staffSession.csrf, patient: p, family, orders, flash: req.query.r })));
  });

  r.post('/staff/orders/:id/resend', ...post('frontdesk'), (req, res) => {
    if (!ORDER_ID.test(req.params.id)) return res.status(404).send('Not found');
    const o = delivery.loadOrder(db, req.params.id);
    if (!o) return res.status(404).send('Not found');
    const patientId = db.prepare('SELECT patient_id FROM orders WHERE id = ?').get(o.id).patient_id;
    if (!limiter.hit(`resend:${req.staff.id}`, 60, 3600_000).ok) return res.status(429).send('Too many resends this hour.');
    const out = delivery.resend(ctx, o.id, req.staff, req);
    const flash = out.error ? 'unsigned' : out.ok ? 'ok' : 'fail';
    res.redirect(`/staff/patients/${patientId}?r=${flash}`);
  });

  // ---- LIS import --------------------------------------------------------------------------
  const importView = (req, extra = {}) => {
    const runs = db.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 15').all().map((x) => ({ ...x, errors: JSON.parse(x.errors) }));
    return String(V.importPage({ user: req.staff, token: req.staffSession.csrf, runs, demo: cfg.demo, ...extra }));
  };

  r.get('/staff/import', auth('frontdesk'), (req, res) => res.send(importView(req)));

  r.post('/staff/import', auth('frontdesk'), (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).send(importView(req, { flash: { kind: 'bad', text: err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (limit 2 MB).' : 'Upload failed.' } }));
      if (!isCsrfOk(req)) return res.status(403).send('Invalid form token.');
      if (!req.file || !/\.csv$/i.test(req.file.originalname)) return res.status(400).send(importView(req, { flash: { kind: 'bad', text: 'Please choose a .csv file.' } }));
      let result;
      try {
        result = importCsv(db, { text: req.file.buffer.toString('utf8'), filename: req.file.originalname.replace(/[^\w.\- ]/g, '_'), source: 'upload' });
      } catch (e) {
        logAccess(db, { ...actor(req), action: 'import_failed', detail: e.message, req });
        return res.status(400).send(importView(req, { flash: { kind: 'bad', text: `Import failed: ${e.message}` } }));
      }
      logAccess(db, { ...actor(req), action: 'import_upload', detail: `${result.ordersNew} new, ${result.ordersSigned} signed, ${result.rowsFailed} rejected rows`, req });
      delivery.processPending(ctx).then(() => res.send(importView(req, { result }))).catch(next);
    });
  });

  r.post('/staff/import/scan', ...post('frontdesk'), async (req, res, next) => {
    try {
      const done = await scanFolder(ctx);
      const text = done.length ? `Processed ${done.length} file(s): ${done.map((d) => d.error ? `${d.name} failed (${d.error})` : `${d.name} ok`).join('; ')}` : 'No new files in the export folder.';
      res.send(importView(req, { flash: { kind: done.some((d) => d.error) ? 'warn' : 'info', text } }));
    } catch (e) { next(e); }
  });

  r.post('/staff/import/demo-drop', ...post('frontdesk'), async (req, res, next) => {
    if (!cfg.demo) return res.status(404).send('Not found');
    try {
      const name = dropSignoffBatch(ctx);
      await new Promise((ok) => setTimeout(ok, 1000)); // the folder watcher ignores files newer than ~1 s
      await scanFolder(ctx);
      res.send(importView(req, { flash: { kind: 'info', text: `Demo: the LIS dropped ${name} into the export folder and it was imported.` } }));
    } catch (e) { next(e); }
  });

  // ---- critical callbacks ----------------------------------------------------------------------
  r.get('/staff/tasks', auth('frontdesk'), (req, res) => {
    const base = `SELECT t.*, o.referring_doctor, p.name, p.mobile, u.name AS by FROM tasks t JOIN orders o ON o.id = t.order_id
                  JOIN patients p ON p.id = o.patient_id LEFT JOIN staff_users u ON u.id = t.done_by`;
    const open = db.prepare(`${base} WHERE t.status = 'open' ORDER BY t.created_at`).all();
    const done = db.prepare(`${base} WHERE t.status = 'done' ORDER BY t.done_at DESC LIMIT 15`).all();
    res.send(String(V.tasksPage({ user: req.staff, token: req.staffSession.csrf, open, done })));
  });

  r.post('/staff/tasks/:id/done', ...post('frontdesk'), (req, res) => {
    const note = String(req.body.note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    const t = db.prepare("SELECT * FROM tasks WHERE id = ? AND status = 'open'").get(Number(req.params.id));
    if (t) {
      db.prepare("UPDATE tasks SET status='done', note=?, done_at=?, done_by=? WHERE id=?").run(note || null, new Date().toISOString(), req.staff.id, t.id);
      logAccess(db, { ...actor(req), action: 'callback_done', orderId: t.order_id, req });
    }
    res.redirect('/staff/tasks');
  });

  // ---- access log ----------------------------------------------------------------------------------
  r.get('/staff/log', auth('frontdesk', 'ops'), (req, res) => {
    const order = ORDER_ID.test(String(req.query.order ?? '').toUpperCase()) ? String(req.query.order).toUpperCase() : '';
    const action = String(req.query.action ?? '').replace(/[^a-z_]/g, '').slice(0, 40);
    const before = Number(req.query.before) || 0;
    const where = []; const args = [];
    if (order) { where.push('order_id = ?'); args.push(order); }
    if (action) { where.push('action = ?'); args.push(action); }
    if (before) { where.push('id < ?'); args.push(before); }
    const rows = db.prepare(`SELECT * FROM access_log ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 101`).all(...args);
    const next = rows.length > 100 ? rows[99].id : null;
    const actions = db.prepare('SELECT DISTINCT action FROM access_log ORDER BY action').all().map((a) => a.action);
    res.send(String(V.logPage({ user: req.staff, token: req.staffSession.csrf, rows: rows.slice(0, 100), filters: { order, action }, actions, next })));
  });

  // ---- delivery and access report ---------------------------------------------------------------------
  r.get('/staff/report', auth('ops'), (req, res) => {
    const days = [7, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    const rep = deliveryReport(db, days);
    res.send(String(V.reportPage({ user: req.staff, token: req.staffSession.csrf, days, m: rep.m, daily: rep.daily })));
  });

  // ---- pathologist review ----------------------------------------------------------------------------------
  function reviewItems(where, order, limit, args = []) {
    const rows = db.prepare(`SELECT DISTINCT r.id AS result_id, r.name, r.unit, r.value_raw AS value, r.flag, r.ref_raw AS ref
                             FROM results r JOIN summaries s ON s.result_id = r.id WHERE ${where} ORDER BY ${order} LIMIT ${limit}`).all(...args);
    return rows.map((x) => {
      const ss = db.prepare('SELECT lang, text, source, model FROM summaries WHERE result_id = ?').all(x.result_id);
      return { ...x, source: ss[0]?.source, model: ss[0]?.model, texts: Object.fromEntries(ss.map((s) => [s.lang, s.text])) };
    });
  }
  r.get('/staff/review', auth('pathologist'), (req, res) => {
    const week = Math.floor(Date.now() / (7 * 86400_000));
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const flagged = reviewItems("s.status = 'flagged'", 'r.id', 50);
    const ai = reviewItems("s.source = 'ai' AND s.status = 'shown'", 'r.id', 50);
    // Stable pseudo-random order within a week: no table needed to remember the sample.
    const sample = reviewItems("s.source = 'template' AND s.status = 'shown' AND s.created_at >= ?", `((r.id * 2654435761 + ${week}) % 1000003)`, 50, [since]);
    res.send(String(V.reviewPage({ user: req.staff, token: req.staffSession.csrf, flagged, ai, sample, notice: req.query.done ? 'Decision saved.' : null })));
  });

  r.post('/staff/review/:rid', ...post('pathologist'), (req, res) => {
    const decision = req.body.decision;
    const ok = summaries.review(db, Number(req.params.rid), req.staff.id, decision);
    if (ok) logAccess(db, { ...actor(req), action: `summary_${decision}`, detail: `result ${Number(req.params.rid)}`, req });
    res.redirect('/staff/review?done=1');
  });

  return r;
}

module.exports = { mount: (app, ctx) => app.use(staffRoutes(ctx)) };
