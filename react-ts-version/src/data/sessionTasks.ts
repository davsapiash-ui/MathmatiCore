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
 * Session 1 is מסמך 03 §3.1 plus four refresh exercises (register decision ו).
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
  /** Blocks already on the board when the task starts (meeting 1's grouping refresh, like diagnostic task 5's cubes on screen). */
  initialCounts?: Partial<PlaceCounts>;
  /** representation: the card does not list the board to build — finding it is the exercise. */
  hideRequiredCounts?: boolean;
  /** The task opens on the board — and the undo history — the previous task left (meeting 1, step 5). */
  continuesBoard?: boolean;
}

/* ── Session 1 — ארגז החול המונחה: היכרות עם הכלים וריענון לקראת האבחון ── */

/**
 * מפגש 1 (owner, 24.9.2026 — register decision ו): the six introduction steps
 * of מסמך 03 §3.1, then four refresh exercises. Each refresh exercise mirrors
 * one diagnostic task of meeting 2 column for column with other numbers, so a
 * wrong answer in the diagnostic is a real gap, not rust and not the interface.
 * Meeting 1 is never scored (PRD Module 14 §ב); the teacher's report shows
 * which tools each learner operated and how each exercise ended.
 *
 * מסמך 03 step 1 (entry, welcome) opens the sandbox task; its former step 5
 * (typing creates blocks) was removed by the owner (register gap טז).
 */
/** A meeting 1 exercise: never compulsory (PRD Module 14 §ב), optionally requiring the conversion itself. */
function s1(
  task: SessionTask,
  flags: Pick<SessionTask, 'requiresGrouping' | 'requiresUngrouping' | 'initialCounts' | 'hideRequiredCounts'> = {}
): SessionTask {
  const { isCompulsory: _dropped, ...rest } = task;
  return { ...rest, ...flags };
}

