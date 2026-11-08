'use strict';
// Numbers for the operations head. All derived from tables we already keep.

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const istDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD

function deliveryReport(db, days) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const orders = db.prepare(`SELECT id, signed_at FROM orders WHERE status != 'processing' AND signed_at >= ?`).all(since);

  const sentSet = new Set(db.prepare(`SELECT DISTINCT order_id FROM messages WHERE kind='report_link' AND status IN ('sent','delivered')`).all().map((r) => r.order_id));
  const anyMsg = new Set(db.prepare(`SELECT DISTINCT order_id FROM messages WHERE kind='report_link'`).all().map((r) => r.order_id));
  const openedRows = db.prepare(`SELECT order_id, MIN(at) AS first FROM access_log WHERE action IN ('link_otp_verified','report_viewed') AND order_id IS NOT NULL GROUP BY order_id`).all();
  const opened = new Map(openedRows.map((r) => [r.order_id, r.first]));

  let digital = 0; let openedN = 0; let failed = 0;
  const hours = [];
  const byDay = new Map();
  for (const o of orders) {
    const day = istDay(o.signed_at);
    const d = byDay.get(day) ?? { day, signed: 0, delivered: 0, opened: 0, failed: 0 };
    d.signed++;
    if (sentSet.has(o.id)) {
      digital++; d.delivered++;
      if (opened.has(o.id)) {
        openedN++; d.opened++;
        hours.push((Date.parse(opened.get(o.id)) - Date.parse(o.signed_at)) / 3600_000);
      }
    } else if (anyMsg.has(o.id)) { failed++; d.failed++; }
    byDay.set(day, d);
  }

  const one = (sql, ...a) => db.prepare(sql).get(...a).c;
  const cb = db.prepare(`SELECT created_at, done_at FROM tasks WHERE status='done' AND done_at >= ?`).all(since);
  const cbHours = cb.length ? cb.reduce((t, r) => t + (Date.parse(r.done_at) - Date.parse(r.created_at)) / 3600_000, 0) / cb.length : null;

  return {
    days,
    m: {
      signed: orders.length, digital, opened: openedN, failed,
      medianHours: round1(median(hours.filter((h) => h >= 0))),
      resends: one("SELECT COUNT(*) c FROM access_log WHERE action='link_resent' AND at >= ?", since),
      callbacksOpen: one("SELECT COUNT(*) c FROM tasks WHERE status='open'"),
      callbackHours: round1(cbHours),
      otpFailed: one("SELECT COUNT(*) c FROM access_log WHERE action='otp_failed' AND at >= ?", since),
      linksExpiredHits: one("SELECT COUNT(*) c FROM access_log WHERE action IN ('link_expired','link_revoked','link_unknown') AND at >= ?", since),
      flagged: one("SELECT COUNT(DISTINCT result_id) c FROM summaries s WHERE s.status='flagged' OR EXISTS (SELECT 1 FROM summary_flags f JOIN summaries x ON x.id=f.summary_id WHERE x.result_id=s.result_id AND f.created_at >= ?)", since),
      sumTemplate: one("SELECT COUNT(*) c FROM summaries WHERE lang='en' AND source='template' AND created_at >= ?", since),
      sumAi: one("SELECT COUNT(*) c FROM summaries WHERE lang='en' AND source='ai' AND created_at >= ?", since),
      sumFallback: one("SELECT COUNT(*) c FROM summaries WHERE lang='en' AND source='fallback' AND created_at >= ?", since),
    },
    daily: [...byDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1)),
  };
}

module.exports = { deliveryReport, median };
