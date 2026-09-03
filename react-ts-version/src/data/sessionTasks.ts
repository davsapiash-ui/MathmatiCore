/**
 * sessionTasks.ts — the exercise banks of MathmatiCore.
 *
 * Content source of truth: מסמך 03 (האפיון המפורט), §3.1–3.8, which lists every
 * compulsory exercise per session and per learning path, plus the early-finisher
 * exercises (see sessionBranchTasks.ts). Numbers are copied from that document
 * verbatim. Where the document describes an exercise without giving its numbers
 * (missing-digit skeletons, error analysis, two-step integration, near-exercise
 * inquiry) the chosen numbers are marked `★ chosen` and satisfy the constraint
 * the document states.
 *
 * Structure (PRD v7.2 Modules 14 and 26): seven compulsory exercises per bank;
 * sessions 3–8 each hold two independent banks — green_path (up to 10,000) and
 * remediation_path (up to 1,000). Session 8 deliberately reuses numbers the
 * learner met in sessions 4–6 (מסמך 03 §3.8, clean decay measurement).
 * Session 2 (the diagnostic) lives in src/core/QMatrix.ts and is re-exported here.
 * Session 1 keeps the sandbox tasks of the original implementation.
 */

import { TASKS as QMATRIX_TASKS } from '@/core/QMatrix';
import type { QMatrixTask } from '@/core/QMatrix';
import type { Place, PlaceCounts } from '@/core/placeValue';
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService';
import {
  addition,
  subtraction,
  skeleton,
  missingResultDigit,
  representation,
  flexible,
  withOpts,
  S3_STANDARD,
  S3_NONSTANDARD,
  S4_ADD,
  S5_SUB,
  S6_SUB,
  S8_ADD,
  S8_SUB,
  FLEX_HOWTO,
  type BuildOpts,
} from './taskBuilders';



/* ── Types ── */

export type LearningPath = 'green_path' | 'remediation_path';

export type TaskType =
  | 'session1_intro'
  | 'addition_simple'
  | 'place_value_zero'
  | 'flexible_decomp'
  | 'vertical_addition'
  | 'small_change'
  | 'missing_element'
  | 'representation';

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

  /** Module 14: Indicates an elective branch task (Reinforcement / Challenge) excluded from baseline mastery metrics */
  isOptionalChoiceTask?: boolean;
  branchType?: 'reinforcement' | 'challenge';

  /* Dynamic/adaptive tasks properties */
  range?: [number, number];
  givenHe?: string;
  questionHe?: string;
  /* Progression Requirements */
  requiresGrouping?: boolean;
  requiresUngrouping?: boolean;
  isCompulsory?: boolean;
  targetValue?: number;

  /* ── מסמך 03 exercise shapes ── */
  /** representation: the exact board the learner must build (places not listed must be empty). */
  requiredCounts?: Partial<PlaceCounts>;
  /** Skeleton exercise: operand digits hidden from the learner, to be discovered and typed. */
  hiddenDigits?: { a?: Place[]; b?: Place[] };
  /** Skeleton exercise: result digits shown up-front; the learner supplies only the missing ones. */
  revealedResultDigits?: Place[];
  /** flexible_decomp: every recorded representation must hold an even number of tens. */
  requireEvenTens?: boolean;
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
    instructionHe: 'בנו בבית המספרים 385 ו-152 וחברו אותם. כאשר מצטברים 10 פריטים בטור, לחצו על כפתור "הקבץ (10)" שמופיע בראש הטור.',
    hintHe: 'כאשר יש 10 בלוקים בטור, לחצו על כפתור "הקבץ (10)" הירוק שבראש הטור כדי לקבצם.',
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
    instructionHe: 'בנו 425 והחסירו 162. כדי לפרוט מאה לעשרות, לחצו על קוביית המאה בלוח או גררו אותה לטור העשרות.',
    hintHe: 'לחצו על קוביית המאה כדי לפרק אותה ל-10 עשרות, או גררו אותה ימינה לטור העשרות!',
    scaffoldLevel: 1,
    requiresUngrouping: true,
  },
];

/* ── Session 2 — the 5 Q-Matrix diagnostic tasks (מפגש 2: מיפוי יכולות ואבחון סמוי) ── */

export const SESSION2_TASKS: QMatrixTask[] = QMATRIX_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 3 — ערך המקום וגמישות ייצוגית (פירוק והרכבה) — מסמך 03 §3.3
 * ══════════════════════════════════════════════════════════════════════════ */

