'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { open } = require('../src/db');
const { build } = require('../src/config');
const { MockProvider, deliveryStatus } = require('../src/services/messaging');
const { importCsv } = require('../src/services/importer');
const delivery = require('../src/services/delivery');
const { scanFolder } = require('../src/services/ingest');

const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', f), 'utf8');

function ctxFor(extra = {}) {
  const cfg = build({ appSecret: 'y'.repeat(64), dbFile: ':memory:', baseUrl: 'http://t.local', ...extra });
  const db = open(':memory:');
  return { cfg, db, provider: new MockProvider({ receiptDelayMs: 0 }), ai: null };
}
const load = (ctx, f) => importCsv(ctx.db, { text: sample(f), filename: f, source: 'upload' });

test('sign-off sends exactly one link per signed order; Processing orders get none', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  const n = await delivery.processPending(ctx);
  assert.equal(n, 9);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) c FROM report_links').get().c, 9);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) c FROM report_links WHERE order_id='ORD-71219'").get().c, 0);
  assert.equal(await delivery.processPending(ctx), 0); // second sweep sends nothing
  assert.equal(ctx.db.prepare('SELECT COUNT(*) c FROM report_links').get().c, 9);
});

test('concurrent sweeps cannot double-send', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  const [a, b] = await Promise.all([delivery.processPending(ctx), delivery.processPending(ctx)]);
  assert.equal(a + b, 9);
});

test('the message carries a link and order id but no patient name or result values', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  await delivery.processPending(ctx);
  const msg = ctx.provider.outbox.find((m) => m.body.includes('ORD-71204'));
  assert.match(msg.body, /http:\/\/t\.local\/r\/[A-Za-z0-9_-]{43}/);
  assert.ok(!/Lakshmi|10\.2|Haemoglobin/i.test(msg.body));
  // token is not in the database
  const token = msg.body.match(/\/r\/([A-Za-z0-9_-]{43})/)[1];
  assert.ok(!JSON.stringify(ctx.db.prepare('SELECT * FROM messages').all()).includes(token));
});

test('critical report: link is sent, a callback task is opened, no summary exists', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  await delivery.processPending(ctx);
  const task = ctx.db.prepare("SELECT * FROM tasks WHERE order_id='ORD-71233'").get();
  assert.equal(task.kind, 'critical_callback');
  assert.equal(task.status, 'open');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) c FROM summaries WHERE order_id='ORD-71233'").get().c, 0);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) c FROM tasks").get().c, 1);
});

test('delivery channels: WhatsApp, SMS fallback, and total failure are all recorded', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  await delivery.processPending(ctx);
  assert.deepEqual([deliveryStatus(ctx.db, 'ORD-71204').state, deliveryStatus(ctx.db, 'ORD-71204').channel], ['delivered', 'whatsapp']);
  const fb = deliveryStatus(ctx.db, 'ORD-71252'); // mobile ends 13
  assert.deepEqual([fb.state, fb.channel], ['delivered', 'sms']);
  assert.equal(fb.rows.length, 2);
  const bad = deliveryStatus(ctx.db, 'ORD-71255'); // mobile ends 99
  assert.equal(bad.state, 'failed');
  assert.match(bad.error, /not reachable/);
});

test('a later export that signs a Processing order triggers its link once', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  await delivery.processPending(ctx);
  load(ctx, 'lis-export-2-signoff.csv');
  assert.equal(await delivery.processPending(ctx), 3);
  assert.equal(await delivery.processPending(ctx), 0);
});

test('resend creates a new link, revokes the old one and is logged', async () => {
  const ctx = ctxFor();
  load(ctx, 'lis-export-1.csv');
  await delivery.processPending(ctx);
  const res = delivery.resend(ctx, 'ORD-71204', { id: 1, username: 'frontdesk1' }, null);
  assert.ok(res.ok);
  const rows = ctx.db.prepare("SELECT revoked_at FROM report_links WHERE order_id='ORD-71204' ORDER BY id").all();
  assert.equal(rows.length, 2);
  assert.ok(rows[0].revoked_at && !rows[1].revoked_at);
  assert.equal(ctx.db.prepare("SELECT COUNT(*) c FROM access_log WHERE action='link_resent'").get().c, 1);
  assert.equal(delivery.resend(ctx, 'ORD-71219', { id: 1, username: 'f' }, null).ok, false); // unsigned
});

test('folder watcher imports, archives the file, and delivers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-'));
  const ctx = ctxFor({ exportDir: dir });
  const file = path.join(dir, 'a.csv');
  fs.writeFileSync(file, sample('lis-export-1.csv'));
  fs.utimesSync(file, new Date(Date.now() - 5000), new Date(Date.now() - 5000));
  fs.writeFileSync(path.join(dir, 'broken.csv'), 'Order ID,Patient\nx,y\n');
  fs.utimesSync(path.join(dir, 'broken.csv'), new Date(Date.now() - 5000), new Date(Date.now() - 5000));
  const out = await scanFolder(ctx);
  assert.equal(out.length, 2);
  assert.ok(!fs.existsSync(file));
  assert.equal(fs.readdirSync(path.join(dir, 'processed')).length, 1);
  const failed = fs.readdirSync(path.join(dir, 'failed'));
  assert.equal(failed.length, 2); // csv + .error.txt
  assert.equal(ctx.db.prepare('SELECT COUNT(*) c FROM report_links').get().c, 9);
  fs.rmSync(dir, { recursive: true, force: true });
});
