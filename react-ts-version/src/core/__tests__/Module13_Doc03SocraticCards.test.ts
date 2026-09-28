import { describe, it, expect } from 'vitest';
import {
  SocraticEngine,
  sessionCardKeysForTaskId,
  socraticTextViolation,
} from '@/infrastructure/services/SocraticEngine';
import { secretNumbersOf, revealsSecret } from '@/infrastructure/services/staticSocraticCards';
import { SESSIONS_BY_PATH, type SessionTask } from '@/data/sessionTasks';

/**
 * מסמך 03 §3.3–3.8 writes one Socratic card per session (question + three
 * options, the first correct). The static fallback served on AI timeout must be
 * that card, for every exercise of the session and for its early-finisher
 * exercises, with session 3 split by learning path (34 tens vs 34 hundreds).
 */
const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };

describe('Module 13: static Socratic cards come from מסמך 03', () => {
  it('maps compulsory and early-finisher ids of sessions 3–8 to their session card', () => {
    expect(sessionCardKeysForTaskId('s3_r_t2')).toEqual(['s3_r_card', 's3_card']);
    expect(sessionCardKeysForTaskId('s3_g_reinforce_1')).toEqual(['s3_g_card', 's3_card']);
    expect(sessionCardKeysForTaskId('s7_r_challenge_1')).toEqual(['s7_r_card', 's7_card']);
    expect(sessionCardKeysForTaskId('s8_g_t7')).toEqual(['s8_g_card', 's8_card']);
    expect(sessionCardKeysForTaskId('s1_t8')).toEqual([]);
  });

  // Until 28.9.2026 every meeting-3 exercise got the one card of מסמך 03 — on
  // the 4,500 exercise a card about 3,400 (audit row 3.14). The card is now the
  // document's question with the exercise's own numbers (owner, 28.9.2026;
  // register, approved deviation 2): SocraticStaticCards_ExerciseOnScreen.test.ts.
  it('session 3 asks the document\'s question about the number on the screen', async () => {
    const tasks = [...SESSIONS_BY_PATH[3].remediation_path, ...SESSIONS_BY_PATH[3].green_path];
    const rem = (await SocraticEngine.getSocraticHint(tasks.find((t) => t.id === 's3_r_t3') as any, 'flexible_regrouping', EMPTY))!;
    expect(rem.questionHe).toContain('ערך המיקום');
    expect(rem.questionHe).toContain('450');
    expect(rem.choices[0].textHe).toBe('נשתמש ב-45 עשרות');
    const green = (await SocraticEngine.getSocraticHint(tasks.find((t) => t.id === 's3_g_t3') as any, 'flexible_regrouping', EMPTY))!;
    expect(green.questionHe).toContain('4,500');
    expect(green.choices[0].textHe).toBe('נשתמש ב-45 מאות');
    expect(JSON.stringify(green)).not.toMatch(/3,?400|34 מאות/);
  });

  it('every other session serves the document card, correct option first, with feedback on each option', async () => {
    const expected: Record<number, string> = {
      4: 'מקבצים 10 יחידות לעשרת אחת',
      5: 'פורטים עשרת אחת לעשר יחידות',
      6: 'פרטו תחילה לבנת מאה אחת לעשר עשרות',
      7: 'ניעזר בלבני הדינס',
      8: 'נתבונן בתרגיל',
    };
    for (const [session, opening] of Object.entries(expected)) {
      for (const id of [`s${session}_r_t1`, `s${session}_g_t7`, ...(Number(session) <= 7 ? [`s${session}_g_challenge_1`] : [])]) {
        const hint = (await SocraticEngine.getSocraticHint({ id, type: 'vertical_addition' } as any, 'procedural_fluency', EMPTY))!;
        expect(hint.choices, id).toHaveLength(3);
        expect(hint.choices[0].textHe, id).toContain(opening);
        expect(hint.correctChoiceId, id).toBe('opt_1');
        for (const c of hint.choices) expect(c.feedbackHe, id).toBeTruthy();
      }
    }
  });

  /**
   * הבדיקה הקודמת כאן בדקה ארבעה מזהי תרגיל, והכלל שבדקה היה "אין מספר
   * בן שלוש ספרות" — כלל שגם פוסל אזכור לגיטימי של אחד המחוברים, וגם
   * לא בודק את שאלת ההנחיה עצמה, וגם אינו בודק את התשובה בפועל.
   *
   * הכלל האמיתי כבר כתוב בקוד כפונקציה (socraticTextViolation). כאן הוא
   * מורץ על כל תרגיל בכל מפגש, בשני המסלולים, על הכרטיס השלם — שאלה,
   * אפשרויות ומשוב.
   */
  const everyExercise: { session: number; path: string; task: SessionTask }[] = [];
  for (const [session, banks] of Object.entries(SESSIONS_BY_PATH)) {
    for (const [path, tasks] of Object.entries(banks)) {
      for (const task of tasks) everyExercise.push({ session: Number(session), path, task });
    }
  }

  it('covers every exercise in every meeting, both paths', () => {
    expect(everyExercise.length).toBeGreaterThan(60);
  });

  // כל תרגיל עובר דרך getSocraticHint, שמנסה קודם קריאה למנוע החניכה
  // ונופל לכרטיס הסטטי בתום הזמן. כפול 60 ומשהו תרגילים זה חורג מברירת
  // המחדל של 5 שניות ב-CI, ולכן הזמן מוקצב במפורש.
  it('no card in any exercise leaks the final answer or a forbidden term', async () => {
    const leaks: string[] = [];

    for (const { session, path, task } of everyExercise) {
      const hint = await SocraticEngine.getSocraticHint(task as any, (task as any).targetNode ?? 'procedural_fluency', EMPTY);
      if (!hint) continue;

      // The result of a skeleton exercise is on the screen; what must not be
      // shown is what the child finds (secretNumbersOf).
      const texts = [hint.questionHe, ...hint.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
      const leaked = revealsSecret(texts, secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n)));
      const violation = socraticTextViolation(texts, null) ?? (leaked !== null ? `leaked ${leaked}` : null);
      if (violation) leaks.push(`מפגש ${session} / ${path} / ${(task as any).id}: ${violation}`);
    }

    expect(leaks).toEqual([]);
  }, 60_000);

  it('a card that would leak is replaced, not shown', () => {
    // כרטיס שמפר את הכלל מוחלף בכרטיס הכללי — עדיף רמז רחב על פני
    // מסירת התשובה לילד.
    const leaky = SocraticEngine.getSynchronousTaskHint(
      { id: 'unknown_task_for_test', numberA: 40, numberB: 20, type: 'vertical_addition' } as any,
      { units: 0, tens: 0, hundreds: 0, thousands: 0 }
    );
    const violation = socraticTextViolation(
      [leaky.questionHe, ...leaky.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])],
      { a: 40, b: 20, isSubtraction: false }
    );
    expect(violation).toBeNull();
  });
});
