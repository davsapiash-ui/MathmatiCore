/**
 * taskBuilders.ts — constructors for the exercise banks (sessionTasks.ts,
 * sessionBranchTasks.ts). Every exercise's result and regrouping flags are
 * derived from its operands, never hand-typed, so a number copied from
 * מסמך 03 cannot drift from its own answer. Type-only imports: this module
 * sits below both bank files and breaks the import cycle between them.
 */

import type { Place, PlaceCounts } from '@/core/placeValue';
import type { SessionTask, RepresentationKind } from './sessionTasks';

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

/**
 * Build exactly this representation on the board, then write the number it
 * shows. Station 1 and station 7's other representation exercises; station 3
 * uses the four builders below, which say what the child writes.
 */
export function representation(id: string, value: number, counts: Partial<PlaceCounts>, titleHe: string, instructionHe: string, opts: BuildOpts = {}): SessionTask {
  return withOpts(
    { id, type: 'representation', numberA: value, correctAnswer: value, requiredCounts: counts, titleHe, instructionHe, targetNode: 'flexible_regrouping' },
    opts
  );
}

/* ── Station 3 and station 7's grouping exercises (owner, 30.9.2026) ──
 *
 * The owner approved one sentence per kind of exercise. The instruction is
 * built from the exercise's own numbers, so its words cannot drift from the
 * board the exercise checks: the blocks named are the blocks built, each
 * "פרטו" / "קבצו" is one conversion applied to them, and the board after the
 * last one is `requiredCounts`. No instruction names the number the child
 * writes (Module26_Doc03Banks / Station3_Redesign tests). Names: "לבנת מאה",
 * plural "לבני מאה" — לבנה is feminine ("לבנת מאה אחת", "לעשר לבני עשרת"). */

/** One block's name after "לבנת" / "לבני" (owner's naming rule). */
export const BLOCK_NAME_HE: Record<Place, string> = { units: 'יחידה', tens: 'עשרת', hundreds: 'מאה', thousands: 'אלף' };

const placeAbove = (p: Place): Place => LOW_TO_HIGH[LOW_TO_HIGH.indexOf(p) + 1];
const placeBelow = (p: Place): Place => LOW_TO_HIGH[LOW_TO_HIGH.indexOf(p) - 1];

/** "3 לבני מאה"; one block is "לבנת מאה אחת". */
function blocksHe(n: number, place: Place): string {
  return n === 1 ? `לבנת ${BLOCK_NAME_HE[place]} אחת` : `${n} לבני ${BLOCK_NAME_HE[place]}`;
}

/** The blocks of a board, high place first: "5 לבני אלף, 2 לבני מאה ו-3 לבני עשרת". */
function boardHe(counts: Partial<PlaceCounts>): string {
  const parts = [...LOW_TO_HIGH].reverse().filter((p) => (counts[p] ?? 0) > 0).map((p) => blocksHe(counts[p]!, p));
  if (parts.length <= 1) return parts[0] ?? '';
  const last = parts[parts.length - 1];
  // "ו-3 לבני עשרת", but "ולבנת עשרת אחת": the hyphen joins the ו to a digit only.
  return `${parts.slice(0, -1).join(', ')} ${/^\d/.test(last) ? 'ו-' : 'ו'}${last}`;
}

/** 4,500 — the thousands comma the instructions use. */
const numberHe = (n: number) => n.toLocaleString('en-US');

function valueOf(counts: Partial<PlaceCounts>): number {
  return LOW_TO_HIGH.reduce((sum, p) => sum + (counts[p] ?? 0) * PLACE_DIVISOR[p], 0);
}

/** The standard form: one digit's worth of blocks per place (340 → 3 hundreds, 4 tens). */
function standardCountsOf(value: number): Partial<PlaceCounts> {
  const out: Partial<PlaceCounts> = {};
  for (const p of LOW_TO_HIGH) if (digitOf(value, p) > 0) out[p] = digitOf(value, p);
  return out;
}

/** Places with no blocks are left out, as every requiredCounts in the banks is written. */
function withoutEmpty(counts: Partial<PlaceCounts>): Partial<PlaceCounts> {
  const out: Partial<PlaceCounts> = {};
  for (const p of [...LOW_TO_HIGH].reverse()) if ((counts[p] ?? 0) > 0) out[p] = counts[p];
  return out;
}

function representationOfKind(
  kind: RepresentationKind,
  id: string,
  value: number,
  counts: Partial<PlaceCounts>,
  answer: number,
  titleHe: string,
  instructionHe: string,
  opts: BuildOpts
): SessionTask {
  return {
    ...representation(id, value, withoutEmpty(counts), titleHe, instructionHe, opts),
    correctAnswer: answer,
    representationKind: kind,
  };
}