export const SESSION3_REMEDIATION_TASKS: SessionTask[] = [
  representation('s3_r_t1', 340, { hundreds: 3, tens: 4 },
    'ביסוס ייצוג סטנדרטי בתחום האלף',
    S3_STANDARD('340', '3 מאות ו-4 עשרות')),
  representation('s3_r_t2', 340, { hundreds: 2, tens: 14 },
    'פירוק חד שלבי מונחה',
    S3_NONSTANDARD('מאה אחת לעשר עשרות', '340', '2 מאות ו-14 עשרות')),
  representation('s3_r_t3', 450, { tens: 45 },
    'מעבר לייצוג לא סטנדרטי מלא',
    'ייצגו את המספר 450 באמצעות עשרות בלבד: 45 עשרות על הלוח. בדקו התאמה ללוח בית המספרים וכתבו את המספר בשורת התוצאה!'),
  representation('s3_r_t4', 85, { tens: 7, units: 15 },
    'פירוק עשרות ליחידות בתחום המאה',
    S3_NONSTANDARD('עשרת אחת לעשר יחידות', '85', '7 עשרות ו-15 יחידות')),
  representation('s3_r_t5', 506, { hundreds: 5, units: 6 },
    'ייצוג מספר עם אפס שומר מקום',
    'גררו לבנים לייצוג המספר 506 בדרך הרגילה: 5 מאות ו-6 יחידות. שימו לב: טור העשרות נשאר ריק. כתבו את המספר בשורת התוצאה!',
    { targetNode: 'decimal_structure' }),
  representation('s3_r_t6', 506, { hundreds: 4, tens: 10, units: 6 },
    'פירוק מספר עם אפס בטור העשרות',
    S3_NONSTANDARD('מאה אחת לעשר עשרות', '506', '4 מאות, 10 עשרות ו-6 יחידות'),
    { targetNode: 'decimal_structure' }),
  withOpts({
    id: 's3_r_t7', type: 'missing_element', numberA: 100, numberB: 160, correctAnswer: 60,
    titleHe: 'משימת חקר ואינטגרציה',
    instructionHe: 'המספר 160 מורכב ממאה אחת ועוד כמה? בנו את המספר בלוח משמאל וכתבו את החלק החסר בתיבת התשובה.',
    targetNode: 'decimal_structure',
  }, {}),
];

export const SESSION3_GREEN_TASKS: SessionTask[] = [
  representation('s3_g_t1', 3400, { thousands: 3, hundreds: 4 },
    'ביסוס ייצוג סטנדרטי בתחום הרבבה',
    S3_STANDARD('3,400', '3 אלפים ו-4 מאות')),
  representation('s3_g_t2', 3400, { thousands: 2, hundreds: 14 },
    'פירוק אלפים למאות',
    S3_NONSTANDARD('לבנת אלף אחת לעשר מאות', '3,400', '2 אלפים ו-14 מאות')),
  representation('s3_g_t3', 4500, { hundreds: 45 },
    'מעבר לייצוג לא סטנדרטי מלא',
    'ייצגו את המספר 4,500 באמצעות מאות בלבד: 45 מאות על הלוח. בדקו התאמה ללוח בית המספרים וכתבו את המספר בשורת התוצאה!'),
  representation('s3_g_t4', 5230, { thousands: 4, hundreds: 11, tens: 13 },
    'פירוק מעורב רב שלבי',
    S3_NONSTANDARD('אלף אחד למאות ומאה אחת לעשרות', '5,230', '4 אלפים, 11 מאות ו-13 עשרות')),
  representation('s3_g_t5', 6030, { thousands: 6, tens: 3 },
    'ייצוג מספר עם אפס בטור המאות',
    'גררו לבנים לייצוג המספר 6,030 בדרך הרגילה: 6 אלפים ו-3 עשרות. שימו לב: טור המאות נשאר ריק. כתבו את המספר בשורת התוצאה!',
    { targetNode: 'decimal_structure' }),
  representation('s3_g_t6', 6030, { thousands: 5, hundreds: 10, tens: 3 },
    'פירוק אלפים דרך טור מאות ריק',
    S3_NONSTANDARD('לבנת אלף אחת לעשר מאות', '6,030', '5 אלפים, 10 מאות ו-3 עשרות'),
    { targetNode: 'decimal_structure' }),
  flexible('s3_g_t7', 2100,
    'משימת חקר של גמישות ייצוגית',
    `מצאו דרכים שונות לייצג את המספר 2,100 בעזרת הרכבים משתנים של אלפים, מאות ועשרות. ${FLEX_HOWTO}`),
];

