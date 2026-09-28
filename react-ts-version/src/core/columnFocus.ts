/**
 * Which column of בית המספרים is "במוקד החישוב הנוכחי" — the one column the
 * dimming leaves lit (PRD Module 7 §א: "עמעום טורים לא פעילים (brightness: 0.6)
 * ... בטורים שאינם במוקד החישוב הנוכחי").
 *
 * The PRD defines the focus only through that sentence. Where the exercise is
 * worked column by column — the vertical exercises of meetings 1 and 3–7,
 * skeleton exercises included — the column in focus is the one whose box the
 * child is writing in: a result-row box or a memory circle (`focusedPlace`, set
 * by VerticalAdditionTask). Until the child stands in one of them there is no
 * column in focus, and nothing is dimmed.
 *
 * Representation exercises ("ייצגו את המספר 4,500 באמצעות מאות בלבד") and the
 * two-representations exercises are not worked column by column: the child
 * builds in whichever columns the representation needs and then writes the whole
 * number. The PRD does not say which column is in focus there, and the owner has
 * not decided; so no column is singled out and none is dimmed (register, open
 * gap יח, 28.9.2026). RepresentationTask still sets `focusedPlace` (other
 * features read it); it is ignored here. Until that date the units column stayed
 * lit and every other column was dimmed in every exercise of meetings 3–7, and in
 * a representation exercise the box the child stood in lit its own column — in
 * "45 מאות" the hundreds column the child was building in was dimmed unless the
 * child stood in the hundreds box.
 */

import type { Place } from './placeValue';

/** Task types whose result row is worked one column at a time. */
const COLUMN_BY_COLUMN_TASKS: ReadonlySet<string> = new Set(['vertical_addition', 'addition_simple']);

export function calculationFocusPlace(taskType: string | null | undefined, focusedPlace: Place | null): Place | null {
  if (!taskType || !COLUMN_BY_COLUMN_TASKS.has(taskType)) return null;
  return focusedPlace;
}

/** PRD Module 7 §א: a column outside the focus is dimmed to brightness 0.6. */
export const DIMMED_COLUMN_FILTER = 'brightness(0.6)';

export function isColumnDimmed(place: Place, focus: Place | null): boolean {
  return focus !== null && focus !== place;
}
