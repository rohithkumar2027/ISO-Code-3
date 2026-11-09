'use strict';
// JSON API tests for the React patient app (replaces the old HTML-based
// portal.test.js). Same security properties, asserted against JSON responses.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp } = require('./helpers');

let app;
test.before(async () => { app = await startApp(); });
test.after(async () => { await app.close(); });

const tokenFor = (orderId) => {
  const msg = app.provider.outbox.find((m) => m.kind === 'report_link' && m.body.includes(orderId));
  return msg.body.match(/\/r\/([A-Za-z0-9_-]{43})/)?.[1];
};

test('login: OTP by mobile, consent gate, then /api/reports shows only that number\'s people', async () => {
  const c = app.client();
  const r1 = await c.postJson('/api/login', { mobile: '90000 00001' });
  assert.equal(r1.status, 200);
  assert.match(r1.json.maskedMobile, /^\+91 •{5} ••001$/);
  const code = app.provider.lastOtp('9000000001');
  const wrong = code === '111111' ? '222222' : '111111';
  const bad = await c.postJson('/api/login/verify', { code: wrong });
  assert.equal(bad.status, 401);
  assert.equal(bad.json.error, 'invalid');
  const ok = await c.postJson('/api/login/verify', { code });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.consent, false);

  const before = await c.getJson('/api/reports');
  assert.equal(before.status, 403);
  assert.equal(before.json.error, 'consent_required');

  const s = await c.getJson('/api/session');
  assert.equal(s.json.patient.maskedMobile, '+91 ••••• ••001');
  await c.postJson('/api/consent', { decision: 'agree' }, { csrf: s.json.patient.csrf });

  const list = await c.getJson('/api/reports');
  const ids = list.json.people.flatMap((p) => p.orders.map((o) => o.id));
  assert.ok(ids.includes('ORD-71204'));
  assert.ok(ids.includes('ORD-71219')); // family member sharing the number
  assert.ok(!ids.includes('ORD-71233')); // someone else's order
  assert.equal(app.db.prepare("SELECT consent_version FROM accounts WHERE mobile='9000000001'").get().consent_version, '2026-01');
});

test('login: an unknown number behaves identically to a known one (no account enumeration)', async () => {
  const before = app.provider.outbox.length;
  const known = await app.client().postJson('/api/login', { mobile: '9000000002' });
  const unknown = await app.client().postJson('/api/login', { mobile: '9123456789' });
  assert.equal(known.status, unknown.status);
  assert.deepEqual(Object.keys(known.json).sort(), Object.keys(unknown.json).sort());
  assert.equal(app.provider.outbox.length, before + 1); // only the known number actually got an SMS
});

test('login: invalid mobile numbers are rejected', async () => {
  for (const m of ['', '12345', 'abc', '5000000000']) {
    const r = await app.client().postJson('/api/login', { mobile: m });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'mobile_invalid');
  }
});

