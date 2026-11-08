'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { startApp, csrfFrom, sample } = require('./helpers');

let app;
test.before(async () => { app = await startApp({ ai: null }); });
test.after(async () => { await app.close(); });

async function staff(username) {
  const c = app.client();
  const r = await c.post('/staff/login', { username, password: 'test-pass-1' });
  assert.equal(r.status, 302, `login ${username}`);
  return { c, landing: r.location };
}

test('every staff page requires sign-in', async () => {
  for (const u of ['/staff', '/staff/patients/1', '/staff/import', '/staff/tasks', '/staff/log', '/staff/report', '/staff/review']) {
    const r = await app.client().get(u);
    assert.equal(r.status, 302, u);
    assert.equal(r.location, '/staff/login');
  }
  for (const u of ['/staff/import/scan', '/staff/orders/ORD-71204/resend', '/staff/tasks/1/done', '/staff/review/1']) {
    assert.equal((await app.client().post(u, {})).status, 302, u);
  }
});

test('sign-in: wrong password and unknown user get the same message; correct login lands on the role home', async () => {
  const bad = await app.client().post('/staff/login', { username: 'fd', password: 'nope' });
  const none = await app.client().post('/staff/login', { username: 'ghost', password: 'nope' });
  assert.equal(bad.status, 401);
  assert.equal(none.status, 401);
  assert.match(bad.text, /Wrong username or password/);
  assert.match(none.text, /Wrong username or password/);
  assert.equal((await staff('fd')).landing, '/staff');
  assert.equal((await staff('ops')).landing, '/staff/report');
  assert.equal((await staff('path')).landing, '/staff/review');
});

test('sign-in is rate limited per user and IP', async () => {
  const c = app.client();
  let last;
  for (let i = 0; i < 8; i++) assert.equal((await c.post('/staff/login', { username: 'brute', password: `x${i}` })).status, 401);
  last = await c.post('/staff/login', { username: 'brute', password: 'x9' });
  assert.equal(last.status, 429);
  // the right password does not get around the lock either
  assert.equal((await c.post('/staff/login', { username: 'brute', password: 'test-pass-1' })).status, 429);
});

test('roles: ops and pathologist cannot use front-desk pages; front desk cannot use the report or review', async () => {
  const ops = (await staff('ops')).c;
  const path = (await staff('path')).c;
  const fd = (await staff('fd')).c;
  assert.equal((await ops.get('/staff/patients/1')).status, 403);
  assert.equal((await ops.get('/staff/import')).status, 403);
  assert.equal((await path.get('/staff/log')).status, 403);
  assert.equal((await path.get('/staff/import')).status, 403);
  assert.equal((await fd.get('/staff/report')).status, 403);
  assert.equal((await fd.get('/staff/review')).status, 403);
  assert.equal((await ops.get('/staff/log')).status, 200);
  assert.equal((await ops.get('/staff/report')).status, 200);
  // a staff cookie is not a patient session and vice versa
  assert.equal((await fd.get('/reports')).location, '/login');
});

test('find a patient by name, order id and partial mobile; short and hostile input is safe', async () => {
  const { c } = await staff('fd');
  assert.match((await c.get('/staff?q=lakshmi')).text, /Lakshmi Prasanna K/);
  assert.equal((await c.get('/staff?q=ORD-71233')).status, 302); // single hit opens the patient
  assert.match((await c.get('/staff?q=000000004')).text, /Anjali Devi T/);
  assert.match((await c.get('/staff?q=zz')).text, /at least 3 characters/);
  assert.match((await c.get('/staff?q=nobodyhere')).text, /No match/);
  const evil = await c.get("/staff?q=" + encodeURIComponent("' OR '1'='1"));
  assert.equal(evil.status, 200);
  assert.match(evil.text, /No match/);
  const pct = await c.get('/staff?q=%25%25%25');
  assert.match(pct.text, /No match/); // % is escaped, not a wildcard
  const xss = await c.get('/staff?q=' + encodeURIComponent('<script>alert(1)</script>'));
  assert.ok(!xss.text.includes('<script>alert(1)</script>'));
});

test('home screen lists failed deliveries that need action', async () => {
  const { c } = await staff('fd');
  const home = await c.get('/staff');
  assert.match(home.text, /ORD-71255/);          // number ending 99: both channels fail
  assert.match(home.text, /Could not deliver/);
  assert.ok(!/ORD-71204/.test(home.text.split('Needs your attention')[1]));
});