export const SESSION3_TASKS: SessionTask[] = SESSION3_GREEN_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 4 — אלגוריתם החיבור במאונך והמרה פשוטה (הקבצה) — מסמך 03 §3.4
 * Titles describe the arithmetic that actually happens; where the document's label
 * disagreed with its own numbers (owner decision 3.9.2026: keep the numbers), the
 * title here follows the numbers. See מסמכי אפיון/סטיות_מהאפיון.md.
 * ══════════════════════════════════════════════════════════════════════════ */

export const SESSION4_REMEDIATION_TASKS: SessionTask[] = [
  addition('s4_r_t1', 142, 23, 'ביסוס אלגוריתם ללא המרה בתחום המאה', S4_ADD('142 + 23', false)),
  addition('s4_r_t2', 128, 35, 'המרה פשוטה ראשונה ביחידות בתחום המאה', S4_ADD('128 + 35', true)),
  addition('s4_r_t3', 247, 135, 'המרה ביחידות עם נוכחות מאות', S4_ADD('247 + 135', true)),
  addition('s4_r_t4', 456, 281, 'המרה בטור העשרות בתחום האלף', S4_ADD('456 + 281', true)),
  addition('s4_r_t5', 354, 128, 'המרה פשוטה ביחידות המעבירה עשרת לטור העשרות', S4_ADD('354 + 128', true)),
  addition('s4_r_t6', 507, 125, 'המרה ביחידות עם אפס בטור העשרות', S4_ADD('507 + 125', true)),
  // ★ chosen: מסמך 03 names the task ("ספרה חסרה בטור התוצאה") without numbers.
  missingResultDigit('s4_r_t7', 328, 145, false, 'tens',
    'משימת חקר וגילוי ספרה חסרה',
    'בתרגיל 328 + 145 חסרה ספרת העשרות בשורת התוצאה. בצעו את ההקבצה בלבני הדינס כדי לגלות אותה, וכתבו אותה בתיבה הריקה.',
    { targetNode: 'relational_thinking' }),
];

export const SESSION4_GREEN_TASKS: SessionTask[] = [
  addition('s4_g_t1', 1245, 328, 'המרה פשוטה בטור היחידות בתחום הרבבה', S4_ADD('1,245 + 328', true)),
  addition('s4_g_t2', 2356, 1427, 'המרה ביחידות עם נוכחות אלפים', S4_ADD('2,356 + 1,427', true)),
  addition('s4_g_t3', 3456, 2183, 'המרה בטור העשרות בלבד', S4_ADD('3,456 + 2,183', true)),
  addition('s4_g_t4', 4821, 1534, 'המרה בטור המאות בלבד', S4_ADD('4,821 + 1,534', true)),
  addition('s4_g_t5', 5678, 2453, 'שרשרת המרות ביחידות, בעשרות ובמאות בתחום הרבבה', S4_ADD('5,678 + 2,453', true)),
  addition('s4_g_t6', 7045, 1283, 'חישוב המרה עם אפסים כשומרי מקום', S4_ADD('7,045 + 1,283', true)),
  // ★ chosen: מסמך 03 describes an inquiry comparing near exercises, without numbers.
  withOpts({
    id: 's4_g_t7', type: 'small_change',
    titleHe: 'משימת חקר של הרכבי המרה משתנים',
    instructionHe: 'השוו בין שני תרגילים קרובים וגלו כיצד המרה בטור היחידות משפיעה על הטורים הבאים.',
    givenHe: '3,456 + 2,183 = 5,639',
    questionHe: 'מה ישתנה אם נחליף רק את ספרת היחידות של המחובר הראשון: 3,459 + 2,183?',
    choices: [
      { id: 'א', textHe: 'תיווסף המרה גם בטור היחידות, ההמרה בטור העשרות תישאר, והתוצאה תהיה 5,642', correct: true },
      { id: 'ב', textHe: 'רק ספרת היחידות בתוצאה תשתנה, והתוצאה תהיה 5,632' },
      { id: 'ג', textHe: 'ההמרה בטור העשרות תיעלם, והתוצאה תהיה 5,542' },
    ],
    correctAnswer: 'א',
    targetNode: 'relational_thinking',
  }, {}),
];

export const SESSION4_TASKS: SessionTask[] = SESSION4_GREEN_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 5 — אלגוריתם החיסור במאונך והמרה פשוטה (פריטה) — מסמך 03 §3.5
 * ══════════════════════════════════════════════════════════════════════════ */

