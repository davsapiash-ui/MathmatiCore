/**
 * Which columns of בית המספרים are dimmed — PRD Module 7 §א: "עמעום טורים לא
 * פעילים (brightness: 0.6) ... בטורים שאינם במוקד החישוב הנוכחי".
 *
 * The PRD does not say what "מוקד החישוב" is. The owner decided it on
 * 28.9.2026 (register, gap יט). On the live site, 2.10.2026, in 347 ("בנו ...
 * ופרטו עשרת אחת לעשר יחידות") the cursor in the units box dimmed the hundreds
 * and the tens while the child still had to build and break a ten there; the
 * owner: "עימעום הטורים לא משרת את המטרה וזה לא רק בתרגיל הזה — כולו צריך
 * לעבור דיוק וכיול", and left the calibration to us. The rule since then: a
 * column is dimmed only to focus a computation, never where the child has to
 * act at that moment.
 *
 * - A calculation focus exists only where the child computes one column at a
 *   time: the vertical exercises (vertical_addition, addition_simple,
 *   skeletons). Every other exercise works on the whole board and nothing is
 *   ever dimmed: representation (meetings 1, 3, 7 and the choice banks — the
 *   child builds, breaks or groups across columns and reads the whole board to
 *   write the number), flexible_decomp, missing_element, small_change and
 *   meeting 1's tool steps.
 * - What the child does with the blocks (boardOperation): the exercise itself;
 *   a skeleton with a hidden operand, the inverse operation that finds it
 *   (owner, 1.10.2026, D12: a hidden minuend is found by adding back) —
 *   31▢ + 254 = 568 is worked as 568 − 254, and 5,▢▢▢ − 2,847 = 2,159 as
 *   2,159 + 2,847.
 * - Vertical exercise, while the child builds the numbers — nothing is
 *   dimmed: every column is being built, whatever box or circle the cursor is
 *   in. Building, against the board work: an addition, while the board is not
 *   worth the two numbers together; a subtraction, until the board has held
 *   the number it starts from — the first number (takeAwayTrack.held), or a
 *   skeleton's result (heldFromTrack.held, view only). A child who never
 *   builds that exact number gets no dimming at all: the rule errs toward not
 *   dimming.
 * - Vertical exercise, computing: the focus column is the result box,
 *   hidden-operand box or memory circle the child stands in (meeting 1: a box
 *   only, as before). With nothing focused nothing is dimmed (owner,
 *   7.10.2026): the lowest empty box used to stand for the focus, a guess at
 *   the child's next step — and a child who grouped the tens first, or took
 *   away the tens first, acted in a dimmed column, and the ten a units
 *   grouping carries landed in one. The dimming now means one thing only:
 *   the column of the box the child is writing in. Lit with it:
 *     · every place from the lowest box still empty up to the focus: a box
 *       focused above an empty lower box depends on that column (53 − 18,
 *       the cursor in the tens box before the units: the ten is broken in the
 *       units' computation);
 *     · every lower place without a box of its own (a missing result digit,
 *       a skeleton): the child works it out on the board, and the digit in
 *       the focus column depends on it (328 + 145, the tens missing: the
 *       units are grouped first);
 *     · in a column that lacks blocks for the subtraction, the columns its
 *       break comes from — the one to its left and, through an empty column,
 *       on to the first that holds a block (53 − 18: the tens with the units;
 *       4,000 − 1,562: tens, hundreds and thousands with the units). The
 *       child clicks or drags a block there, and writes that column's new
 *       count in its memory circle. A grouping needs no other column: its
 *       "קבצו 10" button is on the focus column itself;
 *     · in an addition, a lower column that still holds ten blocks or more:
 *       its grouping carries into the focus column (a digit typed before the
 *       blocks were grouped);
 *     · a memory circle in such a chain lights the whole chain — the column
 *       that lacks blocks and every column the break passes (4,000 − 1,562,
 *       the cursor in the thousands circle: all four; 53 − 18, the tens
 *       circle: the units too).
 * - Skeleton with a hidden operand, nothing focused: nothing is dimmed — the
 *   sheet's boxes do not follow the order of the inverse operation, so there
 *   is no lowest box to stand for the column the child works in.
 *
 * Display only. Nothing here is written anywhere: `focusedPlace` and
 * `activeColumnIndex` keep exactly the values they had, because the research
 * telemetry reads them. The memory circle's focus lives in its own view store
 * (useBoardFocusStore) for that reason — writing it to `focusedPlace` would
 * change what the telemetry records.
 *
 * Only brightness 0.6: the column is never made see-through, and clicks and
 * drags stay active in every column (register, gap יד).
 */

import { PLACE_ORDER, type Place } from './placeValue';

