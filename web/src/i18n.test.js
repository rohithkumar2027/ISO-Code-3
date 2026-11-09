import { describe, expect, test } from 'vitest';
import { t, errText, LANGS } from './i18n';

describe('t()', () => {
  test('fills placeholders and falls back to English for a missing language', () => {
    expect(t('en', 'signed_on', { d: '7 Nov 2026' })).toBe('Signed 7 Nov 2026');
    expect(t('xx', 'brand')).toBe('Reports'); // unknown language -> English
  });

  test('every patient-facing key exists in all three languages', () => {
    for (const key of ['login_title', 'verify_title', 'consent_title', 'reports_title', 'standout', 'critical_title']) {
      for (const lang of LANGS) {
        expect(t(lang, key)).not.toBe(key); // t() returns the raw key only when nothing matched
        expect(t(lang, key).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('errText()', () => {
  test('maps server error codes to a translated, non-empty message', () => {
    for (const lang of LANGS) {
      expect(errText(lang, 'locked')).not.toBe('');
      expect(errText(lang, 'invalid')).not.toBe(errText(lang, 'locked'));
    }
  });

  test('fills the wait-seconds placeholder and falls back to a generic message for an unknown code', () => {
    expect(errText('en', 'wait', { n: 42 })).toMatch(/42/);
    expect(errText('en', 'something_new')).toBe('Something went wrong. Please try again.');
  });
});
