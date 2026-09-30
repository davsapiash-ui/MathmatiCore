import type { Place } from './placeValue';

/**
 * The result row of a vertical exercise: the colour of each box (the board's
 * column colours) and the place label under it ("מאות", "עשרות"…).
 *
 * Owner, 30.9.2026 (stations 3–7, after a station-by-station analysis):
 *  - regular profile: the row starts in one neutral colour, without labels —
 *    the child links each column of the number house to its box. After a wrong
 *    answer with a digit in the wrong place, colours and labels appear as a
 *    scaffold until the end of the exercise;
 *  - enhanced cognitive support profile: the colours are always there (as in
 *    station 2); the LABELS are the scaffold, with the same trigger.
 * Station 2 (owner, 27.9.2026): only the enhanced profile sees colours and
 * labels. Stations 1 and 8 keep both, unchanged.
 */
export function resultRowCues(
  sessionNumber: number,
  enhanced: boolean,
  scaffoldShown: boolean
): { colours: boolean; labels: boolean } {
  if (sessionNumber === 2) return { colours: enhanced, labels: enhanced };
  if (sessionNumber >= 3 && sessionNumber <= 7) {
    return enhanced ? { colours: true, labels: scaffoldShown } : { colours: scaffoldShown, labels: scaffoldShown };
  }
  return { colours: true, labels: true };
}

/** The line that appears with the scaffold (owner's wording, 30.9.2026). */
export const PLACE_CUE_LINE_HE = {
  regular: 'שימו לב לצבעים בשורת התוצאה. כל תיבה צבועה בצבע של הטור שלה בבית המספרים.',
  enhanced: 'שימו לב לכותרות שמתחת לתיבות.',
} as const;

const PLACES: Place[] = ['thousands', 'hundreds', 'tens', 'units'];
const digitOf = (n: number, p: Place): string => {
  const v = { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[p];
  return n >= v || (p === 'units') ? String(Math.floor(n / v) % 10) : '';
};

/**
 * A digit written in the wrong place: some box holds a wrong digit that is the
 * right digit of ANOTHER column of the answer (1,573 written 3,751, or the 7 of
 * the tens typed into the units box). A wrong count or a forgotten regrouping
 * is not this error — the colours would not help there.
 */
export function isPlaceError(typed: Partial<Record<Place, string>>, target: number): boolean {
  const right: Partial<Record<Place, string>> = {};
  for (const p of PLACES) right[p] = digitOf(Math.abs(target), p);
  return PLACES.some((p) => {
    const d = typed[p];
    if (d === undefined || d === '' || d === right[p]) return false;
    return PLACES.some((q) => q !== p && right[q] !== '' && right[q] === d);
  });
}
