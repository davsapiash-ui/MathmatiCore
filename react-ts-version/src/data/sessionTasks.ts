/**
 * sessionTasks.ts — Task content extracted VERBATIM from the vanilla JS implementation.
 *
 * Provenance:
 *  - vanilla_audit/js/app.js
 *      SESSION1_TASKS  (lines 42–107)
 *      SESSION3_TASKS  (lines 109–145)
 *      SESSION4_TASKS  (lines 147–183)
 *      getSocraticHint (lines 1302–1311) → SOCRATIC_HINTS / DEFAULT_SOCRATIC_HINT
 *  - Session 2 (the 5 Q-Matrix diagnostic tasks) lives in src/core/QMatrix.ts and is
 *    re-exported here — single source, the evaluator is coupled to its shape.
 *
 * All Hebrew strings are copied character-for-character from the vanilla source.
 * Do not edit strings here without updating the vanilla source of truth.
 */

import { TASKS as QMATRIX_TASKS } from '@/core/QMatrix';
import type { QMatrixTask } from '@/core/QMatrix';

/* ── Types ── */

export type TaskType =
  | 'session1_intro'
  | 'addition_simple'
  | 'place_value_zero'
  | 'number_line'
  | 'flexible_decomp'
  | 'vertical_addition'
  | 'small_change';

export interface TaskChoice {
  id: string;
  textHe: string;
  correct?: boolean;
}

export interface SessionTask {
  id: string;
  type: TaskType;
  titleHe: string;
  instructionHe: string;

  /* Two-operand arithmetic (addition_simple / vertical_addition) */
  numberA?: number;
  numberB?: number;
  correctAnswer?: number | string; // s1_welcome uses the choice id 'א'
  isSubtraction?: boolean;
  /* ASD simplified operands */
  asdNumberA?: number;
  asdNumberB?: number;

  /* Closed choices */
  thoughtQuestionHe?: string;
  choices?: TaskChoice[];

  /* Scaffolding & hints */
  hintHe?: string;
  scaffoldLevel?: number;
}

/* ── Session 1 — app.js lines 42–107 (מפגש 1: היכרות ותפעול, חיבור ללא המרה בתחום המאה) ── */

export const SESSION1_TASKS: SessionTask[] = [
  {
    id: 's1_welcome',
    type: 'session1_intro',
    titleHe: 'ברוכים הבאים לטבלת ערך המקום! 🎉',
    // User-approved wording change (03.07.2026): "עשרת" instead of "עמודה של עשרת".
    instructionHe: 'נסו לגרור קוביות קטנות (יחידות) או עשרות אל הלוח וראו איך המספר מתעדכן. אחר כך, נסו לגרור עשרת אחת אל טור היחידות, וחשבו על השאלה למטה:',
    thoughtQuestionHe: 'אם נגרור עשרת אחת (10) לטור היחידות והיא תתפרק ל-10 יחידות, האם הערך הכולל של המספר בטבלה השתנה?',
    choices: [
      { id: 'א', textHe: 'הכמות נשארה בדיוק אותו הדבר (10). לא הוספנו ולא הורדנו קוביות מהלוח, הן פשוט נראות אחרת!', correct: true },
      { id: 'ב', textHe: 'הכמות גדלה ל-20, כי עכשיו יש לנו הרבה קוביות קטנות בלוח במקום עשרת אחת.' },
      { id: 'ג', textHe: 'הכמות קטנה והפכה לאפס, כי העשרת נעלמה לגמרי.' },
    ],
    correctAnswer: 'א',
    scaffoldLevel: 0,
  },
  {
    id: 's1_t1',
    type: 'addition_simple',
    numberA: 12, numberB: 24, correctAnswer: 36,
    titleHe: 'חיבור פשוט - תרגיל 1',
    instructionHe: 'פתרו את התרגיל על ידי גרירת הקוביות לכל טור, וכתבו את התשובה שלכם בתיבה.',
    asdNumberA: 12, asdNumberB: 14,
    hintHe: 'נסו לבדוק את עצמכם רגע: האם המספר שבנינו בקוביות מתאים למספרים שבתרגיל?',
    scaffoldLevel: 1,
  },
  {
    id: 's1_t2',
    type: 'addition_simple',
    numberA: 35, numberB: 14, correctAnswer: 49,
    titleHe: 'חיבור פשוט - תרגיל 2',
    instructionHe: 'פתרו את התרגיל על ידי גרירת הקוביות לכל טור, וכתבו את התשובה שלכם בתיבה.',
    asdNumberA: 35, asdNumberB: 12,
    hintHe: 'האם יש לנו טור אחד שיש בו יותר מ-9 קוביות? אם כן, זכרו שאפשר לבצע המרה לטור הבא!',
    scaffoldLevel: 1,
  },
  {
    id: 's1_t3',
    type: 'addition_simple',
    numberA: 41, numberB: 15, correctAnswer: 56,
    titleHe: 'חיבור פשוט - תרגיל 3',
    instructionHe: 'פתרו את התרגיל על ידי גרירת הקוביות לכל טור, וכתבו את התשובה שלכם בתיבה.',
    asdNumberA: 41, asdNumberB: 15,
    hintHe: 'מה קורה לכמות הקוביות כשאנחנו פורטים או ממירים? האם הוספנו או הורדנו קוביות מהלוח, או שרק שינינו את הצורה שלהן?',
    scaffoldLevel: 1,
  },
  {
    id: 's1_t4',
    type: 'addition_simple',
    numberA: 23, numberB: 31, correctAnswer: 54,
    titleHe: 'חיבור פשוט - תרגיל 4',
    instructionHe: 'ייצגו את המספרים בטבלה ורשמו את התשובה הכתובה.',
    asdNumberA: 23, asdNumberB: 31,
    hintHe: 'תראו! המספר 12 הוא בדיוק אותו הדבר כמו עשרת אחת (10) ועוד שתי יחידות (2). הכמות תמיד נשארת!',
    scaffoldLevel: 2,
  },
  {
    id: 's1_t5',
    type: 'addition_simple',
    numberA: 15, numberB: 42, correctAnswer: 57,
    titleHe: 'חיבור פשוט - תרגיל 5',
    instructionHe: 'ייצגו את המספרים בטבלה ורשמו את התשובה הכתובה.',
    asdNumberA: 15, asdNumberB: 42,
    hintHe: 'נסו לבדוק את עצמכם רגע: האם המספר שבנינו מתאים לתרגיל?',
    scaffoldLevel: 2,
  },
];

