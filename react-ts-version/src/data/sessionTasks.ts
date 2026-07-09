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
  | 'small_change'
  | 'missing_element';

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

  /* Dynamic/adaptive tasks properties */
  range?: [number, number];
  givenHe?: string;
  questionHe?: string;
  /* Progression Requirements */
  requiresGrouping?: boolean;
  requiresUngrouping?: boolean;
}

/* ── Session 1 — (מפגש 1: היכרות ותפעול, רישיון מעבדה מורחב) ── */

export const SESSION1_TASKS: SessionTask[] = [

  // 2. Controlled Sandbox (Friction built-in)
  {
    id: 's1_sandbox_controlled',
    type: 'session1_intro',
    titleHe: 'ארגז חול: אימון טכני',
    instructionHe: 'כדי לקבל את רישיון החוקר שלכם, הראו שאתם שולטים בציוד המעבדה: גררו לפחות 5 פריטים ללוח, ולאחר מכן מחקו לפחות פריט אחד (על ידי גרירה החוצה או לחיצה על פח המחזור). מערכת "התקדם" תופעל רק לאחר מכן.',
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
  },
  // 3. License Proof (Build and type)
  {
    id: 's1_license_test',
    type: 'addition_simple',
    numberA: 420, numberB: 0, correctAnswer: 420,
    titleHe: 'בדיקת רישיון: בנייה מדוייקת',
    instructionHe: 'בנו בלוח המחקר את המספר 420 במדויק. לאחר מכן, הזינו את המספר בתיבת התוצאה למטה ולחצו על בדיקה.',
    hintHe: 'שימו לב לטורים: מאות בטור המאות, עשרות בעשרות ויחידות ביחידות.',
    scaffoldLevel: 1,
  },
  // 4. Number Line Tool Practice
  {
    id: 's1_t6',
    type: 'number_line',
    titleHe: 'רישיון חוקר: כיול ישר המספרים',
    instructionHe: 'כלי נוסף במעבדה הוא ישר המספרים. גררו את הסמן למקום שבו נמצא המספר 650 על הקו ולחצו בדיקה.',
    numberA: 650, // target
    range: [0, 1000],
    scaffoldLevel: 0,
  },
  // 8. Math Refresh 1
  {
    id: 's1_t7',
    type: 'addition_simple',
    numberA: 240, numberB: 135, correctAnswer: 375,
    titleHe: 'תרגול חיבור: בלי המרות',
    instructionHe: 'בנו בלוח את המספרים 240 ו-135 בעזרת הקוביות. חברו אותם ורשמו את התוצאה הסופית.',
    hintHe: 'פשוט גררו את הבלוקים למקום שלהם וחברו את כל המאות ואת כל העשרות.',
    scaffoldLevel: 1,
  },
  // 9. Math Refresh 2
  {
    id: 's1_t8',
    type: 'addition_simple',
    numberA: 385, numberB: 152, correctAnswer: 537,
    titleHe: 'תרגול חיבור: קיבוץ לעשרות ומאות',
    instructionHe: 'בנו 385 ו-152 וחברו אותם. כאשר יש לכם יותר מ-9 בלוקים בטור, תצטרכו להמיר אותם! (למשל: גררו 10 יחידות אל טור העשרות כדי לקבץ אותן לעשרת אחת).',
    hintHe: 'במערכת החדשה הקיבוץ אינו אוטומטי - עליכם לגרור 10 בלוקים לטור הבא כדי ליצור בלוק גדול יותר!',
    scaffoldLevel: 1,
    requiresGrouping: true,
  },
  // 10. Math Refresh 3
  {
    id: 's1_t9',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 470, numberB: 250, correctAnswer: 220,
    titleHe: 'תרגול חיסור: הוצאת איברים',
    instructionHe: 'כעת נתרגל חיסור: בנו רק את המספר הראשון (470). מתוכו, מחקו 250 (על ידי גרירת 2 מאות ו-5 עשרות לפח) וגלו מה נשאר.',
    hintHe: 'בחיסור לא בונים את שני המספרים! בונים את המספר הגדול ומוציאים מתוכו בלוקים.',
    scaffoldLevel: 1,
  },
  // 11. Math Refresh 4
  {
    id: 's1_t10',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 425, numberB: 162, correctAnswer: 263,
    titleHe: 'תרגול חיסור: פריטת עשרות',
    instructionHe: 'בנו 425 ונסו להחסיר 162. אם חסרות לכם עשרות כדי להחסיר, תצטרכו לפרוט! (גררו מאה אחת לטור העשרות והיא תתפרק ל-10 עשרות).',
    hintHe: 'המערכת לא תפרוט עבורכם - עליכם לגרור בלוק גדול לטור קטן יותר כדי לפרוט אותו לחלקים!',
    scaffoldLevel: 1,
    requiresUngrouping: true,
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
    requiresGrouping: true,
  },
  {
    id: 's3_t2',
    type: 'addition_simple',
    numberA: 257, numberB: 124, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - תרגיל 2',
    instructionHe: 'בואו נחבר: 257 + 124. בנו את המספרים בטבלה, ובצעו המרה אם נאספו 10 פריטים או יותר בטור אחד.',
    requiresGrouping: true,
  },
  {
    id: 's3_t3',
    type: 'addition_simple',
    numberA: 138, numberB: 245, correctAnswer: 383,
    titleHe: 'המרה מיחידות לעשרות',
    instructionHe: 'פתרו: 138 + 245. מה קורה כשיש לנו 8 יחידות ועוד 5 יחידות? בצעו המרה של 10 יחידות לעשרת אחת.',
    requiresGrouping: true,
  },
  {
    id: 's3_t4',
    type: 'addition_simple',
    numberA: 356, numberB: 182, correctAnswer: 538,
    titleHe: 'המרה מעשרות למאות',
    instructionHe: 'פתרו: 356 + 182. מה קורה כשמחברים 5 עשרות עם 8 עשרות? בצעו המרה של 10 עשרות למאה אחת.',
    requiresGrouping: true,
  },
  {
    id: 's3_t5',
    type: 'addition_simple',
    numberA: 4890, numberB: 1750, correctAnswer: 6640,
    titleHe: 'המרה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 4890 + 1750. כאן תבצעו המרה גם בטור היחידות וגם בטור העשרות. בהצלחה!',
    requiresGrouping: true,
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
    requiresUngrouping: true,
  },
  {
    id: 's4_t2',
    type: 'addition_simple',
    numberA: 524, numberB: 216, correctAnswer: 308, isSubtraction: true,
    titleHe: 'חיסור עם פריטה - תרגיל 2',
    instructionHe: 'פתרו: 524 - 216. זכרו לבצע פריטה במידת הצורך.',
    requiresUngrouping: true,
  },
  {
    id: 's4_t3',
    type: 'addition_simple',
    numberA: 425, numberB: 118, correctAnswer: 307, isSubtraction: true,
    titleHe: 'פריטה מעשרת ליחידות',
    instructionHe: 'פתרו: 425 - 118. כדי שנוכל לחסר 8 יחידות מתוך 5 יחידות, נבצע פריטה של עשרת אחת ל-10 יחידות.',
    requiresUngrouping: true,
  },
  {
    id: 's4_t4',
    type: 'addition_simple',
    numberA: 632, numberB: 271, correctAnswer: 361, isSubtraction: true,
    titleHe: 'פריטה ממאה לעשרות',
    instructionHe: 'פתרו: 632 - 271. כדי שנוכל לחסר 7 עשרות מתוך 3 עשרות, נבצע פריטה של מאה אחת ל-10 עשרות.',
    requiresUngrouping: true,
  },
  {
    id: 's4_t5',
    type: 'addition_simple',
    numberA: 5130, numberB: 2850, correctAnswer: 2280, isSubtraction: true,
    titleHe: 'פריטה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 5130 - 2850. כאן תבצעו פריטה גם ממאה לעשרות וגם מעשרת ליחידות. בהצלחה!',
    requiresUngrouping: true,
  },
];