/** PRD Module 7 §א: a column outside the focus is dimmed to brightness 0.6. */
export const DIMMED_COLUMN_FILTER = 'brightness(0.6)';

const NONE: ReadonlySet<Place> = new Set();

/** The boxes a vertical exercise shows, by place (as VerticalAdditionTask draws them). */
export interface VerticalBoxes {
  /** Result-row boxes the child types in (revealed skeleton digits excluded). */
  result: Place[];
  /** Hidden operand digits the child types (skeleton exercises). */
  operandA: Place[];
  operandB: Place[];
}

const placesOf = (n: number): Place[] => PLACE_ORDER.slice(0, String(Math.abs(n)).length);

/**
 * `resultLength`: how many boxes the result row has (core/placeCues.ts
 * resultBoxCount) — in stations 3–7 a box for every place of the longest
 * number, so the lit column stays on an empty thousands box over 917 and does
 * not tell the child that no digit goes there. The answer's own length when
 * not given.
 */
export function verticalBoxes(
  a: number,
  b: number,
  target: number,
  hidden: { a?: Place[]; b?: Place[] } = {},
  revealedResult: Place[] = [],
  resultLength: number = String(Math.abs(target)).length
): VerticalBoxes {
  return {
    result: PLACE_ORDER.slice(0, resultLength).filter((p) => !revealedResult.includes(p)),
    operandA: placesOf(a).filter((p) => hidden.a?.includes(p)),
    operandB: placesOf(b).filter((p) => hidden.b?.includes(p)),
  };
}

/** A vertical exercise's numbers and what the board holds — the computing stage and its breaks. */
export interface VerticalWork {
  /** The exercise as the sheet shows it (the numbers the child works with). */
  a: number;
  b: number;
  isSubtraction: boolean;
  /** Skeleton: the operand digits the child finds. */
  hidden?: { a?: Place[]; b?: Place[] };
  /** What the blocks on the board are worth. */
  boardValue: number;
  /** The blocks in each column (an addition: a lower column of ten or more is still to be grouped). */
  counts?: Partial<Record<Place, number>>;
  /**
   * A subtraction on the board: the board has held the number it starts from
   * (boardOperation's `from`) in this exercise — takeAwayTrack.held when that
   * is the first number, heldFromTrack.held otherwise (heldFromNumber).
   */
  heldFrom: boolean;
}

export interface ColumnFocusInput {
  sessionNumber: number;
  taskType: string | null | undefined;
  /** Result-row or hidden-operand box the child stands in (store `focusedPlace`, read only). */
  focusedPlace: Place | null;
  /** Memory circle the child stands in (view state only). */
  focusedMemoryCircle: Place | null;
  /** Vertical exercise: its boxes, and what is typed in them. */
  vertical?: VerticalBoxes;
  /** Vertical exercise: its numbers and the board (without it: no building stage, no breaks). */
  work?: VerticalWork;
  answerDigits?: Partial<Record<Place, string>>;
  operandDigits?: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> };
}

const VERTICAL_TASKS: ReadonlySet<string> = new Set(['vertical_addition', 'addition_simple']);

const filled = (v: string | undefined) => v !== undefined && v !== '';

/** Meetings 3–7, nothing focused: the lowest place with an empty box, or null when all are filled. */
export function lowestEmptyPlace(
  boxes: VerticalBoxes,
  answerDigits: Partial<Record<Place, string>> = {},
  operandDigits: { a: Partial<Record<Place, string>>; b: Partial<Record<Place, string>> } = { a: {}, b: {} }
): Place | null {
  for (const p of PLACE_ORDER) {
    if (boxes.result.includes(p) && !filled(answerDigits[p])) return p;
    if (boxes.operandA.includes(p) && !filled(operandDigits.a[p])) return p;
    if (boxes.operandB.includes(p) && !filled(operandDigits.b[p])) return p;
  }
  return null;
}

const PLACE_VALUE: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };
const digitAt = (n: number, p: Place) => Math.floor(Math.abs(n) / PLACE_VALUE[p]) % 10;

/**
 * What the child does with the blocks: the exercise itself, or — a skeleton
 * with a hidden operand — the inverse operation that finds it.
 */
export function boardOperation(w: Pick<VerticalWork, 'a' | 'b' | 'isSubtraction' | 'hidden'>): { from: number; other: number; subtract: boolean } {
  const result = w.isSubtraction ? w.a - w.b : w.a + w.b;
  if (w.hidden?.a?.length) return { from: result, other: w.b, subtract: !w.isSubtraction }; // a = r − b, or a = r + b
  if (w.hidden?.b?.length) return w.isSubtraction ? { from: w.a, other: result, subtract: true } : { from: result, other: w.a, subtract: true };
  return { from: w.a, other: w.b, subtract: w.isSubtraction };
}

