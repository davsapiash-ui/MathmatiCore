/**
 * sessionGradedTasks.ts — the graded path (המסלול המדורג), for learners in special education.
 *
 * Owner, 11.10.2026: the same topics and the same tools as the other two paths, no other aid, no other
 * subject. What changes is the number range and the steps, as the Ministry of Education allows for special
 * education ("ניתן לדרג תחום ה-1000 ובהמשך רבבה"; addition and subtraction graded from no conversion, to
 * one conversion, to more than one) and as מסמך 05 (המטריקס, the special-education column) shows: 452 + 389
 * with the addition grid, 400 − 156, the place of 4,052. The graded path is not the remediation path: that
 * one goes back over prior knowledge a learner lacks; this one grades the range of the same material.
 *
 * The teacher marks a learner as graded before meeting 1 (`graded_track` on the learner record), so the
 * refresh exercises of meeting 1 and the diagnostic of meeting 2 are graded too: of the diagnostic's seven
 * tasks only 6 and 7 change (QMatrix.ts, GRADED_DIAGNOSTIC_OVERRIDES), and the two refresh exercises that
 * mirror them change with them. Meetings 3–8 load this path's banks once the teacher approves it.
 *
 * Every number here was checked twice, by two separate reviewers: the result, the columns that convert,
 * a single solution for each missing digit, and none of the teacher's demonstration numbers (teacherDemos.ts).
 * The 36 / 38 / 74 / 134 / 238 / 260 / 280 / 700 of the demonstrations appear nowhere in this file.
 */

import {
  addition,
  subtraction,
  skeleton,
  missingResultDigit,
  representation,
  readWrite,
  composeBreak,
  decompose,
  composeGroup,
  flexible,
  withOpts,
  S4_ADD,
  S4_MISSING_TENS,
  S5_SUB,
  S6_SUB,
  S6_MISSING_TENS,
  S8_ADD,
  S8_SUB,
  FLEX_HOWTO,
  type BuildOpts,
} from './taskBuilders';
import type { SessionTask } from './sessionTasks';

const ZERO: BuildOpts = { targetNode: 'zero_placeholder' };
const INQUIRY: BuildOpts = { targetNode: 'relational_thinking' };

/* ── Meeting 1: the two refresh exercises that mirror diagnostic tasks 6 and 7 of the graded diagnostic ──
 * Each mirrors its task column for column with other numbers (PRD Module 14 §ב, the mirror rule). */

/** Mirrors graded task 6 (54 + 28): two digits plus two, one grouping in the units, none in the tens. */
export const S1_GRADED_ADDITION: SessionTask = {
  id: 's1_d_add47',
  type: 'addition_simple',
  numberA: 47, numberB: 26, correctAnswer: 73,
  titleHe: 'חיבור במאונך עם המרה ביחידות',
  instructionHe: 'פתרו: 47 + 26.\nבנו בבית המספרים את 47 ואת 26.\nכשמצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור.\nאחר כך רשמו בעיגול הזיכרון את ה־1 שעבר לטור הבא.\nכתבו את התוצאה בשורת התוצאה.',
  scaffoldLevel: 1,
  requiresGrouping: true,
  targetNode: 'regrouping_fluency',
};

/** Mirrors graded task 7 (203 − 41): a 0 in the tens of the minuend, no borrow in the units, one from the hundreds. */
export const S1_GRADED_SUBTRACTION: SessionTask = (() => {
  const { isCompulsory: _dropped, ...rest } = subtraction('s1_d_sub307', 307, 63,
    'חיסור במאונך עם פריטה אחת, כשבמחוסר יש 0 בטור העשרות',
    'פתרו: 307 − 63.\nבנו את 307 בבית המספרים.\nגררו לפח האשפה את הלבנים שאתם מחסרים.\nאם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו. לחצו על הלבנה, או גררו אותה אל הטור שמימין.\nאחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.\nכתבו את התוצאה בשורת התוצאה.',
    { scaffoldLevel: 1 });
  return rest;
})();

/** The meeting-1 ids each graded refresh exercise replaces. */
export const S1_GRADED_REPLACES: Record<string, SessionTask> = {
  s1_t8: S1_GRADED_ADDITION,
  s1_r_sub806: S1_GRADED_SUBTRACTION,
};

/* ── Meeting 3: place value. Whole hundreds first, then the hundreds range, and last one bridge to the thousands. ── */