/* ── Socratic hints — app.js getSocraticHint (lines 1302–1311) ──
   NOTE (verbatim from vanilla): the map is keyed q1–q5, which do NOT match the
   Session-2 task ids ('task1_zero_placeholder', ...). In the vanilla code
   getSocraticHint is defined but never invoked, so the lookup always would have
   fallen back to DEFAULT_SOCRATIC_HINT. Preserved as-is. */

export const SOCRATIC_HINTS: Record<string, string> = {
  task1_zero_placeholder: 'מה קורה כשטור מתרוקן לחלוטין? האם אפשר פשוט לדלג עליו כשכותבים את המספר?',
  task2_estimation_error_margin: 'בואו נבדוק – האם המספר קרוב יותר להתחלת הישר, לאמצע שלו, או לסוף שלו?',
  task3_flexible_regrouping: 'האם יש רק דרך אחת לייצג את המספר הזה? נסו לבצע פריטה כדי למצוא דרך נוספת.',
  task4_basic_addition_fluency: 'האם התשובה שלכם מסתדרת עם מה שאתם כבר יודעים על המספרים? נסו לחשב רק את היחידות קודם.',
  task5_small_change: 'אם משנים רק את ספרת היחידות באחד, מה קורה למספר כולו?',
  task6_subtraction_regrouping: 'אין מספיק יחידות כדי לחסר. מאיפה נוכל לארגן עוד יחידות בלוח מבלי לשנות את הכמות הכוללת?',
  task7_missing_subtrahend: 'אם נדע כמה נשאר בסוף, מה נוכל לעשות כדי לגלות כמה חסר באמצע?',
  task8_missing_addend: 'חיבור וחיסור הן פעולות הפוכות. האם נוכל להשתמש בזה כדי למצוא את המספר החסר?',
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
      'מה עשיתי עד עכשיו ומה עוד נשאר לי לעשות?',
      'האם בניתי את המספרים בלוח בדיוק כמו שהם מופיעים בתרגיל?',
      'האם שמתי לב לפעולה הנדרשת (חיבור או חיסור)?',
    ],
  },
  socratic: {
    titleHe: 'נקודה למחשבה',
    kind: 'equivalence',
    lines: [
      'הסתכלו על הלוח: האם יש בטור כלשהו יותר מ-9 בלוקים? מה נוכל לעשות עם זה?',
      'אם אין לנו מספיק יחידות לפעולת החיסור, מאיפה נוכל להשיג עוד יחידות מבלי לשנות את המספר עצמו?',
    ],
  },
  worked_example: {
    titleHe: 'דוגמה מסייעת: פריטה וקיבוץ',
    kind: 'worked_example',
    lines: [
      'בפעולת הקיבוץ, אנו אוספים 10 יחידות וממירים אותן לעשרת אחת.',
      'בפעולת הפריטה, אנו מפרקים עשרת אחת חזרה ל-10 יחידות.',
      'חשוב לזכור: הכמות הכוללת אינה משתנה – רק הייצוג שלה משתנה!',
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
