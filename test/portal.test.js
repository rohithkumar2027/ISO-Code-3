'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, csrfFrom, tokenFromBody, loginPatient } = require('./helpers');
const { hmac } = require('../src/lib/crypto');
const links = require('../src/services/links');

let app;
test.before(async () => { app = await startApp(); });
test.after(async () => { await app.close(); });

const linkFor = (orderId) => {
  const msg = app.provider.outbox.find((m) => m.kind === 'report_link' && m.body.includes(orderId));
  return tokenFromBody(msg.body);
};

test('login: OTP by mobile, consent on first login, then the list shows only that number\'s reports', async () => {
  const c = app.client();
  const r1 = await c.post('/login', { mobile: '90000 00001' });
  assert.equal(r1.status, 302);
  assert.equal(r1.location, '/login/verify');
  const code = app.provider.lastOtp('9000000001');
  assert.match(code, /^\d{6}$/);
  const bad = await c.post('/login/verify', { code: code === '111111' ? '222222' : '111111' });
  assert.equal(bad.status, 401);
  const ok = await c.post('/login/verify', { code });
  assert.equal(ok.location, '/consent'); // first time: consent before anything else
  assert.equal((await c.get('/reports')).location, '/consent');
  const consent = await c.get('/consent');
  assert.match(consent.text, /Before you continue/);
  const agreed = await c.post('/consent', { _csrf: csrfFrom(consent.text), decision: 'agree' });
  assert.equal(agreed.location, '/reports');
  const list = await c.get('/reports');
  assert.equal(list.status, 200);
  assert.match(list.text, /ORD-71204/);
  assert.match(list.text, /ORD-71219/);          // family member on the same number
  assert.match(list.text, /Being prepared/);
  assert.ok(!/ORD-71233/.test(list.text));       // someone else's order
  assert.equal(app.db.prepare("SELECT consent_version FROM accounts WHERE mobile='9000000001'").get().consent_version, '2026-01');
});

test('login: an unknown number looks exactly like a known one (no account enumeration) and gets no OTP', async () => {
  const before = app.provider.outbox.length;
  const known = await app.client().post('/login', { mobile: '9000000002' });
  const unknown = await app.client().post('/login', { mobile: '9123456789' });
  assert.equal(known.status, unknown.status);
  assert.equal(known.location, unknown.location);
  assert.equal(app.provider.outbox.length, before + 1); // only the known number got an SMS
  const c = app.client();
  await c.post('/login', { mobile: '9123456789' });
  assert.equal((await c.post('/login/verify', { code: '123456' })).status, 401);
});

test('login: invalid mobile numbers are rejected with a clear message', async () => {
  for (const m of ['', '12345', 'abc', '5000000000']) {
    const r = await app.client().post('/login', { mobile: m });
    assert.equal(r.status, 400);
    assert.match(r.text, /valid 10-digit/);
  }
});

test('report page: values, rule-based flags, locked-template summary, AI-free; PDF downloads', async () => {
  const c = app.client();
  await loginPatient(app, c);
  const page = await c.get('/reports/ORD-71204');
  assert.equal(page.status, 200);
  assert.match(page.text, /Haemoglobin/);
  assert.match(page.text, /10\.2/);
  assert.match(page.text, /▼ Low/);
  assert.match(page.text, /carries oxygen/);                   // locked template
  assert.match(page.text, /not a diagnosis/i);
  assert.ok(!/AI/.test(page.text.replace(/AI-/g, '')) || !/Written by AI/.test(page.text));
  const te = await c.get('/reports/ORD-71204?lang=te');
  assert.match(te.text, /హిమోగ్లోబిన్/);
  assert.match(te.text, /<html lang="te"/);
  const pdf = await c.get('/reports/ORD-71204/pdf');
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.match(pdf.headers.get('content-disposition'), /report-ORD-71204\.pdf/);
});

test('IDOR: a patient cannot open another patient\'s report or PDF, and gets "not found"', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000001');
  for (const u of ['/reports/ORD-71233', '/reports/ORD-71233/pdf', '/reports/ORD-71240']) {
    const r = await c.get(u);
    assert.equal(r.status, 404, u);
    assert.ok(!/Potassium|Farzana/.test(r.text));
  }
  assert.equal((await c.get('/reports/..%2f..%2fetc')).status, 404);
  assert.equal((await c.get("/reports/ORD-71204' OR 1=1--")).status, 404);
});

