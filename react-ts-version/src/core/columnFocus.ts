/**
 * Which columns of בית המספרים are dimmed — PRD Module 7 §א: "עמעום טורים לא
 * פעילים (brightness: 0.6) ... בטורים שאינם במוקד החישוב הנוכחי".
 *
 * The PRD does not say what "מוקד החישוב" is. The owner decided it on
 * 28.9.2026 (register, gap יט):
 *
 * - Representation exercises (type 'representation': meetings 1, 3, 7 and the
 *   choice banks). While no result-row box is focused, nothing is dimmed. In
 *   the box of place p, column p and every lower place stay lit and only the
 *   higher places are dimmed; in the highest box of the result row nothing is
 *   dimmed.
 * - flexible_decomp and missing_element: never dimmed.
 * - Vertical exercises (vertical_addition, addition_simple, skeletons). A
 *   focused result box, hidden-operand box or memory circle of place p lights
 *   column p and dims the others. In meetings 3–7, with nothing focused, the
 *   lit column is the lowest place whose box is still empty (result box, or in
 *   a skeleton also a hidden-operand box) — units when the exercise opens,
 *   moving left as soon as that box holds any digit, right or wrong; when every
 *   box is filled nothing is dimmed. In meeting 1 a column is dimmed only while
 *   a result or hidden-operand box is focused, as on main.
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

export interface ColumnFocusInput {
  sessionNumber: number;
  taskType: string | null | undefined;
  /** Result-row or hidden-operand box the child stands in (store `focusedPlace`, read only). */
  focusedPlace: Place | null;
  /** Memory circle the child stands in (view state only). */
  focusedMemoryCircle: Place | null;
  /** Representation exercise: the number whose result row is shown. */
  representationValue?: number;
  /** Vertical exercise: its boxes, and what is typed in them. */
  vertical?: VerticalBoxes;
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

const allBut = (lit: Place): ReadonlySet<Place> => new Set(PLACE_ORDER.filter((p) => p !== lit));

export function dimmedColumns(input: ColumnFocusInput): ReadonlySet<Place> {
  const { taskType, sessionNumber } = input;

  if (taskType === 'representation') {
    const p = input.focusedPlace;
    if (!p) return NONE;
    const row = placesOf(input.representationValue ?? 0);
    const idx = PLACE_ORDER.indexOf(p);
    if (idx >= row.length - 1) return NONE; // the highest box of the result row
    return new Set(PLACE_ORDER.slice(idx + 1));
  }

  if (!taskType || !VERTICAL_TASKS.has(taskType)) return NONE;

  // Meeting 1, as on main: only a result or hidden-operand box dims; the memory
  // circle never did (and the sheet has a thousands circle while the meeting-1
  // board has no thousands column, which would dim every column on screen).
  const focused = input.focusedPlace ?? (sessionNumber === 1 ? null : input.focusedMemoryCircle);
  if (focused) return allBut(focused);
  if (sessionNumber < 3 || sessionNumber > 7 || !input.vertical) return NONE;
  const lit = lowestEmptyPlace(input.vertical, input.answerDigits, input.operandDigits);
  return lit ? allBut(lit) : NONE;
}
