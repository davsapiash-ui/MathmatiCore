import { digitAt, type Place } from './placeValue';

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
 * Place names read aloud to a screen reader follow the labels: a name not
 * shown is not spoken either.
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

/**
 * How many boxes the result row of a vertical exercise shows. Stations 3–7
 * (owner, 30.9.2026): as many as the digits of the longest number of the
 * exercise, so the row does not tell in advance that a place vanishes
 * (2,045 − 1,128 = 917 still shows a thousands box). Every other station keeps
 * the answer's own length (register, deviation 28).
 */
export function resultBoxCount(sessionNumber: number, a: number, b: number, target: number): number {
  const len = (n: number) => String(Math.abs(n)).length;
  return sessionNumber >= 3 && sessionNumber <= 7 ? Math.max(len(a), len(b), len(target)) : len(target);
}

const PLACES: Place[] = ['thousands', 'hundreds', 'tens', 'units'];
const digitOf = (n: number, p: Place): string => {
  const v = { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[p];
  return n >= v || (p === 'units') ? String(Math.floor(n / v) % 10) : '';
};

/**
 * A digit written in the wrong place — the owner's examples (30.9.2026): 3,751
 * for 1,573, or the 7 of the tens in the units box. Either
 *  - the answer's own digits in other boxes (3,751 for 1,573; 917 written one
 *    box to the left in a four-box row), or
 *  - a wrong digit that is the right digit of ANOTHER column of the answer and
 *    that no slip in its own column explains.
 * Slips are regrouping and counting errors, which the colours would not help
 * with and the existing ladder handles: a digit one away from the right one (a
 * forgotten or extra carry or borrow, or one block counted wrong: 3,783
 * answered 3,773, 435 answered 445), and, in subtraction, the smaller digit
 * taken from the larger (53 − 18 answered 45). A 0 in a box to the left of the
 * answer (the thousands box over 917) is right.
 */
export function isPlaceError(
  typed: Partial<Record<Place, string>>,
  target: number,
  exercise?: { a: number; b: number; isSubtraction?: boolean }
): boolean {
  const right: Record<Place, string> = { thousands: '', hundreds: '', tens: '', units: '' };
  for (const p of PLACES) right[p] = digitOf(Math.abs(target), p);
  const wrote = (p: Place): string => {
    const d = typed[p] ?? '';
    return d === '0' && right[p] === '' ? '' : d;
  };

  const sorted = (ds: string[]) => ds.filter((d) => d !== '').sort().join('');
  const rearranged = PLACES.some((p) => wrote(p) !== right[p]) && sorted(PLACES.map(wrote)) === sorted(PLACES.map((p) => right[p]));
  if (rearranged) return true;

  return PLACES.some((p) => {
    const d = wrote(p);
    if (d === '' || d === right[p]) return false;
    const dv = Number(d);
    const rv = right[p] === '' ? 0 : Number(right[p]);
    if ((dv - rv + 10) % 10 === 1 || (rv - dv + 10) % 10 === 1) return false;
    if (exercise?.isSubtraction && dv === Math.abs(digitAt(exercise.a, p) - digitAt(exercise.b, p))) return false;
    return PLACES.some((q) => q !== p && right[q] !== '' && right[q] === d);
  });
}
