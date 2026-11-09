'use strict';
// Doctor portal auth + the document-broadcast feature (a doctor keeps a
// library of PDFs and sends one to a list of mobile numbers, each getting
// its own OTP-gated 72h link — see src/services/broadcast{,Links}.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { startApp, loginDoctor } = require('./helpers');
const { parseRecipients } = require('../src/services/broadcast');
const { looksLikePdf } = require('../src/services/documents');

const PDF = Buffer.from('%PDF-1.4\n%fake test pdf\n1 0 obj<<>>endobj\n%%EOF');
const pdfForm = (name = 'doc.pdf') => { const f = new FormData(); f.set('file', new Blob([PDF], { type: 'application/pdf' }), name); return f; };
const postFormJson = async (c, url, form, opts = {}) => { const r = await c.postForm(url, form, opts); return { ...r, json: r.text ? JSON.parse(r.text) : null }; };

let app;
test.before(async () => { app = await startApp(); });
test.after(async () => { await app.close(); });

test('parseRecipients: normalises, dedupes, drops a header row, and reports invalid entries', () => {
  const r = parseRecipients('Mobile\n9000000001\n90000 00002\n+91 90000 00001\nnot-a-number\n9000000002\n');
  assert.deepEqual(r.valid, ['9000000001', '9000000002']);
  assert.deepEqual(r.invalid, ['not-a-number']);
  assert.equal(r.duplicates, 2); // the +91-formatted repeat of 001, and the plain repeat of 002
});

test('looksLikePdf checks real content, not just a claimed filename', () => {
  assert.equal(looksLikePdf(PDF), true);
  assert.equal(looksLikePdf(Buffer.from('not a pdf at all')), false);
  assert.equal(looksLikePdf(Buffer.from('')), false);
});

test('every doctor route refuses an anonymous caller (401), including the ones a previous version left wide open', async () => {
  const c = app.client();
  for (const url of ['/api/doctor/orders', '/api/doctor/session', '/api/doctor/documents', '/api/doctor/broadcasts']) {
    assert.equal((await c.getJson(url)).status, url === '/api/doctor/session' ? 200 : 401, url);
  }
  assert.equal((await c.postJson('/api/doctor/orders/ORD-71204/sign-and-send', { status: 'ready' })).status, 401);
  assert.equal((await postFormJson(c, '/api/doctor/documents', pdfForm())).status, 401);
  assert.equal((await postFormJson(c, '/api/doctor/broadcast', pdfForm())).status, 401);
  const s = await c.getJson('/api/doctor/session');
  assert.equal(s.json.doctor, null); // session probe itself is the one GET that's always 200
});

test('doctor login: wrong password and unknown user are rejected; a real front-desk/ops account (right password, wrong role) cannot sign in as doctor', async () => {
  assert.equal((await app.client().postJson('/api/doctor/login', { username: 'path', password: 'wrong' })).status, 401);
  assert.equal((await app.client().postJson('/api/doctor/login', { username: 'nope', password: 'x' })).status, 401);
  assert.equal((await app.client().postJson('/api/doctor/login', { username: 'fd', password: 'test-pass-1' })).status, 401);
  assert.equal((await app.client().postJson('/api/doctor/login', { username: 'ops', password: 'test-pass-1' })).status, 401);
});

test('doctor login is rate-limited per username+IP after repeated failures', async () => {
  // Isolated app instance: the shared `limiter` persists across tests in this
  // file (same in-memory rate limiter, same loopback IP for every client),
  // so a lockout test needs its own process to start the counter at zero.
  const isolated = await startApp();
  try {
    const c = isolated.client();
    for (let i = 0; i < 8; i++) assert.equal((await c.postJson('/api/doctor/login', { username: 'path', password: `x${i}` })).status, 401);
    assert.equal((await c.postJson('/api/doctor/login', { username: 'path', password: 'test-pass-1' })).status, 429); // even the right password is locked out now
  } finally {
    await isolated.close();
  }
});

test('doctor login works with the real pathologist account and returns a usable csrf token', async () => {
  const c = app.client();
  const login = await loginDoctor(c);
  assert.equal(login.json.ok, true);
  assert.equal(login.json.doctor.username, 'path');
  assert.ok(login.csrf);
  const s = await c.getJson('/api/doctor/session');
  assert.equal(s.json.doctor.name, 'Pathologist');
  assert.equal(s.json.doctor.csrf, login.csrf);
});