export const SESSION3_GRADED_TASKS: SessionTask[] = [
  readWrite('s3_d_t1', 500, 'חמש מאות',
    'ביסוס מאות שלמות בתחום האלף'),
  composeBreak('s3_d_t2', { hundreds: 3, tens: 2 }, ['hundreds'],
    'פירוק חד שלבי מונחה'),
  composeBreak('s3_d_t3', { tens: 6, units: 4 }, ['tens'],
    'פירוק עשרות ליחידות בתחום המאה'),
  decompose('s3_d_t4', 290, 'tens',
    'מעבר לייצוג לא סטנדרטי מלא'),
  readWrite('s3_d_t5', 608, 'שש מאות ושמונה',
    'ייצוג מספר עם אפס שומר מקום',
    { targetNode: 'decimal_structure' }),
  withOpts({
    id: 's3_d_t6', type: 'missing_element', numberA: 100, numberB: 140, correctAnswer: 40,
    titleHe: 'משימת חקר ואינטגרציה',
    instructionHe: 'בנו את המספר 140 בבית המספרים. המספר 140 מורכב ממאה אחת ועוד כמה? כתבו את החלק החסר בתיבה הריקה.',
    targetNode: 'decimal_structure',
  }, {}),
  // מסמך 05, the special-education column of grade 3: "הצבת 4,052 בלוח ערך מקום" — the bridge to the thousands.
  readWrite('s3_d_t7', 4052, 'ארבעת אלפים חמישים ושתיים',
    'גשר לתחום האלפים: ייצוג מספר עם אפס בטור המאות',
    { targetNode: 'decimal_structure' }),
];

/* ── Meeting 4: vertical addition. Two digits, no grouping; one grouping; three digits; the tens; two groupings. ── */

export const SESSION4_GRADED_TASKS: SessionTask[] = [
  addition('s4_d_t1', 43, 25, 'ביסוס אלגוריתם ללא המרה בתחום המאה', S4_ADD('43 + 25')),
  addition('s4_d_t2', 65, 29, 'המרה ראשונה ביחידות בתחום המאה', S4_ADD('65 + 29')),
  addition('s4_d_t3', 126, 37, 'המרה ביחידות עם נוכחות מאות', S4_ADD('126 + 37')),
  addition('s4_d_t4', 352, 61, 'המרה בטור העשרות בתחום האלף', S4_ADD('352 + 61')),
  addition('s4_d_t5', 275, 39, 'שתי המרות, ביחידות ובעשרות', S4_ADD('275 + 39')),
  // מסמך 05, the special-education column of grade 3: "452+389 עם לוח חיבור".
  addition('s4_d_t6', 452, 389, 'שתי המרות במספרים תלת ספרתיים', S4_ADD('452 + 389')),
  missingResultDigit('s4_d_t7', 228, 154, false, 'tens',
    'משימת חקר וגילוי ספרה חסרה',
    S4_MISSING_TENS('228 + 154'),
    INQUIRY),
];

/* ── Meeting 5: vertical subtraction. Two digits, no borrow; one borrow; three digits; the tens; two borrows. ── */

