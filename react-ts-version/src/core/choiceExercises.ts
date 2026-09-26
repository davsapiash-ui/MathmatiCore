/**
 * תרגילי הבחירה בדוחות המורה.
 *
 * מסמך 03 (מדיניות סיום מוקדם): "ביצועי הלומדים במשימות האקסטרה של נתיבי
 * הבחירה יתועדו בשקט ברקע ויופיעו בדוחות המורה מסומנים כתרגילי בחירה, בנפרד
 * משבעת תרגילי החובה". PRD נספח א' §2: `path_type` הוא compulsory,
 * consolidation (נתיב החזרה והביסוס) או challenge (נתיב האתגר והעומק).
 *
 * המקור הוא מאגרי הבחירה עצמם (`data/sessionBranchTasks.ts`). השרת
 * (`functions/src/meetingMetrics.ts`, `exercisePathType`) מזהה אותם לפי המזהה,
 * כי המאגרים האלה אינם מתפרסמים לקטלוג; בדיקה בשרת נועלת את שני הצדדים זה מול זה.
 */
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import type { SessionTask } from '@/data/sessionTasks';

export type ExercisePathType = 'compulsory' | 'consolidation' | 'challenge';

export const CHOICE_PATH_LABEL_HE: Record<Exclude<ExercisePathType, 'compulsory'>, string> = {
  consolidation: 'תרגיל בחירה — נתיב החזרה והביסוס',
  challenge: 'תרגיל בחירה — נתיב האתגר והעומק',
};

/** אותה כותרת כמו בדוחות ה-PDF (functions/src/reportHtml.ts). */
export const CHOICE_EXERCISES_HEADING_HE =
  'תרגילי בחירה (אחרי תרגילי החובה) — בנפרד מתרגילי החובה, ואינם נכללים בציון השליטה';

const CHOICE_TASKS: ReadonlyMap<string, SessionTask> = new Map(
  Object.values(SESSION_BRANCH_TASKS).flatMap((byPath) =>
    Object.values(byPath).flatMap((bank) => [...bank.reinforcement, ...bank.challenge])
  ).map((t) => [t.id, t] as const)
);

/** תרגיל הבחירה שהמזהה שלו זה, או null לתרגיל חובה. */
export function choiceTask(exerciseId: string): SessionTask | null {
  return CHOICE_TASKS.get(exerciseId) ?? null;
}

/**
 * איזה תרגיל זה. ערך שהשרת כבר קבע גובר; דוח ששמור מלפני שהשדה היה קיים
 * מסווג לפי המאגרים.
 */
export function exercisePathType(exerciseId: string, fromServer?: unknown): ExercisePathType {
  if (fromServer === 'compulsory' || fromServer === 'consolidation' || fromServer === 'challenge') return fromServer;
  const task = choiceTask(exerciseId);
  if (!task) return 'compulsory';
  return task.branchType === 'challenge' ? 'challenge' : 'consolidation';
}
