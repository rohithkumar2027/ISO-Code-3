'use strict';
// Orchestrates a document broadcast: one uploaded PDF, sent as a secure
// 72h/OTP-gated link (see broadcastLinks.js) to a list of mobile numbers the
// doctor supplies. Deliberately mirrors the patient report-link delivery
// pattern (services/delivery.js, messaging.js) rather than attaching a raw
// file to a message — WhatsApp/SMS bodies are text, and sending a document
// nobody has to prove they're the right recipient for would break the
// "no report/document opened by the wrong person" rule the rest of this app
// is built around.
const { nowIso } = require('../db');
const { normalizeMobile } = require('../lib/phone');
const broadcastLinks = require('./broadcastLinks');
const { logAccess } = require('./audit');

/**
 * Pull candidate mobile numbers out of free-form or CSV-ish text (one per
 * line, or comma/semicolon/tab separated — however a doctor pastes or
 * exports them from Excel). A lone header-looking token ("mobile", "phone",
 * "number"...) is ignored rather than rejected, so pasting a one-column CSV
 * export works without the doctor having to strip the header by hand.
 */
function parseRecipients(text) {
  const HEADER_WORDS = new Set(['mobile', 'phone', 'number', 'mobile number', 'contact', 'patient mobile']);
  const tokens = String(text ?? '')
    .split(/[\n\r,;\t]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !HEADER_WORDS.has(t.toLowerCase()));

  const valid = [];
  const invalid = [];
  const seen = new Set();
  let duplicates = 0;
  for (const raw of tokens) {
    const m = normalizeMobile(raw);
    if (!m) { invalid.push(raw.slice(0, 40)); continue; }
    if (seen.has(m)) { duplicates++; continue; }
    seen.add(m);
    valid.push(m);
  }
  return { valid, invalid, duplicates, totalTokens: tokens.length };
}

function buildBody(cfg, document, url) {
  const en = `${cfg.labName}: a document "${document.name}" has been sent to you. Open it here: ${url} . The link works for 72 hours and asks for a one-time code sent to this number.`;
  const te = `${cfg.labName}: "${document.name}" మీకు పంపబడింది. ఇక్కడ తెరవండి: ${url} . ఈ లింక్ 72 గంటలు పనిచేస్తుంది; ఈ నంబర్‌కు వచ్చే కోడ్ అవసరం.`;
  return `${te}\n${en}`;
}

/**
 * @param {{db, cfg, provider}} ctx
 * @param {{documentId:number, title?:string, recipientsText:string, createdBy:string}} opts
 * @returns run summary + a capped preview of per-recipient outcomes
 */
function runBroadcast(ctx, { documentId, title, recipientsText, createdBy }) {
  const { db, cfg, provider } = ctx;
  const document = db.prepare('SELECT * FROM broadcast_documents WHERE id = ?').get(documentId);
  if (!document) { const e = new Error('Document not found'); e.code = 'not_found'; throw e; }

  const { valid, invalid, duplicates } = parseRecipients(recipientsText);
  if (!valid.length) { const e = new Error('No valid mobile numbers were found'); e.code = 'no_recipients'; throw e; }
  if (valid.length > cfg.maxBroadcastRecipients) {
    const e = new Error(`Too many recipients: ${valid.length}, the limit is ${cfg.maxBroadcastRecipients} per broadcast`);
    e.code = 'too_many'; throw e;
  }

  const now = nowIso();
  const runInfo = db.prepare(`INSERT INTO broadcast_runs (document_id, title, created_by, created_at, total, invalid, duplicate)
                              VALUES (?,?,?,?,?,?,?)`)
    .run(documentId, (title ?? '').slice(0, 120) || null, createdBy, now, valid.length, invalid.length, duplicates);
  const runId = Number(runInfo.lastInsertRowid);

  let sent = 0;
  let failed = 0;
  const recipients = [];
  for (const mobile of valid) {
    const link = broadcastLinks.create(db, cfg, { runId, documentId, mobile });
    const body = buildBody(cfg, document, link.url);
    let outcome = null;
    for (const channel of ['whatsapp', 'sms']) {
      const res = provider.send({ channel, mobile, kind: 'doc_link', body });
      if (res.ok) { outcome = { status: 'sent', channel }; break; }
      outcome = { status: 'failed', channel: null, error: res.error };
    }
    broadcastLinks.setSendResult(db, link.id, outcome);
    if (outcome.status === 'sent') sent++; else failed++;
    recipients.push({ mobile, ...outcome });
  }

  db.prepare('UPDATE broadcast_runs SET sent = ?, failed = ? WHERE id = ?').run(sent, failed, runId);
  logAccess(db, {
    type: 'staff', ref: createdBy, action: 'broadcast_sent',
    detail: `"${document.name}": ${sent} sent, ${failed} failed, ${invalid.length} invalid, ${duplicates} duplicate (of ${valid.length + invalid.length + duplicates} entries)`,
  });

  const run = db.prepare('SELECT * FROM broadcast_runs WHERE id = ?').get(runId);
  return { run, document, invalidSamples: invalid.slice(0, 20), recipients: recipients.slice(0, 500) };
}

module.exports = { parseRecipients, runBroadcast };