test('patient page shows family on a shared number, delivery status and attempts', async () => {
  const { c } = await staff('fd');
  const id = app.db.prepare("SELECT id FROM patients WHERE name='Lakshmi Prasanna K'").get().id;
  const page = await c.get(`/staff/patients/${id}`);
  assert.match(page.text, /Venkata Rao M/);       // same number
  assert.match(page.text, /Delivered by WhatsApp/);
  assert.match(page.text, /Resend link/);
  const fb = app.db.prepare("SELECT id FROM patients WHERE name='Mohammed Irfan S'").get().id;
  const p2 = await c.get(`/staff/patients/${fb}`);
  assert.match(p2.text, /Delivered by SMS/);
  assert.match(p2.text, /not on WhatsApp/);
  assert.equal((await c.get('/staff/patients/99999')).status, 404);
  assert.equal((await c.get('/staff/patients/abc')).status, 404);
});

test('resend: needs the form token, makes a new link, revokes the old one, and is logged', async () => {
  const { c } = await staff('fd');
  const id = app.db.prepare("SELECT id FROM patients WHERE name='Anjali Devi T'").get().id;
  const page = await c.get(`/staff/patients/${id}`);
  const token = csrfFrom(page.text);
  assert.equal((await c.post('/staff/orders/ORD-71241/resend', {})).status, 403);
  const before = app.db.prepare("SELECT COUNT(*) c FROM report_links WHERE order_id='ORD-71241'").get().c;
  const r = await c.post('/staff/orders/ORD-71241/resend', { _csrf: token });
  assert.equal(r.location, `/staff/patients/${id}?r=ok`);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM report_links WHERE order_id='ORD-71241'").get().c, before + 1);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM report_links WHERE order_id='ORD-71241' AND revoked_at IS NULL").get().c, 1);
  assert.match((await c.get(r.location)).text, /A new link was sent/);
  const log = app.db.prepare("SELECT * FROM access_log WHERE action='link_resent' ORDER BY id DESC").get();
  assert.equal(log.actor_ref, 'fd');
  // unsigned order: nothing is sent
  const u = await c.post('/staff/orders/ORD-71219/resend', { _csrf: token });
  assert.match(u.location, /r=unsigned/);
  assert.equal((await c.post('/staff/orders/NOT-AN-ID/resend', { _csrf: token })).status, 404);
});

test('import upload: signs a Processing order, reports bad rows with reasons, rejects non-CSV and oversized files', async () => {
  const { c } = await staff('fd');
  const page = await c.get('/staff/import');
  const token = csrfFrom(page.text);
  const form = (name, content) => { const f = new FormData(); f.set('_csrf', token); f.set('file', new Blob([content], { type: 'text/csv' }), name); return f; };

  const sentBefore = app.provider.outbox.length;
  const ok = await c.postForm('/staff/import', form('batch2.csv', sample('lis-export-2-signoff.csv')));
  assert.equal(ok.status, 200);
  assert.match(ok.text, /Imported with problems/);
  assert.match(ok.text, /ORD-71271 \(line 10\)/);
  assert.match(ok.text, /3 signed/);
  assert.ok(app.provider.outbox.length >= sentBefore + 3); // links went out
  assert.equal(app.db.prepare("SELECT status FROM orders WHERE id='ORD-71219'").get().status, 'ready');

  assert.equal((await c.postForm('/staff/import', form('x.txt', 'hello'))).status, 400);
  const bad = await c.postForm('/staff/import', form('y.csv', 'Order ID,Patient\n1,2\n'));
  assert.equal(bad.status, 400);
  assert.match(bad.text, /Missing column/);
  const big = await c.postForm('/staff/import', form('z.csv', 'a'.repeat(3 * 1024 * 1024)));
  assert.equal(big.status, 400);
  assert.match(big.text, /too large/);
  const noCsrf = new FormData(); noCsrf.set('file', new Blob(['x'], { type: 'text/csv' }), 'n.csv');
  assert.equal((await c.postForm('/staff/import', noCsrf)).status, 403);
  assert.match((await c.get('/staff/import')).text, /batch2\.csv/);
});