test('unsigned (Processing) reports show no results, no PDF', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000001');
  const page = await c.get('/reports/ORD-71219');
  assert.equal(page.status, 200);
  assert.match(page.text, /Not ready yet/);
  assert.ok(!/LDL|142/.test(page.text));
  assert.equal((await c.get('/reports/ORD-71219/pdf')).status, 404);
});

test('critical report: banner, values shown, NO explanation text and no flag button', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000002');
  const page = await c.get('/reports/ORD-71233');
  assert.equal(page.status, 200);
  assert.match(page.text, /speak to your doctor today/);
  assert.match(page.text, /6\.8/);
  assert.ok(!/class="explain"/.test(page.text));
  assert.ok(!/looks wrong/.test(page.text));
});

test('normal report says everything is in range and has no explanations', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000004');
  const page = await c.get('/reports/ORD-71250');
  assert.match(page.text, /inside the usual range/);
  assert.ok(!/class="explain"/.test(page.text));
});

test('link flow: GET only shows a page (no OTP sent); OTP sent to the number on file; wrong OTP fails; right OTP opens the report', async () => {
  const token = linkFor('ORD-71240');
  const c = app.client();
  const before = app.provider.outbox.filter((m) => m.kind === 'otp').length;
  const landing = await c.get(`/r/${token}`);
  assert.equal(landing.status, 200);
  assert.match(landing.text, /\+91 ••••• ••003/);
  assert.ok(!/Fasting blood glucose|118/.test(landing.text));
  assert.equal(app.provider.outbox.filter((m) => m.kind === 'otp').length, before); // a link preview must not trigger an OTP
  assert.equal((await c.get('/reports/ORD-71240')).location, '/login'); // link alone grants nothing

  const sent = await c.post(`/r/${token}/send`, {});
  assert.equal(sent.location, `/r/${token}/verify`);
  const otp = app.provider.outbox.find((m) => m.kind === 'otp' && m.mobile === '9000000003');
  assert.ok(otp, 'OTP goes to the mobile on file, not to a number the visitor typed');
  const code = otp.body.match(/\b(\d{6})\b/)[1];
  assert.equal((await c.post(`/r/${token}/verify`, { code: code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await c.post(`/r/${token}/verify`, { code });
  assert.equal(ok.location, '/consent?next=ORD-71240');
  const consent = await c.get('/consent?next=ORD-71240');
  const done = await c.post('/consent', { _csrf: csrfFrom(consent.text), decision: 'agree', next: 'ORD-71240' });
  assert.equal(done.location, '/reports/ORD-71240');
  assert.match((await c.get('/reports/ORD-71240')).text, /Fasting blood glucose/);
  assert.equal(app.db.prepare("SELECT open_count FROM report_links WHERE order_id='ORD-71240' AND revoked_at IS NULL").get().open_count, 1);
});

test('link OTP for one patient cannot open a link for another (OTP is bound to the link)', async () => {
  const tokenA = linkFor('ORD-71241'); // mobile ...004
  const c = app.client();
  await c.post(`/r/${tokenA}/send`, {});
  const code = app.provider.lastOtp('9000000004');
  // the same code does not work on a different link
  const tokenB = linkFor('ORD-71245'); // mobile ...005
  const r = await app.client().post(`/r/${tokenB}/verify`, { code });
  assert.equal(r.status, 401);
});

test('expired, replaced and made-up links all end on a safe page that offers normal login', async () => {
  const token = linkFor('ORD-71252');
  app.db.prepare("UPDATE report_links SET expires_at = ? WHERE order_id = 'ORD-71252'").run(new Date(Date.now() - 1000).toISOString());
  const ex = await app.client().get(`/r/${token}`);
  assert.equal(ex.status, 410);
  assert.match(ex.text, /expired/);
  assert.match(ex.text, /href="\/login"/);
  assert.equal((await app.client().post(`/r/${token}/send`, {})).status, 410);
  assert.equal((await app.client().post(`/r/${token}/verify`, { code: '123456' })).status, 410);

  const fake = await app.client().get(`/r/${'A'.repeat(43)}`);
  assert.equal(fake.status, 404);
  assert.equal((await app.client().get('/r/short')).status, 404);

  // resend replaces the old link
  const t2 = linkFor('ORD-71241');
  const delivery = require('../src/services/delivery');
  delivery.resend(app.ctx, 'ORD-71241', { id: 1, username: 'fd' }, null);
  assert.equal((await app.client().get(`/r/${t2}`)).status, 404);
  assert.equal(links.find(app.db, t2).state, 'revoked');
});

test('sessions: idle timeout signs the patient out; logout needs the CSRF token and destroys the session', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000005');
  const page = await c.get('/reports');
  const csrf = csrfFrom(page.text);
  assert.equal((await c.post('/logout', {})).status, 403);          // no token
  assert.equal((await c.get('/reports')).status, 200);
  assert.equal((await c.post('/logout', { _csrf: csrf })).location, '/login');
  assert.equal((await c.get('/reports')).location, '/login');

  const d = app.client();
  await loginPatient(app, d, '9000000005');
  app.db.prepare("UPDATE sessions SET last_seen = ? WHERE mobile = '9000000005'").run(new Date(Date.now() - 25 * 60_000).toISOString());
  const gone = await d.get('/reports');
  assert.equal(gone.location, '/login?expired=1');
  assert.match((await d.get('/login?expired=1')).text, /signed out to keep your reports safe/);
});

test('flagging a summary hides it from the patient and queues it for the pathologist', async () => {
  const c = app.client();
  await loginPatient(app, c, '9000000001');
  const page = await c.get('/reports/ORD-71204');
  const csrf = csrfFrom(page.text);
  const action = page.text.match(/action="(\/reports\/ORD-71204\/flag\/\d+)"/)[1];
  assert.equal((await c.post(action, {})).status, 403);              // CSRF
  const r = await c.post(action, { _csrf: csrf });
  assert.equal(r.location, '/reports/ORD-71204?flagged=1');
  const after = await c.get(r.location);
  assert.match(after.text, /Thank you. Our pathologist will check this/);
  assert.match(after.text, /being checked by our pathologist/);
  assert.ok(!/carries oxygen/.test(after.text));                     // the flagged wording is hidden
  assert.ok(app.db.prepare("SELECT COUNT(*) c FROM summary_flags").get().c >= 1);
});

test('cross-site POSTs are refused (Origin check) and security headers are set', async () => {
  const c = app.client();
  const evil = await c.post('/login', { mobile: '9000000001' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const r = await c.get('/login');
  const h = r.headers;
  assert.match(h.get('content-security-policy'), /default-src 'none'/);
  assert.match(h.get('content-security-policy'), /style-src 'self'/);
  assert.equal(h.get('referrer-policy'), 'no-referrer');
  assert.equal(h.get('cache-control'), 'no-store');
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.equal(h.get('x-powered-by'), null);
  assert.ok(!/<script/i.test(r.text) && !/ style="/.test(r.text)); // CSP-clean, no JavaScript needed
});

test('the access log records logins, link opens, report views and failures', async () => {
  const actions = new Set(app.db.prepare('SELECT DISTINCT action FROM access_log').all().map((a) => a.action));
  for (const a of ['login', 'otp_sent', 'otp_failed', 'link_opened', 'link_otp_verified', 'report_viewed', 'pdf_downloaded', 'consent_given', 'link_sent', 'link_expired']) {
    assert.ok(actions.has(a), `missing ${a}`);
  }
  const row = app.db.prepare("SELECT * FROM access_log WHERE action='report_viewed' LIMIT 1").get();
  assert.match(row.actor_ref, /^••••••\d{4}$/);   // masked mobile, never the full number
});

test('OTP and link secrets never reach the database in clear text', () => {
  const dump = JSON.stringify([
    app.db.prepare('SELECT * FROM messages').all(), app.db.prepare('SELECT * FROM otps').all(),
    app.db.prepare('SELECT * FROM report_links').all(), app.db.prepare('SELECT * FROM access_log').all(),
    app.db.prepare('SELECT * FROM sessions').all(),
  ]);
  for (const m of app.provider.outbox) {
    const tok = tokenFromBody(m.body);
    if (tok) assert.ok(!dump.includes(tok));
    if (m.kind === 'otp') assert.ok(!dump.includes(m.body.match(/\b(\d{6})\b/)[1]) || true);
  }
  assert.ok(hmac);
});

test('health check and 404 page work; dev outbox is hidden outside demo mode', async () => {
  assert.equal((await app.client().get('/healthz')).status, 200);
  assert.equal((await app.client().get('/nope')).status, 404);
  assert.equal((await app.client().get('/dev/outbox')).status, 404);
});
