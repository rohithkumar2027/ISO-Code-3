'use strict';
// AI-written explanations, used ONLY for out-of-range tests that have no
// locked template. The AI never decides whether a value is out of range (rules
// do that) and never sees the patient's identity, the value or the report:
// it receives only the test name, the direction and the language.
//
// Every answer is validated. Anything that fails validation is discarded and
// the caller falls back to the generic safe sentence.

const SCRIPT = { te: /[ఀ-౿]/g, hi: /[ऀ-ॿ]/g };
const LANG_NAME = { en: 'English', te: 'Telugu', hi: 'Hindi' };

// Words an explanation must never contain. Checked on English output only
// (Telugu/Hindi output is checked for script and digits).
const BANNED_EN = /\b(you have|you are suffering|diagnos\w*|cancer|tumou?r|tablet|capsule|medicine|medication|dose|prescri\w*|definitely|certainly|emergency|life[- ]threatening|dangerous|fatal)\b/i;

const SYSTEM = [
  'You explain ONE blood test result to a patient with no medical training.',
  'Write one or two calm, plain sentences, at most 40 words, in the language requested.',
  'Say what the test measures and what a result outside the printed reference range can sometimes mean, using words like "can" or "may".',
  'Do not diagnose. Do not say the patient has a disease. Do not recommend medicines, doses, or diet changes.',
  'Do not write any numbers or digits. Do not mention the patient.',
  'End by asking the patient to show the report to their doctor.',
  'Reply with JSON only: {"text":"..."}',
].join(' ');

/** Returns { ok:true, text } or { ok:false, reason }. Pure, so it is unit-tested. */
function validate(output, lang) {
  let text = output;
  if (typeof text !== 'string') return { ok: false, reason: 'not a string' };
  text = text.trim().replace(/\s+/g, ' ');
  if (text.length < 30 || text.length > 420) return { ok: false, reason: 'length' };
  if (/[0-9౦-౯०-९]/.test(text)) return { ok: false, reason: 'contains digits' };
  if (/[<>{}\[\]]|https?:|www\./i.test(text)) return { ok: false, reason: 'markup or link' };
  if (lang === 'en') {
    if (BANNED_EN.test(text)) return { ok: false, reason: 'banned wording' };
    if (!/\bdoctor\b/i.test(text)) return { ok: false, reason: 'no doctor referral' };
    if ((text.match(/[A-Za-z]/g) || []).length < text.length * 0.6) return { ok: false, reason: 'wrong language' };
  } else {
    const hits = (text.match(SCRIPT[lang]) || []).length;
    const letters = text.replace(/[\s.,;:!?()'"\-–—।]/g, '').length;
    if (hits < letters * 0.6) return { ok: false, reason: 'wrong language' };
  }
  return { ok: true, text };
}

/** Real client (Anthropic Messages API over fetch; no SDK dependency). */
function createClient(aiCfg, fetchImpl = globalThis.fetch) {
  if (!aiCfg.key) return null;
  return {
    model: aiCfg.model,
    async generate({ name, direction, lang }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), aiCfg.timeoutMs);
      try {
        const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-api-key': aiCfg.key, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: aiCfg.model,
            max_tokens: 300,
            temperature: 0,
            system: SYSTEM,
            messages: [{
              role: 'user',
              content: JSON.stringify({ test: name, result_is: `${direction} than the printed reference range`, language: LANG_NAME[lang] }),
            }],
          }),
        });
        if (!res.ok) throw new Error(`AI HTTP ${res.status}`);
        const data = await res.json();
        const raw = data?.content?.find((c) => c.type === 'text')?.text ?? '';
        const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
        return json.text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

module.exports = { validate, createClient, SYSTEM, BANNED_EN };
