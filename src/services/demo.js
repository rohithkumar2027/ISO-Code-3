'use strict';
// Demo mode only: creates staff users with throw-away passwords (printed to the
// console, never stored in the repository) and drops the first sample export
// into the LIS folder so the watcher imports it.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashPassword } = require('../lib/crypto');

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
    fs.copyFileSync(path.join(cfg.sampleDir, 'lis-export-1.csv'), path.join(cfg.exportDir, 'lis-export-1.csv'));
  }
}

/** Demo helper used by the staff import page: drop the sign-off batch into the LIS folder. */
function dropSignoffBatch({ cfg }) {
  fs.mkdirSync(cfg.exportDir, { recursive: true });
  const dest = path.join(cfg.exportDir, `lis-export-2-signoff-${Date.now()}.csv`);
  fs.copyFileSync(path.join(cfg.sampleDir, 'lis-export-2-signoff.csv'), dest);
  return path.basename(dest);
}

module.exports = { seedDemo, dropSignoffBatch, USERS };
