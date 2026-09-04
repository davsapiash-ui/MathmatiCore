/**
 * taskBuilders.ts — constructors for the exercise banks (sessionTasks.ts,
 * sessionBranchTasks.ts). Every exercise's result and regrouping flags are
 * derived from its operands, never hand-typed, so a number copied from
 * מסמך 03 cannot drift from its own answer. Type-only imports: this module
 * sits below both bank files and breaks the import cycle between them.
 */

import type { Place, PlaceCounts } from '@/core/placeValue';
import type { SessionTask } from './sessionTasks';

const LOW_TO_HIGH: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const PLACE_DIVISOR: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };

function digitOf(n: number, place: Place): number {
  return Math.floor(n / PLACE_DIVISOR[place]) % 10;
}

/** Places the written result occupies, low→high (e.g. 568 → units, tens, hundreds). */
function resultPlaces(value: number): Place[] {
  return LOW_TO_HIGH.slice(0, Math.max(1, String(Math.abs(value)).length));
}

/** a + b needs a composition (carry) in at least one column. */
function needsCarry(a: number, b: number): boolean {
  return LOW_TO_HIGH.some((p) => digitOf(a, p) + digitOf(b, p) >= 10);
}

/** a − b needs a decomposition (borrow) in at least one column. */
function needsBorrow(a: number, b: number): boolean {
  return LOW_TO_HIGH.some((p) => digitOf(a, p) < digitOf(b, p));
}

export interface BuildOpts {
  targetNode?: string;
  branchType?: 'reinforcement' | 'challenge';
  scaffoldLevel?: number;
}

export function withOpts(task: SessionTask, opts: BuildOpts): SessionTask {
  const out: SessionTask = { ...task };
  if (opts.targetNode) out.targetNode = opts.targetNode;
  if (opts.scaffoldLevel !== undefined) out.scaffoldLevel = opts.scaffoldLevel;
  if (opts.branchType) {
    out.isOptionalChoiceTask = true;
    out.branchType = opts.branchType;
  } else {
    out.isCompulsory = true;
  }
  return out;
}

export function addition(id: string, a: number, b: number, titleHe: string, instructionHe: string, opts: BuildOpts = {}): SessionTask {
  const task: SessionTask = { id, type: 'vertical_addition', numberA: a, numberB: b, correctAnswer: a + b, titleHe, instructionHe, targetNode: 'regrouping_fluency' };
  if (needsCarry(a, b)) task.requiresGrouping = true;
  return withOpts(task, opts);
}

export function subtraction(id: string, a: number, b: number, titleHe: string, instructionHe: string, opts: BuildOpts = {}): SessionTask {
  const task: SessionTask = { id, type: 'vertical_addition', isSubtraction: true, numberA: a, numberB: b, correctAnswer: a - b, titleHe, instructionHe, targetNode: 'subtraction_regrouping' };
  if (needsBorrow(a, b)) task.requiresUngrouping = true;
  return withOpts(task, opts);
}

/**
 * Skeleton exercise, operand digits hidden: the written result is shown in
 * full and the learner discovers the hidden digits of operand `a` (or `b`).
 */
export function skeleton(
  id: string,
  a: number,
  b: number,
  isSubtraction: boolean,
  hidden: { a?: Place[]; b?: Place[] },
  titleHe: string,
  instructionHe: string,
  opts: BuildOpts = {}
): SessionTask {
  const base = isSubtraction ? subtraction(id, a, b, titleHe, instructionHe, opts) : addition(id, a, b, titleHe, instructionHe, opts);
  const result = isSubtraction ? a - b : a + b;
  return { ...base, hiddenDigits: hidden, revealedResultDigits: resultPlaces(result) };
}

/** Skeleton exercise, one result digit missing: every other result digit is shown. */
export function missingResultDigit(
  id: string,
  a: number,
  b: number,
  isSubtraction: boolean,
  missing: Place,
  titleHe: string,
  instructionHe: string,
  opts: BuildOpts = {}
): SessionTask {
  const base = isSubtraction ? subtraction(id, a, b, titleHe, instructionHe, opts) : addition(id, a, b, titleHe, instructionHe, opts);
  const result = isSubtraction ? a - b : a + b;
  return { ...base, revealedResultDigits: resultPlaces(result).filter((p) => p !== missing) };
}

/** Build exactly this representation on the board, then write the number it shows. */
export function representation(id: string, value: number, counts: Partial<PlaceCounts>, titleHe: string, instructionHe: string, opts: BuildOpts = {}): SessionTask {
  return withOpts(
    { id, type: 'representation', numberA: value, correctAnswer: value, requiredCounts: counts, titleHe, instructionHe, targetNode: 'flexible_regrouping' },
    opts
  );
}

/** Two different representations of the same number (existing flexible_decomp engine). */
export function flexible(id: string, value: number, titleHe: string, instructionHe: string, opts: BuildOpts & { requireEvenTens?: boolean } = {}): SessionTask {
  const task: SessionTask = { id, type: 'flexible_decomp', numberA: value, correctAnswer: value, requiresUngrouping: true, titleHe, instructionHe, targetNode: 'flexible_regrouping' };
  if (opts.requireEvenTens) task.requireEvenTens = true;
  return withOpts(task, opts);
}

/* ── Shared instruction phrases (מסמך 02/03 on-screen wording) ── */

export const S3_STANDARD = (n: string, desc: string) =>
  `גררו לבנים לייצוג המספר ${n} בדרך הרגילה: ${desc}. בדקו התאמה ללוח בית המספרים וכתבו את המספר בשורת התוצאה!`;
export const S3_NONSTANDARD = (what: string, n: string, desc: string) =>
  `פרקו ${what} ונסו לייצג את המספר ${n} בדרך החדשה: ${desc}. בדקו התאמה ללוח בית המספרים וכתבו את המספר בשורת התוצאה!`;
export const S4_ADD = (ex: string, regroup: boolean) =>
  `פתרו במאונך: ${ex}. ייצגו את המספרים בעזרת לבנות.${regroup ? ' כאשר מצטברים 10 פריטים בטור, לחצו על כפתור הקבץ 10 שבראש הטור ורשמו את ההמרה בעיגול הזיכרון.' : ''} רשמו את התוצאה בשורת התוצאה.`;
export const S5_SUB = (ex: string, borrow: boolean) =>
  `פתרו במאונך: ${ex}. בנו את המחוסר בלוח.${borrow ? ' פרקו עשרת אחת ליחידות (או מאה לעשרות) בלחיצה עליה ועדכנו את הכמויות החדשות בלוח בית המספרים.' : ''} החסירו את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.`;
export const S6_SUB = (ex: string) =>
  `פתרו חיסור עם אפסים: ${ex}. פרקו מאות ואז עשרות, צפו בשינוי בפריטה הכפולה, וכתבו את התוצאה בשורת התוצאה.`;
export const S8_ADD = (ex: string) => `${ex}. פתרו את תרגיל החיבור וכתבו את התשובה בשורת התוצאה!`;
export const S8_SUB = (ex: string) => `${ex}. פתרו את תרגיל החיסור וכתבו את התשובה בשורת התוצאה!`;
export const FLEX_HOWTO = 'בנו דרך אחת, לחצו "הוספת ייצוג", ואז בנו דרך שונה. אפשר להיעזר בכפתור ביטול פעולה לחקירה עצמאית.';
