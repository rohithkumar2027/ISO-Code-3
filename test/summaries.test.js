'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('../src/db');
const { importCsv } = require('../src/services/importer');
const S = require('../src/services/summaries');
const { TESTS, findTest } = require('../src/services/summaries/templates');
const { validate } = require('../src/services/summaries/ai');

const sampleCsv = fs.readFileSync(path.join(__dirname, '..', 'data', 'sample', 'lis-export-1.csv'), 'utf8');
const fresh = () => {
  const db = open(':memory:');
  importCsv(db, { text: sampleCsv, filename: 's.csv', source: 'upload' });
  return db;
};
const goodAi = {
  model: 'stub',
  generate: async ({ lang }) => ({
    en: 'Lipoprotein (a) is a type of fat particle in the blood. A result above the printed range can sometimes be linked to a higher chance of heart problems. Please show this report to your doctor.',
    te: 'ఇది రక్తంలోని ఒక రకమైన కొవ్వు కణం. ముద్రించిన పరిధి కంటే ఎక్కువగా ఉంటే కొన్నిసార్లు గుండె సమస్యల అవకాశం ఎక్కువ కావచ్చు. దయచేసి రిపోర్ట్‌ను మీ డాక్టర్‌కు చూపించండి.',
    hi: 'यह खून में मौजूद एक प्रकार का वसा कण है। छपी सीमा से अधिक होने पर कभी-कभी हृदय की समस्याओं की संभावना बढ़ सकती है। कृपया रिपोर्ट अपने डॉक्टर को दिखाएँ।',
  })[lang],
};

test('exactly 30 locked tests, each with low/high text in en, te and hi and no digits', () => {
  assert.equal(TESTS.length, 30);
  for (const t of TESTS) {
    for (const dir of ['low', 'high']) {
      for (const lang of ['en', 'te', 'hi']) {
        const s = t[dir]?.[lang];
        assert.ok(s && s.length > 30, `${t.key}.${dir}.${lang}`);
        assert.ok(!/[0-9]/.test(s.replace(/HbA1c|B12|T4/g, '')), `numeric value in ${t.key}.${dir}.${lang}`);
      }
    }
    for (const lang of ['en', 'te', 'hi']) assert.ok(t.name[lang], `${t.key} name ${lang}`);
  }
});

test('template matching is exact: look-alike names do not match', () => {
  assert.equal(findTest('Haemoglobin').key, 'haemoglobin');
  assert.equal(findTest('SGPT (ALT)').key, 'sgpt');
  assert.equal(findTest('LDL cholesterol').key, 'ldl');
  assert.equal(findTest('Total cholesterol').key, 'cholesterol');
  assert.equal(findTest('Lipoprotein (a)'), null);
  assert.equal(findTest('Non-HDL cholesterol'), null);
});

test('locked template tests never call the AI', async () => {
  const db = fresh();
  let calls = 0;
  const ai = { model: 'stub', generate: async () => { calls++; return 'x'; } };
  await S.generateForOrder({ db, ai }, 'ORD-71204'); // Hb and MCV are low
  assert.equal(calls, 0);
  const rows = db.prepare("SELECT * FROM summaries WHERE order_id='ORD-71204'").all();
  assert.equal(rows.length, 6); // 2 low values x 3 languages
  assert.ok(rows.every((r) => r.source === 'template'));
});

test('normal results get no summary', async () => {
  const db = fresh();
  assert.equal(await S.generateForOrder({ db, ai: null }, 'ORD-71250'), 0);
});

test('CRITICAL orders get no summary at all', async () => {
  const db = fresh();
  assert.equal(await S.generateForOrder({ db, ai: goodAi }, 'ORD-71233'), 0);
  assert.equal(db.prepare("SELECT COUNT(*) c FROM summaries WHERE order_id='ORD-71233'").get().c, 0);
});

test('unsigned (Processing) orders get no summary', async () => {
  const db = fresh();
  assert.equal(await S.generateForOrder({ db, ai: goodAi }, 'ORD-71219'), 0);
});

