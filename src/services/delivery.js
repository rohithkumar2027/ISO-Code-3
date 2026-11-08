'use strict';
// Sign-off automation: when the LIS marks an order Ready (the pathologist has
// signed), build the summaries, open a callback task if it is critical, create
// a 72-hour link and message the patient. Runs after every import and on a
// timer, and is safe to run twice (an order is claimed with one UPDATE).

const { nowIso } = require('../db');
const links = require('./links');
const messaging = require('./messaging');
const summaries = require('./summaries');
const { logAccess } = require('./audit');

function accountLang(db, mobile) {
  return db.prepare('SELECT lang FROM accounts WHERE mobile = ?').get(mobile)?.lang ?? 'te';
}

function loadOrder(db, orderId) {
  return db.prepare(`SELECT o.*, p.mobile, p.name AS patient_name FROM orders o JOIN patients p ON p.id = o.patient_id WHERE o.id = ?`).get(orderId);
}

async function deliverOrder(ctx, orderId) {
  const { db, cfg } = ctx;
  // Claim: only one runner wins this UPDATE
  const claim = db.prepare("UPDATE orders SET delivered_at = ? WHERE id = ? AND delivered_at IS NULL AND status != 'processing'")
    .run(nowIso(), orderId);
  if (Number(claim.changes) !== 1) return null;
  try {
    const order = loadOrder(db, orderId);
    await summaries.generateForOrder(ctx, orderId); // returns 0 for critical orders by design
    if (order.status === 'ready_critical') {
      db.prepare(`INSERT OR IGNORE INTO tasks (kind, order_id, created_at) VALUES ('critical_callback', ?, ?)`).run(orderId, nowIso());
      logAccess(db, { type: 'system', action: 'callback_task_created', orderId, detail: 'critical value: no summary generated' });
    }
    const link = links.create(db, cfg, orderId, 'system');
    const res = messaging.sendReportLink(ctx, { order, mobile: order.mobile, link, sentBy: 'system', lang: accountLang(db, order.mobile) });
    logAccess(db, {
      type: 'system', action: res.ok ? 'link_sent' : 'link_send_failed', orderId,
      detail: res.attempts.map((a) => `${a.channel}:${a.ok ? 'ok' : a.error}`).join(', '),
    });
    return res;
  } catch (e) {
    db.prepare('UPDATE orders SET delivered_at = NULL WHERE id = ?').run(orderId); // retry on next sweep
    logAccess(db, { type: 'system', action: 'delivery_error', orderId, detail: e.message });
    throw e;
  }
}

/** Deliver every signed order that has not been sent yet. */
async function processPending(ctx) {
  const ids = ctx.db.prepare("SELECT id FROM orders WHERE status != 'processing' AND delivered_at IS NULL ORDER BY signed_at").all();
  let sent = 0;
  for (const { id } of ids) {
    try { if (await deliverOrder(ctx, id)) sent++; } catch { /* logged; retried next sweep */ }
  }
  return sent;
}

/** Front-desk resend: always a brand-new link; older links are revoked. */
function resend(ctx, orderId, staff, req) {
  const { db, cfg } = ctx;
  const order = loadOrder(db, orderId);
  if (!order || order.status === 'processing') return { ok: false, error: 'Report is not signed yet' };
  const link = links.create(db, cfg, orderId, `staff:${staff.id}`);
  const res = messaging.sendReportLink(ctx, { order, mobile: order.mobile, link, sentBy: `staff:${staff.id}`, lang: accountLang(db, order.mobile) });
  logAccess(db, {
    type: 'staff', ref: staff.username, action: 'link_resent', orderId, req,
    detail: res.attempts.map((a) => `${a.channel}:${a.ok ? 'ok' : a.error}`).join(', '),
  });
  return res;
}

module.exports = { deliverOrder, processPending, resend, loadOrder };
