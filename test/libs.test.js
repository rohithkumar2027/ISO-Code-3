'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { html, raw } = require('../src/lib/html');
const { normalizeMobile, maskMobile } = require('../src/lib/phone');
const { parseCsv, parseCsvObjects } = require('../src/lib/csv');
const { hashPassword, verifyPassword, safeEqual, newOtp, newToken } = require('../src/lib/crypto');

test('html escapes interpolations but not nested html or raw()', () => {
  const evil = '<script>alert("x")</script>';
  assert.equal(String(html`<p>${evil}</p>`), '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>');
  assert.equal(String(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`), '<ul><li>1</li><li>2</li></ul>');
  assert.equal(String(html`${raw('<b>ok</b>')}`), '<b>ok</b>');
  assert.equal(String(html`${false}${null}${undefined}`), '');
});

test('normalizeMobile accepts common Indian formats and rejects junk', () => {
  for (const ok of ['9000000001', '+91 90000-00001', '919000000001', '09000000001', '0919000000001']) {
    assert.equal(normalizeMobile(ok), '9000000001', ok);
  }
  for (const bad of ['', '12345', '5000000001', '90000000011', 'abcdefghij', null]) {
    assert.equal(normalizeMobile(bad), null, String(bad));
  }
  assert.equal(maskMobile('9000000001'), '+91 ••••• ••001');
});

test('parseCsv handles quotes, commas, CRLF, BOM and blank lines', () => {
  const text = '﻿A,B,C\r\n1,"x, y",3\r\n\r\n"he said ""hi""",,z\r\n';
  assert.deepEqual(parseCsv(text), [['A', 'B', 'C'], ['1', 'x, y', '3'], ['he said "hi"', '', 'z']]);
  const { headers, records } = parseCsvObjects('Id,Name\n1, Ann \n');
  assert.deepEqual(headers, ['Id', 'Name']);
  assert.equal(records[0].Name, 'Ann');
  assert.equal(records[0].__line, 2);
});

test('parseCsv rejects a truncated quoted field', () => {
  assert.throws(() => parseCsv('A,B\n1,"oops\n'), /Unterminated/);
});

test('passwords hash with salt and verify; tampering fails', () => {
  const h = hashPassword('correct horse');
  assert.ok(verifyPassword('correct horse', h));
  assert.ok(!verifyPassword('wrong', h));
  assert.notEqual(h, hashPassword('correct horse'));
  assert.ok(!verifyPassword('x', 'garbage'));
});

test('otp and token generators have the right shape; safeEqual is length-safe', () => {
  for (let i = 0; i < 50; i++) assert.match(newOtp(), /^\d{6}$/);
  assert.match(newToken(), /^[A-Za-z0-9_-]{43}$/);
  assert.ok(safeEqual('abc', 'abc'));
  assert.ok(!safeEqual('abc', 'abcd'));
});