/**
 * read_write — "בנו בבית המספרים את המספר שלוש מאות וארבעים. כתבו אותו בספרות
 * בשורת התוצאה." The number is said in words; the board is its standard form;
 * the child writes it in digits.
 */
export function readWrite(id: string, value: number, wordsHe: string, titleHe: string, opts: BuildOpts = {}): SessionTask {
  return representationOfKind('read_write', id, value, standardCountsOf(value), value, titleHe,
    `בנו בבית המספרים את המספר ${wordsHe}. כתבו אותו בספרות בשורת התוצאה.`, opts);
}

/**
 * decompose — "בנו בבית המספרים את המספר 450 מלבני עשרת בלבד. בכמה לבני עשרת
 * השתמשתם? כתבו את התשובה בשורת התוצאה." The answer is the number of blocks
 * (45), not the number built (450).
 */
export function decompose(id: string, value: number, place: Place, titleHe: string, opts: BuildOpts = {}): SessionTask {
  const blocks = value / PLACE_DIVISOR[place];
  const name = BLOCK_NAME_HE[place];
  return representationOfKind('decompose', id, value, { [place]: blocks }, blocks, titleHe,
    `בנו בבית המספרים את המספר ${numberHe(value)} מלבני ${name} בלבד. בכמה לבני ${name} השתמשתם? כתבו את התשובה בשורת התוצאה.`, opts);
}

/** One conversion's sentence; a second one says "אחר כך" (another column) or "שוב" (the same column). */
function conversionHe(verb: 'פרטו' | 'קבצו', what: string, place: Place, previous: Place | undefined): string {
  if (previous === undefined) return `${verb} ${what}.`;
  return previous === place ? `${verb} שוב ${what}.` : `אחר כך ${verb} ${what}.`;
}

/**
 * The conversions the closing question names: one stays singular ("לאחר
 * הפריטה", approved 30.9.2026); two take the plural of מסמך 03 §3.3 ("לאחר
 * שתי הפריטות" for 5,230, "לאחר שתי ההקבצות" for 2,500 — owner, 4.10.2026).
 * No exercise converts three times; one that did would need its own approved
 * wording, so it is refused here rather than given an invented one.
 */
export function afterConversionsHe(count: number, one: string, many: string): string {
  if (count <= 1) return one;
  if (count > 2) throw new Error(`afterConversionsHe: no approved wording for ${count} conversions`);
  return `שתי ${many}`;
}

/**
 * compose_break — "בנו בבית המספרים 3 לבני מאה ו-4 לבני עשרת. פרטו לבנת מאה
 * אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת
 * התוצאה." `breaks` lists the block broken each time, in order; the child
 * breaks it with the blocks (requiresUngrouping, REPRESENTATION_LOCKS).
 */
export function composeBreak(id: string, built: Partial<PlaceCounts>, breaks: Place[], titleHe: string, opts: BuildOpts = {}): SessionTask {
  const after: Partial<PlaceCounts> = { ...built };
  const steps = breaks.map((from, i) => {
    const to = placeBelow(from);
    after[from] = (after[from] ?? 0) - 1;
    after[to] = (after[to] ?? 0) + 10;
    return conversionHe('פרטו', `לבנת ${BLOCK_NAME_HE[from]} אחת לעשר לבני ${BLOCK_NAME_HE[to]}`, from, breaks[i - 1]);
  });
  const value = valueOf(built);
  return {
    ...representationOfKind('compose_break', id, value, after, value, titleHe,
      `בנו בבית המספרים ${boardHe(built)}. ${steps.join(' ')} איזה מספר מייצגות הלבנים לאחר ${afterConversionsHe(breaks.length, 'הפריטה', 'הפריטות')}? כתבו אותו בשורת התוצאה.`, opts),
    requiresUngrouping: true,
  };
}

/**
 * compose_group — "בנו בבית המספרים 12 לבני עשרת ו-5 לבני יחידה. קבצו 10 לבני
 * עשרת ללבנת מאה אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת
 * התוצאה." `groups` lists the column grouped each time, in order; the child
 * groups with the column's "קבצו 10" button (requiresGrouping, REPRESENTATION_LOCKS).
 */
export function composeGroup(id: string, built: Partial<PlaceCounts>, groups: Place[], titleHe: string, opts: BuildOpts = {}): SessionTask {
  const after: Partial<PlaceCounts> = { ...built };
  const steps = groups.map((from, i) => {
    const to = placeAbove(from);
    after[from] = (after[from] ?? 0) - 10;
    after[to] = (after[to] ?? 0) + 1;
    return conversionHe('קבצו', `10 לבני ${BLOCK_NAME_HE[from]} ללבנת ${BLOCK_NAME_HE[to]} אחת`, from, groups[i - 1]);
  });
  const value = valueOf(built);
  return {
    ...representationOfKind('compose_group', id, value, after, value, titleHe,
      `בנו בבית המספרים ${boardHe(built)}. ${steps.join(' ')} איזה מספר מייצגות הלבנים לאחר ${afterConversionsHe(groups.length, 'ההקבצה', 'ההקבצות')}? כתבו אותו בשורת התוצאה.`, opts),
    requiresGrouping: true,
  };
}

