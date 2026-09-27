import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { leaksFinalAnswer, findForbiddenTerm, validateSocraticRequest, validateSocraticResponse, FORBIDDEN_TERMS_HE } from '../socraticContract';

/**
 * חוקי הברזל של מנוע החניכה (מודול 13 §א).
 *
 * 1. "איסור מוחלט לחשוף את התשובה המספרית הסופית או לפתור עבור התלמיד."
 * 2. טרמינולוגיה רשמית בלבד: פריטה ולא שבירה, קיבוץ ולא נשיאה, ואיסור על
 *    מונחי עזרים פיזיים שאינם קיימים בממשק.
 * 3. מספר התלמיד הוא 1 עד 12 בלבד.
 *
 * מה שנשען על הבדיקות האלה: כשכרטיס נדחה, הלקוח מגיש את הרמז הסטטי. כלומר
 * כל דליפה שהן מפספסות מגיעה לילד.
 */
const facts = { final_answer: 263, number_a: 425, number_b: 162 };

describe('התשובה הסופית לעולם אינה נאמרת', () => {
  it('התשובה הסופית בטקסט נתפסת', () => {
    expect(leaksFinalAnswer(['התשובה היא 263'], facts)).toBe(true);
    expect(leaksFinalAnswer(['כמה יוצא? 263.'], facts)).toBe(true);
  });

  it('מספרי התרגיל עצמם מותרים — בלעדיהם אין שילוש פדגוגי', () => {
    expect(leaksFinalAnswer(['בתרגיל 425 פחות 162, מה קורה בטור העשרות?'], facts)).toBe(false);
  });

  it('מספר שהתשובה מוכלת בו כרצף ספרות אינו נחשב דליפה', () => {
    // 1263 ו-2630 אינם 263. תפיסה גורפת מדי הייתה פוסלת כרטיסים תקינים
    // ומחליפה אותם ברמז סטטי בלי סיבה.
    expect(leaksFinalAnswer(['יש לנו 1263 לבנים'], facts)).toBe(false);
  });

  it('רמז בלי שום מספר עובר', () => {
    expect(leaksFinalAnswer(['כמה עשרות יש בטור אחרי הפריטה?'], facts)).toBe(false);
  });
});

describe('טרמינולוגיה של משרד החינוך', () => {
  it('מונחים אסורים נתפסים', () => {
    for (const bad of ['נשבור את המאה', 'נשיאה לטור הבא']) {
      expect(findForbiddenTerm([bad]), bad).not.toBeNull();
    }
  });

  it('המונחים התקניים עוברים', () => {
    for (const good of [
      'פרטו מאה אחת לעשר עשרות',
      'הקבצו עשר יחידות לעשרת',
      'כמה לבנים יש בטור העשרות בבית המספרים?',
      'רשמו בעיגול הזיכרון',
    ]) {
      expect(findForbiddenTerm([good]), good).toBeNull();
    }
  });
});

/**
 * Owner decision, 27.9.2026 (register, entry ט): one name per component — the
 * pieces are "לבנים", the board is "בית המספרים". The prompt already said so;
 * the output check did not enforce it, so a card that said "קוביות" reached
 * the child. Now it is refused, and the client serves the fixed question.
 */
describe('שם אחד לכל רכיב: לבנים ובית המספרים', () => {
  const card = (question: string) => ({
    error_category: 'procedural',
    guiding_question: question,
    options: [
      { option_text: 'נקבץ עשר יחידות לעשרת אחת', feedback_text: 'נכון! לחצו על כפתור הקבץ 10.', is_correct: true },
      { option_text: 'נכתוב את כל היחידות בשורת התוצאה', feedback_text: 'רמז: בכל משבצת ספרה אחת.', is_correct: false },
      { option_text: 'נמחק את כל הלבנים', feedback_text: 'רמז: המספר ישתנה.', is_correct: false },
    ],
  });

  it('the old names of the pieces and the board are refused', () => {
    for (const bad of [
      'כמה קוביות יש בטור היחידות?',
      'כמה קובייה אחת שווה?',
      'נגרור בלוק לטור העשרות',
      'כמה בלוקים יש בטור?',
      'מה רואים בלוח הדינס?',
      'מה רואים בלוח הלבנים?',
      'מה רואים בקנבס?',
    ]) {
      expect(findForbiddenTerm([bad]), bad).not.toBeNull();
      const v = validateSocraticResponse(card(bad));
      expect(v.ok, bad).toBe(false);
      if (!v.ok) expect(v.reason, bad).toMatch(/^forbidden terminology/);
    }
  });

  it('the same card with "לבנים" and "בית המספרים" passes', () => {
    const good = 'בתרגיל 146 ועוד 235, כמה לבנים יש בטור היחידות בבית המספרים?';
    expect(findForbiddenTerm([good])).toBeNull();
    expect(validateSocraticResponse(card(good)).ok).toBe(true);
  });

  it('the new terms are in the list, and the client keeps the same list', () => {
    for (const term of ['קובי', 'בלוק', 'לוח הדינס', 'לוח הלבנים', 'קנבס']) {
      expect(FORBIDDEN_TERMS_HE).toContain(term);
    }
    // The client refuses the same words (defence in depth, SocraticEngine.ts):
    // a list that drifts lets through on one side what the other refuses.
    const client = readFileSync(resolve(__dirname, '../../../react-ts-version/src/infrastructure/services/SocraticEngine.ts'), 'utf-8');
    const block = client.slice(client.indexOf('const FORBIDDEN_TERMS_HE = ['), client.indexOf('];', client.indexOf('const FORBIDDEN_TERMS_HE = [')));
    const clientTerms = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(clientTerms).toEqual(FORBIDDEN_TERMS_HE);
  });
});

describe('בקשה מהמנוע — מספר לומד בטווח הפיילוט', () => {
  const base = {
    student_id: 4,
    session_id: 'session_04_student_4',
    exercise_id: 's4_g_t3',
    active_column_index: 1,
    workspace_state: { ones_count: 0, tens_count: 2, hundreds_count: 4 },
  };

  it('בקשה תקינה מתקבלת', () => {
    expect(validateSocraticRequest(base).ok).toBe(true);
  });

  it('מספר לומד מחוץ לטווח נדחה', () => {
    for (const bad of [0, 13, -1, 4.5, '4abc', null]) {
      expect(validateSocraticRequest({ ...base, student_id: bad }).ok, String(bad)).toBe(false);
    }
  });

  it('בקשה ריקה או לא-אובייקט נדחית', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      expect(validateSocraticRequest(bad).ok, String(bad)).toBe(false);
    }
  });
});
