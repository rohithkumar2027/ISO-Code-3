'use strict';
// Storage for doctor-uploaded broadcast documents (PDFs). Files live on disk
// under cfg.documentsDir, named by a random id so the original filename
// (which a browser/OS might render unsafely) never touches the filesystem.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nowIso } = require('../db');

const PDF_MAGIC = Buffer.from('%PDF-');

/** True if `buf` starts with a PDF header. Cheap, deliberate content check — not just the filename extension. */
const looksLikePdf = (buf) => Buffer.isBuffer(buf) && buf.length > PDF_MAGIC.length && buf.subarray(0, 5).equals(PDF_MAGIC);

function save(cfg, { buffer, originalName, name, description, createdBy }) {
  if (!looksLikePdf(buffer)) { const e = new Error('That file is not a PDF'); e.code = 'bad_file'; throw e; }
  fs.mkdirSync(cfg.documentsDir, { recursive: true });
  const filename = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  fs.writeFileSync(path.join(cfg.documentsDir, filename), buffer);
  return { filename, size: buffer.length, originalName: originalName.slice(0, 160), name: name.slice(0, 120), description: description?.slice(0, 500) ?? null, createdBy };
}

function insert(db, cfg, saved) {
  const now = nowIso();
  const info = db.prepare(`INSERT INTO broadcast_documents (name, description, filename, original_name, size, created_by, created_at)
                           VALUES (?,?,?,?,?,?,?)`)
    .run(saved.name, saved.description, saved.filename, saved.originalName, saved.size, saved.createdBy, now);
  return db.prepare('SELECT * FROM broadcast_documents WHERE id = ?').get(Number(info.lastInsertRowid));
}

function remove(db, cfg, id) {
  const doc = db.prepare('SELECT * FROM broadcast_documents WHERE id = ?').get(id);
  if (!doc) return { ok: false, reason: 'not_found' };
  const used = db.prepare('SELECT COUNT(*) c FROM broadcast_runs WHERE document_id = ?').get(id).c;
  if (used > 0) return { ok: false, reason: 'in_use' }; // keep the file so old links sent to patients still work
  db.prepare('DELETE FROM broadcast_documents WHERE id = ?').run(id);
  try { fs.unlinkSync(path.join(cfg.documentsDir, doc.filename)); } catch { /* already gone */ }
  return { ok: true };
}

const filePath = (cfg, doc) => path.join(cfg.documentsDir, doc.filename);

module.exports = { looksLikePdf, save, insert, remove, filePath };