export const SESSION1_TASKS: SessionTask[] = [
  // מסמך 03 §3.1 steps 1–2: welcome, free dragging, the digits follow the
  // blocks. Steps 1–5 are tool steps, their on-screen text the document's,
  // word for word; core/session1Checklist.ts says what completes each.
  {
    id: 's1_sandbox_controlled',
    type: 'session1_intro',
    titleHe: 'חקירה וירטואלית חופשית',
    instructionHe: 'ברוכים הבאים לסביבת הלמידה מתמטיקאור! שחקו וחקרו בחופשיות בתחנה אחת הכרות עם המערכת שלנו.\nגררו לבנים לטורים משמאל וצפו בספרות המשתנות בלוח בית המספרים!',
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
  },
  // Step 3: decompose a hundred into ten tens. The document's step 2 ends on
  // 230 (two hundreds, three tens) and step 3 turns it into one hundred and 13
  // tens — so step 3 opens on 230.
  {
    id: 's1_decompose_hundred',
    type: 'session1_intro',
    titleHe: 'פירוק והרכבה',
    instructionHe: 'לחצו על לבנה כדי לפרק אותה לחלקים קטנים יותר ועקבו אחר השינוי בלוח בית המספרים.',
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
    initialCounts: { hundreds: 2, tens: 3 },
  },
  // Step 4: 305 — zero as a place holder.
  {
    id: 's1_build_305',
    type: 'session1_intro',
    titleHe: 'האפס כשומר מקום',
    instructionHe: 'נסו לבנות את המספר 305 בלבני דינס ושימו לב לתפקיד של הספרה אפס בלוח בית המספרים הריק מעשרות.',
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
  },
  // Step 5: the reversible mistake — undo, then the trash.
  {
    id: 's1_undo_trash',
    type: 'session1_intro',
    titleHe: 'ביטול פעולה וניקוי הלוח',
    instructionHe: 'לחצו על כפתור ביטול פעולה כדי לחזור צעד אחד אחורה.\nאחר כך לחצו על פח האשפה כדי לנקות את הלוח.',
    correctAnswer: 'proceed_any',
    scaffoldLevel: 0,
    // מסמך 03: undo "the last typing or dragging", then the trash "resets the
    // workspace" — the board step 4 built, with its history.
    continuesBoard: true,
  },
  // מסמך 03 §3.1 step 6 (formerly 7) — the target task: 347 → 3 hundreds, 3 tens, 17 units.
  s1(representation('s1_target_347', 347, { hundreds: 3, tens: 3, units: 17 },
    'משימת יעד מסכמת',
    'משימת יעד מסכמת: בנו את המספר 347 בלבני דינס, פרטו עשרת אחת לעשר יחידות, וכתבו בשורת התוצאה את המספר שעל הלוח!'),
    { requiresUngrouping: true, hideRequiredCounts: true }),

  // ── Refresh exercises: each mirrors one diagnostic task (QMatrix.ts) ──
  // ★ chosen (owner, 24.9.2026). Mirrors task 5, where 25 unit cubes are on the
  // screen and the learner finds how many tens and units they make: here 26
  // unit cubes wait on the board, and are grouped twice into tens.
  s1(representation('s1_r_group26', 26, { tens: 2, units: 6 },
    'המרה עצמאית בין עזרים וירטואליים',
    'בטור היחידות יש 26 קוביות יחידה. קבצו כל 10 יחידות לעשרת אחת בעזרת כפתור הקבץ 10 שבראש הטור, וכתבו בשורת התוצאה כמה עשרות וכמה יחידות קיבלתם.'),
    { requiresGrouping: true, initialCounts: { units: 26 }, hideRequiredCounts: true }),
  // ★ chosen (owner, 24.9.2026). Mirrors task 6 (124 + 85) in structure with
  // other numbers: three digits plus two, no carry in the units, the tens sum
  // to exactly 10, so the answer has a 0 in the tens.
  {
    id: 's1_t8',
    type: 'addition_simple',
    numberA: 713, numberB: 94, correctAnswer: 807,
    titleHe: 'חיבור במאונך עם המרה מעל מאה',
    instructionHe: 'בנו בבית המספרים 713 ו-94 וחברו אותם. כאשר מצטברים 10 לבנים בטור, לחצו על כפתור הקבץ 10 שבראש הטור. כתבו את התשובה בשורת התוצאה.',
    scaffoldLevel: 1,
    requiresGrouping: true,
    targetNode: 'regrouping_fluency',
  },
  // ★ chosen (owner, 24.9.2026). Mirrors task 3 (42 − 15): two digits minus
  // two, one borrow in the units, the tens need no borrow.
  s1(subtraction('s1_r_sub61', 61, 24,
    'חיסור חד-שלבי עם פריטה בתחום המאה',
    'בנו 61 והחסירו 24: גררו לפח האשפה את הלבנים שאתם מחסירים. כדי לפרוט עשרת ליחידות, לחצו על לבנת העשרת בלוח או גררו אותה לטור היחידות. כתבו את התשובה בשורת התוצאה.',
    { scaffoldLevel: 1 })),
  // ★ chosen (owner, 24.9.2026). Mirrors task 7 (405 − 132): a 0 in the tens
  // of the minuend, no borrow in the units, one borrow from the hundreds into
  // the tens.
  s1(subtraction('s1_r_sub806', 806, 351,
    'חיסור במאונך עם פריטה דרך אפס בטור העשרות',
    'בנו 806 והחסירו 351: גררו לפח האשפה את הלבנים שאתם מחסירים. שימו לב לטור העשרות. כדי לפרוט מאה לעשרות, לחצו על לבנת המאה בלוח או גררו אותה לטור העשרות. כתבו את התשובה בשורת התוצאה.',
    { scaffoldLevel: 1 })),
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
  addition('s4_r_t1', 142, 23, 'ביסוס אלגוריתם ללא המרה בתחום האלף', S4_ADD('142 + 23', false)),
  addition('s4_r_t2', 128, 35, 'המרה פשוטה ראשונה ביחידות בתחום האלף', S4_ADD('128 + 35', true)),
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
  addition('s4_g_t6', 7045, 1283, 'חישוב המרה עם אפס כשומר מקום', S4_ADD('7,045 + 1,283', true)),
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
  subtraction('s5_r_t1', 78, 25, 'ביסוס אלגוריתם ללא פריטה בתחום המאה', S5_SUB('78 − 25', 78, 25)),
  subtraction('s5_r_t2', 53, 18, 'פריטה פשוטה ראשונה מעשרות ליחידות בתחום המאה', S5_SUB('53 − 18', 53, 18)),
  subtraction('s5_r_t3', 142, 25, 'פריטה ביחידות עם נוכחות מאות', S5_SUB('142 − 25', 142, 25)),
  subtraction('s5_r_t4', 345, 182, 'פריטה בטור העשרות בתחום האלף', S5_SUB('345 − 182', 345, 182)),
  subtraction('s5_r_t5', 563, 128, 'פריטה פשוטה בטור היחידות', S5_SUB('563 − 128', 563, 128)),
  subtraction('s5_r_t6', 480, 155, 'פריטה פשוטה מטור העשרות לטור היחידות, עם אפס בטור היחידות', S5_SUB('480 − 155', 480, 155)),
  // ★ chosen: מסמך 03 names the task ("ספרה חסרה בטור המחוסר") without numbers.
  skeleton('s5_r_t7', 442, 128, true, { a: ['tens'] },
    'משימת חקר וגילוי ספרה חסרה',
    'בשורת המחוסר חסרה ספרת העשרות: 4▢2 − 128 = 314. בצעו את הפריטה בלבני הדינס כדי לגלות את הספרה המקורית, וכתבו אותה בתיבה הריקה.',
    { targetNode: 'relational_thinking' }),
];

