import { describe, it, expect } from 'vitest';
import { leaksFinalAnswer, findForbiddenTerm, validateSocraticRequest } from '../socraticContract';

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
