import { describe, it, expect } from 'vitest';
import { containsPhoneNumber, redactPhoneNumbers } from '../phonePattern';
import {
  containsPhoneNumber as serverContains,
  redactPhoneNumbers as serverRedact,
} from '../../../../../functions/src/phonePattern';
import { containsPII, sanitizePII, validateChatInputForPII, anonymizeChatMessageBody } from '../PiiFilter';
import { sanitizeChatText } from '@/application/useChatStore';

/**
 * PRD Module 22 §ב.1 (the client-side chat filter blocks phone numbers), Module 3 §א,
 * invariant 1 (Zero-PII).
 *
 * The client's phone rule caught only `05X-XXXXXXX`, `0X-XXXXXXX` and bare digit
 * runs. "050 123 4567", "+972501234567" and the other common layouts went through
 * the chat's send check and through `sanitizeChatText` as typed. The server already
 * had the full rule (functions/src/phonePattern.ts, #133); the client now has the
 * same one, and the arithmetic a third-grader writes to the teacher is untouched.
 */
const PHONES = [
  '050 123 4567',
  '050-123-4567',
  '+972501234567',
  '972-50-1234567',
  '+972 50 123 4567',
  '050.123.4567',
  '(050) 1234567',
  '0501234567',
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
  '340 = 300 + 40',
  'תלמיד 4 פתר 12 מתוך 15 תרגילים',
  '0.12345678',
  '3.14',
  '05.10.2026 10:00',
  '28.9.2026',
  '2026-09-28',
  '0 1 2 3 4 5 6 7 8 9',
  '2026-09-28T10:00:00.000Z',
  '1727500000000',
  'session_08_student_4',
];

describe('every phone layout of the requirement is caught on the client', () => {
  for (const phone of PHONES) {
    it(`"${phone}" — blocked at send, redacted in storage, alone and inside a sentence`, () => {
      const sentence = `אפשר להתקשר אליי ${phone} אחרי הצהריים`;
      expect(containsPhoneNumber(phone)).toBe(true);
      expect(redactPhoneNumbers(phone)).toBe('[PHONE_REDACTED]');

      // The chat's send check (StudentChatOverlay → validateChatInputForPII).
      const check = validateChatInputForPII(sentence);
      expect(check.valid).toBe(false);
      expect(check.errorHe).toContain('מספר טלפון');

      // The store's scrub before any write, and the anonymizer.
      expect(sanitizeChatText(sentence)).toBe('אפשר להתקשר אליי [PHONE_REDACTED] אחרי הצהריים');
      expect(anonymizeChatMessageBody(sentence)).toBe('אפשר להתקשר אליי [PHONE_REDACTED] אחרי הצהריים');
      expect(sanitizePII(sentence)).toBe('אפשר להתקשר אליי [PHONE_REDACTED] אחרי הצהריים');
      expect(containsPII(sentence)).toBe(true);
    });
  }

  it('with a Hebrew prefix letter attached, after a colon, and followed by more numbers', () => {
    expect(sanitizeChatText('התקשרי ל0501234567')).toBe('התקשרי ל[PHONE_REDACTED]');
    expect(sanitizeChatText('טלפון:050-123-4567')).toBe('טלפון:[PHONE_REDACTED]');
    expect(sanitizeChatText('050-123-4567 ויש 12 ילדים')).toBe('[PHONE_REDACTED] ויש 12 ילדים');
  });
});

describe('arithmetic, decimals and dates are left alone', () => {
  for (const text of NOT_PHONES) {
    it(`"${text}"`, () => {
      expect(containsPhoneNumber(text)).toBe(false);
      expect(redactPhoneNumbers(text)).toBe(text);
      expect(validateChatInputForPII(text).valid).toBe(true);
      expect(sanitizeChatText(text)).not.toContain('[PHONE_REDACTED]');
      expect(sanitizePII(text)).not.toContain('[PHONE_REDACTED]');
    });
  }

  it('a child\'s question about an exercise is sent as written', () => {
    const msg = 'המורה, בתרגיל 7,651 − 3,381 יצא לי 4,270 ובתרגיל 1,245 ועוד 328 יצא 1,573';
    expect(validateChatInputForPII(msg).valid).toBe(true);
    expect(sanitizeChatText(msg)).toBe(msg);
    expect(anonymizeChatMessageBody(msg)).toBe(msg);
  });

  it('keeps no state between calls', () => {
    expect(containsPhoneNumber('050-123-4567')).toBe(true);
    expect(containsPhoneNumber('050-123-4567')).toBe(true);
    expect(containsPhoneNumber('4,553')).toBe(false);
  });
});

describe('the client rule is the server rule', () => {
  // The server writes a different token; compare where the redactions fall.
  const toServerToken = (s: string) => s.split('[PHONE_REDACTED]').join('[REDACTED_PHONE]');
  const cases = [
    ...PHONES,
    ...NOT_PHONES,
    ...PHONES.map((p) => `טלפון: ${p}, ותרגיל 7,651 − 3,381`),
    'ל0501234567',
    '050-123-4567 ויש 12 ילדים',
    '0501234567 0521234567',
    '+972-50-123-4567',
    '(02) 1234567',
    '0 1 2 3 4 5 6 7 8 9 ואז 050-123-4567',
    'abc0501234567',
    '0501234567x',
    '05012345',
    '050123456789',
    '972 1 2 3 4 5 6 7 8',
  ];
  for (const text of cases) {
    it(`"${text}"`, () => {
      expect(containsPhoneNumber(text)).toBe(serverContains(text));
      expect(toServerToken(redactPhoneNumbers(text))).toBe(serverRedact(text));
    });
  }
});
