import { describe, it, expect } from 'vitest';
import { sanitizePII, anonymizeChatMessageBody } from '../PiiFilter';

/**
 * The Hebrew name-opener rule ("שמי X") fired from the middle of a word, so an
 * ordinary teacher message lost the two words after "רשמי" or "בשמי". The
 * server's scrubPII got the word-start condition on 22.9.2026; this is the
 * same rule on the client.
 */
describe('Hebrew name opener — word start only', () => {
  it('leaves ordinary words that end in "שמי" alone', () => {
    const letter = 'צריך מכתב רשמי להורים של תלמיד 4';
    expect(sanitizePII(letter)).toBe(letter);
    expect(anonymizeChatMessageBody(letter)).toBe(letter);
    expect(sanitizePII('בשמי ובשם הצוות תודה')).toBe('בשמי ובשם הצוות תודה');
    expect(sanitizePII('זה מפגש רשמי ראשון')).toBe('זה מפגש רשמי ראשון');
    expect(sanitizePII('אני צריכה עזרה עם תלמיד 4')).toBe('אני צריכה עזרה עם תלמיד 4');
  });

  it('still redacts a real introduction', () => {
    expect(sanitizePII('שמי רותי לוי')).toBe('שמי [NAME_REDACTED]');
    expect(sanitizePII('שלום, שמי דניאל')).toBe('שלום, שמי [NAME_REDACTED]');
    expect(sanitizePII('קוראים לי יעל')).toBe('קוראים לי [NAME_REDACTED]');
    expect(sanitizePII('השם שלי הוא נועה')).toBe('השם שלי הוא [NAME_REDACTED]');
  });
});
