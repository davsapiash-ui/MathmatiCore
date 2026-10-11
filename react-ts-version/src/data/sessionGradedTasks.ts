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

/* ════════════════════════════════════════════════════════════════════════════════════════════════════════
 * The graded foundations path (המסלול המדורג – יסודות), owner, 11.10.2026.
 *
 * A learner in special education the teacher marked before meeting 1 has two levels after the graded
 * diagnostic, as every other learner has two: the graded path above (the special-education milestone of
 * grade 3 in מסמך 05, the thousand) and this one, for a learner the diagnostic shows is not there yet. It is
 * the special-education milestone of grade 2 in מסמך 05: "חיבור וחיסור עם המרה בתחום ה-100", "תחום ה-1,000",
 * "ביסוס מאות שלמות תחילה". The Ministry's special-education adaptations (pp. 76, 93–96) order the steps:
 * within the hundred without conversion, then with conversion within the hundred, then larger numbers; the
 * outline (p. 6): "דירוג: 100, 1000. תחום האלף: להתחיל ממאות שלמות", and (p. 2) the learner advances in the
 * topics of the grade while the gaps close alongside. So: the same topics and tools as every path, in the
 * hundred for addition and subtraction and from whole hundreds for place value. Ids carry the letter f.
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ── Meeting 3: place value. Whole hundreds, a two-digit number, a hundred, tens only, the zero, the thousand. ── */

export const SESSION3_FOUNDATION_TASKS: SessionTask[] = [
  readWrite('s3_f_t1', 200, 'מאתיים',
    'ביסוס מאות שלמות'),
  composeBreak('s3_f_t2', { tens: 5, units: 3 }, ['tens'],
    'פירוק עשרת ליחידות בתחום המאה'),
  composeBreak('s3_f_t3', { hundreds: 2, tens: 1 }, ['hundreds'],
    'פירוק מאה לעשרות'),
  decompose('s3_f_t4', 170, 'tens',
    'ייצוג מספר בעשרות בלבד'),
  readWrite('s3_f_t5', 709, 'שבע מאות ותשע',
    'ייצוג מספר עם אפס שומר מקום',
    { targetNode: 'decimal_structure' }),
  withOpts({
    id: 's3_f_t6', type: 'missing_element', numberA: 100, numberB: 130, correctAnswer: 30,
    titleHe: 'משימת חקר ואינטגרציה',
    instructionHe: 'בנו את המספר 130 בבית המספרים. המספר 130 מורכב ממאה אחת ועוד כמה? כתבו את החלק החסר בתיבה הריקה.',
    targetNode: 'decimal_structure',
  }, {}),
  // מסמך 05, the special-education column of grade 2: "ספירה במאות שלמות עד 1,000".
  readWrite('s3_f_t7', 1000, 'אלף',
    'ביסוס האלף: עשר מאות',
    { targetNode: 'decimal_structure' }),
];

/* ── Meeting 4: vertical addition within the hundred. No conversion, then one conversion in the units. ── */

export const SESSION4_FOUNDATION_TASKS: SessionTask[] = [
  addition('s4_f_t1', 32, 14, 'ביסוס אלגוריתם ללא המרה בתחום המאה', S4_ADD('32 + 14')),
  addition('s4_f_t2', 51, 27, 'תרגול נוסף ללא המרה בתחום המאה', S4_ADD('51 + 27')),
  // The Ministry's order (p. 95): a one-digit number with a two-digit one first, then two two-digit numbers.
  addition('s4_f_t3', 24, 9, 'המרה ראשונה ביחידות: מספר חד ספרתי ודו ספרתי', S4_ADD('24 + 9')),
  addition('s4_f_t4', 45, 18, 'המרה ביחידות בתחום המאה', S4_ADD('45 + 18')),
  addition('s4_f_t5', 56, 37, 'תרגול נוסף של המרה ביחידות', S4_ADD('56 + 37')),
  addition('s4_f_t6', 39, 44, 'ביסוס המרה ביחידות', S4_ADD('39 + 44')),
  missingResultDigit('s4_f_t7', 28, 57, false, 'tens',
    'משימת חקר וגילוי ספרה חסרה',
    S4_MISSING_TENS('28 + 57'),
    INQUIRY),
];

/* ── Meeting 5: vertical subtraction within the hundred. No borrow, then one borrow from the tens. ── */

