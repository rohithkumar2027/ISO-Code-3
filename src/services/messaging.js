'use strict';
// Messaging. The WhatsApp / SMS gateways are mocked (as the brief allows):
// the MockProvider keeps an in-memory outbox and simulates delivery.
// A real adapter only needs the same `send()` shape.
//
// Simulated behaviour, so staff screens show every state:
//   mobile ends 13 -> not on WhatsApp: WhatsApp fails, SMS fallback succeeds
//   mobile ends 99 -> invalid number: both channels fail
//   anything else  -> WhatsApp succeeds
// Tokens and OTPs are NOT written to the database: message rows hold status
// only. The full text lives in the in-memory outbox (shown only in demo mode).

const { nowIso } = require('../db');
const { maskMobile } = require('../lib/phone');

class MockProvider {
  constructor({ receiptDelayMs = 3000 } = {}) {
    this.outbox = [];
    this.seq = 0;
    this.receiptDelayMs = receiptDelayMs;
  }

  send({ channel, mobile, kind, body }) {
    if (mobile.endsWith('99')) return { ok: false, error: 'Number is not reachable' };
    if (mobile.endsWith('13') && channel === 'whatsapp') return { ok: false, error: 'Number is not on WhatsApp' };
    const id = ++this.seq;
    this.outbox.unshift({ id, at: nowIso(), channel, mobile, kind, body });
    if (this.outbox.length > 200) this.outbox.pop();
    return { ok: true, id };
  }

  lastOtp(mobile) {
    return this.outbox.find((m) => m.mobile === mobile && m.kind === 'otp')?.body.match(/\b(\d{6})\b/)?.[1] ?? null;
  }
}

function reportBody(cfg, orderId, url, lang = 'te') {
  const en = `${cfg.labName}: your report (order ${orderId}) is ready. Open it here: ${url} . The link works for 72 hours and asks for an OTP sent to this number.`;
  const te = `${cfg.labName}: మీ రిపోర్ట్ (ఆర్డర్ ${orderId}) సిద్ధంగా ఉంది. ఇక్కడ తెరవండి: ${url} . ఈ లింక్ 72 గంటలు పనిచేస్తుంది; ఈ నంబర్‌కు వచ్చే OTP అవసరం.`;
  const hi = `${cfg.labName}: आपकी रिपोर्ट (ऑर्डर ${orderId}) तैयार है। यहाँ खोलें: ${url} । लिंक 72 घंटे चलेगा और इस नंबर पर आने वाला OTP माँगेगा।`;
  return lang === 'hi' ? `${hi}\n${en}` : lang === 'en' ? en : `${te}\n${en}`;
}

function insertMessage(db, { orderId, mobile, kind, channel, linkId, sentBy }) {
  const now = nowIso();
  const info = db.prepare(`INSERT INTO messages (order_id, mobile, kind, channel, link_id, status, sent_by, created_at, updated_at)
                           VALUES (?,?,?,?,?,'queued',?,?,?)`).run(orderId, mobile, kind, channel, linkId, sentBy, now, now);
  return Number(info.lastInsertRowid);
}

function setStatus(db, id, status, error = null) {
  db.prepare('UPDATE messages SET status = ?, error = ?, updated_at = ? WHERE id = ?').run(status, error, nowIso(), id);
}

/**
 * Send the report link: WhatsApp first, SMS if WhatsApp fails.
 * Returns { ok, channel, attempts: [{channel, ok, error}] }.
 */
function sendReportLink({ db, cfg, provider }, { order, mobile, link, sentBy, lang }) {
  const body = reportBody(cfg, order.id, link.url, lang);
  const attempts = [];
  for (const channel of ['whatsapp', 'sms']) {
    const mid = insertMessage(db, { orderId: order.id, mobile, kind: 'report_link', channel, linkId: link.id, sentBy });
    const res = provider.send({ channel, mobile, kind: 'report_link', body });
    attempts.push({ channel, ok: res.ok, error: res.error ?? null });
    if (!res.ok) { setStatus(db, mid, 'failed', res.error); continue; }
    setStatus(db, mid, 'sent');
    // Simulated delivery receipt
    const markDelivered = () => { try { setStatus(db, mid, 'delivered'); } catch { /* db closed */ } };
    if (provider.receiptDelayMs <= 0) markDelivered();
    else setTimeout(markDelivered, provider.receiptDelayMs).unref();
    return { ok: true, channel, attempts };
  }
  return { ok: false, channel: null, attempts };
}

/** OTP over SMS. Throws if the gateway refuses so the caller can say so. */
function sendOtp({ db, cfg, provider }, { mobile, code }) {
  const mid = insertMessage(db, { orderId: null, mobile, kind: 'otp', channel: 'sms', linkId: null, sentBy: 'system' });
  const res = provider.send({
    channel: 'sms', mobile, kind: 'otp',
    body: `${code} is your ${cfg.labName} OTP. Valid 5 minutes. Do not share it with anyone.`,
  });
  setStatus(db, mid, res.ok ? 'sent' : 'failed', res.error ?? null);
  return res;
}

/** Latest delivery summary for an order, for staff screens. */
function deliveryStatus(db, orderId) {
  const rows = db.prepare(`SELECT channel, status, error, sent_by, created_at, updated_at, link_id
                           FROM messages WHERE order_id = ? AND kind = 'report_link' ORDER BY id DESC`).all(orderId);
  if (!rows.length) return { state: 'none', rows };
  const latestLink = rows[0].link_id;
  const mine = rows.filter((r) => r.link_id === latestLink);
  const good = mine.find((r) => r.status === 'delivered') ?? mine.find((r) => r.status === 'sent');
  return { state: good ? good.status : 'failed', channel: good?.channel ?? null, rows: mine, error: good ? null : mine[0].error };
}

module.exports = { MockProvider, reportBody, sendReportLink, sendOtp, deliveryStatus, maskMobile };