/* ── Session 2 — the 5 Q-Matrix diagnostic tasks (מפגש 2: מיפוי יכולות ואבחון סמוי) ── */

export const SESSION2_TASKS: QMatrixTask[] = QMATRIX_TASKS;

/* ── Session 3 — app.js lines 109–145 (מפגש 3: חיבור עם המרה בתחום האלף) ── */

export const SESSION3_TASKS: SessionTask[] = [
  {
    id: 's3_t1',
    type: 'addition_simple',
    numberA: 146, numberB: 235, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - מתחילים!',
    instructionHe: 'בואו נחבר: 146 + 235. זכרו: כאשר נאספים 10 פריטים בטור אחד, אנו מבצעים המרה לטור הבא משמאל!',
  },
  {
    id: 's3_t2',
    type: 'addition_simple',
    numberA: 257, numberB: 124, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - תרגיל 2',
    instructionHe: 'בואו נחבר: 257 + 124. בנו את המספרים בטבלה, ובצעו המרה אם נאספו 10 פריטים או יותר בטור אחד.',
  },
  {
    id: 's3_t3',
    type: 'addition_simple',
    numberA: 138, numberB: 245, correctAnswer: 383,
    titleHe: 'המרה מיחידות לעשרות',
    instructionHe: 'פתרו: 138 + 245. מה קורה כשיש לנו 8 יחידות ועוד 5 יחידות? בצעו המרה של 10 יחידות לעשרת אחת.',
  },
  {
    id: 's3_t4',
    type: 'addition_simple',
    numberA: 356, numberB: 182, correctAnswer: 538,
    titleHe: 'המרה מעשרות למאות',
    instructionHe: 'פתרו: 356 + 182. מה קורה כשמחברים 5 עשרות עם 8 עשרות? בצעו המרה של 10 עשרות למאה אחת.',
  },
  {
    id: 's3_t5',
    type: 'addition_simple',
    numberA: 489, numberB: 175, correctAnswer: 664,
    titleHe: 'המרה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 489 + 175. כאן תבצעו המרה גם בטור היחידות וגם בטור העשרות. בהצלחה!',
  },
];

/* ── Session 4 — app.js lines 147–183 (מפגש 4: חיסור עם פריטה בתחום האלף) ── */

