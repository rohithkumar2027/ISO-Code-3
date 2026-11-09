'use strict';
// Spin up the whole app in memory on a random port and drive it over HTTP.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('../src/db');
const { build } = require('../src/config');
const { createApp, createContext } = require('../src/app');
const { MockProvider } = require('../src/services/messaging');
const { importCsv } = require('../src/services/importer');
const { processPending } = require('../src/services/delivery');
const { hashPassword } = require('../src/lib/crypto');

const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', f), 'utf8');

async function startApp({ files = ['lis-export-1.csv'], ai = null, cfgOver = {} } = {}) {
  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-'));
  const documentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-'));
  const cfg = build({ appSecret: 'z'.repeat(64), dbFile: ':memory:', baseUrl: 'http://127.0.0.1', otpResendCooldownMs: 0, deliveryReceiptDelayMs: 0, exportDir, documentsDir, demo: false, ...cfgOver });
  const db = open(':memory:');
  const provider = new MockProvider({ receiptDelayMs: 0 });
  const ctx = createContext({ cfg, db, provider, ai });
  ctx.extraRoutes = [require('../src/routes/staff').mount, require('../src/routes/dev').mount];
  for (const f of files) importCsv(db, { text: sample(f), filename: f, source: 'upload' });
  const ins = db.prepare('INSERT INTO staff_users (username, name, role, password_hash) VALUES (?,?,?,?)');
  const pw = hashPassword('test-pass-1');
  ins.run('fd', 'Front Desk', 'frontdesk', pw);
  ins.run('path', 'Pathologist', 'pathologist', pw);
  ins.run('ops', 'Ops Head', 'ops', pw);
  await processPending(ctx);

  const app = createApp(ctx);
  const server = await new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  ctx.cfg.baseUrl = base;
  return {
    ctx, base, db, provider,
    client: () => client(base),
    close: () => new Promise((ok) => server.close(() => {
      fs.rmSync(exportDir, { recursive: true, force: true });
      fs.rmSync(documentsDir, { recursive: true, force: true });
      ok();
    })),
  };
}

/** Minimal cookie-jar HTTP client. Never follows redirects, so tests see each hop. */
function client(base) {
  const jar = new Map();
  const send = async (method, url, { body, headers = {} } = {}) => {
    const h = { ...headers };
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    h.origin = h.origin ?? base;
    let payload;
    if (body && !(body instanceof FormData)) { payload = new URLSearchParams(body).toString(); h['content-type'] = 'application/x-www-form-urlencoded'; } else payload = body;
    const res = await fetch(url.startsWith('http') ? url : base + url, { method, headers: h, body: payload, redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const val = decodeURIComponent(pair.slice(i + 1));
      if (/max-age=0/i.test(attrs.join(';'))) jar.delete(name); else jar.set(name, encodeURIComponent(val));
    }
    const text = res.headers.get('content-type')?.includes('pdf') ? '' : await res.text();
    return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
  };
  const postJson = async (url, body, { csrf, headers = {} } = {}) => {
    const h = { ...headers, 'content-type': 'application/json' };
    if (csrf) h['x-csrf-token'] = csrf;
    if (jar.size) h.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    h.origin = h.origin ?? base;
    const res = await fetch(base + url, { method: 'POST', headers: h, body: JSON.stringify(body ?? {}), redirect: 'manual' });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = c.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      const val = decodeURIComponent(pair.slice(i + 1));
      if (/max-age=0/i.test(attrs.join(';'))) jar.delete(name); else jar.set(name, encodeURIComponent(val));
    }
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { status: res.status, headers: res.headers, json };
  };
  const getJson = async (u, o) => { const r = await send('GET', u, o); return { ...r, json: r.text ? JSON.parse(r.text) : null }; };
  const deleteJson = async (u, { csrf, headers = {} } = {}) => {
    const h = { ...headers };
    if (csrf) h['x-csrf-token'] = csrf;
    const r = await send('DELETE', u, { headers: h });
    return { ...r, json: r.text ? JSON.parse(r.text) : null };
  };
  return {
    get: (u, o) => send('GET', u, o),
    getJson,
    deleteJson,
    post: (u, body, o = {}) => send('POST', u, { ...o, body }),
    postForm: (u, form, o = {}) => send('POST', u, { ...o, body: form }),
    postJson,
    jar,
    cookie: (n) => jar.get(n),
  };
}

const csrfFrom = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
const tokenFromBody = (body) => body.match(/\/r\/([A-Za-z0-9_-]{43})/)?.[1];

/** Log a patient in via mobile + OTP against the JSON API, using the mock outbox for the code. */
async function loginPatient(app, c, mobile = '9000000001', { consent = true } = {}) {
  await c.postJson('/api/login', { mobile });
  const code = app.provider.lastOtp(mobile);
  const r = await c.postJson('/api/login/verify', { code });
  if (consent && r.json?.consent === false) {
    const s = await c.getJson('/api/session');
    await c.postJson('/api/consent', { decision: 'agree' }, { csrf: s.json?.patient?.csrf });
  }
  return r;
}

/** Log a staff member in as doctor (pathologist) via the JSON API; returns their csrf token. */
async function loginDoctor(c, username = 'path', password = 'test-pass-1') {
  const r = await c.postJson('/api/doctor/login', { username, password });
  if (!r.json?.ok) return r;
  const s = await c.getJson('/api/doctor/session');
  return { ...r, csrf: s.json?.doctor?.csrf };
}

module.exports = { startApp, client, csrfFrom, tokenFromBody, loginPatient, loginDoctor, sample };
