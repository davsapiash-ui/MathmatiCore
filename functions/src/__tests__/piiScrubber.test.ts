import { describe, it, expect } from 'vitest';
import { scrubPII } from '../geminiProxy';

/**
 * החזרה לאפיון, 22.9.2026 — המסנן הרס הודעות אמיתיות.
 *
 * `scrubPII` רץ על שיח מורה-הנהלה (מודול 22), כלומר על פרוזה של מבוגרים.
 * הדפוס העברי כלל את המילה "אני" כפתיח של שם, ולכן "אני צריכה עזרה עם תלמיד 4"
 * הגיע לצד השני כ-"אני [REDACTED_NAME] עם תלמיד 4". גם בצד האנגלי הדגל /i חל
 * על קבוצת השם, כך ש-"i am tired" הפך ל-"i am [REDACTED_NAME]".
 *
 * אי-איסוף מידע מזהה (עיקרון הארכיטקטורה הראשון) נשמר: המסנן ממשיך לחסום כל
 * פתיח שם אמיתי, ובעברית אף יותר מקודם — גם בגוף שלישי.
 */
describe('המסנן אינו הורס עברית רגילה', () => {
  it('"אני" היא המילה I, לא פתיח של שם', () => {
    expect(scrubPII('אני צריכה עזרה עם תלמיד 4')).toBe('אני צריכה עזרה עם תלמיד 4');
    expect(scrubPII('אני לא מבינה מה קרה במפגש')).toBe('אני לא מבינה מה קרה במפגש');
  });

  it('"i am" באנגלית אינו מסמן שם אלא אם הוא באמת שם', () => {
    expect(scrubPII('i am tired of this bug')).toBe('i am tired of this bug');
    expect(scrubPII('I am David')).toBe('I am [REDACTED_NAME]');
  });

  it('אינו נדלק על אמצע מילה', () => {
    expect(scrubPII('בשמי הארץ יש עננים')).toBe('בשמי הארץ יש עננים');
  });
});

describe('פתיחי שם אמיתיים עדיין מנוקים', () => {
  it('עברית — גוף ראשון וגוף שלישי', () => {
    expect(scrubPII('קוראים לי דניאל')).toBe('קוראים לי [REDACTED_NAME]');
    expect(scrubPII('שמי רותי לוי')).toBe('שמי [REDACTED_NAME]');
    expect(scrubPII('השם שלי יעל')).toBe('השם שלי [REDACTED_NAME]');
    expect(scrubPII('קוראים לו אבי')).toBe('קוראים לו [REDACTED_NAME]');
    expect(scrubPII('שמה נועה')).toBe('שמה [REDACTED_NAME]');
  });

  it('אנגלית', () => {
    expect(scrubPII('My name is Sarah Cohen')).toBe('My name is [REDACTED_NAME]');
    expect(scrubPII('this is Michael')).toBe('this is [REDACTED_NAME]');
  });

  it('דוא"ל, תעודת זהות וסיסמה ללא שינוי', () => {
    expect(scrubPII('כתבי לי ל-a.b@example.com')).toContain('[REDACTED_EMAIL]');
    expect(scrubPII('ת.ז. 123456789')).toContain('[REDACTED_ID]');
    expect(scrubPII('סיסמה: abc123')).toContain('[REDACTED_PASSWORD]');
  });
});