export const SESSION5_REMEDIATION_TASKS: SessionTask[] = [
  subtraction('s5_r_t1', 78, 25, 'ביסוס אלגוריתם ללא פריטה בתחום המאה', S5_SUB('78 − 25', false)),
  subtraction('s5_r_t2', 53, 18, 'פריטה פשוטה ראשונה מעשרות ליחידות בתחום המאה', S5_SUB('53 − 18', true)),
  subtraction('s5_r_t3', 142, 25, 'פריטה ביחידות עם נוכחות מאות', S5_SUB('142 − 25', true)),
  subtraction('s5_r_t4', 345, 182, 'פריטה בטור העשרות בתחום האלף', S5_SUB('345 − 182', true)),
  subtraction('s5_r_t5', 563, 128, 'פריטה פשוטה בטור היחידות', S5_SUB('563 − 128', true)),
  subtraction('s5_r_t6', 480, 155, 'פריטה פשוטה בטור העשרות עם אפס בטור היחידות', S5_SUB('480 − 155', true)),
  // ★ chosen: מסמך 03 names the task ("ספרה חסרה בטור המחוסר") without numbers.
  skeleton('s5_r_t7', 442, 128, true, { a: ['tens'] },
    'משימת חקר וגילוי ספרה חסרה',
    'בשורת המחוסר חסרה ספרת העשרות: 4▢2 − 128 = 314. בצעו את הפריטה בלבני הדינס כדי לגלות את הספרה המקורית, וכתבו אותה בתיבה הריקה.',
    { targetNode: 'relational_thinking' }),
];

export const SESSION5_GREEN_TASKS: SessionTask[] = [
  subtraction('s5_g_t1', 5432, 2118, 'פריטה פשוטה בטור היחידות בתחום הרבבה', S5_SUB('5,432 − 2,118', true)),
  subtraction('s5_g_t2', 6543, 1227, 'פריטה ביחידות עם נוכחות אלפים', S5_SUB('6,543 − 1,227', true)),
  subtraction('s5_g_t3', 7651, 3325, 'פריטה מטור העשרות ליחידות', S5_SUB('7,651 − 3,325', true)),
  subtraction('s5_g_t4', 8762, 4439, 'פריטה מטור העשרות ליחידות בתחום הרבבה', S5_SUB('8,762 − 4,439', true)),
  subtraction('s5_g_t5', 6284, 1157, 'פריטה פשוטה בטור היחידות בתחום הרבבה', S5_SUB('6,284 − 1,157', true)),
  subtraction('s5_g_t6', 3845, 1517, 'פריטה פשוטה ביחידות, כל הספרות שונות מאפס', S5_SUB('3,845 − 1,517', true)),
  // ★ chosen: מסמך 03 describes an inquiry comparing near exercises, without numbers.
  withOpts({
    id: 's5_g_t7', type: 'small_change',
    titleHe: 'משימת חקר של הרכבי פריטה משתנים',
    instructionHe: 'השוו בין שני תרגילים קרובים וגלו כיצד פריטה בטור העשרות משפיעה על הטורים הבאים.',
    givenHe: '7,651 − 3,325 = 4,326',
    questionHe: 'מה ישתנה אם נחליף רק את ספרת העשרות של המחוסר: 7,681 − 3,325?',
    choices: [
      { id: 'א', textHe: 'הפריטה מטור העשרות תישאר, וספרת העשרות בתוצאה תגדל ב-3: 4,356', correct: true },
      { id: 'ב', textHe: 'לא תידרש יותר פריטה, והתוצאה תהיה 4,366' },
      { id: 'ג', textHe: 'רק ספרת העשרות תשתנה ל-8, והתוצאה תהיה 4,386' },
    ],
    correctAnswer: 'א',
    targetNode: 'relational_thinking',
  }, {}),
];

export const SESSION5_TASKS: SessionTask[] = SESSION5_GREEN_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 6 — אתגר האפס כשומר מקום ומעבר מעל אפסים (המרה כפולה) — מסמך 03 §3.6
 * ══════════════════════════════════════════════════════════════════════════ */

const ZERO: BuildOpts = { targetNode: 'zero_placeholder' };