export const SESSION4_TASKS: SessionTask[] = [
  {
    id: 's4_t1',
    type: 'addition_simple',
    numberA: 342, numberB: 125, correctAnswer: 217, isSubtraction: true,
    titleHe: 'חיסור עם פריטה - מתחילים!',
    instructionHe: 'בואו נפתור: 342 - 125. מה עושים כשאין מספיק יחידות בטור היחידות כדי לחסר? מבצעים פריטה של עשרת אחת ל-10 יחידות!',
  },
  {
    id: 's4_t2',
    type: 'addition_simple',
    numberA: 524, numberB: 216, correctAnswer: 308, isSubtraction: true,
    titleHe: 'חיסור עם פריטה - תרגיל 2',
    instructionHe: 'פתרו: 524 - 216. זכרו לבצע פריטה במידת הצורך.',
  },
  {
    id: 's4_t3',
    type: 'addition_simple',
    numberA: 425, numberB: 118, correctAnswer: 307, isSubtraction: true,
    titleHe: 'פריטה מעשרת ליחידות',
    instructionHe: 'פתרו: 425 - 118. כדי שנוכל לחסר 8 יחידות מתוך 5 יחידות, נבצע פריטה של עשרת אחת ל-10 יחידות.',
  },
  {
    id: 's4_t4',
    type: 'addition_simple',
    numberA: 632, numberB: 271, correctAnswer: 361, isSubtraction: true,
    titleHe: 'פריטה ממאה לעשרות',
    instructionHe: 'פתרו: 632 - 271. כדי שנוכל לחסר 7 עשרות מתוך 3 עשרות, נבצע פריטה של מאה אחת ל-10 עשרות.',
  },
  {
    id: 's4_t5',
    type: 'addition_simple',
    numberA: 513, numberB: 285, correctAnswer: 228, isSubtraction: true,
    titleHe: 'פריטה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 513 - 285. כאן תבצעו פריטה גם ממאה לעשרות וגם מעשרת ליחידות. בהצלחה!',
  },
];

/* ── Socratic hints — app.js getSocraticHint (lines 1302–1311) ──
   NOTE (verbatim from vanilla): the map is keyed q1–q5, which do NOT match the
   Session-2 task ids ('task1_zero_placeholder', ...). In the vanilla code
   getSocraticHint is defined but never invoked, so the lookup always would have
   fallen back to DEFAULT_SOCRATIC_HINT. Preserved as-is. */

export const SOCRATIC_HINTS: Record<string, string> = {
  q1: 'מה קורה כשטור ריק — כמה יחידות יש שם?',
  q2: 'היכן בערך נמצא האמצע של הישר?',
  q3: 'האם אפשר לפרוט מאה לעשרות?',
  q4: 'מה הספרה בטור היחידות בכל מספר?',
  q5: 'אם מחסירים 1 מ-10, מה קורה לתוצאה?',
};

export const DEFAULT_SOCRATIC_HINT = 'בואו נחשוב יחד — מה אנחנו יודעים על המספר הזה?';

export function getSocraticHint(taskId: string): string {
  return SOCRATIC_HINTS[taskId] ?? DEFAULT_SOCRATIC_HINT;
}

/* ── Support-palette content — app.js handleSupportChoice (lines 1255–1299) ──
   The 3 calibrated-choice help levels (בחירה מכוילת). Static per type, verbatim. */

export type SupportType = 'metacognitive' | 'socratic' | 'worked_example';

export interface SupportContent {
  titleHe: string;
  /** Simple HTML-free content model: heading + bullet/paragraph lines. */
  lines: string[];
  kind: 'checklist' | 'equivalence' | 'worked_example';
}

export const SUPPORT_CONTENT: Record<SupportType, SupportContent> = {
  metacognitive: {
    titleHe: 'בואו נחשוב יחד',
    kind: 'checklist',
    lines: [
      'האם המספר שבניתי בקוביות מתאים למספרים שבתרגיל?',
      'האם יש טור שבו יותר מ-9 קוביות? אם כן — אפשר לבצע המרה!',
      'האם התשובה הכתובה שלי מתאימה למה שרואים בלוח?',
    ],
  },
  socratic: {
    titleHe: 'שאלה למחשבה',
    kind: 'equivalence',
    lines: [
      'עשרת אחת שווה בדיוק ל-10 יחידות קטנות.',
      'כשפרטנו או המרנו — האם הוספנו או הורדנו קוביות מהלוח, או שרק שינינו את הצורה שלהן?',
    ],
  },
  worked_example: {
    titleHe: 'בואו נראה דוגמה',
    kind: 'worked_example',
    lines: [
      'שלב 1: המספר 12 הוא עשרת אחת (10) ועוד 2 יחידות.',
      'שלב 2: אפשר לפרוט את העשרת ל-10 יחידות — ואז יש 12 יחידות.',
      'הכמות תמיד נשארת! רק הצורה משתנה.',
    ],
  },
};

/* ── Sessions map: meeting number → task list (session 2 flows through qmatrixFlow) ── */

export const SESSIONS: Record<1 | 3 | 4, SessionTask[]> = {
  1: SESSION1_TASKS,
  3: SESSION3_TASKS,
  4: SESSION4_TASKS,
};

export function getSessionTasks(meeting: 1 | 3 | 4): SessionTask[] {
  return SESSIONS[meeting];
}