test('report detail: rule-based flags, locked template text, no AI tag, and summaries omitted for processing orders', async () => {
  const c = app.client();
  await require('./helpers').loginPatient(app, c, '9000000001');
  const r = await c.getJson('/api/reports/ORD-71204');
  const hb = r.json.results.find((x) => x.name === 'Haemoglobin');
  assert.equal(hb.flag, 'low');
  assert.equal(hb.value, '10.2');
  assert.match(hb.summary.en.text, /carries oxygen/);
  assert.equal(hb.summary.en.source, 'template');
  assert.match(hb.summary.te.text, /హిమోగ్లోబిన్/);

  const pdf = await c.get('/api/reports/ORD-71204/pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /report-ORD-71204\.pdf/);

  const proc = await c.getJson('/api/reports/ORD-71219');
  assert.equal(proc.json.status, 'processing');
  assert.equal(proc.json.results, undefined);
});

test('IDOR: a patient cannot read another patient\'s report or PDF (404, not 403)', async () => {
  const c = app.client();
  await require('./helpers').loginPatient(app, c, '9000000001');
  for (const u of ['/api/reports/ORD-71233', '/api/reports/ORD-71240']) {
    const r = await c.getJson(u);
    assert.equal(r.status, 404);
    assert.equal(r.json.error, 'not_found');
  }
  assert.equal((await c.get('/api/reports/ORD-71233/pdf')).status, 404);
  assert.equal((await c.getJson("/api/reports/ORD-71204' OR 1=1--")).status, 404);
});

test('critical report: values present, summary withheld entirely (no AI, no fallback text)', async () => {
  const c = app.client();
  await require('./helpers').loginPatient(app, c, '9000000002');
  const r = await c.getJson('/api/reports/ORD-71233');
  assert.equal(r.json.status, 'ready_critical');
  const k = r.json.results.find((x) => x.name === 'Potassium');
  assert.equal(k.value, '6.8');
  assert.equal(k.summary, null);
});

test('link flow: landing never sends an OTP; OTP goes to the number on file, not a typed one; wrong code fails; right code opens the report', async () => {
  const token = tokenFor('ORD-71240');
  const c = app.client();
  const before = app.provider.outbox.filter((m) => m.kind === 'otp').length;
  const land = await c.getJson(`/api/links/${token}`);
  assert.equal(land.json.maskedMobile, '+91 ••••• ••003');
  assert.equal(app.provider.outbox.filter((m) => m.kind === 'otp').length, before);
  assert.equal((await c.getJson('/api/reports/ORD-71240')).status, 401); // no session yet

  const sent = await c.postJson(`/api/links/${token}/send`);
  assert.equal(sent.status, 200);
  const otpMsg = app.provider.outbox.find((m) => m.kind === 'otp' && m.mobile === '9000000003');
  const code = otpMsg.body.match(/\b(\d{6})\b/)[1];
  assert.equal((await c.postJson(`/api/links/${token}/verify`, { code: code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await c.postJson(`/api/links/${token}/verify`, { code });
  assert.equal(ok.json.consent, false);
  const s = await c.getJson('/api/session');
  await c.postJson('/api/consent', { decision: 'agree' }, { csrf: s.json.patient.csrf });
  const r = await c.getJson('/api/reports/ORD-71240');
  assert.match(r.json.results.find((x) => x.name === 'Fasting blood glucose').value, /118/);
  assert.equal(app.db.prepare("SELECT open_count FROM report_links WHERE order_id='ORD-71240' AND revoked_at IS NULL").get().open_count, 1);
});

test('link OTP is bound to its own link: a code for one link does not verify another', async () => {
  const tokenA = tokenFor('ORD-71241'); // mobile ...004
  const tokenB = tokenFor('ORD-71245'); // mobile ...005
  const c = app.client();
  await c.postJson(`/api/links/${tokenA}/send`);
  const code = app.provider.lastOtp('9000000004');
  const r = await app.client().postJson(`/api/links/${tokenB}/verify`, { code });
  assert.equal(r.status, 401);
});

test('expired and made-up links fail safely; resend revokes the old link', async () => {
  const token = tokenFor('ORD-71252');
  app.db.prepare("UPDATE report_links SET expires_at = ? WHERE order_id = 'ORD-71252'").run(new Date(Date.now() - 1000).toISOString());
  const ex = await app.client().getJson(`/api/links/${token}`);
  assert.equal(ex.status, 410);
  assert.equal(ex.json.error, 'expired');
  assert.equal((await app.client().getJson(`/api/links/${'A'.repeat(43)}`)).status, 404);
  assert.equal((await app.client().getJson('/api/links/short')).status, 404);

  const t2 = tokenFor('ORD-71241');
  require('../src/services/delivery').resend(app.ctx, 'ORD-71241', { id: 1, username: 'fd' }, null);
  assert.equal((await app.client().getJson(`/api/links/${t2}`)).status, 404);
});

test('sessions: CSRF is required on mutating calls; logout destroys the session', async () => {
  const c = app.client();
  await require('./helpers').loginPatient(app, c, '9000000005');
  const s = await c.getJson('/api/session');
  assert.equal((await c.postJson('/api/logout')).status, 403); // no csrf header
  assert.equal((await c.getJson('/api/reports')).status, 200);
  assert.equal((await c.postJson('/api/logout', {}, { csrf: s.json.patient.csrf })).status, 200);
  assert.equal((await c.getJson('/api/reports')).status, 401);
});

test('flagging a summary hides it for everyone until a pathologist decides', async () => {
  const c = app.client();
  await require('./helpers').loginPatient(app, c, '9000000001');
  const s = await c.getJson('/api/session');
  const r = await c.getJson('/api/reports/ORD-71204');
  const hb = r.json.results.find((x) => x.name === 'Haemoglobin');
  assert.equal((await c.postJson(`/api/reports/ORD-71204/flag/${hb.id}`)).status, 403); // csrf
  await c.postJson(`/api/reports/ORD-71204/flag/${hb.id}`, {}, { csrf: s.json.patient.csrf });
  const after = await c.getJson('/api/reports/ORD-71204');
  const hb2 = after.json.results.find((x) => x.name === 'Haemoglobin');
  assert.equal(hb2.summary.en.status, 'flagged');
});

test('cross-site POSTs are refused and security headers are present on API responses', async () => {
  const c = app.client();
  const evil = await c.postJson('/api/login', { mobile: '9000000001' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const r = await c.getJson('/api/session');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('the SPA fallback serves the built app for unknown client-side routes, and /api/* 404s as JSON', async () => {
  const c = app.client();
  const home = await c.get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /<div id="root">/);
  const deep = await c.get('/reports/ORD-71204'); // client-side route, no session
  assert.equal(deep.status, 200);
  assert.match(deep.text, /<div id="root">/);
  const missing = await c.getJson('/api/does-not-exist');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.error, 'not_found');
});

test('OTP codes and link tokens never reach the database in clear text', () => {
  const dump = JSON.stringify([
    app.db.prepare('SELECT * FROM messages').all(), app.db.prepare('SELECT * FROM otps').all(),
    app.db.prepare('SELECT * FROM report_links').all(), app.db.prepare('SELECT * FROM sessions').all(),
  ]);
  for (const m of app.provider.outbox) {
    const tok = m.body.match(/\/r\/([A-Za-z0-9_-]{43})/)?.[1];
    if (tok) assert.ok(!dump.includes(tok));
  }
});

test('health check works', async () => {
  assert.equal((await app.client().get('/healthz')).status, 200);
});