export const SESSION6_REMEDIATION_TASKS: SessionTask[] = [
  subtraction('s6_r_t1', 240, 125, 'ביסוס פריטה פשוטה עם אפס בטור היחידות של המחוסר', S6_SUB('240 − 125'), ZERO),
  subtraction('s6_r_t2', 305, 12, 'פריטה פשוטה מטור המאות כאשר טור העשרות ריק', S6_SUB('305 − 12'), ZERO),
  subtraction('s6_r_t3', 204, 112, 'פריטה פשוטה מטור המאות לטור העשרות', S6_SUB('204 − 112'), ZERO),
  subtraction('s6_r_t4', 300, 142, 'פריטה כפולה קלאסית דרך אפס בתחום המאה', S6_SUB('300 − 142'), ZERO),
  subtraction('s6_r_t5', 602, 145, 'פריטה כפולה דרך אפס כאשר ספרת היחידות אינה אפס', S6_SUB('602 − 145'), ZERO),
  subtraction('s6_r_t6', 500, 287, 'ביסוס פריטה כפולה בתחום האלף', S6_SUB('500 − 287'), ZERO),
  // ★ chosen (400 − 156 is the grade-ג example in מסמך 05, המטריקס).
  missingResultDigit('s6_r_t7', 400, 156, true, 'tens',
    'משימת חקר וספרה חסרה',
    'בתרגיל 400 − 156 חסרה ספרת העשרות בשורת התוצאה. בצעו את הפריטה הכפולה בלבני הדינס כדי לגלות אותה, וכתבו אותה בתיבה הריקה.',
    ZERO),
];

export const SESSION6_GREEN_TASKS: SessionTask[] = [
  subtraction('s6_g_t1', 2045, 1128, 'פריטה כפולה דרך טור מאות ריק', S6_SUB('2,045 − 1,128'), ZERO),
  subtraction('s6_g_t2', 3005, 1248, 'פריטה משולשת דרך טור עשרות ריק', S6_SUB('3,005 − 1,248'), ZERO),
  subtraction('s6_g_t3', 4000, 1562, 'פריטה משולשת דרך אפסים עוקבים', S6_SUB('4,000 − 1,562'), ZERO),
  subtraction('s6_g_t4', 5000, 2345, 'תרגול נוסף של פריטה משולשת', S6_SUB('5,000 − 2,345'), ZERO),
  subtraction('s6_g_t5', 6020, 1485, 'פריטה משולשת עם אפסים שאינם רציפים', S6_SUB('6,020 − 1,485'), ZERO),
  subtraction('s6_g_t6', 7003, 2845, 'פריטה משולשת עם ספרת יחידות שאינה אפס', S6_SUB('7,003 − 2,845'), ZERO),
  // ★ chosen: מסמך 03 names the task ("השלמת ספרות חסרות בשורת המחוסר") without numbers.
  skeleton('s6_g_t7', 6005, 2847, true, { a: ['tens', 'units'] },
    'משימת חקר של השלמת ספרות חסרות בתחום הרבבה',
    'בשורת המחוסר חסרות שתי ספרות: 6,0▢▢ − 2,847 = 3,158. גלו אותן בעזרת הפריטה המשולשת בלבני הדינס וכתבו אותן בתיבות הריקות. אפשר להיעזר בכפתור ביטול פעולה לחקירה עצמאית.',
    ZERO),
];

export const SESSION6_TASKS: SessionTask[] = SESSION6_GREEN_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 7 — פתרון בעיות חקר ואינטגרציה של פעולות החשבון — מסמך 03 §3.7
 * ══════════════════════════════════════════════════════════════════════════ */

const INQUIRY: BuildOpts = { targetNode: 'relational_thinking' };

export const SESSION7_REMEDIATION_TASKS: SessionTask[] = [
  flexible('s7_r_t1', 125,
    'משימת הוכחת ערך מקום',
    'הוכיחו בלבני דינס ש-12 עשרות ו-5 יחידות שוות בדיוק למאה אחת, 2 עשרות ו-5 יחידות: בנו 12 עשרות ו-5 יחידות ולחצו "הוספת ייצוג". לאחר מכן הקבצו 10 עשרות למאה אחת והוסיפו את הייצוג השני.',
    INQUIRY),
  // ★ chosen: מסמך 03 describes the skeleton without numbers.
  skeleton('s7_r_t2', 314, 254, false, { a: ['units'] },
    'ספרה חסרה אחת בחיבור ללא המרה',
    'בתרגיל 31▢ + 254 = 568 חסרה ספרת היחידות של המחובר הראשון. גלו אותה בעזרת הלבנים וכתבו אותה בתיבה הריקה.',
    INQUIRY),
  // ★ chosen.
  skeleton('s7_r_t3', 386, 271, false, { a: ['tens'] },
    'ספרה חסרה בחיבור עם המרה',
    'בתרגיל 3▢6 + 271 = 657 חסרה ספרת העשרות של המחובר הראשון. שימו לב: נדרשת המרה אחת לטור המאות. גלו את הספרה בעזרת הלבנים וכתבו אותה בתיבה הריקה.',
    INQUIRY),
  // ★ chosen.
  skeleton('s7_r_t4', 542, 178, true, { a: ['tens', 'units'] },
    'שתי ספרות חסרות בחיסור עם פריטה',
    'בתרגיל 5▢▢ − 178 = 364 חסרות ספרת היחידות וספרת העשרות של המחוסר. גלו אותן בעזרת הפריטה בלבני הדינס וכתבו אותן בתיבות הריקות.',
    INQUIRY),
  // ★ chosen: the imaginary learner's error is the one מסמך 03 describes (a forgotten memory-circle carry).
  addition('s7_r_t5', 247, 135,
    'ניתוח שגיאה של לומד דמיוני',
    'תלמיד פתר 247 + 135 וקיבל 372, כי שכח לרשום את ההמרה בעיגול הזיכרון מעל טור העשרות. תקנו את התרגיל בעזרת לבני הדינס: בנו את המספרים, הקבצו, רשמו את ההמרה בעיגול הזיכרון וכתבו את התוצאה הנכונה.',
    INQUIRY),
  // ★ chosen: two-step add-then-remove reaching a defined target.
  representation('s7_r_t6', 510, { hundreds: 5, tens: 1 },
    'אינטגרציה דו שלבית של הוספה והפחתה',
    'בנו את המספר 340 בלוח. הוסיפו 2 מאות, ואז הסירו 3 עשרות. איזה מספר קיבלתם? השאירו אותו על הלוח וכתבו אותו בשורת התוצאה.',
    INQUIRY),
  flexible('s7_r_t7', 150,
    'בעיית חקר פתוחה למחצה של הרכבים משתנים',
    `מצאו דרכים שונות לייצג את המספר 150 כך שבכל דרך מספר העשרות זוגי (למשל 14 עשרות ו-10 יחידות). ${FLEX_HOWTO}`,
    { ...INQUIRY, requireEvenTens: true }),
];

