'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('../src/db');
const { importCsv } = require('../src/services/importer');

const HEAD = 'Order ID,Patient,Parameter,Result,Reference Range,Status,Referring Doctor,Mobile,Age,Sex,Collected At,Signed At\n';
const sample = (f) => fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', f), 'utf8');
const imp = (db, text) => importCsv(db, { text, filename: 't.csv', source: 'upload' });

test('imports the sample export and applies rule-based flags', () => {
  const db = open(':memory:');
  const r = imp(db, sample('lis-export-1.csv'));
  assert.equal(r.rowsFailed, 0, JSON.stringify(r.errors));
  assert.equal(r.ordersNew, 11);
  assert.equal(r.ordersSigned, 9); // two orders still Processing
  const hb = db.prepare("SELECT * FROM results WHERE order_id='ORD-71204' AND name='Haemoglobin'").get();
  assert.equal(hb.flag, 'low');
  assert.equal(hb.unit, 'g/dL');
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='ORD-71233'").get().status, 'ready_critical');
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='ORD-71219'").get().status, 'processing');
  assert.equal(db.prepare("SELECT signed_at FROM orders WHERE id='ORD-71219'").get().signed_at, null);
});

test('one mobile can cover a family: two patients share a number', () => {
  const db = open(':memory:');
  imp(db, sample('lis-export-1.csv'));
  const names = db.prepare("SELECT name FROM patients WHERE mobile='9000000001' ORDER BY name").all().map((p) => p.name);
  assert.deepEqual(names, ['Lakshmi Prasanna K', 'Venkata Rao M']);
});

test('re-importing the same file changes nothing (idempotent)', () => {
  const db = open(':memory:');
  imp(db, sample('lis-export-1.csv'));
  const r2 = imp(db, sample('lis-export-1.csv'));
  assert.equal(r2.ordersNew, 0);
  assert.equal(r2.ordersSigned, 0);
  assert.equal(r2.errors.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM orders').get().c, 11);
});

test('a later export signs a Processing order exactly once', () => {
  const db = open(':memory:');
  imp(db, sample('lis-export-1.csv'));
  const r = imp(db, sample('lis-export-2-signoff.csv'));
  assert.equal(r.ordersSigned, 3); // 71219, 71260 transition; 71270 is new + signed
  assert.equal(db.prepare("SELECT status FROM orders WHERE id='ORD-71219'").get().status, 'ready');
  const again = imp(db, sample('lis-export-2-signoff.csv'));
  assert.equal(again.ordersSigned, 0);
});

test('bad rows reject only their own order and are reported with a line number', () => {
  const db = open(':memory:');
  const r = imp(db, sample('lis-export-2-signoff.csv'));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM orders WHERE id IN ('ORD-71271','ORD-71272')").get().c, 0);
  assert.ok(r.errors.some((e) => e.order === 'ORD-71271' && /Mobile/.test(e.message) && e.line === 10));
  assert.ok(r.errors.some((e) => e.order === 'ORD-71272' && /Status/.test(e.message)));
  assert.equal(db.prepare("SELECT COUNT(*) c FROM orders WHERE id='ORD-71270'").get().c, 1);
});

test('an order with one bad row is not imported partially', () => {
  const db = open(':memory:');
  const text = HEAD +
    'ORD-90001,Test One,Haemoglobin g/dL,12,12-15,Ready,Dr A,9000000001,30,F,,\n' +
    'ORD-90001,Test One,Platelets 10^3/µL,abc,150-410,Bogus,Dr A,9000000001,30,F,,\n';
  const r = imp(db, text);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM orders').get().c, 0);
  assert.equal(r.ordersNew, 0);
  assert.ok(r.errors.length >= 1);
});

test('rows of one order that disagree on mobile are rejected', () => {
  const db = open(':memory:');
  const r = imp(db, HEAD +
    'ORD-90002,Test Two,Haemoglobin g/dL,12,12-15,Ready,Dr A,9000000001,30,F,,\n' +
    'ORD-90002,Test Two,Calcium mg/dL,9,8.6-10.2,Ready,Dr A,9000000002,30,F,,\n');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM orders').get().c, 0);
  assert.ok(r.errors.some((e) => /disagree/.test(e.message)));
});

test('a signed order is never silently changed by a later export', () => {
  const db = open(':memory:');
  imp(db, HEAD + 'ORD-90003,Test Three,Haemoglobin g/dL,12,12-15,Ready,Dr A,9000000001,30,F,,\n');
  const r = imp(db, HEAD + 'ORD-90003,Test Three,Haemoglobin g/dL,9,12-15,Ready,Dr A,9000000009,30,F,,\n');
  assert.ok(r.errors.some((e) => /not changed/.test(e.message)));
  assert.equal(db.prepare("SELECT value_raw FROM results WHERE order_id='ORD-90003'").get().value_raw, '12');
  assert.equal(db.prepare("SELECT p.mobile FROM orders o JOIN patients p ON p.id=o.patient_id WHERE o.id='ORD-90003'").get().mobile, '9000000001');
});

test('unusable files fail loudly: missing columns, header only, truncated quotes', () => {
  const db = open(':memory:');
  assert.throws(() => imp(db, 'Order ID,Patient\nORD-1,x\n'), /Missing column/);
  assert.throws(() => imp(db, HEAD), /no data rows/);
  assert.throws(() => imp(db, HEAD + 'ORD-90004,"Test,Haemoglobin\n'), /Unterminated/);
});

test('header names are matched case-insensitively and control characters are stripped', () => {
  const db = open(':memory:');
  const text = 'order id,patient,parameter,result,reference range,status,referring doctor,mobile\n' +
    'ord-90005,Test\u0007  Five,Haemoglobin g/dL,12,12-15,ready,Dr A,+91 90000 00001\n';
  const r = imp(db, text);
  assert.equal(r.rowsFailed, 0, JSON.stringify(r.errors));
  assert.equal(db.prepare("SELECT name FROM patients").get().name, 'Test Five');
});