export const SESSION5_FOUNDATION_TASKS: SessionTask[] = [
  subtraction('s5_f_t1', 68, 23, 'ביסוס אלגוריתם ללא פריטה בתחום המאה', S5_SUB('68 − 23', 68, 23)),
  subtraction('s5_f_t2', 97, 54, 'תרגול נוסף ללא פריטה בתחום המאה', S5_SUB('97 − 54', 97, 54)),
  subtraction('s5_f_t3', 52, 8, 'פריטה ראשונה: מספר דו ספרתי פחות חד ספרתי', S5_SUB('52 − 8', 52, 8)),
  subtraction('s5_f_t4', 84, 47, 'פריטה מעשרות ליחידות בתחום המאה', S5_SUB('84 − 47', 84, 47)),
  subtraction('s5_f_t5', 92, 58, 'תרגול נוסף של פריטה מעשרות ליחידות', S5_SUB('92 − 58', 92, 58)),
  subtraction('s5_f_t6', 65, 39, 'ביסוס פריטה מעשרות ליחידות', S5_SUB('65 − 39', 65, 39)),
  skeleton('s5_f_t7', 73, 28, true, { a: ['tens'] },
    'משימת חקר וגילוי ספרה חסרה',
    'בתרגיל ▢3 − 28 = 45 חסרה ספרת העשרות במספר הראשון. גלו את הספרה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
];

/* ── Meeting 6: the zero within the hundred, and last the hundred itself (two borrows across zeros). ── */

export const SESSION6_FOUNDATION_TASKS: SessionTask[] = [
  subtraction('s6_f_t1', 40, 17, 'פריטה עם אפס בטור היחידות של המחוסר', S6_SUB('40 − 17', 40, 17), ZERO),
  subtraction('s6_f_t2', 60, 23, 'תרגול נוסף של פריטה עם אפס בטור היחידות', S6_SUB('60 − 23', 60, 23), ZERO),
  subtraction('s6_f_t3', 90, 43, 'ביסוס פריטה עם אפס בטור היחידות', S6_SUB('90 − 43', 90, 43), ZERO),
  subtraction('s6_f_t4', 80, 29, 'פריטה עם אפס, כשבמחסר יש 9 ביחידות', S6_SUB('80 − 29', 80, 29), ZERO),
  subtraction('s6_f_t5', 100, 45, 'שתי פריטות, כשבמחוסר יש אפסים בטור העשרות ובטור היחידות', S6_SUB('100 − 45', 100, 45), ZERO),
  subtraction('s6_f_t6', 100, 72, 'ביסוס שתי פריטות מן המאה', S6_SUB('100 − 72', 100, 72), ZERO),
  missingResultDigit('s6_f_t7', 50, 18, true, 'tens',
    'משימת חקר וספרה חסרה',
    S6_MISSING_TENS('50 − 18', 50, 18),
    ZERO),
];

/* ── Meeting 7: inquiry within the hundred. The kinds of the other paths, with this path's numbers. ── */

export const SESSION7_FOUNDATION_TASKS: SessionTask[] = [
  composeGroup('s7_f_t1', { tens: 12, units: 5 }, ['tens'],
    'משימת הוכחת ערך מקום',
    INQUIRY),
  skeleton('s7_f_t2', 41, 31, false, { a: ['units'] },
    'ספרה חסרה אחת בחיבור ללא המרה',
    'בתרגיל 4▢ + 31 = 72 חסרה ספרת היחידות במספר הראשון. גלו אותה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
  skeleton('s7_f_t3', 58, 26, false, { a: ['tens'] },
    'ספרה חסרה בחיבור עם המרה',
    'בתרגיל ▢8 + 26 = 84 חסרה ספרת העשרות במספר הראשון. גלו את הספרה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
  skeleton('s7_f_t4', 64, 37, true, { a: ['units'] },
    'ספרת יחידות חסרה בחיסור עם פריטה',
    'בתרגיל 6▢ − 37 = 27 חסרה ספרת היחידות במספר הראשון. גלו אותה בעזרת הלבנים. כתבו אותה בתיבה הריקה.',
    INQUIRY),
  // The imaginary learner forgot the carry from the units, as in the other paths.
  addition('s7_f_t5', 46, 29,
    'ניתוח שגיאה של לומד דמיוני',
    'תלמיד פתר 46 + 29 וקיבל 65. מצאו את הטעות ותקנו אותה בעזרת הלבנים. כתבו את התוצאה הנכונה בשורת התוצאה.',
    INQUIRY),
  // 130, two hundreds more (330), four tens taken away by breaking a hundred: 2 hundreds and 9 tens.
  representation('s7_f_t6', 290, { hundreds: 2, tens: 9 },
    'אינטגרציה דו שלבית של הוספה והפחתה',
    'בנו את המספר 130 בבית המספרים. הוסיפו 2 מאות, ואז הוציאו 4 עשרות. השאירו את הלבנים בבית המספרים. איזה מספר קיבלתם? כתבו אותו בשורת התוצאה.',
    INQUIRY),
  flexible('s7_f_t7', 160,
    'בעיית חקר פתוחה למחצה של הרכבים משתנים',
    `מצאו שתי דרכים שונות לבנות את המספר 160. השתמשו רק בלבני מאה ועשרת. ${FLEX_HOWTO}`,
    { ...INQUIRY, noUnitBlocks: true }),
];

/* ── Meeting 8: without blocks, numbers this path met in meetings 4–6 (מסמך 03 §3.8, the fading gap). ── */

export const SESSION8_FOUNDATION_TASKS: SessionTask[] = [
  addition('s8_f_t1', 32, 14, 'חיבור ללא המרה בתחום המאה', S8_ADD('32 + 14'), { scaffoldLevel: 1 }),
  addition('s8_f_t2', 45, 18, 'חיבור עם המרה ביחידות', S8_ADD('45 + 18'), { scaffoldLevel: 1 }),
  addition('s8_f_t3', 56, 37, 'תרגול נוסף של חיבור עם המרה ביחידות', S8_ADD('56 + 37'), { scaffoldLevel: 1 }),
  subtraction('s8_f_t4', 68, 23, 'חיסור ללא פריטה בתחום המאה', S8_SUB('68 − 23'), { scaffoldLevel: 1 }),
  subtraction('s8_f_t5', 84, 47, 'חיסור עם פריטה מעשרות ליחידות', S8_SUB('84 − 47'), { scaffoldLevel: 1 }),
  subtraction('s8_f_t6', 100, 45, 'חיסור עם שתי פריטות מן המאה', S8_SUB('100 − 45'), { scaffoldLevel: 1, targetNode: 'zero_placeholder' }),
  skeleton('s8_f_t7', 56, 37, false, { a: ['units'] },
    'בעיית חקר של גילוי ספרה חסרה בתחום המאה',
    'בתרגיל 5▢ + 37 = 93 חסרה ספרת היחידות במספר הראשון. גלו אותה. כתבו אותה בתיבה הריקה.',
    { scaffoldLevel: 1, targetNode: 'relational_thinking' }),
];