test('mutating doctor routes require the csrf header, not just the session cookie', async () => {
  const c = app.client();
  await loginDoctor(c);
  assert.equal((await c.postJson('/api/doctor/orders/ORD-71204/sign-and-send', { status: 'ready' })).status, 403);
  assert.equal((await postFormJson(c, '/api/doctor/documents', pdfForm())).status, 403);
});

test('sign-and-send: a signed-in doctor can sign a Processing order and it gets delivered, logged under their own username', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const before = app.provider.outbox.length;
  const r = await c.postJson('/api/doctor/orders/ORD-71219/sign-and-send', { status: 'ready' }, { csrf });
  assert.equal(r.status, 200);
  assert.equal(r.json.order.status, 'ready');
  assert.ok(app.provider.outbox.length > before);
  const log = app.db.prepare("SELECT * FROM access_log WHERE action='doctor_signed_and_sent' ORDER BY id DESC LIMIT 1").get();
  assert.equal(log.actor_ref, 'path');
  assert.equal((await c.postJson('/api/doctor/orders/NOT-REAL/sign-and-send', { status: 'ready' }, { csrf })).status, 404);
});

test('document upload: rejects a non-PDF and an unauthenticated username is never trusted for created_by', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const notPdf = new FormData(); notPdf.set('file', new Blob([Buffer.from('hello')], { type: 'text/plain' }), 'x.pdf'); notPdf.set('name', 'Fake');
  const bad = await postFormJson(c, '/api/doctor/documents', notPdf, { headers: { 'x-csrf-token': csrf } });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'bad_file');

  const form = pdfForm(); form.set('name', 'Health camp flyer'); form.set('description', 'November camp details');
  const ok = await postFormJson(c, '/api/doctor/documents', form, { headers: { 'x-csrf-token': csrf } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.document.created_by, 'path');
  assert.ok(fs.existsSync(require('path').join(app.ctx.cfg.documentsDir, ok.json.document.filename)));

  const list = await c.getJson('/api/doctor/documents');
  assert.ok(list.json.documents.some((d) => d.name === 'Health camp flyer'));
});