export const SESSION5_GRADED_TASKS: SessionTask[] = [
  subtraction('s5_d_t1', 87, 35, 'ביסוס אלגוריתם ללא פריטה בתחום המאה', S5_SUB('87 − 35', 87, 35)),
  subtraction('s5_d_t2', 62, 18, 'פריטה ראשונה מעשרות ליחידות בתחום המאה', S5_SUB('62 − 18', 62, 18)),
  subtraction('s5_d_t3', 144, 27, 'פריטה ביחידות עם נוכחות מאות', S5_SUB('144 − 27', 144, 27)),
  subtraction('s5_d_t4', 253, 71, 'פריטה בטור העשרות בתחום האלף', S5_SUB('253 − 71', 253, 71)),
  subtraction('s5_d_t5', 423, 158, 'שתי פריטות, ביחידות ובעשרות', S5_SUB('423 − 158', 423, 158)),
  subtraction('s5_d_t6', 614, 239, 'תרגול נוסף של שתי פריטות, ביחידות ובעשרות', S5_SUB('614 − 239', 614, 239)),
  skeleton('s5_d_t7', 543, 128, true, { a: ['tens'] },
    'משימת חקר וגילוי ספרה חסרה',
    'בתרגיל 5▢3 − 128 = 415 חסרה ספרת העשרות במספר הראשון. גלו את הספרה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
];

/* ── Meeting 6: the zero. One borrow by a zero, then two borrows across zeros (מסמך 05: 400 − 156). ── */

export const SESSION6_GRADED_TASKS: SessionTask[] = [
  subtraction('s6_d_t1', 70, 25, 'פריטה פשוטה עם אפס בטור היחידות של המחוסר', S6_SUB('70 − 25', 70, 25), ZERO),
  subtraction('s6_d_t2', 804, 31, 'פריטה פשוטה מטור המאות כאשר בטור העשרות יש 0', S6_SUB('804 − 31', 804, 31), ZERO),
  subtraction('s6_d_t3', 507, 243, 'פריטה פשוטה מטור המאות לטור העשרות', S6_SUB('507 − 243', 507, 243), ZERO),
  subtraction('s6_d_t4', 600, 237, 'שתי פריטות, כשבמחוסר יש אפסים בטור העשרות ובטור היחידות', S6_SUB('600 − 237', 600, 237), ZERO),
  subtraction('s6_d_t5', 703, 458, 'שתי פריטות, כשבמחוסר יש 0 רק בטור העשרות', S6_SUB('703 − 458', 703, 458), ZERO),
  subtraction('s6_d_t6', 900, 468, 'ביסוס שתי פריטות, כשבמחוסר יש אפסים בטור העשרות ובטור היחידות', S6_SUB('900 − 468', 900, 468), ZERO),
  missingResultDigit('s6_d_t7', 800, 258, true, 'tens',
    'משימת חקר וספרה חסרה',
    S6_MISSING_TENS('800 − 258', 800, 258),
    ZERO),
];

/* ── Meeting 7: inquiry, within the hundreds range. The kinds of the other two paths, with this path's numbers. ── */

export const SESSION7_GRADED_TASKS: SessionTask[] = [
  composeGroup('s7_d_t1', { tens: 14, units: 3 }, ['tens'],
    'משימת הוכחת ערך מקום',
    INQUIRY),
  skeleton('s7_d_t2', 425, 153, false, { a: ['units'] },
    'ספרה חסרה אחת בחיבור ללא המרה',
    'בתרגיל 42▢ + 153 = 578 חסרה ספרת היחידות במספר הראשון. גלו אותה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
  skeleton('s7_d_t3', 257, 164, false, { a: ['tens'] },
    'ספרה חסרה בחיבור עם המרה',
    'בתרגיל 2▢7 + 164 = 421 חסרה ספרת העשרות במספר הראשון. גלו את הספרה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
  skeleton('s7_d_t4', 493, 156, true, { a: ['tens', 'units'] },
    'שתי ספרות חסרות בחיסור עם פריטה',
    'בתרגיל 4▢▢ − 156 = 337 חסרות ספרת העשרות וספרת היחידות במספר הראשון. גלו אותן בעזרת הלבנים. כתבו אותן בתיבות הריקות.',
    INQUIRY),
  // The imaginary learner's error is the one מסמך 03 describes for the other paths: a forgotten carry.
  addition('s7_d_t5', 227, 149,
    'ניתוח שגיאה של לומד דמיוני',
    'תלמיד פתר 227 + 149 וקיבל 366. מצאו את הטעות ותקנו אותה בעזרת הלבנים. כתבו את התוצאה הנכונה בשורת התוצאה.',
    INQUIRY),
  // 240, three hundreds more (540), five tens taken away by breaking a hundred: 4 hundreds and 9 tens.
  representation('s7_d_t6', 490, { hundreds: 4, tens: 9 },
    'אינטגרציה דו שלבית של הוספה והפחתה',
    'בנו את המספר 240 בבית המספרים. הוסיפו 3 מאות, ואז הוציאו 5 עשרות. השאירו את הלבנים בבית המספרים. איזה מספר קיבלתם? כתבו אותו בשורת התוצאה.',
    INQUIRY),
  flexible('s7_d_t7', 240,
    'בעיית חקר פתוחה למחצה של הרכבים משתנים',
    `מצאו שתי דרכים שונות לבנות את המספר 240. השתמשו רק בלבני מאה ועשרת. ${FLEX_HOWTO}`,
    { ...INQUIRY, noUnitBlocks: true }),
];

/* ── Meeting 8: without blocks, numbers this path met in meetings 4–6 (מסמך 03 §3.8, the fading gap). ── */

export const SESSION8_GRADED_TASKS: SessionTask[] = [
  addition('s8_d_t1', 43, 25, 'חיבור ללא המרה בתחום המאה', S8_ADD('43 + 25'), { scaffoldLevel: 1 }),
  addition('s8_d_t2', 65, 29, 'חיבור עם המרה אחת ביחידות', S8_ADD('65 + 29'), { scaffoldLevel: 1 }),
  addition('s8_d_t3', 352, 61, 'חיבור עם המרה בטור העשרות', S8_ADD('352 + 61'), { scaffoldLevel: 1 }),
  subtraction('s8_d_t4', 87, 35, 'חיסור ללא פריטה בתחום המאה', S8_SUB('87 − 35'), { scaffoldLevel: 1 }),
  subtraction('s8_d_t5', 62, 18, 'חיסור עם פריטה פשוטה בתחום המאה', S8_SUB('62 − 18'), { scaffoldLevel: 1 }),
  subtraction('s8_d_t6', 703, 458, 'חיסור עם שתי פריטות, כשבמחוסר יש 0 בטור העשרות', S8_SUB('703 − 458'), { scaffoldLevel: 1, targetNode: 'zero_placeholder' }),
  skeleton('s8_d_t7', 352, 61, false, { a: ['tens'] },
    'בעיית חקר של גילוי ספרה חסרה בתחום האלף',
    'בתרגיל 3▢2 + 61 = 413 חסרה ספרת העשרות במספר הראשון. גלו אותה. כתבו אותה בתיבה הריקה.',
    { scaffoldLevel: 1, targetNode: 'relational_thinking' }),
];
