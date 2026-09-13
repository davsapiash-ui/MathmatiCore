import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TASKS } from '@/core/QMatrix';

/**
 * סבב התיקונים של מפגש 2 (מודול 13).
 *
 * שלוש תקלות חיו כאן יחד, וכולן פגעו באותו ילד:
 *
 * 1. ארבע מתוך שבע משימות האבחון הגיעו לסבב התיקונים בלי שום פקד קלט. השדות
 *    subtaskChoices, showAutoUngroup ו-visualHint מוגדרים בממשק אך אינם
 *    מוגדרים על אף משימה, ורק משימות 3, 6 ו-7 נושאות probe. הילד ראה רובוט,
 *    משפט, וכפתור "התקדם" מושבת — והיציאה היחידה הייתה התנתקות.
 * 2. התשובה נבדקה מול התרגיל הלא נכון: במשימה 3 מוצג 40 − 10 והתשובה נבדקה
 *    מול 27 (התשובה ל-42 − 15). כלומר 30 נפסל ו-27 התקבל.
 * 3. ההנחיה הדפיסה לילד את התשובה הסופית, ומיד אחר כך נשאל שוב אותו תרגיל.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const view = src('features/workspace/tasks/BackwardDiagnosisView.tsx');
const store = src('application/useWorkspaceStore.ts');

describe('לכל משימת אבחון יש דרך להמשיך', () => {
  it('כל משבע המשימות נושאת אבחון לאחור', () => {
    expect(TASKS).toHaveLength(7);
    for (const t of TASKS) expect(t.backwardDiagnosis, t.id).toBeDefined();
  });

  it('המסך מזהה מתי אף ענף ייעודי אינו נטען, ומציג תיבת תשובה', () => {
    expect(view).toContain('const hasSpecialisedBranch =');
    expect(view).toContain('{!hasSpecialisedBranch && (');
    expect(view).toContain('id="q-probe-answer"');
  });

  it('ארבע המשימות ללא ענף ייעודי הן אלה שנשענות על תיבת התשובה', () => {
    // אם מישהו יוסיף בעתיד ענף ייעודי, הבדיקה הבאה תמשיך להגן: מה שאין לו
    // ענף — יש לו תיבה.
    const withoutBranch = TASKS.filter((t) => {
      const d = t.backwardDiagnosis!;
      const hasProbe = d.probeA !== undefined && (t.type === 'vertical_addition' || t.type === 'missing_element');
      return !(
        (d.subtaskChoices && t.type === 'place_value_zero') ||
        (d.showAutoUngroup && t.type === 'flexible_decomp') ||
        hasProbe ||
        (d.visualHint && t.type === 'small_change')
      );
    });
    expect(withoutBranch.map((t) => t.id)).toEqual([
      'task1_read_write_zero',
      'task2_digit_value',
      'task4_decompose_number',
      'task5_units_to_tens',
    ]);
    for (const t of withoutBranch) expect(t.backwardDiagnosis!.probeAnswer, t.id).toBeTypeOf('number');
  });
});

describe('התשובה נבדקת מול התרגיל שמוצג בפועל', () => {
  it('בסבב התיקונים הציפייה היא תשובת ה-probe, לא תשובת המשימה', () => {
    expect(store).toContain('const probeExpected =');
    expect(store).toContain('if (probeExpected !== undefined) expected = probeExpected;');
    expect(store).toContain('const isCorrect = expected !== null && answer === expected;');
    expect(store).not.toContain('const isCorrect = answer === task.correctAnswer;');
  });

  it('תשובת ה-probe נכונה חשבונית לכל משימה שיש בה תרגיל משנה', () => {
    for (const t of TASKS) {
      const d = t.backwardDiagnosis!;
      if (d.probeA === undefined || d.probeB === undefined) continue;
      const expected = t.isSubtraction ? d.probeA - d.probeB : d.probeA + d.probeB;
      expect(d.probeAnswer, `${t.id}: ${d.probeA} ${t.isSubtraction ? '-' : '+'} ${d.probeB}`).toBe(expected);
    }
  });
});

describe('ההנחיה אינה מוסרת את התשובה', () => {
  it('אף הנחיית תיקון אינה מכילה את התשובה הסופית של המשימה', () => {
    // מודול 13, חוק ברזל 1: "איסור מוחלט לחשוף את התשובה המספרית הסופית".
    const offenders: string[] = [];
    for (const t of TASKS) {
      const text = t.backwardDiagnosis?.probeInstructionHe ?? '';
      if (!text || t.correctAnswer === undefined) continue;
      const answer = String(t.correctAnswer);
      const digits = text.replace(/[^0-9]/g, ' ');
      if (new RegExp(`(^| )${answer}( |$)`).test(digits)) offenders.push(`${t.id}: "${text}"`);
    }
    expect(offenders).toEqual([]);
  });

  it('אין הבטחה של העלאת פתרון שאיש אינו קולט', () => {
    expect(view).not.toContain('הפתרון הועלה בהצלחה למורה');
    expect(view).not.toContain('type="file"');
  });
});