test('broadcast: sends to valid numbers only, skips invalid/duplicate, respects WhatsApp->SMS fallback and the unreachable-number simulation', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const docForm = pdfForm(); docForm.set('name', 'Broadcast test doc');
  const doc = await postFormJson(c, '/api/doctor/documents', docForm, { headers: { 'x-csrf-token': csrf } });
  const documentId = doc.json.document.id;

  const form = new FormData();
  form.set('document_id', String(documentId));
  form.set('title', 'Test run');
  // ...13 = not on WhatsApp (SMS fallback), ...99 = unreachable (fails both), plus a dup and an invalid entry
  form.set('recipients', '9000000013\n9000000099\n9000000013\nnot-a-number\n9000000001');

  const res = await postFormJson(c, '/api/doctor/broadcast', form, { headers: { 'x-csrf-token': csrf } });
  assert.equal(res.status, 200);
  assert.equal(res.json.run.total, 3); // 013, 099, 001 (dup and invalid excluded from "total")
  assert.equal(res.json.run.duplicate, 1);
  assert.equal(res.json.run.invalid, 1);
  assert.equal(res.json.run.sent, 2); // 013 via SMS fallback, 001 via WhatsApp
  assert.equal(res.json.run.failed, 1); // 099 unreachable on both channels
  assert.deepEqual(res.json.invalidSamples, ['not-a-number']);

  const detail = await c.getJson(`/api/doctor/broadcasts/${res.json.run.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.recipients.length, 3);
  assert.ok(detail.json.recipients.every((r2) => /^\+91 •{5} ••\d{3}$/.test(r2.mobile))); // masked, never the full number
});

test('broadcast: unknown document, no recipients, and too-many-recipients are all rejected with a clear reason', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const headers = { 'x-csrf-token': csrf };

  const noDoc = new FormData(); noDoc.set('document_id', '999999'); noDoc.set('recipients', '9000000001');
  const r1 = await postFormJson(c, '/api/doctor/broadcast', noDoc, { headers });
  assert.equal(r1.status, 400); assert.equal(r1.json.error, 'not_found');

  const docForm = pdfForm(); docForm.set('name', 'Doc B');
  const doc = await postFormJson(c, '/api/doctor/documents', docForm, { headers });
  const documentId = doc.json.document.id;

  const empty = new FormData(); empty.set('document_id', String(documentId)); empty.set('recipients', 'nothing valid here');
  const r2 = await postFormJson(c, '/api/doctor/broadcast', empty, { headers });
  assert.equal(r2.status, 400); assert.equal(r2.json.error, 'no_recipients');

  const many = Array.from({ length: app.ctx.cfg.maxBroadcastRecipients + 1 }, (_, i) => `9${String(1000000 + i).padStart(9, '0')}`).join('\n');
  const tooMany = new FormData(); tooMany.set('document_id', String(documentId)); tooMany.set('recipients', many);
  const r3 = await postFormJson(c, '/api/doctor/broadcast', tooMany, { headers });
  assert.equal(r3.status, 400); assert.equal(r3.json.error, 'too_many');
});

test('a document already sent cannot be deleted (keeps old links working); an unused one can be', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const headers = { 'x-csrf-token': csrf };

  const used = pdfForm(); used.set('name', 'In-use doc');
  const u = await postFormJson(c, '/api/doctor/documents', used, { headers });
  const send = new FormData(); send.set('document_id', String(u.json.document.id)); send.set('recipients', '9000000001');
  await postFormJson(c, '/api/doctor/broadcast', send, { headers });
  const blocked = await c.deleteJson(`/api/doctor/documents/${u.json.document.id}`, { csrf });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.error, 'in_use');

  const unused = pdfForm(); unused.set('name', 'Never sent');
  const n = await postFormJson(c, '/api/doctor/documents', unused, { headers });
  const removed = await c.deleteJson(`/api/doctor/documents/${n.json.document.id}`, { csrf });
  assert.equal(removed.status, 200);
  const list = await c.getJson('/api/doctor/documents');
  assert.ok(!list.json.documents.some((d) => d.id === n.json.document.id));

  assert.equal((await c.deleteJson('/api/doctor/documents/999999', { csrf })).status, 404);
  assert.equal((await c.deleteJson(`/api/doctor/documents/${n.json.document.id}`)).status, 403); // no csrf
});

test('public document link: unknown/expired tokens fail safely, OTP goes to the recipient number, wrong code fails, and the file needs a verified unlock', async () => {
  const c = app.client();
  const { csrf } = await loginDoctor(c);
  const docForm = pdfForm(); docForm.set('name', 'Public flow doc');
  const doc = await postFormJson(c, '/api/doctor/documents', docForm, { headers: { 'x-csrf-token': csrf } });
  const send = new FormData(); send.set('document_id', String(doc.json.document.id)); send.set('recipients', '9000000005');
  const run = await postFormJson(c, '/api/doctor/broadcast', send, { headers: { 'x-csrf-token': csrf } });
  assert.equal(run.json.run.sent, 1);

  const msg = app.provider.outbox.find((m) => m.kind === 'doc_link' && m.mobile === '9000000005');
  const token = msg.body.match(/\/d\/([A-Za-z0-9_-]{43})/)[1];

  const pub = app.client();
  assert.equal((await pub.getJson(`/api/d/${'A'.repeat(43)}`)).status, 404);
  assert.equal((await pub.getJson('/api/d/short')).status, 404);

  const land = await pub.getJson(`/api/d/${token}`);
  assert.equal(land.status, 200);
  assert.equal(land.json.documentName, 'Public flow doc');
  assert.equal(land.json.maskedMobile, '+91 ••••• ••005');

  assert.equal((await pub.getJson(`/api/d/${token}/file`)).status, 401); // not unlocked yet

  const otpBefore = app.provider.outbox.filter((m) => m.kind === 'otp').length;
  await pub.postJson(`/api/d/${token}/send`);
  const otpMsg = app.provider.outbox.find((m) => m.kind === 'otp' && m.mobile === '9000000005');
  assert.ok(otpMsg);
  assert.ok(app.provider.outbox.filter((m) => m.kind === 'otp').length > otpBefore);

  const code = otpMsg.body.match(/\b(\d{6})\b/)[1];
  const wrong = code === '000000' ? '111111' : '000000';
  assert.equal((await pub.postJson(`/api/d/${token}/verify`, { code: wrong })).status, 401);

  const ok = await pub.postJson(`/api/d/${token}/verify`, { code });
  assert.equal(ok.status, 200);

  const file = await pub.get(`/api/d/${token}/file`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'application/pdf');

  // a different, never-unlocked client cannot use the same token to fetch the file
  const stranger = app.client();
  assert.equal((await stranger.get(`/api/d/${token}/file`)).status, 401);
});