export const SESSION7_GREEN_TASKS: SessionTask[] = [
  flexible('s7_g_t1', 2500,
    'משימת הוכחת שימור כמות מורכבת בתחום הרבבה',
    'הוכיחו בלבנים ש-25 מאות שוות בדיוק ל-2 אלפים ו-5 מאות: בנו 25 מאות ולחצו "הוספת ייצוג". לאחר מכן הקבצו 10 מאות לאלף אחד, ושוב, והוסיפו את הייצוג הרגיל.',
    INQUIRY),
  // ★ chosen: מסמך 03 describes the skeleton without numbers.
  skeleton('s7_g_t2', 2637, 1554, false, { a: ['hundreds', 'units'] },
    'שתי ספרות חסרות בחיבור עם המרה כפולה',
    'בתרגיל 2,▢3▢ + 1,554 = 4,191 חסרות שתי ספרות של המחובר הראשון, בטורים שונים. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.',
    INQUIRY),
  // ★ chosen.
  skeleton('s7_g_t3', 5006, 2847, true, { a: ['hundreds', 'tens', 'units'] },
    'שלוש ספרות חסרות בחיסור עם פריטה כפולה',
    'בתרגיל 5,▢▢▢ − 2,847 = 2,159 חסרות שלוש ספרות של המחוסר. הפתרון עובר מעל אפסים בטור העשרות. גלו את הספרות בעזרת הפריטה בלבני הדינס וכתבו אותן בתיבות הריקות.',
    INQUIRY),
  // ★ chosen: the imaginary learner's error is the one מסמך 03 describes (a wrong double regrouping in the hundreds).
  addition('s7_g_t4', 4857, 3568,
    'איתור ותיקון שגיאת המרה כפולה',
    'תלמיד פתר 4,857 + 3,568 וקיבל 7,425, כי בהמרה הכפולה בטור המאות שכח להעביר את המאה שהתקבצה לטור האלפים. תקנו את התרגיל בעזרת הלבנים על הלוח וכתבו את התוצאה הנכונה.',
    INQUIRY),
  // ★ chosen: add one thousand, remove hundreds, reach a defined target.
  representation('s7_g_t5', 3800, { thousands: 3, hundreds: 8 },
    'אינטגרציה דו שלבית של פעולות הפוכות בתחום הרבבה',
    'בנו את המספר 3,400 בלוח. הוסיפו אלף אחד, ואז הסירו 6 מאות. איזה מספר קיבלתם? השאירו אותו על הלוח וכתבו אותו בשורת התוצאה.',
    INQUIRY),
  // ★ chosen: a quantity given in non-standard form, to be regrouped into the fewest blocks.
  representation('s7_g_t6', 2730, { thousands: 2, hundreds: 7, tens: 3 },
    'בעיית חקר של ייצוג מינימלי של לבנים',
    'לפניכם כמות: אלף אחד, 16 מאות ו-13 עשרות. הציגו את אותה כמות במספר הלבנים הקטן ביותר האפשרי — בצעו את כל ההקבצות שמאלה לאורך העמודות — וכתבו את המספר בשורת התוצאה.',
    INQUIRY),
  // ★ chosen.
  skeleton('s7_g_t7', 6752, 2827, true, { a: ['hundreds', 'units'] },
    'בעיית חקר של ספרות חסרות משולבות',
    'בתרגיל 6,▢5▢ − 2,827 = 3,925 חסרות שתי ספרות של המחוסר המקורי. גלו אותן על סמך התוצאה ומניפולציה פעילה בלוח לבני הדינס, וכתבו אותן בתיבות הריקות.',
    INQUIRY),
];

