'use strict';
// Plain-language summaries for out-of-range values.
//
// Decision order for every out-of-range result (flags come from rules):
//   critical order            -> NO summary at all; staff callback task instead
//   locked template (30 tests)-> template text, no AI involved
//   other test + AI available -> AI text, validated; if it fails -> fallback
//   otherwise                 -> generic safe fallback
// Patients can flag any summary; a flagged summary is hidden until a
// pathologist approves or rejects it.

const { nowIso } = require('../../db');
const { findTest, FALLBACK, LANGS } = require('./templates');
const { validate } = require('./ai');

const FOOTER = {
  en: 'This is a simple explanation to help you understand your report. It is not a diagnosis. Your doctor will advise you.',
  te: 'ఇది మీ రిపోర్ట్‌ను అర్థం చేసుకోవడానికి ఇచ్చిన సరళమైన వివరణ మాత్రమే. ఇది వ్యాధి నిర్ధారణ కాదు. మీ డాక్టర్ సలహా ఇస్తారు.',
  hi: 'यह आपकी रिपोर्ट को समझने में मदद के लिए एक सरल व्याख्या है। यह रोग की पहचान नहीं है। आपके डॉक्टर सलाह देंगे।',
};

function templateText(testName, direction, lang) {
  const t = findTest(testName);
  return t ? t[direction][lang] : null;
}

const fallbackText = (direction, lang) => FALLBACK[direction][lang];

/** Localised display name for a test, or null if there is no locked name. */
function localName(testName, lang) {
  const t = findTest(testName);
  return t && lang !== 'en' ? t.name[lang] : null;
}

/**
 * Create summaries for an order's out-of-range results. Idempotent.
 * `ai` is an object with generate({name,direction,lang}) or null.
 * @returns {Promise<number>} number of summaries created
 */
async function generateForOrder({ db, ai }, orderId) {
  const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status !== 'ready') return 0; // critical orders get no summary, by design
  const rows = db.prepare("SELECT * FROM results WHERE order_id = ? AND flag IN ('low','high') ORDER BY position").all(orderId);
  const ins = db.prepare(`INSERT OR IGNORE INTO summaries (order_id, result_id, lang, text, source, model, created_at)
                          VALUES (?,?,?,?,?,?,?)`);
  let created = 0;
  for (const r of rows) {
    const jobs = LANGS.map(async (lang) => {
      const have = db.prepare('SELECT 1 FROM summaries WHERE result_id = ? AND lang = ?').get(r.id, lang);
      if (have) return null;
      const locked = templateText(r.name, r.flag, lang);
      if (locked) return { lang, text: locked, source: 'template', model: null };
      if (ai) {
        try {
          const out = validate(await ai.generate({ name: r.name, direction: r.flag === 'low' ? 'lower' : 'higher', lang }), lang);
          if (out.ok) return { lang, text: out.text, source: 'ai', model: ai.model ?? null };
        } catch { /* fall through to the safe sentence */ }
      }
      return { lang, text: fallbackText(r.flag, lang), source: 'fallback', model: null };
    });
    for (const j of await Promise.all(jobs)) {
      if (!j) continue;
      ins.run(orderId, r.id, j.lang, j.text, j.source, j.model, nowIso());
      created++;
    }
  }
  return created;
}

/** Summaries for display: map of result_id -> row for one language. */
function forOrder(db, orderId, lang) {
  const out = new Map();
  for (const s of db.prepare('SELECT * FROM summaries WHERE order_id = ? AND lang = ?').all(orderId, lang)) out.set(s.result_id, s);
  return out;
}

/** A patient says "this looks wrong": hide it in every language until reviewed. */
function flag(db, summaryId, mobile) {
  const s = db.prepare('SELECT * FROM summaries WHERE id = ?').get(summaryId);
  if (!s) return false;
  db.prepare('INSERT OR IGNORE INTO summary_flags (summary_id, mobile, created_at) VALUES (?,?,?)').run(summaryId, mobile, nowIso());
  db.prepare("UPDATE summaries SET status = 'flagged' WHERE result_id = ? AND status IN ('shown','approved')").run(s.result_id);
  return true;
}

/**
 * Pathologist decision for a result (all three languages together).
 * approve -> shown with a "checked" mark; reject -> replaced by the generic safe sentence.
 */
function review(db, resultId, staffId, decision) {
  const r = db.prepare('SELECT flag FROM results WHERE id = ?').get(resultId);
  if (!r) return false;
  const now = nowIso();
  if (decision === 'approve') {
    db.prepare("UPDATE summaries SET status = 'approved', reviewed_by = ?, reviewed_at = ? WHERE result_id = ?").run(staffId, now, resultId);
  } else if (decision === 'reject') {
    for (const lang of LANGS) {
      db.prepare(`UPDATE summaries SET text = ?, source = 'fallback', model = NULL, status = 'rejected', reviewed_by = ?, reviewed_at = ?
                  WHERE result_id = ? AND lang = ?`).run(fallbackText(r.flag, lang), staffId, now, resultId, lang);
    }
  } else return false;
  return true;
}

module.exports = { generateForOrder, forOrder, flag, review, templateText, fallbackText, localName, FOOTER };
