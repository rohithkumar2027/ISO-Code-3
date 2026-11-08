'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { splitParameter, parseRange, parseValue, flagFor, evaluate, mapStatus } = require('../src/services/rules');

test('splitParameter separates a trailing unit only', () => {
  assert.deepEqual(splitParameter('Haemoglobin g/dL'), { name: 'Haemoglobin', unit: 'g/dL' });
  assert.deepEqual(splitParameter('LDL cholesterol mg/dL'), { name: 'LDL cholesterol', unit: 'mg/dL' });
  assert.deepEqual(splitParameter('Potassium mmol/L'), { name: 'Potassium', unit: 'mmol/L' });
  assert.deepEqual(splitParameter('MCV fL'), { name: 'MCV', unit: 'fL' });
  assert.deepEqual(splitParameter('Neutrophils %'), { name: 'Neutrophils', unit: '%' });
  assert.deepEqual(splitParameter('Blood Group'), { name: 'Blood Group', unit: null });
  assert.deepEqual(splitParameter('TSH'), { name: 'TSH', unit: null });
});

test('parseRange understands bands, one-sided limits and dash variants', () => {
  assert.deepEqual(parseRange('12.0-15.5'), { low: 12, high: 15.5 });
  assert.deepEqual(parseRange('3.5 – 5.1'), { low: 3.5, high: 5.1 });
  assert.deepEqual(parseRange('0-100'), { low: 0, high: 100 });
  assert.deepEqual(parseRange('<5.7'), { low: null, high: 5.7 });
  assert.deepEqual(parseRange('≤ 200'), { low: null, high: 200 });
  assert.deepEqual(parseRange('>40'), { low: 40, high: null });
  assert.equal(parseRange('Negative'), null);
  assert.equal(parseRange('15-12'), null);
  assert.equal(parseRange(''), null);
});

test('flagFor uses inclusive range limits', () => {
  const r = { low: 12, high: 15.5 };
  assert.equal(flagFor(12, r), 'normal');
  assert.equal(flagFor(15.5, r), 'normal');
  assert.equal(flagFor(11.99, r), 'low');
  assert.equal(flagFor(15.51, r), 'high');
  assert.equal(flagFor(null, r), 'unknown');
  assert.equal(flagFor(10, null), 'unknown');
  assert.equal(flagFor(500, { low: null, high: 100 }), 'high');
});

test('evaluate reproduces the three sample rows from the brief', () => {
  assert.deepEqual(evaluate('Haemoglobin g/dL', '10.2', '12.0-15.5'),
    { name: 'Haemoglobin', unit: 'g/dL', valueNum: 10.2, refLow: 12, refHigh: 15.5, flag: 'low' });
  assert.equal(evaluate('LDL cholesterol mg/dL', '142', '0-100').flag, 'high');
  assert.equal(evaluate('Potassium mmol/L', '6.8', '3.5-5.1').flag, 'high');
});

test('non-numeric results are never flagged by rules', () => {
  assert.equal(evaluate('HIV', 'Non-reactive', 'Non-reactive').flag, 'unknown');
  assert.equal(evaluate('CRP mg/L', '<0.5', '0-5').flag, 'unknown');
  assert.equal(parseValue('1,250'), 1250);
});

test('mapStatus maps LIS statuses and rejects unknown ones', () => {
  assert.equal(mapStatus('Ready'), 'ready');
  assert.equal(mapStatus(' ready (critical) '), 'ready_critical');
  assert.equal(mapStatus('PROCESSING'), 'processing');
  assert.equal(mapStatus('Cancelled'), null);
});
