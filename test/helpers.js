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
  const cfg = build({ appSecret: 'z'.repeat(64), dbFile: ':memory:', baseUrl: 'http://127.0.0.1', otpResendCooldownMs: 0, deliveryReceiptDelayMs: 0, exportDir, demo: false, ...cfgOver });
  const db = open(':memory:');
  const provider = new MockProvider({ receiptDelayMs: 0 });
  const ctx = createContext({ cfg, db, provider, ai });
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
    close: () => new Promise((ok) => server.close(() => { fs.rmSync(exportDir, { recursive: true, force: true }); ok(); })),
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
  return {
    get: (u, o) => send('GET', u, o),
    post: (u, body, o = {}) => send('POST', u, { ...o, body }),
    postForm: (u, form, o = {}) => send('POST', u, { ...o, body: form }),
    jar,
    cookie: (n) => jar.get(n),
  };
}

const csrfFrom = (html) => html.match(/name="_csrf" value="([^"]+)"/)?.[1];
const tokenFromBody = (body) => body.match(/\/r\/([A-Za-z0-9_-]{43})/)?.[1];

/** Log a patient in via mobile + OTP using the mock outbox. */
async function loginPatient(app, c, mobile = '9000000001', { consent = true } = {}) {
  await c.post('/login', { mobile });
  const code = app.provider.lastOtp(mobile);
  const r = await c.post('/login/verify', { code });
  if (consent && r.location === '/consent') {
    const page = await c.get('/consent');
    await c.post('/consent', { _csrf: csrfFrom(page.text), decision: 'agree' });
  }
  await c.get('/reports?lang=en'); // tests read English; the account language is remembered across logins by design
  return r;
}

module.exports = { startApp, client, csrfFrom, tokenFromBody, loginPatient, sample };