test('unlisted test + valid AI output is used and labelled "ai"', async () => {
  const db = fresh();
  await S.generateForOrder({ db, ai: goodAi }, 'ORD-71245');
  const lpa = db.prepare("SELECT s.* FROM summaries s JOIN results r ON r.id=s.result_id WHERE r.name LIKE 'Lipoprotein%' AND s.lang='en'").get();
  assert.equal(lpa.source, 'ai');
  assert.equal(lpa.model, 'stub');
});

test('unlisted test + AI unavailable, throwing, or misbehaving falls back to the safe sentence', async () => {
  const bad = [
    null,
    { generate: async () => { throw new Error('network down'); } },
    { generate: async () => 'You have cancer, take this tablet 500 mg. Definitely.' },
    { generate: async () => 'Short.' },
    { generate: async () => 42 },
  ];
  for (const ai of bad) {
    const db = fresh();
    await S.generateForOrder({ db, ai }, 'ORD-71245');
    const rows = db.prepare("SELECT s.* FROM summaries s JOIN results r ON r.id=s.result_id WHERE r.name LIKE 'Lipoprotein%'").all();
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.source === 'fallback' && r.text === S.fallbackText('high', r.lang)));
  }
});

test('generation is idempotent', async () => {
  const db = fresh();
  const first = await S.generateForOrder({ db, ai: null }, 'ORD-71245');
  assert.ok(first > 0);
  assert.equal(await S.generateForOrder({ db, ai: null }, 'ORD-71245'), 0);
});

test('validate() rejects digits, banned words, links, wrong language and missing referral', () => {
  const ok = 'This test measures a type of fat in the blood. A result above the range can sometimes matter for the heart. Please show this report to your doctor.';
  assert.ok(validate(ok, 'en').ok);
  assert.equal(validate(ok.replace('fat', 'fat 5'), 'en').reason, 'contains digits');
  assert.equal(validate(ok.replace('sometimes matter', 'definitely matter'), 'en').reason, 'banned wording');
  assert.equal(validate(ok + ' See www.example.com', 'en').reason, 'markup or link');
  assert.equal(validate(ok.replace('doctor', 'friend'), 'en').reason, 'no doctor referral');
  assert.equal(validate(ok, 'te').reason, 'wrong language');
  assert.equal(validate('<script>alert()</script> padding padding padding padding doctor', 'en').reason, 'markup or link');
  assert.equal(validate(undefined, 'en').ok, false);
});

test('patient flag hides the summary in every language; pathologist can approve or reject', async () => {
  const db = fresh();
  await S.generateForOrder({ db, ai: null }, 'ORD-71204');
  const hb = db.prepare("SELECT id FROM results WHERE order_id='ORD-71204' AND name='Haemoglobin'").get().id;
  const en = db.prepare('SELECT id FROM summaries WHERE result_id=? AND lang=?').get(hb, 'en').id;
  assert.ok(S.flag(db, en, '9000000001'));
  assert.deepEqual(db.prepare('SELECT DISTINCT status FROM summaries WHERE result_id=?').all(hb).map((r) => r.status), ['flagged']);
  assert.ok(S.flag(db, en, '9000000001')); // flagging twice is harmless
  assert.equal(db.prepare('SELECT COUNT(*) c FROM summary_flags').get().c, 1);

  assert.ok(S.review(db, hb, null, 'approve'));
  assert.deepEqual(db.prepare('SELECT DISTINCT status FROM summaries WHERE result_id=?').all(hb).map((r) => r.status), ['approved']);

  assert.ok(S.review(db, hb, null, 'reject'));
  const rejected = db.prepare('SELECT * FROM summaries WHERE result_id=?').all(hb);
  assert.ok(rejected.every((r) => r.status === 'rejected' && r.source === 'fallback' && r.text === S.fallbackText('low', r.lang)));
  assert.equal(S.review(db, hb, null, 'maybe'), false);
});