export const SESSION5_GREEN_TASKS: SessionTask[] = [
  subtraction('s5_g_t1', 5432, 2118, 'פריטה פשוטה בטור היחידות בתחום הרבבה', S5_SUB('5,432 − 2,118', 5432, 2118)),
  subtraction('s5_g_t2', 6543, 1227, 'פריטה ביחידות עם נוכחות אלפים', S5_SUB('6,543 − 1,227', 6543, 1227)),
  // ★ owner-approved replacement (3.9.2026): the document's 7,651 − 3,325 borrowed in the units, not the tens.
  // מסמך 03 carries 7,651 − 3,381 since 25.9.2026 (the owner updated it).
  subtraction('s5_g_t3', 7651, 3381, 'פריטה בטור העשרות בלבד', S5_SUB('7,651 − 3,381', 7651, 3381)),
  // ★ owner-approved replacement (3.9.2026): the document's 8,762 − 4,439 borrowed in the units, not the hundreds.
  // מסמך 03 carries 8,762 − 4,932 since 25.9.2026 (the owner updated it).
  subtraction('s5_g_t4', 8762, 4932, 'פריטה בטור המאות בלבד', S5_SUB('8,762 − 4,932', 8762, 4932)),
  subtraction('s5_g_t5', 6284, 1157, 'פריטה פשוטה בטור היחידות בתחום הרבבה', S5_SUB('6,284 − 1,157', 6284, 1157)),
  subtraction('s5_g_t6', 3845, 1517, 'פריטה פשוטה ביחידות, כל הספרות שונות מאפס', S5_SUB('3,845 − 1,517', 3845, 1517)),
  // ★ chosen: מסמך 03 describes an inquiry comparing near exercises, without numbers.
  withOpts({
    id: 's5_g_t7', type: 'small_change',
    titleHe: 'משימת חקר של הרכבי פריטה משתנים',
    instructionHe: 'השוו בין שני תרגילים קרובים וגלו כיצד פריטה בטור העשרות משפיעה על הטורים הבאים.',
    givenHe: '7,651 − 3,381 = 4,270',
    questionHe: 'מה ישתנה אם נחליף רק את ספרת העשרות של המחוסר: 7,691 − 3,381?',
    choices: [
      { id: 'א', textHe: 'לא תידרש יותר פריטה, כי 9 עשרות גדולות מ-8, והתוצאה תהיה 4,310', correct: true },
      { id: 'ב', textHe: 'הפריטה מטור המאות תישאר, והתוצאה תהיה 4,210' },
      { id: 'ג', textHe: 'רק ספרת העשרות בתוצאה תשתנה, והתוצאה תהיה 4,280' },
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
  subtraction('s6_r_t1', 240, 125, 'ביסוס פריטה פשוטה עם אפס בטור היחידות של המחוסר', S6_SUB('240 − 125', 240, 125), ZERO),
  subtraction('s6_r_t2', 305, 12, 'פריטה פשוטה מטור המאות כאשר טור העשרות ריק', S6_SUB('305 − 12', 305, 12), ZERO),
  subtraction('s6_r_t3', 204, 112, 'פריטה פשוטה מטור המאות לטור העשרות', S6_SUB('204 − 112', 204, 112), ZERO),
  subtraction('s6_r_t4', 300, 142, 'פריטה כפולה קלאסית דרך אפס בתחום האלף', S6_SUB('300 − 142', 300, 142), ZERO),
  subtraction('s6_r_t5', 602, 145, 'פריטה כפולה דרך אפס כאשר ספרת היחידות אינה אפס', S6_SUB('602 − 145', 602, 145), ZERO),
  subtraction('s6_r_t6', 500, 287, 'ביסוס פריטה כפולה בתחום האלף', S6_SUB('500 − 287', 500, 287), ZERO),
  // ★ chosen (400 − 156 is the grade-ג example in מסמך 05, המטריקס).
  missingResultDigit('s6_r_t7', 400, 156, true, 'tens',
    'משימת חקר וספרה חסרה',
    'בתרגיל 400 − 156 חסרה ספרת העשרות בשורת התוצאה. בצעו את הפריטה הכפולה בלבני הדינס כדי לגלות אותה, וכתבו אותה בתיבה הריקה.',
    ZERO),
];

export const SESSION6_GREEN_TASKS: SessionTask[] = [
  subtraction('s6_g_t1', 2045, 1128, 'פריטה כפולה, אחת מהן אל טור מאות ריק', S6_SUB('2,045 − 1,128', 2045, 1128), ZERO),
  subtraction('s6_g_t2', 3005, 1248, 'פריטה משולשת דרך טורי מאות ועשרות ריקים', S6_SUB('3,005 − 1,248', 3005, 1248), ZERO),
  subtraction('s6_g_t3', 4000, 1562, 'פריטה משולשת דרך אפסים עוקבים', S6_SUB('4,000 − 1,562', 4000, 1562), ZERO),
  subtraction('s6_g_t4', 5000, 2345, 'תרגול נוסף של פריטה משולשת', S6_SUB('5,000 − 2,345', 5000, 2345), ZERO),
  subtraction('s6_g_t5', 6020, 1485, 'פריטה משולשת עם אפסים שאינם רציפים', S6_SUB('6,020 − 1,485', 6020, 1485), ZERO),
  subtraction('s6_g_t6', 7003, 2845, 'פריטה משולשת עם ספרת יחידות שאינה אפס', S6_SUB('7,003 − 2,845', 7003, 2845), ZERO),
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
    'שלוש ספרות חסרות בחיסור עם פריטה משולשת',
    'בתרגיל 5,▢▢▢ − 2,847 = 2,159 חסרות שלוש ספרות של המחוסר. הפתרון עובר מעל האפסים שבטור העשרות ובטור המאות. גלו את הספרות בעזרת הפריטה בלבני הדינס וכתבו אותן בתיבות הריקות.',
    INQUIRY),
  // ★ chosen: the imaginary learner's error is the one מסמך 03 describes (a wrong double regrouping in the hundreds).
  addition('s7_g_t4', 4857, 3568,
    'איתור ותיקון שגיאה בשרשרת המרות',
    'תלמיד פתר 4,857 + 3,568 וקיבל 7,425. התרגיל דורש שלוש המרות רצופות, והוא שכח לרשום בטור האלפים את ההמרה מטור המאות. תקנו את התרגיל בעזרת הלבנים על הלוח וכתבו את התוצאה הנכונה.',
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
  addition('s8_r_t1', 142, 23, 'חיבור ללא המרה בתחום האלף', S8_ADD('142 + 23'), { scaffoldLevel: 1 }),
  addition('s8_r_t2', 128, 35, 'חיבור עם המרה אחת ביחידות', S8_ADD('128 + 35'), { scaffoldLevel: 1 }),
  addition('s8_r_t3', 456, 281, 'חיבור עם המרה בטור העשרות', S8_ADD('456 + 281'), { scaffoldLevel: 1 }),
  subtraction('s8_r_t4', 78, 25, 'חיסור ללא פריטה בתחום המאה', S8_SUB('78 − 25'), { scaffoldLevel: 1 }),
  subtraction('s8_r_t5', 53, 18, 'חיסור עם פריטה פשוטה בתחום המאה', S8_SUB('53 − 18'), { scaffoldLevel: 1 }),
  // ★ chosen (owner, 16.9.2026): מסמך 03 §3.8 lists 302 − 145 here, which the learner never met in sessions 4–6,
  // against the section's own rule. Replaced by session 6 exercise 5 (602 − 145 = 457): the same double
  // decomposition through a single zero in the tens, so the title stays true and the fading gap can be measured.
  subtraction('s8_r_t6', 602, 145, 'חיסור עם פריטה כפולה דרך אפס יחיד', S8_SUB('602 − 145'), { scaffoldLevel: 1, targetNode: 'zero_placeholder' }),
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
  // ★ chosen (owner, 16.9.2026): מסמך 03 §3.8 lists 4,354 − 1,126 here, never met in sessions 4–6. Replaced by
  // session 5 exercise 5 (6,284 − 1,157 = 5,127), which the document titles identically: one decomposition, units only.
  subtraction('s8_g_t4', 6284, 1157, 'חיסור עם פריטה פשוטה בתחום הרבבה', S8_SUB('6,284 − 1,157'), { scaffoldLevel: 1 }),
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

export type SupportType = 'socratic';

export interface SupportContent {
  titleHe: string;
  lines: string[];
  kind: 'equivalence';
}

export const SUPPORT_CONTENT: Record<SupportType, SupportContent> = {
  socratic: {
    titleHe: 'נקודה למחשבה',
    kind: 'equivalence',
    lines: [
      'הסתכלו על הלוח: האם יש בטור כלשהו יותר מ-9 בלוקים? מה נוכל לעשות עם זה?',
      'אם אין לנו מספיק יחידות לפעולת החיסור, מאיפה נוכל להשיג עוד יחידות מבלי לשנות את המספר עצמו?',
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
