'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('../src/db');
const { build } = require('../src/config');
const otp = require('../src/services/otp');
const links = require('../src/services/links');
const sessions = require('../src/services/sessions');
const { importCsv } = require('../src/services/importer');

const cfg = build({ appSecret: 'x'.repeat(64), otpResendCooldownMs: 0, dbFile: ':memory:' });
const HEAD = 'Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor,Mobile\n';

function seeded() {
  const db = open(':memory:');
  importCsv(db, { text: HEAD + 'ORD-80001,Test Patient,Haemoglobin g/dL,12,12-15,Ready,Dr A,9000000001\n', filename: 'a.csv', source: 'upload' });
  return db;
}

test('OTP: correct code works once, wrong code does not, codes are not stored in clear', () => {
  const db = seeded();
  const { code } = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' });
  assert.match(code, /^\d{6}$/);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM otps').all()).includes(code));
  const wrong = code === '000000' ? '111111' : '000000';
  assert.deepEqual(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code: wrong }), { ok: false, reason: 'invalid' });
  assert.deepEqual(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code }), { ok: true });
  assert.equal(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code }).ok, false); // single use
});

test('OTP: locked after 5 wrong attempts even if the right code follows', () => {
  const db = seeded();
  const { code } = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' });
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code: wrong });
  assert.deepEqual(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code }), { ok: false, reason: 'locked' });
});

test('OTP: expires after 5 minutes', () => {
  const db = seeded();
  const { code } = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' });
  db.prepare('UPDATE otps SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
  assert.deepEqual(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code }), { ok: false, reason: 'expired' });
});

test('OTP: a new OTP voids the previous one; purposes and links do not mix', () => {
  const db = seeded();
  const first = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' }).code;
  const second = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' }).code;
  if (first !== second) assert.equal(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'login', code: first }).ok, false);
  assert.equal(otp.verify(db, cfg, { mobile: '9000000001', purpose: 'link', linkId: 1, code: second }).reason, 'none');
  assert.equal(otp.verify(db, cfg, { mobile: '9000000002', purpose: 'login', code: second }).reason, 'none');
});

test('OTP: a code for one mobile is useless for another (hash is bound to the mobile)', () => {
  const db = seeded();
  const { code } = otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' });
  const other = otp.issue(db, cfg, { mobile: '9000000002', purpose: 'login' }).code;
  if (code !== other) assert.equal(otp.verify(db, cfg, { mobile: '9000000002', purpose: 'login', code }).ok, false);
});

test('OTP: cooldown and hourly send limit', () => {
  const db = seeded();
  const slow = { ...cfg, otpResendCooldownMs: 30_000 };
  otp.issue(db, slow, { mobile: '9000000001', purpose: 'login' });
  assert.throws(() => otp.issue(db, slow, { mobile: '9000000001', purpose: 'login' }), otp.OtpRateLimited);
  for (let i = 0; i < 4; i++) otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' });
  assert.throws(() => otp.issue(db, cfg, { mobile: '9000000001', purpose: 'login' }), /Too many/);
});

test('links: token is stored hashed, resolves, expires after 72 h, and newer link revokes older', () => {
  const db = seeded();
  const a = links.create(db, cfg, 'ORD-80001', 'system');
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM report_links').all()).includes(a.token));
  assert.equal(links.find(db, a.token).state, 'valid');
  assert.equal(links.find(db, a.token).mobile, '9000000001');
  const ttl = Date.parse(a.expiresAt) - Date.now();
  assert.ok(Math.abs(ttl - 72 * 3600 * 1000) < 5000);

  const b = links.create(db, cfg, 'ORD-80001', 'staff:1');
  assert.equal(links.find(db, a.token).state, 'revoked');
  assert.equal(links.find(db, b.token).state, 'valid');

  db.prepare('UPDATE report_links SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), b.id);
  assert.equal(links.find(db, b.token).state, 'expired');
});

test('links: malformed or guessed tokens are unknown', () => {
  const db = seeded();
  for (const t of ['', 'abc', 'x'.repeat(43), "' OR 1=1 --", undefined, null, 'A'.repeat(500)]) {
    assert.equal(links.find(db, t).state, 'unknown');
  }
});

test('sessions: valid, idle timeout, absolute timeout, destroy, wrong kind', () => {
  const db = seeded();
  const lim = { idleMs: 20 * 60_000, maxMs: 2 * 3600_000 };
  const { token } = sessions.create(db, { kind: 'patient', mobile: '9000000001' });
  assert.equal(sessions.load(db, token, 'patient', lim).mobile, '9000000001');
  assert.equal(sessions.load(db, token, 'staff', lim), null);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM sessions').all()).includes(token));

  db.prepare('UPDATE sessions SET last_seen = ?').run(new Date(Date.now() - 21 * 60_000).toISOString());
  assert.equal(sessions.load(db, token, 'patient', lim), null); // idle

  const t2 = sessions.create(db, { kind: 'patient', mobile: '9000000001' }).token;
  db.prepare('UPDATE sessions SET created_at = ?').run(new Date(Date.now() - 3 * 3600_000).toISOString());
  assert.equal(sessions.load(db, t2, 'patient', lim), null); // absolute

  const t3 = sessions.create(db, { kind: 'patient', mobile: '9000000001' }).token;
  sessions.destroy(db, t3);
  assert.equal(sessions.load(db, t3, 'patient', lim), null);
});
