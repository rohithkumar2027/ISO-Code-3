'use strict';
// Demo mode only: creates staff users with throw-away passwords (printed to the
// console, never stored in the repository) and drops the first sample export
// into the LIS folder so the watcher imports it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashPassword } = require('../lib/crypto');

// The sample CSVs carry fixed dates (2026-11-06..08). In demo mode they are
// shifted so the newest sign-off is "just now": the 90-day views stay populated
// whenever the demo is run, and the committed sample files stay unchanged.
const ANCHOR_MS = Date.parse('2026-11-08T12:30:00+05:30');
const IST_MS = 5.5 * 3600_000;
function shiftCsv(text, targetMs = Date.now()) {
  const delta = targetMs - ANCHOR_MS;
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})\b/g, (m, y, mo, d, h, mi) => {
    const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:00+05:30`) + delta;
    return new Date(t + IST_MS).toISOString().slice(0, 16).replace('T', ' ');
  });
}

const USERS = [
  ['frontdesk1', 'Front desk (demo)', 'frontdesk'],
  ['pathologist1', 'Pathologist (demo)', 'pathologist'],
  ['ops1', 'Operations head (demo)', 'ops'],
];

function seedDemo({ db, cfg }) {
  const have = db.prepare('SELECT COUNT(*) AS c FROM staff_users').get().c;
  if (!have) {
    const pw = process.env.DEMO_STAFF_PASSWORD || crypto.randomBytes(5).toString('hex');
    const ins = db.prepare('INSERT INTO staff_users (username, name, role, password_hash) VALUES (?,?,?,?)');
    for (const [u, n, r] of USERS) ins.run(u, n, r, hashPassword(pw));
    console.log(`Demo staff accounts created (password for all: ${pw})`);
    console.log(`  ${USERS.map(([u, , r]) => `${u} (${r})`).join(', ')}`);
  }
  const orders = db.prepare('SELECT COUNT(*) AS c FROM orders').get().c;
  if (!orders) {
    fs.mkdirSync(cfg.exportDir, { recursive: true });
    const text = fs.readFileSync(path.join(cfg.sampleDir, 'lis-export-1.csv'), 'utf8');
    fs.writeFileSync(path.join(cfg.exportDir, 'lis-export-1.csv'), shiftCsv(text));
  }
}

/** Demo helper used by the staff import page: drop the sign-off batch into the LIS folder. */
function dropSignoffBatch({ cfg }) {
  fs.mkdirSync(cfg.exportDir, { recursive: true });
  const dest = path.join(cfg.exportDir, `lis-export-2-signoff-${Date.now()}.csv`);
  fs.writeFileSync(dest, shiftCsv(fs.readFileSync(path.join(cfg.sampleDir, 'lis-export-2-signoff.csv'), 'utf8')));
  return path.basename(dest);
}

module.exports = { seedDemo, dropSignoffBatch, shiftCsv, USERS };