/**
 * The number the board must hold before a subtraction on the board starts,
 * when it is NOT the first number — a + ▢ = r and ▢ + b = r, worked as r − a
 * and r − b. The store keeps whether the board has held it
 * (useWorkspaceStore heldFromTrack, view only); the first number is
 * takeAwayTrack's. null: no such number.
 */
export function heldFromNumber(w: Pick<VerticalWork, 'a' | 'b' | 'isSubtraction' | 'hidden'>): number | null {
  const op = boardOperation(w);
  return op.subtract && op.from !== w.a ? op.from : null;
}

/**
 * Subtraction with blocks, column by column from the units: for each column
 * that lacks blocks, the columns the child breaks a block in — the nearest
 * column to its left that holds one, and every empty column on the way (they
 * pass the block on). 806 − 351 → tens: [hundreds]; 4,000 − 1,562 → units:
 * [tens, hundreds, thousands].
 */
export function breakSources(from: number, take: number): Map<Place, Place[]> {
  const counts = Object.fromEntries(PLACE_ORDER.map((p) => [p, digitAt(from, p)])) as Record<Place, number>;
  const out = new Map<Place, Place[]>();
  PLACE_ORDER.forEach((p, i) => {
    const need = digitAt(take, p);
    if (counts[p] < need) {
      const q = PLACE_ORDER.findIndex((r, j) => j > i && counts[r] > 0);
      if (q === -1) return; // nothing left to break (not an exercise in the banks)
      const via = PLACE_ORDER.slice(i + 1, q + 1);
      for (let j = q; j > i; j--) {
        counts[PLACE_ORDER[j]] -= 1;
        counts[PLACE_ORDER[j - 1]] += 10;
      }
      out.set(p, via);
    }
    counts[p] -= need;
  });
  return out;
}

/**
 * Still building the numbers, against the board work: an addition while the
 * board is not worth the two numbers together; a subtraction until the board
 * has held the number it starts from.
 */
export function stillBuilding(w: VerticalWork): boolean {
  const op = boardOperation(w);
  return op.subtract ? !w.heldFrom : w.boardValue !== op.from + op.other;
}

/** The focus column, and what its computation needs lit with it. */
function litColumns(focus: Place, circle: Place | null, input: ColumnFocusInput): Set<Place> {
  const lit = new Set<Place>([focus]);
  const at = PLACE_ORDER.indexOf(focus);
  const boxes = input.vertical;
  if (boxes) {
    // From the lowest box still empty up to the focus: the focus digit depends on them.
    const low = lowestEmptyPlace(boxes, input.answerDigits, input.operandDigits);
    if (low) PLACE_ORDER.slice(PLACE_ORDER.indexOf(low), at).forEach((q) => lit.add(q));
    // Every lower place without a box: worked out on the board.
    for (const q of PLACE_ORDER.slice(0, at)) {
      if (!boxes.result.includes(q) && !boxes.operandA.includes(q) && !boxes.operandB.includes(q)) lit.add(q);
    }
  }
  if (input.work) {
    const op = boardOperation(input.work);
    if (op.subtract) {
      const sources = breakSources(op.from, op.other);
      // A memory circle in a break chain: the whole chain.
      if (circle) {
        for (const [p, via] of sources) {
          if (p === circle || via.includes(circle)) [p, ...via].forEach((q) => lit.add(q));
        }
      }
      for (const q of [...lit]) sources.get(q)?.forEach((p) => lit.add(p));
    } else {
      // A lower column still to be grouped carries into the focus.
      for (const q of PLACE_ORDER.slice(0, at)) if ((input.work.counts?.[q] ?? 0) >= 10) lit.add(q);
    }
  }
  return lit;
}

export function dimmedColumns(input: ColumnFocusInput): ReadonlySet<Place> {
  const { taskType, sessionNumber, work } = input;
  // No calculation focus outside the vertical exercises: the whole board is the work.
  if (!taskType || !VERTICAL_TASKS.has(taskType)) return NONE;

  if (work && stillBuilding(work)) return NONE;

  // Meeting 1, as before: only a result or hidden-operand box dims; the memory
  // circle never did (and the sheet has a thousands circle while the meeting-1
  // board has no thousands column, which would dim every column on screen).
  const circle = input.focusedPlace || sessionNumber === 1 ? null : input.focusedMemoryCircle;
  // Owner, 7.10.2026: dimmed only while the child stands in a box or circle.
  // With nothing focused the board was dimmed around the lowest empty box —
  // a guess at the child's next step that dimmed the very column a child who
  // worked in another order was acting in.
  const focus = input.focusedPlace ?? circle;
  if (!focus) return NONE;
  const lit = litColumns(focus, circle, input);
  return new Set(PLACE_ORDER.filter((p) => !lit.has(p)));
}