export const SESSION7_TASKS: SessionTask[] = SESSION7_GREEN_TASKS;

/* ══════════════════════════════════════════════════════════════════════════
 * מפגש 8 — מפגש חוקר (הערכה ורפלקציה מסכמת) — מסמך 03 §3.8
 * ברמת ההפשטה (ללא לבנים). המספרים הם במכוון מספרים שהלומדים כבר פגשו
 * במפגשים 4–6, למדידה נקייה של פער הדעיכה.
 * ══════════════════════════════════════════════════════════════════════════ */

export const SESSION8_REMEDIATION_TASKS: SessionTask[] = [
  addition('s8_r_t1', 142, 23, 'חיבור ללא המרה בתחום המאה', S8_ADD('142 + 23'), { scaffoldLevel: 1 }),
  addition('s8_r_t2', 128, 35, 'חיבור עם המרה אחת ביחידות', S8_ADD('128 + 35'), { scaffoldLevel: 1 }),
  addition('s8_r_t3', 456, 281, 'חיבור עם המרה בטור העשרות', S8_ADD('456 + 281'), { scaffoldLevel: 1 }),
  subtraction('s8_r_t4', 78, 25, 'חיסור ללא פריטה בתחום המאה', S8_SUB('78 − 25'), { scaffoldLevel: 1 }),
  subtraction('s8_r_t5', 53, 18, 'חיסור עם פריטה פשוטה בתחום המאה', S8_SUB('53 − 18'), { scaffoldLevel: 1 }),
  subtraction('s8_r_t6', 302, 145, 'חיסור עם פריטה כפולה דרך אפס יחיד', S8_SUB('302 − 145'), { scaffoldLevel: 1, targetNode: 'zero_placeholder' }),
  // ★ chosen: reuses 456 + 281 (session 4) as מסמך 03 requires known numbers; the tens digit of an addend is hidden.
  skeleton('s8_r_t7', 456, 281, false, { a: ['tens'] },
    'בעיית חקר של גילוי ספרה חסרה בתחום האלף',
    'בתרגיל 4▢6 + 281 = 737 חסרה ספרת העשרות של המחובר הראשון. גלו אותה וכתבו אותה בתיבה הריקה.',
    { scaffoldLevel: 1, targetNode: 'relational_thinking' }),
];

export const SESSION8_GREEN_TASKS: SessionTask[] = [
  addition('s8_g_t1', 1245, 328, 'חיבור עם המרה אחת בתחום הרבבה', S8_ADD('1,245 + 328'), { scaffoldLevel: 1 }),
  addition('s8_g_t2', 5678, 2453, 'חיבור עם המרה משולשת בתחום הרבבה', S8_ADD('5,678 + 2,453'), { scaffoldLevel: 1 }),
  subtraction('s8_g_t3', 5432, 2118, 'חיסור עם פריטה פשוטה בתחום הרבבה', S8_SUB('5,432 − 2,118'), { scaffoldLevel: 1 }),
  subtraction('s8_g_t4', 4354, 1126, 'חיסור עם פריטה פשוטה בתחום הרבבה', S8_SUB('4,354 − 1,126'), { scaffoldLevel: 1 }),
  subtraction('s8_g_t5', 4000, 1562, 'חיסור מעל אפסים רציפים בתחום הרבבה', S8_SUB('4,000 − 1,562'), { scaffoldLevel: 1, targetNode: 'zero_placeholder' }),
  // ★ chosen: reuses 5,678 + 2,453 (session 4); two addend digits hidden.
  skeleton('s8_g_t6', 5678, 2453, false, { a: ['hundreds', 'units'] },
    'בעיית חקר של ספרות חסרות בחיבור',
    'בתרגיל 5,▢7▢ + 2,453 = 8,131 חסרות שתי ספרות של המחובר הראשון. גלו אותן וכתבו אותן בתיבות הריקות.',
    { scaffoldLevel: 1, targetNode: 'relational_thinking' }),
  // ★ chosen: reuses 4,000 − 1,562 (session 6); three minuend digits hidden.
  skeleton('s8_g_t7', 4000, 1562, true, { a: ['hundreds', 'tens', 'units'] },
    'בעיית חקר של ספרות חסרות בחיסור',
    'בתרגיל 4,▢▢▢ − 1,562 = 2,438 חסרות שלוש ספרות של המחוסר. הפתרון עובר מעל אפסים. גלו אותן וכתבו אותן בתיבות הריקות.',
    { scaffoldLevel: 1, targetNode: 'relational_thinking' }),
];