/** Two different representations of the same number (existing flexible_decomp engine). */
export function flexible(id: string, value: number, titleHe: string, instructionHe: string, opts: BuildOpts & { requireEvenTens?: boolean } = {}): SessionTask {
  const task: SessionTask = { id, type: 'flexible_decomp', numberA: value, correctAnswer: value, requiresUngrouping: true, titleHe, instructionHe, targetNode: 'flexible_regrouping' };
  if (opts.requireEvenTens) task.requireEvenTens = true;
  return withOpts(task, opts);
}

/* ── Shared instruction phrases (מסמך 02/03 on-screen wording) ──
 * Station 3's two phrases (S3_STANDARD, "represent N the usual way: …", and
 * S3_NONSTANDARD, "break … and represent N the new way: …") pasted the blocks
 * AND the number into the instruction, so the child copied the answer from
 * it. The owner replaced them on 30.9.2026 — see readWrite, composeBreak,
 * decompose. */

/**
 * Station 4 (owner, 30.9.2026): every exercise names the "קבצו 10" button — its
 * absence told the child in advance that nothing needs grouping. "כאשר" governs
 * both actions, so an exercise without grouping asks for nothing it lacks.
 */
export const S4_ADD = (ex: string) =>
  `פתרו במאונך: ${ex}. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.`;
/**
 * Stations 5–6 (owner, 30.9.2026): the instruction no longer says in advance
 * where or how many times to borrow — the child finds the column that lacks
 * blocks, and the coaching card helps on need. The wording is the one the owner
 * approved for station 1 (61 − 24, 806 − 351); it names click and drag, and
 * the memory circles. (Until 30.9.2026 station 5 said "פרטו עשרת אחת ליחידות…"
 * and station 6 "כאן דרושה פריטה כפולה: פרטו פעמיים…".)
 */
const BORROW_WHEN_NEEDED =
  ' בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.';

export function S5_SUB(ex: string, _a?: number, _b?: number): string {
  return `פתרו במאונך: ${ex}.${BORROW_WHEN_NEEDED} הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.`;
}

/**
 * הטורים שבהם החיסור a − b דורש פריטה, מימין לשמאל, כולל שרשור: בטור p
 * פורטים לבנה אחת מהטור שמשמאלו.
 */
export function borrowColumns(a: number, b: number): Place[] {
  const cols: Place[] = [];
  let borrow = 0;
  for (const p of LOW_TO_HIGH) {
    const digit = digitOf(a, p) - borrow;
    if (digit < digitOf(b, p)) {
      cols.push(p);
      borrow = 1;
    } else {
      borrow = 0;
    }
  }
  return cols;
}

/**
 * מספר הפריטות שהתרגיל דורש בפועל, טור אחר טור, כולל שרשור (הבדיקות
 * משוות אותו לכותרות התרגילים). עד 28.9.2026 ההנחיה אמרה "צפו בשינוי בפריטה הכפולה"
 * בכל 20 תרגילי מפגש 6 — גם בארבעה שאינם דורשים פריטה כלל (למשל 305 − 102),
 * בשלושה שדורשים פריטה אחת, ובשבעה שדורשים שלוש. ילד שקיבל את 305 − 102 הונחה
 * לפרוט פעמיים במקום שאין בו מה לפרוט.
 */
export function borrowCount(a: number, b: number): number {
  return borrowColumns(a, b).length;
}

export const S6_SUB = (ex: string, _a?: number, _b?: number) =>
  `פתרו חיסור עם אפסים: ${ex}.${BORROW_WHEN_NEEDED} הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.`;
export const S8_ADD = (ex: string) => `${ex}. פתרו את תרגיל החיבור וכתבו את התשובה בשורת התוצאה!`;
export const S8_SUB = (ex: string) => `${ex}. פתרו את תרגיל החיסור וכתבו את התשובה בשורת התוצאה!`;
// The button records one way per press, two in all (FlexibleDecompTask): the second way needs a second press.
export const FLEX_HOWTO = 'בנו את המספר בדרך אחת. לחצו על הכפתור "הוספת ייצוג". אחר כך בנו אותו בדרך שונה, ולחצו שוב על "הוספת ייצוג". רוצים לחזור צעד אחד אחורה? לחצו על כפתור ביטול הפעולה ↺.';
