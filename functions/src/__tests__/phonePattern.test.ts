import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { containsPhoneNumber, redactPhoneNumbers } from '../phonePattern';
import { scrubPII } from '../geminiProxy';

/**
 * PRD מודול 22 §ב.2, מודול 3 §א, עיקרון ארכיטקטורה 1 (Zero-PII).
 *
 * `scrubPII` (שיח מורה-הנהלה) זיהה טלפון רק כשהיה בדיוק בצורה של תעודת זהות,
 * ושער ה-PII של ייצוא המחקר רק כ-`05X-XXXXXXX`. "050 123 4567", "+972501234567"
 * ושאר הצורות הנפוצות נשמרו ונשלחו כמו שהן.
 *
 * מנגד, שני הערוצים מלאים בחשבון — "מסננים מידע מזהה — לא הודעות" (מרשם
 * הסטיות). מספר עם פסיק אלפים, מספר של 3–4 ספרות, שבר עשרוני ותאריך עם שעה
 * אינם טלפון.
 */
const PHONES = [
  '050 123 4567',
  '050-123-4567',
  '+972501234567',
  '972-50-1234567',
  '+972 50 123 4567',
  '0501234567',
  '050.123.4567',
  '(050) 1234567',
  '02-1234567',
  '050-1234567',
];

const NOT_PHONES = [
  '7,651 − 3,381',
  '7,651 - 3,381 = 4,270',
  '1,245 ועוד 328',
  '4,553',
  '1573',
  '328',
  '1245 + 328 = 1573',
  'תלמיד 4 פתר 12 מתוך 15 תרגילים',
  '0.12345678',
  '05.10.2026 10:00',
  '0 1 2 3 4 5 6 7 8 9',
  '2026-09-28T10:00:00.000Z',
  '1727500000000',
  'session_08_student_4',
];

describe('every common Israeli phone layout is caught', () => {
  for (const phone of PHONES) {
    it(`"${phone}" — alone and inside a Hebrew sentence`, () => {
      expect(containsPhoneNumber(phone)).toBe(true);
      expect(redactPhoneNumbers(phone)).toBe('[REDACTED_PHONE]');
      expect(scrubPII(`אפשר להתקשר אליי ${phone} אחרי הצהריים`)).toBe('אפשר להתקשר אליי [REDACTED_PHONE] אחרי הצהריים');
    });
  }

  it('with a Hebrew prefix letter attached, after a colon, and followed by more numbers', () => {
    expect(scrubPII('התקשרי ל0501234567')).toBe('התקשרי ל[REDACTED_PHONE]');
    expect(scrubPII('טלפון:050-123-4567')).toBe('טלפון:[REDACTED_PHONE]');
    expect(scrubPII('050-123-4567 ויש 12 ילדים')).toBe('[REDACTED_PHONE] ויש 12 ילדים');
  });
});

describe('arithmetic and ordinary numbers are left alone', () => {
  for (const text of NOT_PHONES) {
    it(`"${text}"`, () => {
      expect(containsPhoneNumber(text)).toBe(false);
      expect(redactPhoneNumbers(text)).toBe(text);
      // (scrubPII's older 9-digit ID rule is its own business; no phone is invented.)
      expect(scrubPII(text)).not.toContain('[REDACTED_PHONE]');
    });
  }

  it('a real teacher message about an exercise keeps every number', () => {
    const msg = 'תלמיד 7 כתב 7,651 − 3,381 = 4,370 ובתרגיל 1,245 ועוד 328 קיבל 1,573';
    expect(scrubPII(msg)).toBe(msg);
  });

  it('the shared regex keeps no state between calls', () => {
    expect(containsPhoneNumber('050-123-4567')).toBe(true);
    expect(containsPhoneNumber('050-123-4567')).toBe(true);
    expect(containsPhoneNumber('4,553')).toBe(false);
  });
});

describe('one pattern for both callers', () => {
  const gemini = readFileSync(resolve(__dirname, '../geminiProxy.ts'), 'utf-8');
  const exporter = readFileSync(resolve(__dirname, '../exportDriveReport.ts'), 'utf-8');

  it('scrubPII and the research-export gate both use phonePattern.ts', () => {
    expect(gemini).toContain('import { redactPhoneNumbers } from "./phonePattern";');
    expect(gemini).toContain('scrubbed = redactPhoneNumbers(scrubbed);');
    expect(exporter).toContain('import { containsPhoneNumber } from "./phonePattern";');
    // The gate lives in researchFilesContainPii since 2.10.2026 (audit M-export).
    expect(exporter).toContain('return piiRegex.test(content) || containsPhoneNumber(content);');
    expect(exporter).toContain('if (researchFilesContainPii(allContent)) {');
    // The old narrow phone pattern is gone from the gate.
    expect(exporter).not.toContain('05\\d-?\\d{7}');
  });
});
