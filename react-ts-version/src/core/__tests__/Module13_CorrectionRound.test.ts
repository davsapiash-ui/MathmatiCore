import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TASKS } from '@/core/QMatrix';
import { initQFlow, recordResult, advance, hasProbeExercise } from '@/core/qmatrixFlow';

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

/**
 * Owner, 29.9.2026: the simpler exercise of the correction round is the
 * operation alone, in round numbers — no carry and no borrow in any column
 * (120 + 80 still carried in the tens; 400 − 130 still borrowed into the zero
 * tens). Task 6: 120 + 70 = 190; task 7: 400 − 100 = 300; task 3 stays 40 − 10.
 */
describe('the simpler exercises: no carry, no borrow (owner, 29.9.2026)', () => {
  const probe = (id: string) => {
    const d = TASKS.find((x) => x.id === id)!.backwardDiagnosis!;
    return [d.probeA, d.probeB, d.probeAnswer];
  };
  const digitAt = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
  const columns = (a: number, b: number) => Array.from({ length: String(Math.max(a, b)).length }, (_, i) => i);

  it('task 6 is 120 + 70 = 190 and task 7 is 400 − 100 = 300 (was 120 + 80 = 200 and 400 − 130 = 270)', () => {
    expect(probe('task6_vertical_addition')).toEqual([120, 70, 190]);
    expect(probe('task7_subtraction_zero_tens')).toEqual([400, 100, 300]);
    expect(probe('task3_subtraction_regrouping')).toEqual([40, 10, 30]);
  });

  it('no column of any simpler exercise carries or borrows', () => {
    const withProbe = TASKS.filter((t) => t.backwardDiagnosis?.probeA !== undefined && t.backwardDiagnosis?.probeB !== undefined);
    expect(withProbe.map((t) => t.id)).toEqual(['task3_subtraction_regrouping', 'task6_vertical_addition', 'task7_subtraction_zero_tens']);
    for (const t of withProbe) {
      const a = t.backwardDiagnosis!.probeA!;
      const b = t.backwardDiagnosis!.probeB!;
      for (const i of columns(a, b)) {
        const where = `${t.id}: ${a} ${t.isSubtraction ? '−' : '+'} ${b}, column ${i}`;
        if (t.isSubtraction) expect(digitAt(a, i), where).toBeGreaterThanOrEqual(digitAt(b, i));
        else expect(digitAt(a, i) + digitAt(b, i), where).toBeLessThan(10);
      }
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

/**
 * הכרעת בעל המוצר (25.9.2026): סבב התיקונים נשאר, בלי רמזים ובלי משפטי הכוונה,
 * והמשוב בו אינו מגלה אם התשובה נכונה — הוא עדיין חלק מהאבחון. בתרגילי החיבור
 * והחיסור קודם מוצג תרגיל פשוט יותר במספרים עגולים ואחר כך המשימה עצמה; בשאר
 * המשימות אין תרגיל פשוט יותר, ולכן יש ניסיון שני אחד בלבד.
 */
describe('סבב התיקונים בלי רמזים', () => {
  it('המסך אינו מציג רובוט, כותרת "בדיקה מונחית" או משפט הכוונה', () => {
    expect(view).not.toContain('🤖');
    expect(view).not.toContain('בדיקה מונחית');
    expect(view).not.toContain('בואו נפתור יחד');
  });

  it('ההנחיות בסבב אינן מסבירות איך לפתור', () => {
    for (const t of TASKS) {
      const text = t.backwardDiagnosis?.probeInstructionHe ?? '';
      for (const hint of ['שאלו את עצמכם', 'טור שאין בו כלום', 'ערך הספרה הוא', 'כל 10 יחידות', 'נתאמן קודם', 'פרקו בראש']) {
        expect(text, t.id).not.toContain(hint);
      }
    }
  });

  it('המשוב בסבב אינו תלוי בנכונות התשובה', () => {
    const start = store.indexOf("case 'start_correction':");
    const end = store.indexOf("case 'all_complete':", start);
    const round = store.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(round).not.toContain('event.correct ?');
    expect(round).not.toContain('correct: event.correct');
  });

  it('משימה בלי תרגיל פשוט יותר: ניסיון שני אחד; משימת חשבון: תרגיל פשוט ואז המשימה', () => {
    let state = initQFlow();
    let event: any = null;
    for (let i = 0; i < TASKS.length; i++) {
      state = recordResult(state, { correct: false, detail: '' }).state;
      ({ state, event } = advance(state));
    }
    const seen: string[] = [];
    while (event && event.type !== 'all_complete') {
      if (event.type === 'start_correction') {
        const task = TASKS.find((t) => t.id === event.taskId)!;
        const r = recordResult(state, { correct: true, detail: '' });
        state = r.state;
        ({ state, event } = advance(state));
        if (hasProbeExercise(task)) {
          expect(event.type, task.id).toBe('start_retry');
          state = recordResult(state, { correct: true, detail: '' }).state;
          ({ state, event } = advance(state));
          seen.push(task.id + ':probe+retry');
        } else {
          expect(state.results[task.id].secondAttemptCorrect, task.id).toBe(true);
          seen.push(task.id + ':one');
        }
      } else break;
    }
    expect(event?.type).toBe('all_complete');
    expect(seen).toEqual([
      'task1_read_write_zero:one',
      'task2_digit_value:one',
      'task3_subtraction_regrouping:probe+retry',
      'task4_decompose_number:one',
      'task5_units_to_tens:one',
      'task6_vertical_addition:probe+retry',
      'task7_subtraction_zero_tens:probe+retry',
    ]);
  });
});

/** ביקורת 26.9.2026 על השינוי: שלוש תקלות שנמצאו ותוקנו. */
describe('סבב התיקונים — אחרי הביקורת', () => {
  it('תשובה נכונה בסבב אינה נשלחת לשרת כמשימה שנפתרה (הציון = הניסיון הראשון)', () => {
    const at = store.indexOf("} else if (s.qflow.phase === 'correction') {");
    const emit = store.indexOf("event_type: 'PROBLEM_COMPLETE'", at);
    expect(at).toBeGreaterThan(0);
    // the correction branch comes first and has no PROBLEM_COMPLETE of its own
    expect(store.slice(at, store.indexOf('} else {', at))).not.toContain('emitTelemetry(');
    expect(emit).toBeGreaterThan(at);
  });

  it('משימה בלי תרגיל פשוט יותר חוזרת כמו שהיא, במסך שלה, והתיוג נקבע מהניסיון השני', () => {
    let state = initQFlow();
    let event: any = null;
    for (let i = 0; i < TASKS.length; i++) {
      state = recordResult(state, { correct: false, detail: '' }).state;
      ({ state, event } = advance(state));
    }
    expect(event.taskId).toBe('task1_read_write_zero');
    expect(state.subphase).toBe('retry');
    state = recordResult(state, { correct: true, detail: '' }).state;
    expect(state.results['task1_read_write_zero'].tag).toBe('zero_placeholder_hundreds_error');
    expect(state.results['task1_read_write_zero'].secondAttemptCorrect).toBe(true);
  });

  it('כפתור העזרה השקטה אינו מבטל את המשך המשימה', () => {
    const help = store.slice(store.indexOf('requestSilentHelp: () => {'));
    const helpBlock = help.slice(0, help.indexOf('\n    },'));
    expect(helpBlock).toContain('showSideFeedback(');
    expect(helpBlock).not.toMatch(/[^e]showFeedback\(/);
  });
});