test('critical callback task: listed, completed with a note, and logged', async () => {
  const { c } = await staff('fd');
  const page = await c.get('/staff/tasks');
  assert.match(page.text, /ORD-71233/);
  assert.match(page.text, /Farzana Begum/);
  const token = csrfFrom(page.text);
  const id = app.db.prepare("SELECT id FROM tasks WHERE order_id='ORD-71233'").get().id;
  assert.equal((await c.post(`/staff/tasks/${id}/done`, { note: 'x' })).status, 403);
  await c.post(`/staff/tasks/${id}/done`, { _csrf: token, note: 'Spoke to patient and Dr Suresh' });
  const after = await c.get('/staff/tasks');
  assert.match(after.text, /Spoke to patient and Dr Suresh/);
  assert.match(after.text, /No open callbacks/);
  assert.equal(app.db.prepare("SELECT COUNT(*) c FROM access_log WHERE action='callback_done'").get().c, 1);
});

test('access log: shows patient and staff events, filters by order and action, hides nothing from ops', async () => {
  const pc = app.client();
  await pc.post('/login', { mobile: '9000000003' });
  await pc.post('/login/verify', { code: app.provider.lastOtp('9000000003') });
  const { c } = await staff('ops');
  const all = await c.get('/staff/log');
  assert.match(all.text, /link_sent/);
  assert.match(all.text, /staff_login/);
  const one = await c.get('/staff/log?order=ORD-71240');
  assert.match(one.text, /link_sent/);
  assert.ok(!/ORD-71233/.test(one.text));
  const act = await c.get('/staff/log?action=login');
  assert.match(act.text, /patient · ••••••0003/);
  assert.equal((await c.get('/staff/log?order=%27%3Bdrop')).status, 200);
});

test('delivery report: digital delivery rate, failures and callbacks add up', async () => {
  const { c } = await staff('ops');
  const page = await c.get('/staff/report?days=90');
  assert.equal(page.status, 200);
  // 9 signed in export 1 + 3 in export 2 (uploaded earlier in this file) = 12 signed; 1 undeliverable (…99)
  assert.match(page.text, />12</);
  assert.match(page.text, /Delivered digitally/);
  assert.match(page.text, /Failed on every channel/);
  const { deliveryReport } = require('../src/services/metrics');
  const rep = deliveryReport(app.db, 90);
  assert.equal(rep.m.signed, 12);
  assert.equal(rep.m.failed, 1);
  assert.equal(rep.m.digital, 11);
  assert.equal((await c.get('/staff/report?days=abc')).status, 200);
});

test('pathologist review: sees wording not identities; approve and reject change what patients see', async () => {
  const { c } = await staff('path');
  const page = await c.get('/staff/review');
  assert.equal(page.status, 200);
  assert.ok(!/Lakshmi|9000000001/.test(page.text));          // no patient identity here
  assert.match(page.text, /Flagged by patients/);
  assert.match(page.text, /sample of 50/);
  const token = csrfFrom(page.text);
  const hb = app.db.prepare("SELECT id FROM results WHERE order_id='ORD-71204' AND name='Haemoglobin'").get().id;
  assert.equal((await c.post(`/staff/review/${hb}`, { decision: 'approve' })).status, 403); // CSRF
  await c.post(`/staff/review/${hb}`, { _csrf: token, decision: 'approve' });
  assert.equal(app.db.prepare('SELECT DISTINCT status FROM summaries WHERE result_id=?').get(hb).status, 'approved');
  await c.post(`/staff/review/${hb}`, { _csrf: token, decision: 'reject' });
  assert.equal(app.db.prepare("SELECT source FROM summaries WHERE result_id=? AND lang='en'").get(hb).source, 'fallback');
  await c.post(`/staff/review/${hb}`, { _csrf: token, decision: 'nonsense' });
  assert.equal(app.db.prepare("SELECT source FROM summaries WHERE result_id=? AND lang='en'").get(hb).source, 'fallback');
});

test('staff sign-out destroys the session', async () => {
  const { c } = await staff('fd');
  const token = csrfFrom((await c.get('/staff')).text);
  assert.equal((await c.post('/staff/logout', {})).status, 403);
  assert.equal((await c.post('/staff/logout', { _csrf: token })).location, '/staff/login');
  assert.equal((await c.get('/staff')).location, '/staff/login');
});
