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
  
  /** The specific Q-Matrix node this task evaluates for the Micro-Agility Engine */
  targetNode?: string;
  /** Scaffold degradation level for Decoupled Vector Scaling (0 = full, 1 = mid, 2 = low) */
  scaffoldLevel?: number;

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
    instructionHe: "כדי לקבל את רישיון החוקר שלכם, הראו שאתם שולטים בציוד המעבדה:\n1. גררו לפחות 5 פריטים לבית המספרים.\n2. מחקו לפחות פריט אחד (גררו אותו לפח המחזור).\nלאחר שתסיימו, כפתור 'התקדם' יידלק ותוכלו לעבור לשלב הבא!",
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
  },
  // 3. License Proof (Build and type)
  {
    id: 's1_license_test',
    type: 'addition_simple',
    numberA: 400, numberB: 20, correctAnswer: 420,
    titleHe: 'בניית מספרים עגולים',
    instructionHe: 'בנו בבית המספרים את המספר 420 בעזרת מאות ועשרות, והקלידו את התוצאה בתיבת המענה.',
    targetNode: 'basic_addition_fluency',
  },

  // 8. Math Refresh 1
  {
    id: 's1_t7',
    type: 'addition_simple',
    numberA: 240, numberB: 135, correctAnswer: 375,
    titleHe: 'תרגול חיבור: בלי המרות',
    instructionHe: 'בנו בבית המספרים את המספרים 240 ו-135 בעזרת הקוביות. חברו אותם ורשמו את התוצאה הסופית.',
    hintHe: 'פשוט גררו את הבלוקים לטורים המתאימים בבית המספרים וחברו את כל המאות ואת כל העשרות.',
    scaffoldLevel: 1,
  },
  // 9. Math Refresh 2
  {
    id: 's1_t8',
    type: 'addition_simple',
    numberA: 385, numberB: 152, correctAnswer: 537,
    titleHe: 'תרגול חיבור: קיבוץ לעשרות ומאות',
    instructionHe: 'בנו בבית המספרים 385 ו-152 וחברו אותם. כאשר מצטברים 10 פריטים או יותר בטור, נקבץ אותם! גררו 10 יחידות אל טור העשרות כדי להפכן לעשרת אחת.',
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
    instructionHe: 'בואו נתרגל חיסור בבית המספרים: בנו רק את המספר הראשון (470). מתוכו, מחקו 250 (על ידי גרירת 2 מאות ו-5 עשרות לפח המחזור), והקלידו את התוצאה שנשארה.',
    hintHe: 'בחיסור לא בונים את שני המספרים! בונים את המספר הגדול בבית המספרים ומוציאים מתוכו בלוקים.',
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

/* ── Session 3 — מפגש 3: ערך המקום וגמישות ייצוגית (פירוק/הרכבה) — 7 תרגילי חובה ── */

export const SESSION3_TASKS: SessionTask[] = [
  {
    id: 's3_t1',
    type: 'addition_simple',
    numberA: 146, numberB: 235, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - מתחילים!',
    instructionHe: 'בואו נחבר: 146 + 235. זכרו: כאשר נאספים 10 פריטים בטור אחד, אנו מבצעים המרה לטור הבא משמאל!',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's3_t2',
    type: 'addition_simple',
    numberA: 257, numberB: 124, correctAnswer: 381,
    titleHe: 'חיבור עם המרה - תרגיל 2',
    instructionHe: 'בואו נחבר: 257 + 124. בנו את המספרים בטבלה, ובצעו המרה אם נאספו 10 פריטים או יותר בטור אחד.',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's3_t3',
    type: 'addition_simple',
    numberA: 138, numberB: 245, correctAnswer: 383,
    titleHe: 'המרה מיחידות לעשרות',
    instructionHe: 'פתרו: 138 + 245. מה קורה כשיש לנו 8 יחידות ועוד 5 יחידות? בצעו המרה של 10 יחידות לעשרת אחת.',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's3_t4',
    type: 'addition_simple',
    numberA: 356, numberB: 182, correctAnswer: 538,
    titleHe: 'המרה מעשרות למאות',
    instructionHe: 'פתרו: 356 + 182. מה קורה כשמחברים 5 עשרות עם 8 עשרות? בצעו המרה של 10 עשרות למאה אחת.',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's3_t5',
    type: 'addition_simple',
    numberA: 4890, numberB: 1750, correctAnswer: 6640,
    titleHe: 'המרה כפולה - גם וגם!',
    instructionHe: 'תרגיל אתגר: 4890 + 1750. כאן תבצעו המרה גם בטור היחידות וגם בטור העשרות. בהצלחה!',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's3_t6',
    type: 'flexible_decomp',
    numberA: 452, correctAnswer: 452,
    titleHe: 'גמישות ייצוגית - פירוק מבנה',
    instructionHe: 'בנו את המספר 452 בשתי דרכים שונות בלוח (למשל: בשימוש 4 מאות או 3 מאות ו-15 עשרות).',
    requiresUngrouping: true,
    targetNode: 'flexible_regrouping',
  },
  {
    id: 's3_t7',
    type: 'addition_simple',
    numberA: 320, numberB: 480, correctAnswer: 800,
    titleHe: 'סיכום מפגש 3: השלמה למאות שלמות',
    instructionHe: 'פתרו: 320 + 480. גררו את הבלוקים ובדקו איזו תוצאה עגולה מתקבלת!',
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
];

/* ── Session 4 — מפגש 4: חיבור במאונך והמרה פשוטה (הקבצה) — 7 תרגילי חובה ── */

export const SESSION4_TASKS: SessionTask[] = [
  {
    id: 's4_t1',
    type: 'vertical_addition',
    numberA: 342, numberB: 125, correctAnswer: 467,
    titleHe: 'חיבור במאונך פשוט',
    instructionHe: 'בואו נפתור במאונך: 342 + 125. התחילו מטור היחידות, עברו לעשרות ולמאות.',
    scaffoldLevel: 0,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t2',
    type: 'vertical_addition',
    numberA: 524, numberB: 216, correctAnswer: 740,
    titleHe: 'חיבור במאונך עם המרה לעשרות',
    instructionHe: 'פתרו: 524 + 216. 4 יחידות ועוד 6 יחידות הן 10 יחידות – זכרו לרשום 0 ביחידות ולהעביר 1 שארית לעשרות!',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t3',
    type: 'vertical_addition',
    numberA: 425, numberB: 198, correctAnswer: 623,
    titleHe: 'חיבור במאונך עם המרה כפולה',
    instructionHe: 'פתרו: 425 + 198. בצעו הקבצה ביחידות ובעשרות ורישמו את השאריות בתיבות העזר העליונות.',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t4',
    type: 'vertical_addition',
    numberA: 632, numberB: 279, correctAnswer: 911,
    titleHe: 'חיבור במאונך בתחום ה-1,000',
    instructionHe: 'פתרו: 632 + 279. הקפידו על הקלדה מדויקת בתיבות התשובה.',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t5',
    type: 'vertical_addition',
    numberA: 1530, numberB: 2870, correctAnswer: 4400,
    titleHe: 'חיבור במאונך בתחום האלפים',
    instructionHe: 'תרגיל אתגר: 1,530 + 2,870. חברו בטורים ושימו לב למעבר מעל ה-1,000.',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t6',
    type: 'vertical_addition',
    numberA: 3450, numberB: 2680, correctAnswer: 6130,
    titleHe: 'חיבור אלפים במאונך',
    instructionHe: 'פתרו במאונך: 3,450 + 2,680. השתמשו בתיבות הזיכרון העליונות במידת הצורך.',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
  {
    id: 's4_t7',
    type: 'vertical_addition',
    numberA: 4890, numberB: 3510, correctAnswer: 8400,
    titleHe: 'סיכום מפגש 4: אתגר החיבור',
    instructionHe: 'פתרו במאונך: 4,890 + 3,510. הראו שליטה מלאה בשרשרת הקיבוצים!',
    requiresGrouping: true,
    targetNode: 'procedural_fluency',
  },
];

/* ── Socratic hints & Support content ── */

export const SOCRATIC_HINTS: Record<string, string> = {
  zero_placeholder: 'מה קורה כשטור מתרוקן לחלוטין? האם אפשר פשוט לדלג עליו כשכותבים את המספר?',
  number_magnitude: 'בואו נבדוק – האם המספר קרוב יותר להתחלת הישר, לאמצע שלו, או לסוף שלו?',
  flexible_regrouping: 'האם יש רק דרך אחת לייצג את המספר הזה? נסו לבצע פריטה כדי למצוא דרך נוספת.',
  procedural_fluency: 'האם התשובה שלכם מסתדרת עם מה שאתם כבר יודעים על המספרים? נסו לחשב רק את היחידות קודם.',
  relational_thinking: 'אם משנים רק את ספרת היחידות באחד, מה קורה למספר כולו?',
  regrouping_fluency: 'אין מספיק יחידות כדי לחסר. מאיפה נוכל לארגן עוד יחידות בלוח מבלי לשנות את הכמות הכוללת?',
  missing_subtrahend: 'אם נדע כמה נשאר בסוף, מה נוכל לעשות כדי לגלות כמה חסר באמצע?',
  missing_addend: 'חיבור וחיסור הן פעולות הפוכות. האם נוכל להשתמש בזה כדי למצוא את המספר החסר?',
};

export const DEFAULT_SOCRATIC_HINT = 'בואו נחשוב יחד — מה אנחנו יודעים על המספר הזה?';

export function getSocraticHint(targetNode: string): string {
  return SOCRATIC_HINTS[targetNode] ?? DEFAULT_SOCRATIC_HINT;
}

export function getDynamicSocraticHint(
  targetNode: string,
  counts: { units: number; tens: number; hundreds: number; thousands: number },
  task: any,
  answerDigits: Record<string, string>,
  carryDigits: Record<string, string>
): string {
  if (targetNode === 'regrouping_fluency' || targetNode === 'flexible_regrouping') {
    if (counts.units >= 10) {
      return `ספרתם ${counts.units} יחידות בטור היחידות. האם נוכל לאסוף 10 מהן ולקבץ אותן לעשרת אחת? איך זה ישפיע על הסדר בלוח?`;
    }
    if (counts.tens >= 10) {
      return `יש לכם ${counts.tens} עשרות בטור העשרות. האם נוכל לקחת 10 מהן ולהמיר אותן למאה אחת?`;
    }
    if (task?.isSubtraction && task.numberA && task.numberB) {
      const unitsA = task.numberA % 10;
      const unitsB = task.numberB % 10;
      if (unitsA < unitsB && counts.units < unitsB) {
        return `אנחנו צריכים להחסיר ${unitsB} יחידות, אבל יש לנו רק ${counts.units} יחידות בלוח. מאיפה נוכל לקחת עשרת ולפרוט אותה כדי שיהיו לנו מספיק יחידות?`;
      }
    }
  }

  if (targetNode === 'zero_placeholder') {
    if (task?.numberA && String(task.numberA).includes('0')) {
      const numStr = String(task.numberA);
      const zeroIdx = numStr.indexOf('0');
      const placeName = numStr.length - 1 - zeroIdx === 1 ? 'עשרות' : 'מאות';
      if (counts.tens === 0 && placeName === 'עשרות') {
        return `שימו לב שאין לנו בלוקים בטור העשרות. כשנרשום את המספר, איך נסמן שהמקום הזה ריק מבלי שהספרות האחרות יזוזו שמאלה?`;
      }
    }
  }

  if (targetNode === 'procedural_fluency') {
    const hasAnswer = Object.keys(answerDigits).length > 0;
    const hasCarry = Object.keys(carryDigits).length > 0;
    if (hasAnswer && !hasCarry) {
      return `רשמתם ספרה בתשובה, אך האם ביצעתם המרה כלשהי? אם כן, איפה עלינו לרשום את ה-Carry (השארית) בראש התרגיל כדי לא לשכוח אותה?`;
    }
  }

  return SOCRATIC_HINTS[targetNode] ?? DEFAULT_SOCRATIC_HINT;
}

export type SupportType = 'metacognitive' | 'socratic' | 'worked_example';

export interface SupportContent {
  titleHe: string;
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

export const SESSION5_TASKS: SessionTask[] = [
  {
    id: 's5_t1',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 4500, numberB: 1200, correctAnswer: 3300,
    titleHe: 'חיסור אלפים פשוט',
    instructionHe: 'פתרו את התרגיל הבא: 4,500 פחות 1,200. פרקו או גררו בלוקים במידת הצורך.',
    scaffoldLevel: 1,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t2',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 3800, numberB: 2400, correctAnswer: 1400,
    titleHe: 'חיסור אלפים ללא פריטה',
    instructionHe: 'בנו את המספר 3,800 והחסירו 2,400. רשמו את התוצאה בטורים.',
    scaffoldLevel: 1,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t3',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 5240, numberB: 1800, correctAnswer: 3440,
    titleHe: 'חיסור אלפים עם פריטת מאות',
    instructionHe: 'פתרו: 5,240 - 1,800. לחצו על קוביית האלף כדי לפרוט אותה ל-10 מאות, או גררו אותה לטור המאות.',
    requiresUngrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t4',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 6350, numberB: 2480, correctAnswer: 3870,
    titleHe: 'חיסור אלפים עם פריטת עשרות',
    instructionHe: 'פתרו: 6,350 - 2,480. פירקו מאה אחת ל-10 עשרות כדי לחסר.',
    requiresUngrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t5',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 4120, numberB: 1950, correctAnswer: 2170,
    titleHe: 'חיסור אלפים עם פריטה כפולה',
    instructionHe: 'פתרו: 4,120 - 1,950. בצעו פריטות במידת הצורך בלוח הדינס.',
    requiresUngrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t6',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 7200, numberB: 3850, correctAnswer: 3350,
    titleHe: 'חיסור מורכב בתחום הרבבה',
    instructionHe: 'פתרו: 7,200 - 3,850. שימו לב שלא ניתן להחסיר מספר גדול מקטן בכל טור.',
    requiresUngrouping: true,
    targetNode: 'regrouping_fluency',
  },
  {
    id: 's5_t7',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 8500, numberB: 4920, correctAnswer: 3580,
    titleHe: 'סיכום מפגש 5: אתגר הפריטה',
    instructionHe: 'פתרו: 8,500 - 4,920. השלימו את כל שלבי הפריטה והזינו תשובה סופית.',
    requiresUngrouping: true,
    targetNode: 'regrouping_fluency',
  },
];

/* ── Session 6 — מפגש 6: אתגר האפס כשומר מקום (המרה כפולה מעל אפסים) — 7 תרגילי חובה ── */

export const SESSION6_TASKS: SessionTask[] = [
  {
    id: 's6_t1',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 6200, numberB: 3500, correctAnswer: 2700,
    titleHe: 'חיסור אלפים עם פריטה',
    instructionHe: 'בנו בלוח את המספר 6,200 והחסירו ממנו 3,500. תצטרכו לפרוק אלף אחד למאות!',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t2',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 5000, numberB: 1800, correctAnswer: 3200,
    titleHe: 'פריטה מאלפים מעל אפסים עוקבים',
    instructionHe: 'בנו את המספר 5,000 בלוח והחסירו 1,800. פירקו אלף אחד ל-10 מאות, ומאה אחת ל-10 עשרות.',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t3',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 4005, numberB: 1230, correctAnswer: 2775,
    titleHe: 'מעקף אפסים עוקבים',
    instructionHe: 'פתרו: 4,005 - 1,230. שימו לב לשומר המקום אפס בטור המאות והעשרות.',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t4',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 7000, numberB: 3450, correctAnswer: 3550,
    titleHe: 'חיסור מ-7,000 עגול',
    instructionHe: 'פתרו: 7,000 - 3,450. בצעו פריטה מדורגת מעל האפסים.',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t5',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 3040, numberB: 1580, correctAnswer: 1460,
    titleHe: 'פריטה עם אפס באמצע',
    instructionHe: 'פתרו: 3,040 - 1,580. הקפידו לשמור על ערך המקום של כל ספרה.',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t6',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 8000, numberB: 4260, correctAnswer: 3740,
    titleHe: 'חיסור מ-8,000 מעל אפסים',
    instructionHe: 'פתרו: 8,000 - 4,260. השתמשו בחניכה הסוקרטית אם נתקעתם בפריטת האפסים.',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
  {
    id: 's6_t7',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 9005, numberB: 4520, correctAnswer: 4485,
    titleHe: 'סיכום מפגש 6: מיומנות האפס',
    instructionHe: 'פתרו: 9,005 - 4,520. הראו שליטה מלאה בפריטה מעל אפסים שומרי מקום!',
    requiresUngrouping: true,
    targetNode: 'zero_placeholder',
  },
];

/* ── Session 7 — מפגש 7: בעיות חקר ואינטגרציה (ספרות חסרות & שימור כמות) — 7 תרגילי חובה ── */

export const SESSION7_TASKS: SessionTask[] = [
  {
    id: 's7_t1',
    type: 'addition_simple',
    numberA: 7890, numberB: 1250, correctAnswer: 9140,
    titleHe: 'חיבור אתגר בתחום ה-10,000',
    instructionHe: 'פתרו את התרגיל הבא: 7,890 ועוד 1,250. שימו לב להמרות הנדרשות.',
    requiresGrouping: true,
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t2',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 8120, numberB: 4560, correctAnswer: 3560,
    titleHe: 'חיסור אתגר בתחום ה-10,000',
    instructionHe: 'בנו 8,120 והחסירו 4,560. תצטרכו לבצע פריטה כפולה!',
    requiresUngrouping: true,
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t3',
    type: 'missing_element',
    numberA: 4500, numberB: 1500, correctAnswer: 6000,
    titleHe: 'בעיית חקר: גילוי הספרה החסרה',
    instructionHe: 'לפניכם תרגיל עם ספרה חסרה: 4,5__0 + 1,500 = 6,000. גלו מהי הספרה החסרה בטור העשרות!',
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t4',
    type: 'flexible_decomp',
    numberA: 3400, correctAnswer: 3400,
    titleHe: 'בעיית חקר: הוכחת שימור כמות בלבנים',
    instructionHe: 'פרקו 1 מאה ל-10 עשרות בדינס. בדקו: האם הכמות הכוללת בלוח השתנתה או שרק הייצוג השתנה?',
    requiresUngrouping: true,
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t5',
    type: 'missing_element',
    numberA: 5200, numberB: 2300, correctAnswer: 2900, isSubtraction: true,
    titleHe: 'בעיית חקר: ניתוח שגיאה בחיסור',
    instructionHe: 'תלמיד חישב 5,200 - 2,300 וקיבל 3,100. מצאו היכן נפלה השגיאה ותקנו אותה.',
    requiresUngrouping: true,
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t6',
    type: 'addition_simple',
    numberA: 6540, numberB: 2880, correctAnswer: 9420,
    titleHe: 'אינטגרציית חיבור ופריטה',
    instructionHe: 'פתרו: 6,540 + 2,880. בדקו את תשובתכם באמצעות פעולה הפוכה.',
    requiresGrouping: true,
    targetNode: 'relational_thinking',
  },
  {
    id: 's7_t7',
    type: 'missing_element',
    numberA: 9990, numberB: 4440, correctAnswer: 5550, isSubtraction: true,
    titleHe: 'סיכום מפגש 7: אתגר החוקר הגדול',
    instructionHe: 'פתרו: 9,990 - 4,440. הוכיחו שייצוג המספר משמר את כמותו המקורית בכל שלב.',
    requiresUngrouping: true,
    targetNode: 'relational_thinking',
  },
];

/* ── Session 8 — (מפגש 8: אבחון מסכם אלפים) ── */
export const SESSION8_TASKS: SessionTask[] = [
  {
    id: 's8_t1',
    type: 'addition_simple',
    numberA: 6400, numberB: 2700, correctAnswer: 9100,
    titleHe: 'אבחון מסכם: חיבור אלפים',
    instructionHe: 'בנו וחברו: 6,400 + 2,700. רשמו את התוצאה הסופית.',
    requiresGrouping: true,
    scaffoldLevel: 1,
  },
  {
    id: 's8_t2',
    type: 'vertical_addition',
    isSubtraction: true,
    numberA: 9000, numberB: 4300, correctAnswer: 4700,
    titleHe: 'אבחון מסכם: חיסור אלפים',
    instructionHe: 'בנו והחסירו: 9,000 - 4,300. רשמו את התוצאה הסופית.',
    requiresUngrouping: true,
    scaffoldLevel: 1,
  },

];

/* ── Sessions map: meeting number → task list (session 2 flows through qmatrixFlow) ── */

export const SESSIONS: Record<1 | 3 | 4 | 5 | 6 | 7 | 8, SessionTask[]> = {
  1: SESSION1_TASKS,
  3: SESSION3_TASKS,
  4: SESSION4_TASKS,
  5: SESSION5_TASKS,
  6: SESSION6_TASKS,
  7: SESSION7_TASKS,
  8: SESSION8_TASKS,
};

export function getSessionTasks(meeting: 1 | 3 | 4 | 5 | 6 | 7 | 8): SessionTask[] {
  return SESSIONS[meeting];
}