export const SESSION8_TASKS: SessionTask[] = SESSION8_GREEN_TASKS;

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
      return `רשמתם ספרה בתשובה, אך האם ביצעתם המרה כלשהי? אם כן, איפה עלינו לרשום את השארית (הספרה שהעברנו) בראש התרגיל כדי לא לשכוח אותה?`;
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

/* ── Sessions map: meeting number → task bank by learning path ── */

export const SESSIONS_BY_PATH: Record<3 | 4 | 5 | 6 | 7 | 8, Record<LearningPath, SessionTask[]>> = {
  3: { green_path: SESSION3_GREEN_TASKS, remediation_path: SESSION3_REMEDIATION_TASKS },
  4: { green_path: SESSION4_GREEN_TASKS, remediation_path: SESSION4_REMEDIATION_TASKS },
  5: { green_path: SESSION5_GREEN_TASKS, remediation_path: SESSION5_REMEDIATION_TASKS },
  6: { green_path: SESSION6_GREEN_TASKS, remediation_path: SESSION6_REMEDIATION_TASKS },
  7: { green_path: SESSION7_GREEN_TASKS, remediation_path: SESSION7_REMEDIATION_TASKS },
  8: { green_path: SESSION8_GREEN_TASKS, remediation_path: SESSION8_REMEDIATION_TASKS },
};

/** Default (green_path) bank per session — kept for callers that do not resolve a path. */
export const SESSIONS: Record<1 | 3 | 4 | 5 | 6 | 7 | 8, SessionTask[]> = {
  1: SESSION1_TASKS,
  3: SESSION3_GREEN_TASKS,
  4: SESSION4_GREEN_TASKS,
  5: SESSION5_GREEN_TASKS,
  6: SESSION6_GREEN_TASKS,
  7: SESSION7_GREEN_TASKS,
  8: SESSION8_GREEN_TASKS,
};

const PATH_SPLIT_SESSIONS = [3, 4, 5, 6, 7, 8] as const;

/**
 * PRD v7.2 Modules 4/26: the hardcoded banks in their canonical Firestore
 * `curriculum_catalog` document layout — used by the admin publish action to
 * seed/refresh the server catalog. Always reads the hardcoded constants,
 * never the live overrides. 13 banks: session 1, and both paths of sessions 3–8.
 */
export function getHardcodedCatalogBanks(): Array<{
  id: string;
  session_number: number;
  learning_path: LearningPath | null;
  tasks: SessionTask[];
}> {
  const banks: Array<{ id: string; session_number: number; learning_path: LearningPath | null; tasks: SessionTask[] }> = [
    { id: 'session_1', session_number: 1, learning_path: null, tasks: SESSIONS[1] },
  ];
  for (const n of PATH_SPLIT_SESSIONS) {
    banks.push({ id: `session_${n}_green_path`, session_number: n, learning_path: 'green_path', tasks: SESSIONS_BY_PATH[n].green_path });
    banks.push({ id: `session_${n}_remediation_path`, session_number: n, learning_path: 'remediation_path', tasks: SESSIONS_BY_PATH[n].remediation_path });
  }
  return banks;
}

export function getSessionTasks(
  meeting: 1 | 3 | 4 | 5 | 6 | 7 | 8,
  path: LearningPath = 'green_path'
): SessionTask[] {
  const isSplit = meeting >= 3 && meeting <= 8;
  const hardcoded = isSplit
    ? (SESSIONS_BY_PATH[meeting as 3 | 4 | 5 | 6 | 7 | 8]?.[path] || SESSIONS_BY_PATH[meeting as 3 | 4 | 5 | 6 | 7 | 8]?.green_path || [])
    : (SESSIONS[meeting] || []);

  // PRD v7.2 Modules 4/26: a bank published to the Firestore curriculum_catalog
  // (cached in IndexedDB, promoted only at session init) overrides the hardcoded
  // bank; the hardcoded constants remain the guaranteed offline fallback.
  return curriculumCatalog.getActiveBank(meeting, isSplit ? path : null) ?? hardcoded;
}
