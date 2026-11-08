'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { shiftCsv } = require('../src/services/demo');
const { open } = require('../src/db');
const { importCsv } = require('../src/services/importer');

test('demo date shifting keeps order and puts the newest sign-off at the target time', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', 'lis-export-2-signoff.csv'), 'utf8');
  const target = Date.parse('2027-03-01T10:00:00+05:30');
  const out = shiftCsv(src, target);
  assert.match(out, /2027-03-01 09:50/);              // 12:20 on the anchor day -> ten minutes before target
  assert.ok(!/2026-11-08/.test(out));
  assert.equal(out.split('\n').length, src.split('\n').length);
  // still a valid export
  const db = open(':memory:');
  const r = importCsv(db, { text: out, filename: 'shifted.csv', source: 'upload' });
  assert.equal(r.ordersNew, 3);
});
