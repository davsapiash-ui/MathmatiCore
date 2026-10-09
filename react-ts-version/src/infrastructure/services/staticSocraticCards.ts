/**
 * The static Socratic card of meetings 3–8, computed from the exercise on the
 * screen (register, approved deviation 2: the static hint is "מחושב מהמספרים
 * של התרגיל ומצב הלוח"; owner, 28.9.2026: a card about 3,400 in the 4,500
 * exercise must not happen).
 *
 * Every card here says only what is true of the exercise the child sees:
 *  - numbers are named only as the screen shows them — a hidden digit of a
 *    skeleton exercise stays "▢", and a number the child is asked to find is
 *    never named;
 *  - a column is named only where the exercise really converts: the first
 *    column (from the units) whose addition reaches 10, or whose minuend digit
 *    is smaller than the subtrahend's;
 *  - in meeting 8 there are no blocks, no trash and no number house on the
 *    screen (PRD Module 14 §ב), so the card speaks of the result row and the
 *    memory circles only (PRD Module 13 §א: no aids that are not on screen).
 *
 * The cards of מסמך 03 (one per meeting) are the model for the wording; the
 * register's deviation 2 calls them examples, and the column and the numbers
 * here are the exercise's own.
 *
 * Owner, 30.9.2026: the feedback of a wrong option opens with "רמז:" and is a
 * short guiding question — never an explanation, never the answer; the
 * feedback of the right one opens with "נכון מאוד!". The seven cards of that
 * day (C1–C7 below) are his approved wording.
 */

import type { Place } from '@/core/placeValue';
import { buildsAnyWay, builtAnyWay, representationKindOfTask } from '@/data/representationLocks';
import type { SocraticHintResponse } from './SocraticEngine';

const LOW_TO_HIGH: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const DIVISOR: Record<Place, number> = { units: 1, tens: 10, hundreds: 100, thousands: 1000 };

const COLUMN: Record<Place, string> = { units: 'טור היחידות', tens: 'טור העשרות', hundreds: 'טור המאות', thousands: 'טור האלפים' };
const PLURAL: Record<Place, string> = { units: 'יחידות', tens: 'עשרות', hundreds: 'מאות', thousands: 'אלפים' };
const ONE: Record<Place, string> = { units: 'יחידה אחת', tens: 'עשרת אחת', hundreds: 'מאה אחת', thousands: 'אלף אחד' };
const TEN_OF: Record<Place, string> = { units: 'עשר יחידות', tens: 'עשר עשרות', hundreds: 'עשר מאות', thousands: 'עשרה אלפים' };
const NONE: Record<Place, string> = { units: 'אף יחידה', tens: 'אף עשרת', hundreds: 'אף מאה', thousands: 'אף אלף' };
const BLOCK: Record<Place, string> = { units: 'לבנת יחידה', tens: 'לבנת עשרת', hundreds: 'לבנת מאה', thousands: 'לבנת אלף' };
const BLOCK_THE: Record<Place, string> = { units: 'לבנת היחידה', tens: 'לבנת העשרת', hundreds: 'לבנת המאה', thousands: 'לבנת האלף' };
const BLOCKS: Record<Place, string> = { units: 'לבני יחידה', tens: 'לבני עשרת', hundreds: 'לבני מאה', thousands: 'לבני אלף' };
const BLOCKS_THE: Record<Place, string> = { units: 'לבני היחידה', tens: 'לבני העשרת', hundreds: 'לבני המאה', thousands: 'לבני האלף' };
/** The worth of one block, as a quantity: "בנו כל מאה מ-10 לבני עשרת". */
const WORTH: Record<Place, string> = { units: 'יחידה', tens: 'עשרת', hundreds: 'מאה', thousands: 'אלף' };
/** "אלף" is masculine; the other three are feminine. */
const MASC: Record<Place, boolean> = { units: false, tens: false, hundreds: false, thousands: true };

/** "העשרת", "האלף": one block's worth, with the article. */
const THE_ONE: Record<Place, string> = { units: 'היחידה', tens: 'העשרת', hundreds: 'המאה', thousands: 'האלף' };

const digit = (n: number, p: Place) => Math.floor(n / DIVISOR[p]) % 10;
const next = (p: Place): Place | null => LOW_TO_HIGH[LOW_TO_HIGH.indexOf(p) + 1] ?? null;
const prevPlace = (p: Place): Place | null => LOW_TO_HIGH[LOW_TO_HIGH.indexOf(p) - 1] ?? null;
const places = (n: number): Place[] => LOW_TO_HIGH.slice(0, Math.max(1, String(Math.abs(n)).length));
/** "עברה" / "עבר" — אלף is masculine. */
const passed = (p: Place) => (MASC[p] ? 'עבר' : 'עברה');

/** The way numbers are written on the child's screen: "1,245", "328". */
export function formatNumberHe(n: number): string {
  const s = String(Math.abs(n));
  return s.length > 3 ? `${s.slice(0, -3)},${s.slice(-3)}` : s;
}

/** A number with some digits hidden, as the skeleton exercise shows it: "2,▢3▢". */
function masked(n: number, hidden: Place[] = []): string {
  const ps = places(n);
  const chars = [...ps].reverse().map((p) => (hidden.includes(p) ? '▢' : String(digit(n, p))));
  const s = chars.join('');
  return s.length > 3 ? `${s.slice(0, -3)},${s.slice(-3)}` : s;
}

/** "3 מאות", "עשרת אחת". */
function count(n: number, p: Place): string {
  return n === 1 ? ONE[p] : `${n} ${PLURAL[p]}`;
}

/** Joins with the Hebrew "and": "3 אלפים ו-4 מאות", "4 אלפים, 11 מאות ו-13 עשרות", "5 מאות ועשרת אחת". */
function joinHe(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  const last = parts[parts.length - 1];
  const and = /^\d/.test(last) ? `ו-${last}` : `ו${last}`;
  return `${parts.slice(0, -1).join(', ')} ${and}`;
}

/** Hebrew preposition "ב" glued the way the instructions glue it: "ב-34 מאות", "במאה אחת". */
const withBe = (s: string) => (/^\d/.test(s) ? `ב-${s}` : `ב${s}`);

type Counts = Partial<Record<Place, number>>;

function countsPhrase(c: Counts): string {
  return joinHe([...LOW_TO_HIGH].reverse().filter((p) => (c[p] ?? 0) > 0).map((p) => count(c[p]!, p)));
}

function standardCounts(n: number): Counts {
  const out: Counts = {};
  for (const p of LOW_TO_HIGH) if (digit(n, p) > 0) out[p] = digit(n, p);
  return out;
}

const sameCounts = (a: Counts, b: Counts) => LOW_TO_HIGH.every((p) => (a[p] ?? 0) === (b[p] ?? 0));

/** Every whole number the instruction shows ("1,245" is 1245). */
export function numbersInInstruction(task: any): number[] {
  const text = typeof task?.instructionHe === 'string' ? stripDigitGroupSeparators(task.instructionHe) : '';
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Is this text (or its number) on the child's screen — i.e. in the instruction? */
function onScreen(task: any, text: string): boolean {
  return typeof task?.instructionHe === 'string' && task.instructionHe.includes(text);
}

/** Is this number, as a whole number, in the instruction? 45 is not in "450". */
function numberOnScreen(task: any, n: number): boolean {
  return typeof task?.instructionHe === 'string' && revealsSecret([task.instructionHe], [n]) !== null;
}

/** The number the child writes: the task's answer, or the number it is about. */
function numberWritten(task: any): number | undefined {
  if (typeof task?.correctAnswer === 'number') return task.correctAnswer;
  return typeof task?.numberA === 'number' ? task.numberA : undefined;
}

/** Meeting number of an exercise id ("s8_g_t1" → 8), or null. */
export function meetingOfTaskId(id?: string): number | null {
  const m = typeof id === 'string' ? /^s(\d)_/.exec(id) : null;
  return m ? Number(m[1]) : null;
}

/** Meetings 2 and 8 have no blocks, no trash and no number house on the screen (PRD Module 14 §ב). */
export function blocksOnScreen(meeting: number | null): boolean {
  return meeting !== 2 && meeting !== 8;
}

/** Columns, from the units, where a + b reaches 10 (with what came from the right). */
export function carryColumns(a: number, b: number): Place[] {
  const out: Place[] = [];
  let carry = 0;
  for (const p of LOW_TO_HIGH) {
    const sum = digit(a, p) + digit(b, p) + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) out.push(p);
  }
  return out;
}

/** Columns, from the units, where a − b needs a decomposition (after what the right column took). */
export function borrowColumns(a: number, b: number): Place[] {
  const out: Place[] = [];
  let borrow = 0;
  for (const p of LOW_TO_HIGH) {
    const need = digit(a, p) - borrow < digit(b, p);
    if (need) out.push(p);
    borrow = need ? 1 : 0;
  }
  return out;
}

/**
 * The numbers this exercise must never show in a card: the result the child
 * works out, the hidden digits of a skeleton (as the whole operand), or a
 * number the child is asked to find. Checked on every card, static or AI.
 */
export function secretNumbersOf(task: any): number[] {
  if (!task) return [];
  const a = task.numberA;
  const b = task.numberB;
  if (task.type === 'representation' || task.type === 'flexible_decomp') {
    // As a whole number: 45 is not on a screen that shows only 450.
    const out: number[] = typeof a === 'number' && !numberOnScreen(task, a) ? [a] : [];
    // The number the child writes, when it is not the one built: "build 450
    // from tens only" is answered 45 (the station-3 redesign, 30.9.2026).
    const w = task.correctAnswer;
    if (typeof w === 'number' && w !== a && !numberOnScreen(task, w)) out.push(w);
    return out;
  }
  if (task.type === 'missing_element') {
    return typeof task.correctAnswer === 'number' ? [task.correctAnswer] : [];
  }
  if (typeof a !== 'number' || typeof b !== 'number') return [];
  const result = task.isSubtraction ? a - b : a + b;
  const out: number[] = [];
  if (task.hiddenDigits?.a?.length) out.push(a);
  if (task.hiddenDigits?.b?.length) out.push(b);
  // A skeleton shows its whole result; every other exercise asks for it.
  const resultShown = Array.isArray(task.revealedResultDigits) && task.revealedResultDigits.length >= places(result).length;
  if (!resultShown) out.push(result);
  return out;
}

/**
 * Deletes a digit-group separator between two digits — comma, apostrophe,
 * geresh, space, NBSP, narrow NBSP, thin space — so that "1,573", "1 573"
 * and "1'573" all read as 1573. Mirrored on the server
 * (functions/src/socraticContract.ts, stripDigitGroupSeparators).
 */
const DIGIT_GROUP_SEPARATOR = /(?<=\d)[,'\u05F3 \u00A0\u202F\u2009](?=\d{3}(?!\d))/g;
export function stripDigitGroupSeparators(text: string): string {
  return text.replace(DIGIT_GROUP_SEPARATOR, '');
}

/** Does any text show one of these numbers ("4500", "4,500", "4 500", …)? */
export function revealsSecret(texts: string[], secrets: number[]): number | null {
  const plain = texts.map(stripDigitGroupSeparators);
  for (const n of secrets) {
    const re = new RegExp(`(^|[^0-9])${n}(?![0-9])`);
    if (plain.some((t) => re.test(t))) return n;
  }
  return null;
}

/** A digit as a card may write it: the digit, or a number word of it, in either gender. Mirrors the server (socraticContract.DIGIT_WORDS_HE). */
const DIGIT_WORDS_HE: Record<number, string[]> = {
  0: ['אפס'], 1: ['אחת', 'אחד'], 2: ['שתיים', 'שתי', 'שניים', 'שני'], 3: ['שלוש', 'שלושה', 'שלושת'],
  4: ['ארבע', 'ארבעה', 'ארבעת'], 5: ['חמש', 'חמישה', 'חמשת'], 6: ['שש', 'שישה', 'ששת'],
  7: ['שבע', 'שבעה', 'שבעת'], 8: ['שמונה', 'שמונת'], 9: ['תשע', 'תשעה', 'תשעת'],
};

/**
 * A digit anywhere in a text, as a standalone token: "מוסיפים 8", "הספרה 8",
 * "שמונה". Not inside a longer number ("18", "3▢6"), not a construct before a
 * definite noun ("שני המספרים"), not "אחת / אחד" after a noun ("עשרת אחת"),
 * and not the 1 of the memory circle (a carry is always 1). Mirrors the server
 * (socraticContract.mentionsDigitAnywhere).
 */
export function mentionsDigitAnywhere(text: string, d: number): boolean {
  const token = new RegExp(`(?<![\\d▢])${d}(?![\\d▢])|(?<![א-ת])(?:${DIGIT_WORDS_HE[d].join('|')})(?![א-ת])`, 'g');
  for (const clause of stripDigitGroupSeparators(text).split(/[.?!;:\n]/)) {
    if (d === 1 && /עיגול/.test(clause)) continue;
    for (const t of clause.matchAll(token)) {
      if (/^\d$/.test(t[0])) return true;
      const before = clause.slice(0, t.index);
      const after = clause.slice((t.index ?? 0) + t[0].length);
      if (/^(?:שני|שתי|שלושת|ארבעת|חמשת|ששת|שבעת|שמונת|תשעת)$/.test(t[0]) && /^\s+ה[א-ת]/.test(after)) continue;
      if (/^(?:אחת|אחד)$/.test(t[0]) && /[א-ת]\s+$/.test(before)) continue;
      return true;
    }
  }
  return false;
}

/**
 * The single digits the screen hides — a skeleton's hidden operand digits, a
 * missing result digit — that it shows nowhere else (the 8 of 3▢6 + 271 =
 * 657). secretNumbersOf holds whole numbers only; a card that names such a
 * digit anywhere gives it away (final review, 2.10.2026). Mirrors the
 * server's digitSecretsOf / onScreen.
 */
export function hiddenDigitsOffScreen(task: any): number[] {
  if (!task || typeof task.numberA !== 'number' || typeof task.numberB !== 'number') return [];
  const a: number = task.numberA;
  const b: number = task.numberB;
  const result = task.isSubtraction ? a - b : a + b;
  const hiddenA: Place[] = task.hiddenDigits?.a ?? [];
  const hiddenB: Place[] = task.hiddenDigits?.b ?? [];
  const revealed: Place[] | null = Array.isArray(task.revealedResultDigits) ? task.revealedResultDigits : null;
  const hiddenResult = revealed ? places(result).filter((p) => !revealed.includes(p)) : [];
  if (!hiddenA.length && !hiddenB.length && !hiddenResult.length) return [];
  const shown = new Set<number>();
  for (const p of places(a)) if (!hiddenA.includes(p)) shown.add(digit(a, p));
  for (const p of places(b)) if (!hiddenB.includes(p)) shown.add(digit(b, p));
  if (revealed) for (const p of places(result)) if (revealed.includes(p)) shown.add(digit(result, p));
  for (const m of stripDigitGroupSeparators(typeof task.instructionHe === 'string' ? task.instructionHe : '').matchAll(/\d/g)) shown.add(Number(m[0]));
  const hidden = [...hiddenA.map((p) => digit(a, p)), ...hiddenB.map((p) => digit(b, p)), ...hiddenResult.map((p) => digit(result, p))];
  return [...new Set(hidden.filter((d) => !shown.has(d)))];
}

/** The first hidden digit (hiddenDigitsOffScreen) a text names, or null. */
export function revealsHiddenDigit(texts: string[], task: any): number | null {
  for (const d of hiddenDigitsOffScreen(task)) if (texts.some((t) => mentionsDigitAnywhere(t, d))) return d;
  return null;
}

/**
 * Block counts written in words, as the cards and the instructions write
 * them: "3 אלפים ו-4 מאות", "4 מאות, 10 עשרות ו-6 יחידות", "מאה אחת ו-6 עשרות".
 * Each maximal run is one group. Used on the AI card: a group worth a secret
 * number gives it away as surely as its digits, and on a representation task
 * a group is an option's representation. The block names of 30.9.2026 are
 * read too: "3 לבני מאה ו-4 לבני עשרת", "לבנת מאה אחת", "5 לבני העשרת".
 */
const PART = /(\d[\d,]*)\s+(?:(יחידות|עשרות|מאות|אלפים)|(?:לבני|לבנים)\s+(?:ה-?)?(יחידה|עשרת|מאה|אלף))|(יחידה אחת|עשרת אחת|מאה אחת|אלף אחד)|לבנת\s+(?:ה-?)?(יחידה|עשרת|מאה|אלף)\s+אחת/g;
const PART_PLACE: Record<string, Place> = {
  'יחידות': 'units', 'עשרות': 'tens', 'מאות': 'hundreds', 'אלפים': 'thousands',
  'יחידה אחת': 'units', 'עשרת אחת': 'tens', 'מאה אחת': 'hundreds', 'אלף אחד': 'thousands',
  'יחידה': 'units', 'עשרת': 'tens', 'מאה': 'hundreds', 'אלף': 'thousands',
};
const JOIN = /^(\s*,\s*|\s+ו-?|\s*,\s*ו-?|\s+ועוד\s+)$/;
type Part = { place: Place; n: number };
function countRunsIn(text: string): Part[][] {
  const runs: Part[][] = [];
  let current: Part[] | null = null;
  let lastEnd = -1;
  const plain = stripDigitGroupSeparators(text);
  for (const m of plain.matchAll(PART)) {
    const part = { place: PART_PLACE[m[2] ?? m[3] ?? m[4] ?? m[5]], n: m[1] ? Number(m[1].replace(/,/g, '')) : 1 };
    const joined = current !== null && JOIN.test(plain.slice(lastEnd, m.index)) && !current.some((q) => q.place === part.place);
    if (!joined || !current) {
      current = [];
      runs.push(current);
    }
    current.push(part);
    lastEnd = m.index! + m[0].length;
  }
  return runs;
}
const partsCounts = (parts: Part[]): Counts => Object.fromEntries(parts.map((q) => [q.place, q.n])) as Counts;
export function countGroupsIn(text: string): Counts[] {
  return countRunsIn(text).map(partsCounts);
}
export const countsValue = (c: Counts) => LOW_TO_HIGH.reduce((sum, p) => sum + (c[p] ?? 0) * DIVISOR[p], 0);

/**
 * Does any text write a secret number as blocks — a whole run or any stretch
 * of it ("מאה אחת ועוד 6 עשרות" gives away 60)?
 */
export function revealsSecretInCounts(texts: string[], secrets: number[]): number | null {
  for (const t of texts) {
    for (const run of countRunsIn(t)) {
      for (let i = 0; i < run.length; i++) {
        for (let j = i; j < run.length; j++) {
          const v = countsValue(partsCounts(run.slice(i, j + 1)));
          if (secrets.includes(v)) return v;
        }
      }
    }
  }
  return null;
}

const PLACE_OF_COLUMN: Record<string, Place> = { 'יחידות': 'units', 'עשרות': 'tens', 'מאות': 'hundreds', 'אלפים': 'thousands' };
/** "12 לבנים בטור העשרות", "בטור העשרות יש 12 לבנים" — not "10 לבנים או יותר", a threshold. */
const COUNT_IN_COLUMN = [
  /(\d+)\s+לבנים\s+(?:ב|מ|ל)?טור\s+ה(יחידות|עשרות|מאות|אלפים)/g,
  /(?:ב|מ|ל)?טור\s+ה(יחידות|עשרות|מאות|אלפים)\s+(?:יש\s+|נמצאות\s+|עכשיו\s+)*(\d+)\s+לבנים(?!\s+(?:או\s+יותר|ומעלה))/g,
];

/**
 * Stations 1 and 3–7: the child counts the blocks of each column himself — the
 * digit beside the column name is hidden (owner, 29–30.9.2026). Does a text
 * give a column's CURRENT count ("7 יחידות", "12 לבני עשרת", "לבנת מאה אחת",
 * "12 לבנים בטור העשרות")? Returns the column, or null. Not read: a column
 * with no blocks, and the names of a regrouping itself — "10 יחידות",
 * "עשרת אחת", "לבנת מאה אחת" ("מקבצים 10 יחידות לעשרת אחת" is the step, not
 * a count), and a number the exercise itself shows — the `skip` list: the
 * active column's digits and every number of the instruction ("בנו 12 לבני
 * עשרת" says 12 whatever the board holds). Used on the engine's card: the
 * static card replaces it.
 */
export function statesBoardCount(texts: string[], counts: Partial<Record<Place, number>>, skip: readonly number[] = []): Place | null {
  const holds = (p: Place, n: number) => n >= 2 && n !== 10 && !skip.includes(n) && (counts[p] ?? 0) === n;
  for (const t of texts) {
    const plain = stripDigitGroupSeparators(t);
    for (const run of countRunsIn(plain)) {
      for (const part of run) if (holds(part.place, part.n)) return part.place;
    }
    for (const m of plain.matchAll(COUNT_IN_COLUMN[0])) {
      const p = PLACE_OF_COLUMN[m[2]];
      if (holds(p, Number(m[1]))) return p;
    }
    for (const m of plain.matchAll(COUNT_IN_COLUMN[1])) {
      const p = PLACE_OF_COLUMN[m[1]];
      if (holds(p, Number(m[2]))) return p;
    }
  }
  return null;
}

/**
 * On a representation task the instruction names the blocks: an AI card that
 * marks them wrong, or marks other blocks right, contradicts the screen
 * (owner, 28.9.2026, שהB.1: no path may mark the instruction's own
 * representation wrong). Only an option that IS a choice of blocks is read —
 * "משתמשים ב-34 מאות", "בונים את המספר ב-3 אלפים ו-4 מאות", "בונים 3 לבני
 * מאה ו-4 לבני עשרת", and the same in the first person, which the model may
 * still write ("נשתמש…", "נבנה…") — not a step ("פורטים מאה אחת ל-10
 * עשרות") or an action on the blocks ("כותבים 3 מאות ו-4 עשרות בלי לבנות אותן").
 */
const REPRESENTATION_CHOICE = /^(נשתמש|משתמשים|נבנה|בונים|נייצג|מייצגים)(\s+אותו|\s+את(\s+המספר)?(\s+[\d,]+)?)?\s+(?:ב-?)?(?=\d|יחידה|עשרת|מאה|אלף|לבנת)/;
function chosenCounts(text: string): Counts | null {
  const t = text.trim();
  if (!REPRESENTATION_CHOICE.test(t)) return null;
  const rest = stripDigitGroupSeparators(t.replace(REPRESENTATION_CHOICE, '')).replace(/[.!]\s*$/, '');
  const groups = countRunsIn(rest);
  // The whole rest of the option must be one run of blocks and nothing else.
  if (groups.length !== 1 || rest.replace(PART, '').replace(/[\s,]+|ו-?/g, '') !== '') return null;
  return partsCounts(groups[0]);
}
export function contradictsRequiredRepresentation(task: any, choices: { textHe: string; isCorrect?: boolean }[]): boolean {
  if (task?.type !== 'representation' || !task.requiredCounts) return false;
  const required: Counts = task.requiredCounts;
  // "Build the number X" with no word on how (owner, 4.10.2026): every build
  // worth X is right (34 tens for 340), so none may be an option marked
  // wrong. The right option stays the exercise's own board, as before.
  const anyWay = buildsAnyWay(task);
  for (const c of choices) {
    const chosen = chosenCounts(c.textHe);
    if (!chosen) continue;
    if (!c.isCorrect && (sameCounts(chosen, required) || (anyWay && builtAnyWay(task, chosen)))) return true;
    if (c.isCorrect && !sameCounts(chosen, required)) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────

const OPEN = 'נסו לחשוב: ';

/**
 * The new cards of 30.9.2026 (owner-approved), by name. The store records a
 * card's kind once the card is shown, so a card that comes in levels is shown
 * once per exercise (useWorkspaceStore.socraticCardKinds).
 */
export const STATIC_CARD_KINDS = [
  'compose_break', // C1
  'decompose', // C2
  'read_write_zero', // C3
  'place_cues', // C4
  'borrow_check', // C5
  'error_analysis', // C6
  'compose_group', // C7
  // Owner, 1.10.2026: the card follows the situation, the trigger and the
  // level — the second card of an exercise in the same situation is not the
  // first one again. Each card below is recorded once shown, like C1–C7, and
  // the next card of its family reads it.
  'compose_break_2', 'compose_group_2', 'decompose_2', 'read_write_zero_2',
  'which_number', 'which_number_2',
  'carry', 'carry_2', 'add_start',
  'crowded', 'crowded_2',
  'borrow', 'break_action', 'sub_start',
  'error_analysis_2',
  's8_check',
  'skeleton', 'skeleton_2',
  'place_slip', 'place_slip_2',
  'steps', 'flexible', 'flexible_2',
  'show_board',
  's1_card', 's1_crowded', 's1_crowded_2', 's1_deficit', 's1_deficit_2', 's1_after_break',
  'build_first', 'missing_part', 'missing_part_2',
  // 2.10.2026 (audit D5): every card has a kind, so that every situation
  // family has its next level. No digits: the server keeps a shown kind only
  // when it matches /^[a-z_]{1,24}$/ (socraticContract, earlier_card_kinds).
  'build_both', 'one_number', 'build_number', 'build_first_how', 'build_first_number',
  'write_boxes', 'write_boxes_check', 'no_button', 'digits_in_columns',
  'stray', 'stray_which', 'extra_break', 'extra_break_which', 'same_number', 'restore_start',
  'sub_board_empty', 'take_away', 'take_away_how', 'check_before_taking', 'take_away_progress',
  'took_too_many', 'took_too_many_next', 'build_only_first', 'build_only_first_undo',
  'borrow_from_box', 'borrow_from_box_next', 'build_from_words', 'digit_column',
  'convert_yourselves', 'blocks_before_convert', 'build_before_convert', 'all_blocks_in', 'write_column', 'after_take_away',
  'small_change', 'small_change_column', 'extra_break_sub', 'group_back_action',
  'add_column', 'carry_written', 'sub_column', 'sub_after_borrow', 'carry_forgotten', 'carry_circle',
  'break_as_asked', 'break_result', 'group_as_asked', 'group_result',
  'compare_words', 'compare_words_column', 'board_hidden', 'guessing', 'count_not_number', 'column_count', 'group_yourselves',
  // Owner, 4.10.2026 (cards round 2, B1/B2): the blocks an exercise gave changed (2,730).
  'restore_given', 'restore_given_how',
] as const;
export type StaticCardKind = typeof STATIC_CARD_KINDS[number];

/** Each kind's situation family (cardFamilyOf): the levels of one card share it. */
const CARD_FAMILY: Record<StaticCardKind, string> = {
  compose_break: 'compose_break', compose_break_2: 'compose_break',
  decompose: 'decompose', decompose_2: 'decompose',
  read_write_zero: 'read_write_zero', read_write_zero_2: 'read_write_zero',
  place_cues: 'place_cues',
  borrow_check: 'borrow', borrow: 'borrow', break_action: 'borrow',
  error_analysis: 'error_analysis', error_analysis_2: 'error_analysis',
  compose_group: 'compose_group', compose_group_2: 'compose_group',
  which_number: 'which_number', which_number_2: 'which_number',
  restore_given: 'restore_given', restore_given_how: 'restore_given',
  carry: 'carry', carry_2: 'carry', add_start: 'add_start',
  crowded: 'crowded', crowded_2: 'crowded',
  sub_start: 'sub_start',
  s8_check: 'check_each_column',
  skeleton: 'skeleton', skeleton_2: 'skeleton',
  place_slip: 'place_slip', place_slip_2: 'place_slip',
  steps: 'steps', flexible: 'flexible', flexible_2: 'flexible',
  show_board: 'board_hidden',
  s1_card: 's1_card', s1_crowded: 'crowded', s1_crowded_2: 'crowded', s1_deficit: 'borrow', s1_deficit_2: 'borrow', s1_after_break: 's1_after_break',
  build_first: 'build_first', missing_part: 'missing_part', missing_part_2: 'missing_part',
  build_both: 'build_first', one_number: 'one_number', build_number: 'one_number', build_first_how: 'build_first',
  build_first_number: 'build_first_number',
  write_boxes: 'write_boxes', write_boxes_check: 'write_boxes', no_button: 'no_button', digits_in_columns: 'no_button',
  stray: 'stray', stray_which: 'stray', extra_break: 'extra_break', extra_break_which: 'extra_break',
  same_number: 'start_changed', restore_start: 'start_changed',
  sub_board_empty: 'sub_board_empty', take_away: 'take_away', take_away_how: 'take_away',
  check_before_taking: 'check_before_taking', take_away_progress: 'check_before_taking',
  took_too_many: 'took_too_many', took_too_many_next: 'took_too_many',
  build_only_first: 'build_only_first', build_only_first_undo: 'build_only_first',
  borrow_from_box: 'borrow_from_box', borrow_from_box_next: 'borrow_from_box',
  build_from_words: 'build_from_words', digit_column: 'digit_column',
  convert_yourselves: 'convert_yourselves', blocks_before_convert: 'convert_yourselves', build_before_convert: 'build_before_convert',
  all_blocks_in: 'write_result', write_column: 'write_result', after_take_away: 'write_result',
  small_change: 'small_change', small_change_column: 'small_change',
  extra_break_sub: 'extra_break_sub', group_back_action: 'extra_break_sub',
  add_column: 'column', carry_written: 'column', sub_column: 'column', sub_after_borrow: 'column',
  carry_forgotten: 'carry_forgotten', carry_circle: 'carry_forgotten',
  break_as_asked: 'convert_as_asked', break_result: 'convert_as_asked', group_as_asked: 'convert_as_asked', group_result: 'convert_as_asked',
  compare_words: 'compare_words', compare_words_column: 'compare_words',
  board_hidden: 'board_hidden', guessing: 'guessing_loop', count_not_number: 'decompose', column_count: 'column', group_yourselves: 'start_changed',
};

/** What opened the card (useWorkspaceStore.SocraticTriggerReason). */
export type StaticCardTrigger =
  | 'hesitation_45s'
  | 'consecutive_errors_4'
  | 'consecutive_undos_3'
  | 'conversion_not_performed'
  | 'repeated_errors';

/**
 * What the card chooser knows about the exercise so far, beyond the board.
 * Every field is optional: without it the chooser reads the board alone, as
 * it did before 1.10.2026. The store fills them in
 * useWorkspaceStore.staticCardContextFor.
 */
export interface StaticCardContext {
  /** The result row's place cues are on (useWorkspaceStore.placeCuesShown; stations 3–7, owner 30.9.2026). */
  placeCuesShown?: boolean;
  /** Cards already shown in this exercise. */
  shownKinds?: readonly StaticCardKind[];
  /**
   * A break or grouping exercise (compose_break, compose_group): are all the
   * conversions its instruction names done with the blocks — both groupings
   * of s7_g_t1? False: not yet; undefined: unknown (no store), read as done.
   * From useWorkspaceStore (REPRESENTATION_LOCKS, conversionsByColumn,
   * hasGrouped/hasUngrouped). Meeting 1's 347 (requiresUngrouping) reads it
   * too: hasUngrouped.
   */
  conversionDone?: boolean;
  /** The column of the next conversion (REPRESENTATION_LOCKS: the receiving column of a break, the source column of a grouping), when known. */
  pendingConversion?: Place | null;
  /** The next conversion repeats one already done in the same column ("קבצו שוב", s7_g_t1). */
  conversionAgain?: boolean;
  /** The trigger that opened the card (socraticTriggerReason). */
  trigger?: StaticCardTrigger | null;
  /**
   * The column the card is about: the streak's column for
   * 'consecutive_errors_4' (socraticCardPlace), the column of the wrong digit
   * for 'conversion_not_performed', otherwise the focused box.
   */
  focusColumn?: Place | null;
  /** The result row as typed, per column (answerDigits; stations 3 and 7: the single box, right-aligned). */
  answerDigits?: Partial<Record<Place, string>>;
  /** The memory circles as typed (carryDigits): "1" above a column that received a carry, the new count above a column changed by a decomposition. */
  memoryCircles?: Partial<Record<Place, string>>;
  /** A skeleton's hidden digits as typed (operandDigits). */
  operandDigits?: { a?: Partial<Record<Place, string>>; b?: Partial<Record<Place, string>> };
  /** Columns whose conversion the blocks performed (conversionsByColumn: the source column of a grouping in addition, the receiving column of a decomposition in subtraction). */
  conversionsDone?: readonly Place[];
  /** Stations 3–7: the number house is hidden by the top-bar button (boardOpen is false). */
  boardHidden?: boolean;
  /**
   * Subtraction: taking away has started — a block left the board after it
   * held the first number in this exercise, and no clear to 0 since (the
   * store's takeAwayTrack; useWorkspaceStore.nextTakeAwayTrack). Elsewhere: a
   * block went to the trash (hasDeletedBlock).
   */
  blocksRemoved?: boolean;
  /**
   * An exercise that opens with the blocks to group (initialCounts: 2,730):
   * the board is the opening board, or the opening board with exactly the
   * groupings recorded so far — the final board included
   * (useWorkspaceStore.givenBoardOnTheWay). False: the given blocks changed.
   */
  givenOnTheWay?: boolean;
  /** Such an exercise: the oldest frame of the undo stack is the opening board, so undoing every step leads back to it. */
  undoReachesStart?: boolean;
}

const shownIn = (ctx: StaticCardContext, kind: StaticCardKind) => (ctx.shownKinds ?? []).includes(kind);

/**
 * The situation family of a card (coordinator's decision, 2.10.2026): its
 * levels are one card going one step further. With the trigger and the
 * column, the family is the card's identity in the store's "the same card
 * does not come back" rule (useWorkspaceStore.socraticCardRefusal).
 */
export function cardFamilyOf(card: Pick<SocraticHintResponse, 'cardKind' | 'situation' | 'questionHe' | 'family'>): string {
  if (card.family) return card.family;
  if (card.cardKind) return CARD_FAMILY[card.cardKind];
  return card.situation ?? card.questionHe;
}

/** The card, in the situation family `family` (its levels share it). */
export const inFamily = (c: SocraticHintResponse, family: string): SocraticHintResponse => ({ ...c, family });

/** The card, recorded as `kind` once shown — the step it is in its family. */
export const withKind = (c: SocraticHintResponse, kind: StaticCardKind): SocraticHintResponse => ({ ...c, cardKind: kind });

/**
 * The levels of one situation family (owner, 1.10.2026: "כולל רמה שנייה
 * למשפחות שחוזרות על עצמן"): the first level whose kind was not shown yet in
 * the exercise; after the last one, the last one again — the store opens the
 * identical card twice at most (socraticCardRefusal). Every level carries its
 * kind and the family.
 */
export function ladder(ctx: StaticCardContext, family: string, levels: [StaticCardKind, () => SocraticHintResponse][]): SocraticHintResponse {
  const next = levels.find(([k]) => !shownIn(ctx, k)) ?? levels[levels.length - 1];
  return inFamily(withKind(next[1](), next[0]), family);
}

/** The frame the engine writes inside (owner, 1.10.2026): the situation, the card's level, and what the child should notice. */
export interface CardFrame {
  situation: string;
  frameLevel: 1 | 2 | 3;
  intentHe: string;
}
const frame = (situation: string, frameLevel: 1 | 2 | 3, intentHe: string): CardFrame => ({ situation, frameLevel, intentHe });

/** A card with its frame (and kind), whatever built it. */
export function framed(c: SocraticHintResponse, f: CardFrame, cardKind?: StaticCardKind): SocraticHintResponse {
  return { ...c, situation: f.situation, frameLevel: f.frameLevel, intentHe: f.intentHe, ...(cardKind ? { cardKind } : {}) };
}

function card(
  questionHe: string,
  intent: 'procedural' | 'conceptual',
  highlight: string,
  choices: [string, string][],
  cardKind?: StaticCardKind,
  f?: CardFrame,
): SocraticHintResponse {
  return {
    pedagogical_intent: intent,
    error_category: intent,
    tts_text: questionHe,
    suggested_highlight: highlight,
    questionHe,
    choices: choices.map(([textHe, feedbackHe], i) => ({ id: `opt_${i + 1}`, textHe, feedbackHe, isCorrect: i === 0 })),
    correctChoiceId: 'opt_1',
    ...(cardKind ? { cardKind } : {}),
    ...(f ? { situation: f.situation, frameLevel: f.frameLevel, intentHe: f.intentHe } : {}),
  };
}

const HL = (p: Place) => `tour-column-${p}`;

/**
 * Wrong-option hints of stations 3–8 (owner, 30.9.2026): a short guiding
 * question — never an explanation, never the answer. One wording per idea,
 * shared with the live cards (SocraticEngine.ts). The ones that name blocks
 * are for stations with blocks on the screen only.
 */
export const HINT = {
  addBlocks: 'רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?',
  deleteBlocks: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?',
  oneDigitPerBox: 'רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?',
  topOrBottom: 'רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?',
  startAdd: 'רמז: אם בטור היחידות יהיו 10 יחידות או יותר, מה יקרה בטור העשרות?',
  startSub: 'רמז: אם בטור היחידות לא יהיו מספיק יחידות כדי לחסר, מה יקרה בטור העשרות?',
  addOrTakeOut: 'רמז: האם בחיסור מוסיפים לבנים לבית המספרים או מוציאים ממנו?',
  secondNumber: 'רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו?',
  // 1.10.2026, in the same style.
  addBlock: 'רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?',
  deleteBlock: 'רמז: אם תמחקו לבנה, האם המספר יישאר אותו מספר?',
  emptyColumnBox: 'רמז: מה כותבים בתיבה של טור שאין בו אף לבנה?',
} as const;

/** "רמז: 10 לבני יחידה שוות לאיזו לבנה?" — for 10 or more blocks left in one column. */
export const tenBlocksHint = (p: Place) => `רמז: 10 ${BLOCKS[p]} שוות לאיזו לבנה?`;

/** "רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?" */
const sameWorthHint = (p: Place, q: Place) => `רמז: האם ${BLOCK[p]} ו${BLOCK[q]} שוות אותו דבר?`;

/**
 * Owner, 30.9.2026: every wrong-option hint of stations 3–8 opens with "רמז:"
 * and is a guiding question. Checked on every static card of those stations
 * (SocraticEngine.enforceIronRule).
 */
export function wrongHintViolation(card: Pick<SocraticHintResponse, 'choices' | 'correctChoiceId'>): string | null {
  for (const c of card.choices) {
    const correct = c.isCorrect ?? (card.correctChoiceId ? c.id === card.correctChoiceId : false);
    if (correct) continue;
    const hint = (c.feedbackHe ?? '').trim();
    if (!hint.startsWith('רמז:') || !hint.endsWith('?')) return `wrong-option hint is not a guiding question: ${c.id}`;
  }
  return null;
}

export type BoardCounts = Record<Place, number>;
const boardValue = (c: BoardCounts) => LOW_TO_HIGH.reduce((sum, p) => sum + (c[p] ?? 0) * DIVISOR[p], 0);

// ─────────────────────────────────────────────────────────────
// What the exercise and the child's work say (1.10.2026). Every reading
// below falls back to the board alone when the store gives no context.
// ─────────────────────────────────────────────────────────────

/** The digit typed in column p of the result row, or null. */
function typedDigit(ctx: StaticCardContext, p: Place): number | null {
  const v = ctx.answerDigits?.[p];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
}

/** The number in the single answer box (stations 3 and 7), or null. */
function typedNumber(ctx: StaticCardContext): number | null {
  const d = ctx.answerDigits;
  if (!d) return null;
  const s = [...LOW_TO_HIGH].reverse().map((p) => d[p] ?? '').join('');
  return /^\d+$/.test(s) ? Number(s) : null;
}

/** A trigger that belongs to one column: four wrong digits there, or a wrong digit before its conversion. */
const columnTrigger = (ctx: StaticCardContext) =>
  ctx.trigger === 'consecutive_errors_4' || ctx.trigger === 'conversion_not_performed';

/**
 * The column a vertical exercise's card is about (owner, 1.10.2026: never a
 * finished step). The trigger's column, or the focused box while its digit is
 * not yet right; otherwise the first column, from the units, whose result
 * digit is not yet right. Null when nothing is known: the card then reads the
 * exercise and the board, as before.
 */
function focusColumnOf(ctx: StaticCardContext, result: number): Place | null {
  const cols = places(result);
  const solved = (p: Place) => typedDigit(ctx, p) === digit(result, p);
  const f = ctx.focusColumn;
  if (f && cols.includes(f) && (columnTrigger(ctx) || !ctx.answerDigits || !solved(f))) return f;
  if (ctx.answerDigits) return cols.find((p) => !solved(p)) ?? null;
  return null;
}

/** The carry that a + b brings into column p from the column on its right (0 or 1). */
function carryInto(a: number, b: number, p: Place): number {
  let carry = 0;
  for (const q of LOW_TO_HIGH) {
    if (q === p) return carry;
    carry = digit(a, q) + digit(b, q) + carry >= 10 ? 1 : 0;
  }
  return 0;
}

/** a − b: column p gave a block to the column on its right. */
function gaveRight(a: number, b: number, p: Place): boolean {
  const q = prevPlace(p);
  return q !== null && borrowColumns(a, b).includes(q);
}

/** a − b: what column p holds after its decompositions — what its memory circle shows. */
function afterBorrow(a: number, b: number, p: Place): number {
  return digit(a, p) - (gaveRight(a, b, p) ? 1 : 0) + (borrowColumns(a, b).includes(p) ? 10 : 0);
}

/** Blocks on the board, whatever their worth. */
const blockCount = (c: Counts | BoardCounts) => LOW_TO_HIGH.reduce((s, p) => s + (c[p] ?? 0), 0);

// ─────────────────────────────────────────────────────────────
// Vertical addition
// ─────────────────────────────────────────────────────────────

/** All the blocks of both numbers are there and grouped (existing card; one box variant of 1.10.2026). */
function allInCard(ex: string, oneBox: boolean): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, כל הלבנים כבר בבית המספרים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
    oneBox
      ? ['כותבים בתיבה הריקה את מספר הלבנים שבטור שלה', 'נכון מאוד! ספרו את הלבנים בטור של התיבה הריקה.']
      : ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
    ['מוסיפים עוד לבנים', 'רמז: האם כבר בניתם בבית המספרים את שני המספרים?'],
    ['מקבצים את היחידות לעשרת אחת', 'רמז: האם יש בטור היחידות 10 לבנים או יותר?'],
  ], 'all_blocks_in', frame('all_blocks_in', 1, 'כל הלבנים בבית המספרים ומקובצות: כותבים בכל תיבה את מספר הלבנים שבטור שלה'));
}

// ─────────────────────────────────────────────────────────────
// The next level of a situation family (2.10.2026, audit D5; owner, 1.10.2026:
// "כולל רמה שנייה למשפחות שחוזרות על עצמן"). The owner's frame: level 1
// names no column and no action, level 2 names the column, level 3 the
// action on the screen. A second card in the same situation goes one step
// further — it is never the first card again. Meeting 1 names no column
// where the difficulty is and no count (owner, 29.9.2026); stations 3–7
// never state a column's block count (30.9.2026); meeting 8 names no block,
// board, trash or grouping button.
// ─────────────────────────────────────────────────────────────

/** How a number is built on the board: blocks from the tool box, each digit in its column (frame 3). */
export function buildNumberCard(n: number, next: 'sub' | 'add' | 'another_way' | 'steps'): SocraticHintResponse {
  const N = formatNumberHe(n);
  const done = next === 'sub'
    ? 'נכון מאוד! אחר כך הוציאו ממנו לפח האשפה את המספר השני.'
    : next === 'add'
      ? 'נכון מאוד! אחר כך בדקו שבבית המספרים בנויים שני המספרים.'
      : next === 'steps'
        ? 'נכון מאוד! אחר כך עשו את הפעולות שבהנחיה, לפי הסדר.'
        : 'נכון מאוד! אחר כך מצאו דרך נוספת לבנות אותו.';
  // A number that reads the same both ways (55, 303): "in reverse order" would be right.
  const digits = String(Math.abs(n));
  const reversed = [...digits].reverse().join('') === digits;
  return card(`${OPEN}איך בונים את ${N} בבית המספרים?`, 'procedural', 'tour-palette', [
    [`גוררים מארגז הכלים לכל טור לבנים לפי הספרה של ${N} באותו טור`, done],
    next === 'another_way' || next === 'steps'
      ? [`כותבים את ${N} בשורת התוצאה`, 'רמז: האם ההנחיה מבקשת קודם לכתוב, או לבנות?']
      : [`כותבים את ${N} בשורת התוצאה`, 'רמז: מה כותבים בשורת התוצאה: את אחד המספרים, או את התוצאה?'],
    reversed
      ? ['בונים את כל הלבנים בטור אחד', 'רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?']
      : [`בונים את הספרות של ${N} בסדר הפוך`, 'רמז: באיזה טור בונים את הספרה הימנית של מספר?'],
  ], 'build_number', frame('build_number', 3, `בונים את ${N}: גוררים מארגז הכלים לכל טור לבנים לפי הספרה שלו`));
}

/** A representation on an empty board, the second card: how blocks get onto the board (frame 3). */
function buildHowCard(): SocraticHintResponse {
  return card(`${OPEN}איך בונים בבית המספרים את מה שההנחיה מבקשת?`, 'procedural', 'tour-palette', [
    ['גוררים לבנים מארגז הכלים אל הטורים של בית המספרים', 'נכון מאוד! קראו שוב את ההנחיה, ובנו את מה שהיא מבקשת.'],
    ['כותבים את התשובה בשורת התוצאה', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?'],
    ['לוחצים על פח האשפה', 'רמז: מה עושה פח האשפה: מוסיף לבנים או מוציא אותן?'],
  ], 'build_first_how', frame('build_first_how', 3, 'בונים: גוררים לבנים מארגז הכלים אל הטורים, כמו שההנחיה מבקשת'));
}

/** Meeting 1's 26 changed — blocks deleted or added (audit D8): the number changed with them (frame 1). */
function sameNumberCard(): SocraticHintResponse {
  return card(`${OPEN}האם בבית המספרים יש עכשיו אותו מספר כמו בתחילת התרגיל?`, 'conceptual', 'tour-place-value-board', [
    ['לא. לבנים יצאו מבית המספרים או נוספו אליו', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים יחזרו להיות כמו בהתחלה.'],
    ['כן, כי בכל טור יש עכשיו פחות מ-10 לבנים', 'רמז: האם הוצאתם או הוספתם לבנים מאז ההתחלה?'],
    ['כן, כי עדיין יש לבנים בבית המספרים', 'רמז: האם יש בבית המספרים אותן לבנים שהיו בתחילת התרגיל?'],
  ], 'same_number', frame('same_number_check', 1, 'הלבנים שהתרגיל נתן השתנו, ולכן גם המספר: מחזירים אותן בכפתור ביטול הפעולה'));
}

/** Meeting 1, the second card about the result row: each box against its column (frame 1). */
function writeBoxesCheckCard(): SocraticHintResponse {
  return card(`${OPEN}איך בודקים שכל ספרה כתובה בתיבה הנכונה?`, 'procedural', 'tour-place-value-board', [
    ['משווים את הספרה שבכל תיבה למספר הלבנים שבטור שלה', 'נכון מאוד! בדקו את התיבות טור אחר טור, ותקנו כל תיבה שאינה מתאימה לטור שלה.'],
    ['בודקים רק את התיבה הראשונה', 'רמז: האם טעות יכולה להיות גם בתיבה אחרת?'],
    ['כותבים את הספרות בתיבות הראשונות משמאל', 'רמז: לאיזה טור שייכת כל תיבה?'],
  ], 'write_boxes_check', frame('check_result_boxes', 1, 'בכל תיבה בשורת התוצאה: מספר הלבנים שבטור שלה'));
}

/** A number built with its digits in the wrong columns (meeting 1's 713 + 94 with 16 hundreds; a wrong board): no column named (frame 1). */
export function digitsInColumnsCard(): SocraticHintResponse {
  return card(`${OPEN}באיזה טור בונים כל ספרה של מספר?`, 'conceptual', 'tour-place-value-board', [
    ['את הספרה הימנית בונים בטור הימני, וכל ספרה שמשמאלה בטור שמשמאלו', 'נכון מאוד! הוציאו לפח האשפה את הלבנים שבטור הלא נכון, ובנו כל ספרה בטור שלה.'],
    ['כל ספרה בטור הפנוי הראשון', 'רמז: באיזה טור בונים את הספרה הימנית של מספר?'],
    ['כל הספרות באותו טור', 'רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?'],
  ], 'digits_in_columns', frame('digits_in_columns', 1, 'כל ספרה של המספר בטור שלה, מהספרה הימנית שמאלה'));
}

/** More blocks than the instruction asks for, the second card: which are extra (frame 1). */
function strayWhichCard(): SocraticHintResponse {
  return card(`${OPEN}אילו לבנים מיותרות בבית המספרים?`, 'procedural', 'tour-place-value-board', [
    ['לבנים שההנחיה לא מבקשת', 'נכון מאוד! בדקו כל טור לפי ההנחיה, והוציאו לפח האשפה את מה שמיותר.'],
    ['אין כאלה. כל לבנה שבניתם שייכת למספר', 'רמז: האם בית המספרים מראה את המספר שההנחיה מבקשת?'],
    ['הלבנים שבניתם ראשונות', 'רמז: האם הסדר שבו בונים קובע אילו לבנים מיותרות?'],
  ], 'stray_which', frame('stray_which', 1, 'מיותרות הן הלבנים שההנחיה לא מבקשת: בודקים כל טור לפי ההנחיה'));
}

/** A block broken that the instruction does not ask to break, the second card: which blocks it asks to break (frame 1). */
function extraBreakWhichCard(): SocraticHintResponse {
  return card(`${OPEN}אילו לבנים ההנחיה מבקשת לפרוט?`, 'procedural', 'tour-task-card', [
    ['רק את הלבנים שכתובות בהנחיה אחרי המילה "פרטו"', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהפריטה המיותרת תתבטל.'],
    ['כל לבנה שאפשר ללחוץ עליה', 'רמז: מה כתוב בהנחיה אחרי המילה "פרטו"?'],
    ['לבנה אחת מכל טור', 'רמז: האם ההנחיה מבקשת לפרוט לבנה בכל טור?'],
  ], 'extra_break_which', frame('extra_break_which', 1, 'פורטים רק את הלבנים שההנחיה מבקשת, ומבטלים כל פריטה אחרת'));
}

/** Subtraction with blocks, every column has enough: how the number subtracted leaves the board (frame 3). */
function takeAwayHowCard(b: number): SocraticHintResponse {
  const B = formatNumberHe(b);
  return card(`${OPEN}איך מוציאים מבית המספרים את ${B}?`, 'procedural', 'tour-place-value-board', [
    // "כמה לבנים שהספרה מראה" was loose; "בדיוק לפי הספרה" (final review, 2.10.2026).
    [`מכל טור גוררים לפח האשפה לבנים בדיוק לפי הספרה של ${B} באותו טור`, 'נכון מאוד! התחילו בטור היחידות.'],
    ['לוחצים על פח האשפה', 'רמז: מה קורה לכל הלבנים כשלוחצים על פח האשפה?'],
    ['לוחצים על כל לבנה שמוציאים', 'רמז: מה קורה ללבנה כשלוחצים עליה?'],
  ], 'take_away_how', frame('take_away_how', 3, `מוציאים את ${B}: מכל טור גוררים לפח האשפה לבנים בדיוק לפי הספרה של ${B} באותו טור`));
}

/** Subtraction with blocks, taking away under way: how much is still to go (frame 1). */
function takeAwayProgressCard(b: number): SocraticHintResponse {
  const B = formatNumberHe(b);
  return card(`${OPEN}איך יודעים כמה עוד צריך להוציא?`, 'procedural', 'tour-place-value-board', [
    [`בודקים בכל טור כמה לבנים כבר יצאו ממנו, ומשווים לספרה של ${B} באותו טור`, 'נכון מאוד! בכל טור, הוציאו רק את מה שעוד צריך להוציא.'],
    ['מוציאים לבנים עד שהטור מתרוקן', 'רמז: כמה לבנים צריך להוציא מכל טור?'],
    ['סופרים כמה לבנים נשארו בבית המספרים', 'רמז: איך תדעו כמה הוצאתם מכל טור?'],
  // The intent goes to the engine: "כמה כבר הוצא" read as a singular imperative there (final review, 2.10.2026).
  ], 'take_away_progress', frame('take_away_progress', 1, `בודקים בכל טור כמה לבנים כבר יצאו ממנו, ומשווים לספרה של ${B} באותו טור`));
}

/** Stations 5–6, too much taken from a column, the second card: that column (frame 2). */
function tookTooManyColumnCard(ex: string, b: number, c: Place): SocraticHintResponse {
  const B = formatNumberHe(b);
  return card(`${OPEN}בתרגיל ${ex}, מה קובע כמה לבנים מוציאים מ${COLUMN[c]}?`, 'procedural', HL(c), [
    [`ספרת ה${PLURAL[c]} של ${B}`, 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים שהוצאתם בטעות יחזרו.'],
    ['כמה לבנים יש בטור', 'רמז: האם מחסרים את כל מה שיש בטור?'],
    ['כמה שנוח, העיקר שיישאר מעט', 'רמז: איזה מספר מחסרים בתרגיל?'],
  ], 'took_too_many_next', frame('took_too_many_column', 2, `מ${COLUMN[c]} מוציאים לבנים בדיוק לפי הספרה של ${B} בטור הזה`));
}

/** Meeting 1, too much taken away, the second card: the undo button — no column named (frame 3). */
function undoTakenCard(b: number): SocraticHintResponse {
  const B = formatNumberHe(b);
  return card(`${OPEN}הוצאתם יותר מדי לבנים. איך מחזירים אותן?`, 'procedural', 'tour-action-buttons', [
    ['לוחצים על כפתור ביטול הפעולה ↺ עד שהלבנים חוזרות', `נכון מאוד! אחר כך בדקו שמכל טור הוצאתם לבנים בדיוק לפי הספרה של ${B} באותו טור.`],
    ['מוציאים עוד לבנים', 'רמז: אם תוציאו עוד, יהיו בבית המספרים יותר לבנים או פחות?'],
    ['כותבים את מה שנשאר בבית המספרים', `רמז: האם הוצאתם בדיוק את ${B}?`],
  ], 'took_too_many_next', frame('took_too_many_undo', 3, 'מחזירים את מה שהוצא בטעות בכפתור ביטול הפעולה, ובודקים כל טור'));
}

/** Subtraction, more than the first number on the board, the second card: back to the first number alone (frame 3). */
function undoToFirstCard(ex: string, a: number, b: number): SocraticHintResponse {
  const A = formatNumberHe(a);
  const B = formatNumberHe(b);
  // Not "undo until only 53 is left": blocks built before 53 was complete never leave by undo alone (final review, 2.10.2026).
  return card(`${OPEN}בתרגיל ${ex}, איך משאירים בבית המספרים רק את ${A}?`, 'procedural', 'tour-place-value-board', [
    [`בודקים כל טור לפי הספרה של ${A}, ומוציאים לפח האשפה את הלבנים המיותרות`, `נכון מאוד! אחר כך הוציאו את ${B} לפח האשפה.`],
    ['מוציאים לפח האשפה את כל הלבנים', `רמז: האם ${A} צריך להישאר בבית המספרים?`],
    ['כותבים את המספר שבבית המספרים', `רמז: האם בבית המספרים יש רק ${A}?`],
  ], 'build_only_first_undo', frame('build_only_first_undo', 3, `בחיסור בונים רק את ${A}: בודקים כל טור לפי הספרה של ${A}, ומוציאים לפח האשפה את הלבנים המיותרות`));
}

/** What goes in the box of column c, when the board shows the result (frame 2): after grouping, or after taking away. */
function writeColumnCard(ex: string, c: Place, sub: boolean): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, מה כותבים בתיבה של ${COLUMN[c]}?`, 'procedural', HL(c), [
    [sub ? `את מספר הלבנים שנשארו ב${COLUMN[c]}` : `את מספר הלבנים שב${COLUMN[c]}`, 'נכון מאוד! ספרו את הלבנים שבטור, וכתבו את מספרן בתיבה.'],
    sub
      ? ['את מספר הלבנים שהוצאתם מהטור', 'רמז: האם כותבים את מה שהוצאתם, או את מה שנשאר?']
      : ['את הספרה הגדולה מבין שתי הספרות של הטור', 'רמז: האם בחיבור כותבים את הספרה הגדולה?'],
    ['את הספרה של המספר הראשון בטור הזה', 'רמז: מה כותבים בשורת התוצאה: את אחד המספרים, או את התוצאה?'],
  ], 'write_column', frame('write_column', 2, `בתיבה של ${COLUMN[c]} כותבים את מספר הלבנים שבטור`));
}

/** A break the instruction asks for, the second card: what the click gives (frame 2). */
function breakResultCard(from: Place, into: Place): SocraticHintResponse {
  return card(`${OPEN}מה מופיע בבית המספרים כשלוחצים על ${BLOCK[from]}?`, 'conceptual', HL(from), [
    [`עשר ${BLOCKS[into]} במקום ${BLOCK_THE[from]}`, `נכון מאוד! לחצו עכשיו על ${BLOCK[from]} אחת.`],
    [`${BLOCK_THE[from]} נעלמת, ולא מופיע דבר`, 'רמז: כשפורטים לבנה, האם הערך שלה הולך לאיבוד?'],
    [`מופיעה עוד ${BLOCK[from]}`, `רמז: לאילו לבנים קטנות יותר פורטים ${BLOCK[from]}?`],
  ], 'break_result', frame('break_result', 2, `לחיצה על ${BLOCK[from]} פורטת אותה לעשר ${BLOCKS[into]}`));
}

/** A grouping the instruction asks for, the second card: what the button gives (frame 2). */
function groupResultCard(from: Place, to: Place): SocraticHintResponse {
  return card(`${OPEN}מה מופיע בבית המספרים כשלוחצים על הכפתור "קבצו 10" שבראש ${COLUMN[from]}?`, 'conceptual', HL(from), [
    [`${BLOCK[to]} אחת במקום 10 ${BLOCKS[from]}`, `נכון מאוד! לחצו עכשיו על הכפתור "קבצו 10" שבראש ${COLUMN[from]}.`],
    [`10 ${BLOCKS[from]} נעלמות, ולא מופיע דבר`, 'רמז: כשמקבצים, האם הערך של הלבנים הולך לאיבוד?'],
    [`מופיעות עוד 10 ${BLOCKS[from]}`, `רמז: לאיזו לבנה מקבצים 10 ${BLOCKS[from]}?`],
  ], 'group_result', frame('group_result', 2, `הכפתור "קבצו 10" מקבץ 10 ${BLOCKS[from]} ל${BLOCK[to]} אחת`));
}

/**
 * How many conversions a station-3/7 exercise asks for, from its numbers: the
 * number written and the board it ends with (requiredCounts) — not from the
 * instruction's words, which a published catalog may phrase otherwise.
 *  - breaks, from the top column down: what the usual board of the number
 *    held, plus the ten that came from a break above, less what is left
 *    (5,230 → 4, 11, 13: one thousand broken, then one hundred);
 *  - groupings: the blocks of the highest column of the final board, as
 *    composeGroupCard counts them (2,500 from 25 hundreds: two thousands).
 */
export function conversionCountOf(brk: boolean, task: any): number {
  const n = numberWritten(task);
  if (typeof n !== 'number') return 1;
  const after: Counts = task?.requiredCounts ?? standardCounts(n);
  if (!brk) {
    const made = [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) > 0);
    return Math.max(1, made ? after[made] ?? 1 : 1);
  }
  const before = standardCounts(n);
  let total = 0;
  let fromAbove = 0;
  for (const p of [...LOW_TO_HIGH].reverse()) {
    const broken = Math.max(0, (before[p] ?? 0) + 10 * fromAbove - (after[p] ?? 0));
    total += broken;
    fromAbove = broken;
  }
  return Math.max(1, total);
}

/**
 * The conversion a station-3/7 card names, as the exercise's instruction does:
 * "הפריטה" / "ההקבצה" for one, "הפריטות" / "ההקבצות" when it asks for
 * two or more (owner, 4.10.2026: s3_g_t4 and s7_g_t1, as מסמך 03).
 */
export function conversionNounHe(brk: boolean, task: any): string {
  const many = conversionCountOf(brk, task) > 1;
  if (brk) return many ? 'הפריטות' : 'הפריטה';
  return many ? 'ההקבצות' : 'ההקבצה';
}

/** A break or grouping to do yourselves, the second card: which blocks come before it (frame 1). */
function blocksBeforeConvertCard(kind: 'compose_break' | 'compose_group', task?: any): SocraticHintResponse {
  const brk = kind === 'compose_break';
  const verb = brk ? 'פרטו' : 'קבצו';
  // Plural when the exercise converts twice, as its instruction does (owner, 4.10.2026).
  const noun = conversionNounHe(brk, task);
  return card(`${OPEN}אילו לבנים ההנחיה מבקשת לבנות לפני ${noun}?`, 'procedural', 'tour-task-card', [
    [`את הלבנים שכתובות בהנחיה לפני המילה "${verb}"`, `נכון מאוד! בנו בדיוק אותן, ורק אחר כך ${verb} בעצמכם.`],
    [`את הלבנים שיהיו בבית המספרים אחרי ${noun}`, 'רמז: מה ההנחיה מבקשת שתעשו בעצמכם?'],
    // The grouping card's wrong idea: build only the 10 blocks the instruction
    // groups. Wrong in every grouping exercise: s7_g_t1 builds 25 hundreds,
    // s7_r_t1 12 tens and 5 units, s7_g_reinforce_2 14 hundreds and 3 tens
    // (review, 2.10.2026; "the number the usual way" is option 2's board).
    brk ? ['רק את הלבנה שפורטים', 'רמז: האם ההנחיה מבקשת לבנות רק לבנה אחת?'] : ['רק את 10 הלבנים שמקבצים', 'רמז: האם ההנחיה מבקשת לבנות רק 10 לבנים?'],
  ], 'blocks_before_convert', frame('blocks_before_convert', 1, `בונים קודם את הלבנים שכתובות בהנחיה, ורק אחר כך ${brk ? 'פורטים' : 'מקבצים'} בעצמכם`));
}

/** Station 3, a number said in words built otherwise (audit D10): compare the board with the words (frame 1). */
function compareWordsCard(): SocraticHintResponse {
  return card(`${OPEN}איך בודקים שבית המספרים מראה את המספר שבהנחיה?`, 'conceptual', 'tour-place-value-board', [
    ['משווים כל טור למילים של המספר שבהנחיה', 'נכון מאוד! תקנו כל טור שאינו מתאים למילים. אחר כך כתבו את המספר.'],
    ['סופרים את הלבנים וכותבים את המספר שהן מראות', 'רמז: האם הלבנים מראות את המספר שבהנחיה?'],
    ['מוסיפים לבנים עד שהמספר נראה גדול מספיק', 'רמז: איך תדעו כמה לבנים צריך בכל טור?'],
  ], 'compare_words', frame('compare_with_instruction', 1, 'משווים את הלבנים שבכל טור למילים של המספר שבהנחיה'));
}

/** …the second card: the first column that does not match the words (frame 2). No count is stated. */
function compareWordsColumnCard(c: Place): SocraticHintResponse {
  return card(`${OPEN}האם ${COLUMN[c]} מתאים למילים של המספר?`, 'conceptual', HL(c), [
    [`לא. בודקים במילים מה ספרת ה${PLURAL[c]} של המספר, ומתקנים את הטור`, 'נכון מאוד! גררו לבנים לטור או הוציאו ממנו, עד שהוא יתאים למילים.'],
    ['כן, ולכן כותבים את המספר', `רמז: מה המילים של המספר אומרות על ספרת ה${PLURAL[c]}?`],
    ['לא משנה מה יש בטור הזה', 'רמז: האם גם הטור הזה הוא חלק מהמספר?'],
  ], 'compare_words_column', frame('compare_column_with_instruction', 2, `${COLUMN[c]} אינו מתאים למילים של המספר: בודקים במילים את ספרת ה${PLURAL[c]}`));
}

/** The choice tasks (s4_g_t7, s5_g_t7), the second card: where the change starts (frame 1). */
function smallChangeColumnCard(sub: boolean): SocraticHintResponse {
  return card(`${OPEN}באיזה טור מתחילים לבדוק מה השתנה?`, 'procedural', 'tour-task-card', [
    ['בטור שבו הספרה השתנתה, ואחר כך בטור שמשמאלו', sub ? 'נכון מאוד! פתרו את הטור הזה בתרגיל החדש, ובדקו אם הוא צריך פריטה.' : 'נכון מאוד! פתרו את הטור הזה בתרגיל החדש, ובדקו אם משהו עובר ממנו לטור שמשמאלו.'],
    ['בטור השמאלי ביותר', 'רמז: איזו ספרה השתנתה בתרגיל החדש?'],
    ['בכל הטורים יחד, בלי סדר', 'רמז: אם רק ספרה אחת השתנתה, באילו טורים התוצאה יכולה להשתנות?'],
  ], 'small_change_column', frame('small_change_column', 1, 'מתחילים בטור שבו הספרה השתנתה, ובודקים מה קורה בטור שמשמאלו'));
}

/** A forgotten carry, the second card: how the ten that came from the right is kept — the memory circle (frame 2). */
function carryCircleCard(ex: string, p: Place): SocraticHintResponse {
  const q = prevPlace(p)!;
  const it = MASC[p] ? 'אותו' : 'אותה';
  return card(`${OPEN}בתרגיל ${ex}, איך זוכרים ש${ONE[p]} ${passed(p)} מ${COLUMN[q]} ל${COLUMN[p]}?`, 'procedural', HL(p), [
    [`רושמים 1 בעיגול הזיכרון שמעל ${COLUMN[p]}`, `נכון מאוד! כשתחברו את הספרות של ${COLUMN[p]}, הוסיפו גם את ה-1 שבעיגול הזיכרון.`],
    ['זוכרים בראש, בלי לרשום', `רמז: איך תזכרו את ${THE_ONE[p]} ${MASC[p] ? 'הזה' : 'הזאת'} כשתגיעו ל${COLUMN[p]}?`],
    [`כותבים ${it} בתיבה של ${COLUMN[q]}`, `רמז: לאיזה טור ${passed(p)} ${THE_ONE[p]}?`],
  ], 'carry_circle', frame('carry_circle', 2, `${ONE[p]} שעוברת מ${COLUMN[q]} נרשמת כ-1 בעיגול הזיכרון שמעל ${COLUMN[p]}, ומחברים גם אותה`));
}

/** Addition with blocks, a column that needs no grouping, the second card: what its blocks show (frame 2). */
function columnCountCard(ex: string, p: Place): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, איך בודקים בבית המספרים מה כותבים בתיבה של ${COLUMN[p]}?`, 'procedural', HL(p), [
    [`בונים ב${COLUMN[p]} לבנים לפי הספרות של שני המספרים, וסופרים את כל הלבנים שבו`, 'נכון מאוד! כתבו בתיבה כמה לבנים יש בטור.'],
    ['סופרים רק את הלבנים של המספר הראשון', 'רמז: אילו מספרים מחברים בתרגיל הזה?'],
    ['סופרים את כל הלבנים שבבית המספרים', 'רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?'],
  ], 'column_count', frame('column_count', 2, `ב${COLUMN[p]} בונים לבנים לפי הספרות של שני המספרים וסופרים את הלבנים שבו`));
}

/** Meeting 1's 26, its result built by hand (2 tens and 6 units, nothing grouped), the second card: the grouping the instruction asks for (frame 3). */
function s1GroupYourselvesCard(): SocraticHintResponse {
  return card(`${OPEN}מה ההנחיה מבקשת לעשות עם לבני היחידה שהיו בטור בהתחלה?`, 'procedural', 'tour-task-card', [
    ['מקבצים אותן בכפתור "קבצו 10"', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שלבני היחידה יחזרו. אחר כך קבצו אותן בכפתור.'],
    ['בונים את התוצאה בעצמכם, בלי הכפתור', 'רמז: באיזה כפתור ההנחיה מבקשת לקבץ?'],
    ['כותבים את המספר בלי לקבץ', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?'],
  ], 'group_yourselves', frame('group_yourselves', 3, 'ההנחיה מבקשת לקבץ בעצמכם בכפתור "קבצו 10": מחזירים את לבני היחידה ומקבצים'));
}

/** A forgotten carry whose 1 is already in the memory circle, the second card: that 1 is added too (frame 2). */
function circleAddCard(ex: string, p: Place, a: number, b: number): SocraticHintResponse {
  // 5,678 + 2,453: the hundreds reach 11 and the tens 13 with the 1 — only the units digit goes in the box (final review, 2.10.2026).
  const n = next(p);
  const reaches10 = digit(a, p) + digit(b, p) + 1 >= 10;
  const right = reaches10
    ? `נכון מאוד! חברו את הספרות של הטור ואת ה-1 שבעיגול. אם הסכום מגיע ל-10 או יותר, כתבו בתיבה רק את ספרת היחידות שלו${n ? `, ורשמו 1 בעיגול הזיכרון שמעל ${COLUMN[n]}` : ''}.`
    : 'נכון מאוד! חברו את הספרות של הטור ואת ה-1 שבעיגול, וכתבו את התוצאה בתיבה.';
  return card(`${OPEN}בתרגיל ${ex}, רשמתם 1 בעיגול הזיכרון שמעל ${COLUMN[p]}. מה עושים איתו כשמחברים את הספרות של הטור הזה?`, 'procedural', HL(p), [
    ['מחברים אותו לספרות של הטור', right],
    ['לא מחברים אותו, כי הוא רק תזכורת', 'רמז: מה מייצג ה-1 שבעיגול הזיכרון?'],
    ['כותבים אותו בתיבה של הטור', 'רמז: מה מחברים בטור הזה חוץ מה-1 שבעיגול הזיכרון?'],
  ], 'carry_circle', frame('carry_circle_add', 2, `ה-1 שבעיגול הזיכרון שמעל ${COLUMN[p]} הוא ${ONE[p]} שעברה מהטור שמימין: מחברים גם אותו`));
}

/** Stations 3–7, the number house hidden by the top-bar button, the first card (frame 1); the second names the button (showBoardCard). */
export function boardHiddenCard(): SocraticHintResponse {
  return card(`${OPEN}בית המספרים מוסתר עכשיו. איך תעבדו בתרגיל עם הלבנים?`, 'procedural', 'tour-action-buttons', [
    ['מציגים שוב את בית המספרים, ועובדים בו', 'נכון מאוד! הכפתור שמציג אותו נמצא בסרגל העליון.'],
    ['מנחשים את התשובה בלי הלבנים', 'רמז: איך תבדקו את התשובה בלי לראות את הלבנים?'],
    ['מתחילים את התרגיל מההתחלה', 'רמז: האם הלבנים נמחקו, או שהן רק מוסתרות?'],
  ], 'board_hidden', frame('board_hidden', 1, 'בית המספרים מוסתר: מציגים אותו שוב ועובדים בלבנים'));
}

/** Nothing to convert, or nothing known yet (existing card). */
function addStartCard(ex: string, blocks: boolean): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחבר?`, 'procedural', HL('units'), [
    ['מטור היחידות, ואחר כך טור אחר טור שמאלה', blocks ? 'נכון מאוד! חברו את הלבנים בכל טור, והתחילו בטור היחידות.' : 'נכון מאוד! חברו את הספרות בכל טור, והתחילו בטור היחידות.'],
    ['מהטור השמאלי ביותר', HINT.startAdd],
    ['מחברים את כל הספרות יחד', 'רמז: האם מחברים יחידות עם עשרות?'],
  ], 'add_start', frame('add_start', 1, 'בחיבור במאונך מתחילים בטור היחידות וממשיכים טור אחר טור שמאלה'));
}

/** Column c of the exercise reaches 10 (existing card; the column is the one the child is at, 1.10.2026). */
function carryCard(ex: string, c: Place, n: Place, blocks: boolean): SocraticHintResponse {
  const it = MASC[n] ? 'אותו' : 'אותה';
  const question = `${OPEN}בתרגיל ${ex}, ב${COLUMN[c]} מצטברות 10 ${PLURAL[c]} או יותר. מה עושים איתן?`;
  const f = frame('carry_column', 2, `ב${COLUMN[c]} מצטברות 10 ${PLURAL[c]} או יותר: מקבצים אותן ל${ONE[n]} שעוברת ל${COLUMN[n]}`);
  if (blocks) {
    return card(question, 'procedural', HL(c), [
      [`מקבצים 10 ${PLURAL[c]} ל${ONE[n]} ומעבירים ${it} שמאלה ל${COLUMN[n]}`, `נכון מאוד! כשיש ב${COLUMN[c]} 10 לבנים או יותר, לחצו על הכפתור "קבצו 10" שבראש הטור.`],
      [`משאירים את כולן ב${COLUMN[c]}`, tenBlocksHint(c)],
      [`מוחקים את ה${PLURAL[c]} המיותרות`, HINT.deleteBlocks],
    ], 'carry', f);
  }
  return card(question, 'procedural', HL(c), [
    [`ממירים 10 ${PLURAL[c]} ל${ONE[n]}, ורושמים ${it} בעיגול הזיכרון שמעל ${COLUMN[n]}`, `נכון מאוד! רשמו 1 בעיגול הזיכרון שמעל ${COLUMN[n]}.`],
    [`כותבים את שתי הספרות בתיבת ה${PLURAL[c]}`, HINT.oneDigitPerBox],
    [`ממשיכים ל${COLUMN[n]} בלי לרשום דבר בעיגול הזיכרון`, `רמז: אם לא תרשמו דבר בעיגול הזיכרון, איך תזכרו לחבר עוד ${ONE[n]} ב${COLUMN[n]}?`],
  ], 'carry', f);
}

/**
 * What is added in column p — and, when a ten (hundred, thousand) came into
 * it from the right, that one too. Also the card of a forgotten carry: the
 * digit typed there is one less than the exercise's (1.10.2026).
 */
function addColumnCard(ex: string, p: Place, a: number, b: number, forgotten: boolean): SocraticHintResponse {
  const q = prevPlace(p);
  const cin = q !== null && carryInto(a, b, p) === 1;
  const reaches10 = digit(a, p) + digit(b, p) + (cin ? 1 : 0) >= 10;
  const done = reaches10
    ? 'נכון מאוד! אם הסכום מגיע ל-10 או יותר, כתבו בתיבה רק את ספרת היחידות שלו.'
    : `נכון מאוד! כתבו את הסכום בתיבה של ${COLUMN[p]}.`;
  // "Are tens added to units?" is true in another sense (40 + 5): the hint asks which digits the column holds (review, 1.10.2026).
  const which = `רמז: אילו ספרות כתובות ב${COLUMN[p]}?`;
  const choices: [string, string][] = cin
    ? [
        [`את שתי הספרות של הטור, ועוד ${THE_ONE[p]} ש${passed(p)} מ${COLUMN[q!]}`, done],
        ['רק את שתי הספרות של הטור', `רמז: מה עבר ל${COLUMN[p]} מ${COLUMN[q!]}?`],
        ['את כל הספרות של התרגיל', which],
      ]
    : [
        ['את שתי הספרות של הטור', done],
        ['את שתי הספרות של הטור, ועוד 1', q ? `רמז: האם עבר משהו ל${COLUMN[p]} מ${COLUMN[q]}?` : 'רמז: האם יש טור מימין לטור היחידות?'],
        ['את כל הספרות של התרגיל', which],
      ];
  return card(`${OPEN}בתרגיל ${ex}, מה מחברים ב${COLUMN[p]}?`, 'procedural', HL(p), choices, forgotten ? 'carry_forgotten' : 'add_column',
    forgotten
      ? frame('carry_forgotten', 2, `ל${COLUMN[p]} ${passed(p)} ${ONE[p]} מהטור שמימין, וגם ${MASC[p] ? 'אותו' : 'אותה'} מחברים`)
      : frame('add_column', 2, 'בכל טור מחברים את שתי הספרות שלו, ועוד מה שעבר אליו מהטור שמימין'));
}

/** Blocks: column c is grouped; what is recorded in the memory circle above the next column. */
function carryRecordCard(c: Place, n: Place): SocraticHintResponse {
  return card(`${OPEN}קיבצתם 10 ${PLURAL[c]} ל${ONE[n]}. מה רושמים בעיגול הזיכרון שמעל ${COLUMN[n]}?`, 'procedural', HL(n), [
    // "the digits of the column": with blocks, the ten already stands in the column (review, 1.10.2026).
    [`1, כי ${ONE[n]} ${passed(n)} ל${COLUMN[n]}`, `נכון מאוד! כשתחברו את הספרות של ${COLUMN[n]}, הוסיפו גם את ה-1 שבעיגול הזיכרון.`],
    [`10, כי מקבצים 10 ${PLURAL[c]}`, `רמז: כמה ${BLOCKS[n]} עברו ל${COLUMN[n]}?`],
    ['לא רושמים כלום, כי הלבנים כבר בבית המספרים', `רמז: איך תזכרו לחבר את ${THE_ONE[n]} ש${passed(n)} ל${COLUMN[n]}?`],
  ], 'carry_2', frame('carry_record', 2, `אחרי ההקבצה רושמים 1 בעיגול הזיכרון שמעל ${COLUMN[n]}`));
}

/** Column c's conversion is done (grouped, or its 1 written); what goes in its box. */
function carryWrittenCard(ex: string, c: Place, n: Place, blocks: boolean, box: number, top: number): SocraticHintResponse {
  // "1, as in the memory circle" is the right digit where the column leaves 1 (5,678 + 2,453: 8 + 3 = 11): another wrong option there (review, 1.10.2026).
  const guess: [string, string] = ['מנחשים ספרה וכותבים אותה בתיבה', blocks ? 'רמז: איך אפשר לבדוק בבית המספרים אם הספרה נכונה?' : 'רמז: איך אפשר לבדוק בחישוב אם הספרה נכונה?'];
  const notOne: [string, string] = top !== box ? ['את הספרה העליונה של הטור', 'רמז: האם מחברים רק את הספרה העליונה?'] : guess;
  const f = frame('carry_column_write', 2, `ב${COLUMN[c]} כבר הומרו 10 ${PLURAL[c]}: בתיבה כותבים רק את מה שנשאר`);
  if (blocks) {
    return card(`${OPEN}בתרגיל ${ex}, כבר קיבצתם ב${COLUMN[c]}. מה כותבים בתיבה שלו?`, 'procedural', HL(c), [
      [`את מספר הלבנים שנשארו ב${COLUMN[c]}`, 'נכון מאוד! ספרו את הלבנים שבטור, וכתבו את מספרן בתיבה.'],
      ['את מספר הלבנים שהיו בטור לפני ההקבצה', HINT.oneDigitPerBox],
      box === 1 ? notOne : ['1, כמו בעיגול הזיכרון', 'רמז: לאיזה טור שייך ה-1 שבעיגול הזיכרון?'],
    ], 'carry_written', f);
  }
  return card(`${OPEN}בתרגיל ${ex}, כבר רשמתם 1 בעיגול הזיכרון שמעל ${COLUMN[n]}. מה כותבים בתיבה של ${COLUMN[c]}?`, 'procedural', HL(c), [
    ['רק את ספרת היחידות של הסכום', `נכון מאוד! ה-1 שבעיגול הזיכרון מייצג עשר ${PLURAL[c]}.`],
    ['את כל הסכום, בשתי ספרות', HINT.oneDigitPerBox],
    box === 1 ? notOne : ['את ה-1 שבעיגול הזיכרון', 'רמז: לאיזה טור שייך ה-1 שבעיגול הזיכרון?'],
  ], 'carry_written', f);
}

/** Addition, what is built: both numbers (a second card while building; a wrong board after two wrong answers). */
export function addBuildCard(ex: string, kind: StaticCardKind = 'build_both'): SocraticHintResponse {
  return card(`${OPEN}מה בונים בבית המספרים בתרגיל ${ex}?`, 'procedural', 'tour-place-value-board', [
    ['את שני המספרים, כל ספרה בטור שלה', 'נכון מאוד! בנו כל מספר, כל ספרה בטור שלה, ובדקו טור אחר טור.'],
    ['רק את המספר הראשון', 'רמז: אילו מספרים מחברים בתרגיל הזה?'],
    ['רק את התוצאה', 'רמז: האם כבר יודעים מה התוצאה?'],
  ], kind, frame('build_both_numbers', 1, 'בחיבור בונים את שני המספרים, כל ספרה בטור שלה, ובודקים כל מספר'));
}

/** Addition, one of the two numbers is on the board and the other is not. */
function oneNumberMissingCard(ex: string, a: number, b: number, value: number): SocraticHintResponse {
  const missing = formatNumberHe(value === a ? b : a);
  const built = formatNumberHe(value === a ? a : b);
  return card(`${OPEN}בתרגיל ${ex}, איזה מספר עוד לא בבית המספרים?`, 'procedural', 'tour-place-value-board', [
    [`המספר ${missing}`, `נכון מאוד! בנו את ${missing}, כל ספרה בטור שלה.`],
    [`המספר ${built}`, 'רמז: אילו לבנים כבר בניתם?'],
    ['שני המספרים כבר שם', 'רמז: איזה מספר מראות הלבנים שבבית המספרים?'],
  ], 'one_number', frame('one_number_missing', 1, 'בבית המספרים בנוי רק אחד המספרים: בונים גם את השני'));
}

/**
 * Blocks (stations 1, 3–7), "10 or more — how do you group them?": the
 * button, by name. The second card of the "10 or more" family.
 */
export function groupActionCard(c: Place, vertical: boolean): SocraticHintResponse {
  const n = next(c)!;
  return card(`${OPEN}איך מקבצים 10 ${BLOCKS[c]} ל${BLOCK[n]} אחת?`, 'procedural', HL(c), [
    [`לוחצים על הכפתור "קבצו 10" שבראש ${COLUMN[c]}`, vertical ? `נכון מאוד! אחר כך רשמו 1 בעיגול הזיכרון שמעל ${COLUMN[n]}.` : 'נכון מאוד! אחר כך בדקו מה השתנה בבית המספרים.'],
    [`גוררים ${BLOCK[n]} חדשה מארגז הכלים`, HINT.addBlock],
    [`גוררים 10 ${BLOCKS[c]} לפח האשפה`, HINT.deleteBlocks],
  ], 'crowded_2', frame('group_action', 3, `מקבצים בכפתור "קבצו 10" שבראש ${COLUMN[c]}`));
}

/**
 * Vertical addition, both numbers on the screen (stations 4, 7 and 8).
 * Stage-aware (owner, 1.10.2026): the card speaks of the column the child is
 * at — the trigger's column, or the first column whose digit is not yet
 * right — and never of a conversion already done:
 *  - a digit one less than the exercise's where a carry comes in: the column card, carry included;
 *  - with blocks: all the blocks in and grouped → the result row; one number
 *    only → the other one; a second wrong answer on another board → build both;
 *  - a column that reaches 10: the carry card (first card), then its next
 *    step (building, the button, the memory circle);
 *  - a column whose conversion is done: what goes in its box;
 *  - any other column: what is added there.
 * Without the context the card is the one it was: the exercise's first
 * conversion column.
 */
function additionCard(a: number, b: number, blocks: boolean, counts: BoardCounts | undefined, ctx: StaticCardContext, oneBox = false, errorAnalysis = false): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} + ${formatNumberHe(b)}`;
  const result = a + b;
  const carries = carryColumns(a, b);
  const value = counts ? boardValue(counts) : 0;
  const f = focusColumnOf(ctx, result);
  // A carry forgotten in a column: the digit typed there is one less than the
  // exercise's (analysts' matrix 3–4; audit D12) — before the empty board: the
  // child is working that column's digits, with or without blocks.
  const forgot = (p: Place) => carryInto(a, b, p) === 1 && typedDigit(ctx, p) === (digit(result, p) + 9) % 10;
  const forgottenAt = f && forgot(f) ? f : !columnTrigger(ctx) ? places(result).find(forgot) ?? null : null;
  if (forgottenAt) {
    return ladder(ctx, 'carry_forgotten', [
      ['carry_forgotten', () => addColumnCard(ex, forgottenAt, a, b, true)],
      // The 1 already in the memory circle above the column: it is added too;
      // otherwise, how the ten that came is kept — the memory circle.
      ['carry_circle', () => (ctx.memoryCircles?.[forgottenAt] === '1' ? circleAddCard(ex, forgottenAt, a, b) : carryCircleCard(ex, forgottenAt))],
    ]);
  }
  // An empty board (analysts' matrix 4.2; audit D14): build first — the carry
  // card spoke of 10 blocks in a column that holds none. The second card: what
  // is built. Not while the child works a column's digits (a trigger of one
  // column, or digits typed): that column's card comes first (audit D12).
  // Station 7's error analysis said "solve it with blocks" already (C6): what is built.
  const working = (columnTrigger(ctx) && f !== null) || Object.values(ctx.answerDigits ?? {}).some((d) => d !== undefined && d !== '');
  // On an empty board no card speaks of blocks or the "קבצו 10" button (final
  // review, 2.10.2026: s4_r_t2 with "2" typed got "…לחצו על הכפתור 'קבצו 10'"
  // and no block on the board): the child working a column gets what is added
  // there, worded without blocks; otherwise build first.
  if (blocks && counts && value === 0) {
    if (working && f) return ladder(ctx, 'column', [['add_column', () => addColumnCard(ex, f, a, b, false)], ['build_both', () => addBuildCard(ex)]]);
    if (errorAnalysis) return inFamily(addBuildCard(ex), 'build_first');
    return ladder(ctx, 'build_first', [['build_first', buildFirstCard], ['build_both', () => addBuildCard(ex)]]);
  }
  if (blocks && counts) {
    if (value === result && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) {
      const col = f ?? places(result).find((p) => typedDigit(ctx, p) !== digit(result, p)) ?? 'units';
      return ladder(ctx, 'write_result', [['all_blocks_in', () => allInCard(ex, oneBox)], ['write_column', () => writeColumnCard(ex, col, false)]]);
    }
    if (value > 0 && a !== b && (value === a || value === b)) {
      return ladder(ctx, 'one_number', [['one_number', () => oneNumberMissingCard(ex, a, b, value)], ['build_number', () => buildNumberCard(value === a ? b : a, 'add')]]);
    }
    // A second wrong answer on a board that is neither number nor the sum:
    // what is built, then each digit in its column.
    if (ctx.trigger === 'repeated_errors' && value > 0) {
      return ladder(ctx, 'wrong_board', [['build_both', () => addBuildCard(ex)], ['digits_in_columns', digitsInColumnsCard]]);
    }
  }
  const converted = (c: Place): boolean => {
    if (!blocks) return ctx.memoryCircles?.[next(c) ?? c] === '1';
    if (ctx.conversionsDone?.includes(c)) return true;
    return Boolean(counts) && value === result && (counts![c] ?? 0) < 10;
  };
  let c: Place | null;
  if (f) {
    if (!carries.includes(f)) {
      // With blocks, its second card: what the column's blocks show (2.10.2026).
      return blocks
        ? ladder(ctx, 'column', [['add_column', () => addColumnCard(ex, f, a, b, false)], ['column_count', () => columnCountCard(ex, f)]])
        : addColumnCard(ex, f, a, b, false);
    }
    if (converted(f) && next(f)) return carryWrittenCard(ex, f, next(f)!, blocks, digit(result, f), digit(a, f));
    c = f;
  } else {
    c = carries.find((x) => !converted(x)) ?? null;
  }
  const n = c ? next(c) : null;
  // A second card after the carry card, with blocks: a column grouped whose
  // 1 is not in its memory circle yet.
  if (blocks && shownIn(ctx, 'carry') && ctx.memoryCircles) {
    const unwritten = carries.find((x) => converted(x) && next(x) && ctx.memoryCircles?.[next(x)!] !== '1');
    if (unwritten && (!c || LOW_TO_HIGH.indexOf(unwritten) < LOW_TO_HIGH.indexOf(c))) return carryRecordCard(unwritten, next(unwritten)!);
  }
  if (!c || !n) {
    if (shownIn(ctx, 'add_start')) return blocks ? addBuildCard(ex) : addColumnCard(ex, f ?? 'units', a, b, false);
    return addStartCard(ex, blocks);
  }
  if (!shownIn(ctx, 'carry')) return carryCard(ex, c, n, blocks);
  if (blocks) {
    if ((counts?.[c] ?? 0) >= 10) return groupActionCard(c, true);
    return addBuildCard(ex, 'carry_2');
  }
  return carryCard(ex, c, n, blocks);
}

// ─────────────────────────────────────────────────────────────
// Vertical subtraction
// ─────────────────────────────────────────────────────────────

/**
 * The decomposition card: column `c` of the exercise has the digit `have` on
 * top and must give `need`; the blocks come from `m`, across the empty columns
 * `zeros` (מסמך 03 §3.6 when there are any, §3.5 otherwise). With blocks on
 * the screen (stations 3–7) the card names no column's block count: the
 * column digits are hidden there, and the child counts (owner, 30.9.2026).
 * Through a zero, with blocks, one breaks a BLOCK — "לבנת מאה אחת", "לחצו על
 * לבנת המאה", "לבנת עשרת אחת" — the forms of the owner's documents (02; 03
 * §3.6; owner, 4.10.2026). Until then "מאה אחת", "לבנת מאה", "עשרת אחת".
 * Meeting 8 has no blocks, and keeps "מאה אחת".
 */
function borrowCard(ex: string, c: Place, have: number, need: number, zeros: Place[], m: Place, blocks: boolean): SocraticHintResponse {
  const n = next(c)!;
  const writeZero = `רמז: האם יש ב${COLUMN[c]} מספיק ${PLURAL[c]} כדי לחסר?`;
  if (zeros.length > 0) {
    const below = LOW_TO_HIGH[LOW_TO_HIGH.indexOf(m) - 1];
    const where = zeros.length === 1 ? `ב${COLUMN[zeros[0]]} יש אפס` : `${zeros.map((z) => `ב${COLUMN[z]}`).join(' ו')} יש אפסים`;
    return card(`${OPEN}בתרגיל ${ex}, איך פורטים כש${where}?`, 'conceptual', HL(m), [
      blocks
        ? [`פורטים תחילה ${BLOCK[m]} אחת ל${TEN_OF[below]} ב${COLUMN[below]}`, `נכון מאוד! לחצו על ${BLOCK_THE[m]} כדי לפרוט אותה. אחר כך פרטו שוב, טור אחר טור, עד ${COLUMN[c]}.`]
        : [`פורטים תחילה ${ONE[m]} ל${TEN_OF[below]}, ורושמים את השינוי בעיגולי הזיכרון`, `נכון מאוד! אחר כך פרטו שוב, טור אחר טור, עד ${COLUMN[c]}.`],
      // What a decomposition gives: the next column, never straight into the one that is short.
      [zeros.length === 1 ? 'מדלגים על האפס וממשיכים לטור הבא' : 'מדלגים על האפסים וממשיכים לטור הבא', `רמז: כשפורטים ${blocks ? `${BLOCK[m]} אחת` : ONE[m]}, מה מקבלים: ${TEN_OF[below]} או ${TEN_OF[c]}?`],
      blocks
        ? [`מוסיפים ${BLOCK[n]} אחת ל${COLUMN[c]} בלי לפרוט`, HINT.addBlocks]
        : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, writeZero],
    ], 'borrow', frame('borrow_through_zero', 2, `ב${COLUMN[c]} אין מספיק, והטור שמשמאלו ריק: פורטים מהטור הקרוב שיש בו, טור אחר טור`));
  }
  const haveText = have === 0 ? `ב${COLUMN[c]} אין ${NONE[c]}` : `ב${COLUMN[c]} יש ${count(have, c)}`;
  const question = blocks
    ? `${OPEN}בתרגיל ${ex}, ב${COLUMN[c]} אין מספיק לבנים כדי לחסר ${count(need, c)}. מה עושים?`
    : `${OPEN}בתרגיל ${ex}, ${haveText}, וצריך לחסר ${count(need, c)}. מה עושים?`;
  return card(question, 'procedural', HL(n), [
    blocks
      ? [`פורטים ${ONE[n]} ל${TEN_OF[c]} ומעבירים אותן ל${COLUMN[c]}`, `נכון מאוד! לחצו על ${BLOCK[n]} כדי לפרוט אותה.`]
      : [`פורטים ${ONE[n]} ל${TEN_OF[c]}, ורושמים בעיגול הזיכרון שמעל ${COLUMN[n]} כמה ${PLURAL[n]} נשארו`, `נכון מאוד! עכשיו יש מספיק ${PLURAL[c]} כדי לחסר.`],
    [`מחסרים הפוך: ${need} פחות ${have}`, HINT.topOrBottom],
    blocks
      ? [`מוסיפים לבנים חדשות ל${COLUMN[c]}`, HINT.addBlocks]
      : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, writeZero],
  ], 'borrow', frame('borrow_column', 2, `ב${COLUMN[c]} אין מספיק כדי לחסר: פורטים ${ONE[n]} מ${COLUMN[n]}`));
}

/**
 * C5 — stations 5–6, level 1 (owner-approved, 30.9.2026): the first card of
 * an exercise where borrowCard would speak asks what to check in every column,
 * without naming the column. The next card of the same exercise names it
 * (borrowCard, level 2). The instructions no longer say where to borrow.
 */
function borrowCheckCard(): SocraticHintResponse {
  return card(`${OPEN}לפני שמוציאים לבנים, מה בודקים בכל טור?`, 'procedural', 'tour-place-value-board', [
    ['אם יש בטור מספיק לבנים כדי לחסר', 'נכון מאוד! מצאו את הטור שאין בו מספיק לבנים.'],
    ['כמה לבנים יש בבית המספרים כולו', 'רמז: בחיסור במאונך, האם מחסרים את כל המספר בבת אחת?'],
    ['אם יש בטור 10 לבנים או יותר', 'רמז: מתי מקבצים 10 לבנים, בחיבור או בחיסור? ומה בודקים בחיסור?'],
  ], 'borrow_check', frame('check_enough_to_subtract', 1, 'לפני שמוציאים: בודקים בכל טור אם יש בו מספיק לבנים כדי לחסר'));
}

/** The third card of a decomposition (frame 3): the click itself. */
function breakActionCard(from: Place, into: Place): SocraticHintResponse {
  return card(`${OPEN}איך פורטים ${BLOCK[from]} אחת לעשר ${BLOCKS[into]}?`, 'procedural', HL(from), [
    [`לוחצים על ${BLOCK_THE[from]}, או גוררים אותה ל${COLUMN[into]}`, `נכון מאוד! עשר ${BLOCKS[into]} יופיעו ב${COLUMN[into]}.`],
    [`גוררים 10 ${BLOCKS[into]} מארגז הכלים`, HINT.addBlocks],
    [`גוררים את ${BLOCK_THE[from]} לפח האשפה`, HINT.deleteBlock],
  ], 'break_action', frame('break_action', 3, `לוחצים על ${BLOCK[from]} כדי לפרוט אותה לעשר ${BLOCKS[into]}`));
}

/** The first column to the left of `c` that holds something, and the empty ones on the way. */
function source(c: Place, has: (p: Place) => number): { zeros: Place[]; m: Place | null } {
  const zeros: Place[] = [];
  let m: Place | null = next(c);
  while (m && has(m) === 0) {
    zeros.push(m);
    m = next(m);
  }
  return { zeros, m };
}

/** Every column has enough: take away (existing card). */
function takeAwayCard(ex: string, takeAway: string): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, בכל טור יש מספיק לבנים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
    [`מוציאים לפח האשפה ${takeAway}`, 'נכון מאוד! אחר כך כתבו בשורת התוצאה את מה שנשאר בבית המספרים.'],
    ['פורטים עוד לבנה', 'רמז: האם יש טור שאין בו מספיק לבנים?'],
    ['מוסיפים לבנים', HINT.addOrTakeOut],
  ], 'take_away', frame('take_away_now', 1, 'בכל טור יש מספיק: מוציאים לפח את מה שמחסרים'));
}

/** More than the first number on the board (existing card). */
export function buildOnlyFirstCard(ex: string, a: number): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, בבית המספרים יש יותר מ-${formatNumberHe(a)}. מה בונים בחיסור?`, 'procedural', 'tour-place-value-board', [
    [`רק את המספר הראשון, ${formatNumberHe(a)}`, 'נכון מאוד! אחר כך הוציאו ממנו לפח האשפה את מה שמחסרים.'],
    ['את שני המספרים', HINT.secondNumber],
    ['רק את המספר השני', 'רמז: מאיזה מספר מחסרים?'],
  ], 'build_only_first', frame('build_only_first', 1, 'בחיסור בונים רק את המספר הראשון ומוציאים ממנו'));
}

/** What is left after taking all of it away (existing card; one box variant of 1.10.2026). */
function afterTakeAwayCard(ex: string, oneBox: boolean): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, אם כבר הוצאתם לפח האשפה את כל מה שמחסרים, מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
    oneBox
      ? ['כותבים בתיבה הריקה את מספר הלבנים שבטור שלה', 'נכון מאוד! ספרו את הלבנים בטור של התיבה הריקה.']
      : ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
    ['מוציאים עוד לבנים', 'רמז: כמה צריך להוציא בתרגיל הזה?'],
    ['מוסיפים לבנים', HINT.addOrTakeOut],
  ], 'after_take_away', frame('write_after_take_away', 1, 'אחרי שהוציאו את כל מה שמחסרים: כותבים בכל תיבה את מספר הלבנים שבטור שלה'));
}

/**
 * Less than the first number on the board, and nothing taken away yet: the
 * first number is not complete, or the second one was built instead. The
 * options are buildOnlyFirstCard's (1.10.2026).
 */
function buildFirstNumberCard(ex: string, a: number, b: number): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, איזה מספר בונים בבית המספרים?`, 'procedural', 'tour-place-value-board', [
    [`רק את המספר הראשון, ${formatNumberHe(a)}`, 'נכון מאוד! בנו את כל המספר הראשון. אחר כך הוציאו ממנו לפח האשפה את מה שמחסרים.'],
    [`רק את המספר השני, ${formatNumberHe(b)}`, 'רמז: מאיזה מספר מחסרים?'],
    ['את שני המספרים', HINT.secondNumber],
  ], 'build_first_number', frame('build_first_number', 1, 'בחיסור בונים בבית המספרים את כל המספר הראשון, ורק אחר כך מוציאים ממנו'));
}

/** Between building and the result: what to check before taking from a column (existing card). */
export function checkBeforeTakingCard(ex: string): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, מה בודקים לפני שמוציאים לבנים מטור?`, 'procedural', 'tour-place-value-board', [
    ['אם יש בטור מספיק לבנים להוציא', 'נכון מאוד! אם אין מספיק, פורטים לבנה מהטור שמשמאל.'],
    ['שום דבר, מוציאים מיד', 'רמז: מה יקרה אם בטור אין מספיק לבנים להוציא?'],
    ['מוסיפים לבנים חדשות לטור', HINT.addBlocks],
  ], 'check_before_taking', frame('check_before_taking', 1, 'לפני שמוציאים מטור: בודקים אם יש בו מספיק לבנים, ואם אין פורטים מהטור שמשמאל'));
}

/**
 * Subtraction with blocks: the blocks a column lacked were dragged from the tool box (board = a + 10, 100 or 1,000).
 * Owner, 2.10.2026: the question once asked "מאיפה מקבלים עוד לבנים" — wrong in subtraction, where nothing is
 * received (new blocks change the number; a block of the column on the left is broken), and "אין מספיק" said
 * nothing of what for. The house phrase is "כשבטור אין מספיק לבנים כדי לחסר".
 */
export function paletteBorrowCard(): SocraticHintResponse {
  return card(`${OPEN}בחיסור, כשבטור אין מספיק לבנים כדי לחסר, מה עושים?`, 'procedural', 'tour-place-value-board', [
    ['פורטים לבנה מהטור שמשמאל', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים שהוספתם ייצאו מבית המספרים. אחר כך פרטו לבנה מהטור שמשמאל.'],
    ['מוסיפים לבנים מארגז הכלים', 'רמז: אם תוסיפו לבנים מארגז הכלים, האם המספר יישאר אותו מספר?'],
    // Not "תחסרו": read aloud it may be תֶּחְסְרוּ ("you will lack").
    ['מוציאים מהטור רק את מה שיש בו', 'רמז: האם כך תוציאו את כל המספר השני?'],
  ], 'borrow_from_box', frame('borrow_from_box', 1, 'הלבנים שנוספו לטור הגיעו מארגז הכלים, והן משנות את המספר: כשבטור אין מספיק לבנים כדי לחסר, פורטים לבנה מהטור שמשמאל'));
}

/** Subtraction with blocks: more taken away than the number subtracted. */
export function overRemovalCard(): SocraticHintResponse {
  return card(`${OPEN}איך בודקים שהוצאתם בדיוק את המספר שמחסרים?`, 'procedural', 'tour-place-value-board', [
    ['בודקים בכל טור כמה לבנים הוצאתם, ומשווים לספרה של המספר השני', 'נכון מאוד! אם הוצאתם יותר מדי, לחצו על כפתור ביטול הפעולה ↺.'],
    ['סופרים כמה לבנים נשארו בבית המספרים', 'רמז: איך תדעו כמה הוצאתם מכל טור?'],
    ['מוציאים עוד לבנים עד שהטור מתרוקן', 'רמז: כמה לבנים צריך להוציא מכל טור?'],
  ], 'took_too_many', frame('took_too_many', 1, 'משווים בכל טור את מה שהוצא לספרה של המספר השני באותו טור'));
}

/**
 * Subtraction with blocks: column p holds 10 or more even after its own
 * subtraction (and after giving the column on its right what it lacks) — a
 * block was broken that the exercise did not need.
 */
function extraBreakColumn(b: number, counts: BoardCounts): Place | null {
  for (const p of LOW_TO_HIGH) {
    const q = prevPlace(p);
    const needRight = q !== null && (counts[q] ?? 0) < digit(b, q) ? 1 : 0;
    if (next(p) && (counts[p] ?? 0) - digit(b, p) - needRight >= 10) return p;
  }
  return null;
}

/**
 * Subtraction with blocks, taking away under way: a column holding fewer
 * blocks than the result's digit although it needs nothing more from its
 * left — its own break done (conversionsDone), or none needed — so too much
 * was taken from it (53 − 18 with 4 tens and 4 units: 9 units taken, not 8).
 * Null when none, or when the store does not say which breaks were done.
 */
function overTakenColumn(a: number, b: number, counts: BoardCounts, ctx: StaticCardContext): Place | null {
  if (!ctx.conversionsDone) return null;
  const r = a - b;
  const borrows = borrowColumns(a, b);
  return places(a).find((p) => (!borrows.includes(p) || ctx.conversionsDone!.includes(p)) && (counts[p] ?? 0) < digit(r, p)) ?? null;
}

/** "תחסרו" is avoided: read aloud it may be תֶּחְסְרוּ ("you will lack") (review, 1.10.2026). */
function groupBackCard(p: Place): SocraticHintResponse {
  const n = next(p)!;
  return card(`${OPEN}בסוף החיסור יישארו ב${COLUMN[p]} 10 לבנים או יותר. מה עושים איתן?`, 'procedural', HL(p), [
    [`מקבצים 10 ${PLURAL[p]} ל${ONE[n]}`, `נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש ${COLUMN[p]}. בסוף, בכל טור צריכות להיות פחות מ-10 לבנים.`],
    ['כותבים בתיבה את כל מה שנשאר בטור', HINT.oneDigitPerBox],
    ['מוציאים לפח האשפה עוד לבנים מהטור', 'רמז: אם תוציאו עוד לבנים, האם תוציאו יותר מהמספר השני?'],
  ], 'extra_break_sub', frame('extra_break_sub', 2, `בטור יישארו 10 לבנים או יותר גם אחרי החיסור: מקבצים 10 ${PLURAL[p]} ל${ONE[n]}`));
}

/** No conversion needed, or nothing known yet (existing card). */
function subStartCard(ex: string): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחסר?`, 'procedural', HL('units'), [
    ['מטור היחידות, ואחר כך טור אחר טור שמאלה', 'נכון מאוד! בכל טור מחסרים את הספרה התחתונה מהעליונה. מתחילים בטור היחידות.'],
    ['מהטור השמאלי ביותר', HINT.startSub],
    ['מחברים את שני המספרים', 'רמז: איזה סימן כתוב בין המספרים?'],
  ], 'sub_start', frame('sub_start', 1, 'בחיסור במאונך מתחילים בטור היחידות, ובכל טור מחסרים את הספרה התחתונה מהעליונה'));
}

/** Meeting 8: a column whose decomposition is written in the memory circles. */
function subAfterBorrowCard(ex: string, p: Place, a: number, b: number): SocraticHintResponse {
  // The circle over the column records the break into it and, when it also
  // gave a block to the right, that break too: two breaks are "הפריטות"
  // (owner, 4.10.2026). 4,000 − 1,562 at the units: one; at the tens: two.
  const breaks = (borrowColumns(a, b).includes(p) ? 1 : 0) + (gaveRight(a, b, p) ? 1 : 0);
  return card(`${OPEN}בתרגיל ${ex}, כבר רשמתם את ${breaks > 1 ? 'הפריטות' : 'הפריטה'} בעיגולי הזיכרון. ממה מחסרים עכשיו ב${COLUMN[p]}?`, 'procedural', HL(p), [
    [`מהמספר שבעיגול הזיכרון שמעל ${COLUMN[p]}`, 'נכון מאוד! כתבו בתיבה כמה נשאר אחרי שמחסרים ממנו את הספרה התחתונה.'],
    // On the screen the top digit stays as it was: the hint points at the circle (review, 1.10.2026).
    ['מהספרה העליונה שבתרגיל', `רמז: מה רשמתם בעיגול הזיכרון שמעל ${COLUMN[p]}?`],
    ['מהספרה התחתונה', 'רמז: האם מחסרים מהספרה התחתונה, או מחסרים אותה?'],
  ], 'sub_after_borrow', frame('subtract_after_borrow', 2, `אחרי הפריטה מחסרים ב${COLUMN[p]} מהמספר שבעיגול הזיכרון`));
}

/** Meeting 8: a column with no decomposition. */
function subColumnCard(ex: string, p: Place): SocraticHintResponse {
  return card(`${OPEN}בתרגיל ${ex}, מה מחסרים ב${COLUMN[p]}?`, 'procedural', HL(p), [
    ['את הספרה התחתונה מהספרה העליונה', `נכון מאוד! כתבו את התוצאה בתיבה של ${COLUMN[p]}.`],
    ['את הספרה העליונה מהספרה התחתונה', HINT.topOrBottom],
    ['לא מחסרים, אלא מחברים את שתי הספרות', 'רמז: איזה סימן כתוב בין המספרים?'],
  ], 'sub_column', frame('subtract_column', 2, 'בכל טור מחסרים את הספרה התחתונה מהעליונה'));
}

/**
 * Meeting 8 (no blocks), the column card: the column the child is at, its
 * decomposition — or what it subtracts once the decomposition is written in
 * the memory circles (audit C32: 4,000 − 1,562 with 3, 9, 9 and 10 written).
 */
function subtractionColumnCard(ex: string, a: number, b: number, ctx: StaticCardContext): SocraticHintResponse {
  const borrows = borrowColumns(a, b);
  const f = focusColumnOf(ctx, a - b);
  const p = f ?? borrows[0] ?? null;
  if (!p) return subStartCard(ex);
  const written = (q: Place) => {
    const v = ctx.memoryCircles?.[q];
    return v !== undefined && v !== '' && Number(v) === afterBorrow(a, b, q);
  };
  const decompose = (c: Place) => {
    const { zeros, m } = source(c, (x) => digit(a, x));
    return borrowCard(ex, c, digit(a, c), digit(b, c), zeros, m ?? next(c)!, false);
  };
  if (borrows.includes(p)) return written(p) ? subAfterBorrowCard(ex, p, a, b) : decompose(p);
  if (gaveRight(a, b, p)) return written(p) ? subAfterBorrowCard(ex, p, a, b) : decompose(prevPlace(p)!);
  return subColumnCard(ex, p);
}

/**
 * Vertical subtraction, both numbers on the screen. Without blocks (meeting
 * 8) the card reads the exercise. With blocks it reads the board, because
 * the child does the decompositions there:
 *  - the first number is on the board (board value = a): the first column
 *    that still has fewer blocks than it must give, and where its blocks come
 *    from — across empty columns if need be; or, when every column has
 *    enough, "take away";
 *  - more than the first number on the board: in subtraction only the first
 *    number is built — or, a ten (hundred, thousand) more exactly, blocks the
 *    child dragged in instead of breaking one (1.10.2026);
 *  - a column that would hold 10 or more even after its subtraction: a block
 *    was broken too many — group it back (1.10.2026);
 *  - what is left after taking all of it away (board value = a − b): the
 *    result row;
 *  - less than that, after blocks went to the trash: too much was taken away
 *    (1.10.2026);
 *  - anything else — the first number still being built, or taking away
 *    under way; the board alone cannot tell which — what to check before
 *    taking from a column, which is true in both.
 * The empty board has its own live card ("מה בונים קודם?").
 * With blocks, the first card of the exercise that would name the short
 * column is C5 (borrowCheckCard); the next one names it, the third shows the
 * click.
 */
function subtractionCard(a: number, b: number, blocks: boolean, counts: BoardCounts | undefined, ctx: StaticCardContext, oneBox = false): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} − ${formatNumberHe(b)}`;
  const takeAway = countsPhrase(standardCounts(b));
  const value = counts ? boardValue(counts) : 0;
  const checkFirst = blocks && !shownIn(ctx, 'borrow_check');
  if (blocks && counts && value > 0) {
    // The blocks a column lacked dragged from the tool box: where they come
    // from; then the break itself, of the column that gives them.
    if (value > a && [10, 100, 1000].includes(value - a)) {
      const short = borrowColumns(a, b)[0];
      const giver = short ? next(short) : null;
      return ladder(ctx, 'borrow_from_box', [
        ['borrow_from_box', paletteBorrowCard],
        short && giver
          ? ['borrow_from_box_next', () => breakActionCard(giver, short)]
          : ['borrow_from_box_next', () => undoToFirstCard(ex, a, b)],
      ]);
    }
    const extra = value <= a ? extraBreakColumn(b, counts) : null;
    if (extra) return ladder(ctx, 'extra_break_sub', [['extra_break_sub', () => groupBackCard(extra)], ['group_back_action', () => groupActionCard(extra, false)]]);
    if (value === a) {
      const lacking = (p: Place) => (counts[p] ?? 0) < digit(b, p);
      // The column of a column's own trigger (four errors there, a wrong digit
      // before its conversion); otherwise the lowest one short — the work
      // starts at the units, across the zeros on the way (s6_r_t7: 400 − 156
      // starts at the units, through the empty tens).
      const f = focusColumnOf(ctx, a - b);
      const c = columnTrigger(ctx) && f && lacking(f) ? f : LOW_TO_HIGH.find(lacking);
      if (c) {
        const { zeros, m } = source(c, (p) => counts[p] ?? 0);
        // The exercise's own digit, never the board's count (the child counts).
        if (m) {
          if (checkFirst) return borrowCheckCard();
          if (shownIn(ctx, 'borrow')) return breakActionCard(m, LOW_TO_HIGH[LOW_TO_HIGH.indexOf(m) - 1]);
          return borrowCard(ex, c, digit(a, c), digit(b, c), zeros, m, true);
        }
      }
      // A column still short with nothing to its left to decompose (5,432
      // built as 54 hundreds: 0 thousands, 2 to take): "every column has
      // enough" would be false. The check before taking away is true.
      // Every column has enough — just after the break, too (audit D6): take
      // away now; the second card, how.
      if (!c) return ladder(ctx, 'take_away', [['take_away', () => takeAwayCard(ex, takeAway)], ['take_away_how', () => takeAwayHowCard(b)]]);
    }
    if (value > a) return ladder(ctx, 'build_only_first', [['build_only_first', () => buildOnlyFirstCard(ex, a)], ['build_only_first_undo', () => undoToFirstCard(ex, a, b)]]);
    // The board holds a − b: after taking away, or — rarely — on the way to
    // building a (78 − 25 with 5 tens and 3 units while still building 78).
    // The question says "if", so it is true in both and does not tell the child
    // the board holds the result. A column of 10 or more cannot be written in
    // a box: group it first (1 hundred, 14 tens and 4 units is 244 too).
    if (value === a - b) {
      const full = LOW_TO_HIGH.find((p) => (counts[p] ?? 0) >= 10 && next(p));
      if (full) return ladder(ctx, 'extra_break_sub', [['extra_break_sub', () => groupBackCard(full)], ['group_back_action', () => groupActionCard(full, false)]]);
      const f = focusColumnOf(ctx, a - b);
      const col = f ?? places(a - b).find((p) => typedDigit(ctx, p) !== digit(a - b, p)) ?? 'units';
      return ladder(ctx, 'write_result', [['after_take_away', () => afterTakeAwayCard(ex, oneBox)], ['write_column', () => writeColumnCard(ex, col, true)]]);
    }
    // Too much taken away (audit D7): less than a − b, or a column below the
    // result's digit although it needs nothing more from its left — only once
    // taking away started (the store's undo history; useWorkspaceStore).
    // Only on a board worth at most the first number (final review, 2.10.2026).
    const over = ctx.blocksRemoved === true && value <= a ? overTakenColumn(a, b, counts, ctx) : null;
    if (ctx.blocksRemoved === true && (value < a - b || over)) {
      return ladder(ctx, 'took_too_many', [
        ['took_too_many', overRemovalCard],
        ['took_too_many_next', () => (over ? tookTooManyColumnCard(ex, b, over) : undoTakenCard(b))],
      ]);
    }
    // Less than the first number and nothing taken away yet: the first
    // number is not complete, or the second one was built (analysts' matrix
    // 5–6 #15). Without the store's field: the check before taking, as before.
    if (ctx.blocksRemoved === false) {
      return ladder(ctx, 'build_first_number', [['build_first_number', () => buildFirstNumberCard(ex, a, b)], ['build_number', () => buildNumberCard(a, 'sub')]]);
    }
    return ladder(ctx, 'check_before_taking', [['check_before_taking', () => checkBeforeTakingCard(ex)], ['take_away_progress', () => takeAwayProgressCard(b)]]);
  }
  if (!blocks) return subtractionColumnCard(ex, a, b, ctx);
  const c = borrowColumns(a, b)[0];
  if (!c) return subStartCard(ex);
  if (checkFirst) return borrowCheckCard();
  const { zeros, m } = source(c, (p) => digit(a, p));
  return borrowCard(ex, c, digit(a, c), digit(b, c), zeros, m ?? next(c)!, blocks);
}

/** Meeting 8 (owner's decision D8, 1.10.2026): the first card of an exercise is general — it names no column. */
function s8CheckCard(sub: boolean): SocraticHintResponse {
  const q = `${OPEN}לפני שכותבים ספרה בשורת התוצאה, מה בודקים בכל טור?`;
  if (sub) {
    return card(q, 'procedural', HL('units'), [
      ['אם הספרה העליונה גדולה מהתחתונה או שווה לה', 'נכון מאוד! אם היא קטנה מהתחתונה, פרטו מהטור שמשמאל. רשמו את השינוי בעיגולי הזיכרון.'],
      ['איזו ספרה גדולה יותר, כדי לחסר את הקטנה מהגדולה', HINT.topOrBottom],
      ['אם יש בטור 0', 'רמז: אם ה-0 הוא הספרה התחתונה, האם צריך לפרוט?'],
    ], 's8_check', frame('check_each_column', 1, 'לפני שכותבים ספרה: בודקים בכל טור אם הספרה העליונה מספיקה כדי לחסר'));
  }
  return card(q, 'procedural', HL('units'), [
    ['אם סכום הספרות בטור מגיע ל-10 או יותר', 'נכון מאוד! אם הוא מגיע ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.'],
    ['איזו ספרה בטור היא הגדולה', 'רמז: האם בחיבור כותבים את הספרה הגדולה?'],
    ['כמה ספרות יש בתרגיל כולו', 'רמז: האם מחברים את כל הספרות של התרגיל יחד?'],
  ], 's8_check', frame('check_each_column', 1, 'לפני שכותבים ספרה: בודקים בכל טור אם הסכום מגיע ל-10 או יותר'));
}

// ─────────────────────────────────────────────────────────────
// Skeleton exercises: digits of a number hidden
// ─────────────────────────────────────────────────────────────

/** Skeleton exercise: digits of an operand hidden, or one result digit missing (the card of 28.9.2026, now the fallback). */
function missingDigitsCard(task: any, blocks: boolean): SocraticHintResponse {
  const a: number = task.numberA;
  const b: number = task.numberB;
  const sub = Boolean(task.isSubtraction);
  const result = sub ? a - b : a + b;
  const hiddenA: Place[] = task.hiddenDigits?.a ?? [];
  const hiddenB: Place[] = task.hiddenDigits?.b ?? [];
  const operandHidden = hiddenA.length + hiddenB.length > 0;
  const missing = operandHidden ? hiddenA.length + hiddenB.length : places(result).length - (task.revealedResultDigits?.length ?? 0);
  return card(
    `${OPEN}בתרגיל ${skeletonShown(task)}, איך מגלים את ${missing === 1 ? 'הספרה החסרה' : 'הספרות החסרות'}?`,
    'procedural',
    blocks ? 'tour-place-value-board' : HL('units'),
    [
      [
        'בודקים טור אחר טור, מטור היחידות, איזו ספרה משלימה את התרגיל',
        `נכון מאוד! ${blocks ? 'בדקו בלבנים בבית המספרים' : 'שימו לב לעיגולי הזיכרון'}, וכתבו ${missing === 1 ? 'את הספרה בתיבה הריקה' : 'את הספרות בתיבות הריקות'}.`,
      ],
      [
        missing === 1 ? 'מנחשים ספרה וכותבים אותה בתיבה' : 'מנחשים ספרות וכותבים אותן בתיבות',
        `רמז: איך אפשר לבדוק${blocks ? ' בבית המספרים' : ''} אם ${missing === 1 ? 'הספרה נכונה' : 'הספרות נכונות'}?`,
      ],
      ['מתחילים מהטור השמאלי', sub ? HINT.startSub : HINT.startAdd],
    ],
    'skeleton',
    frame('skeleton_generic', 1, 'בודקים טור אחר טור, מטור היחידות, איזו ספרה משלימה את התרגיל'),
  );
}

/** The exercise as the skeleton shows it: "3▢6 + 271 = 657". */
export function skeletonShown(task: any): string {
  const a: number = task.numberA;
  const b: number = task.numberB;
  const sub = Boolean(task.isSubtraction);
  const result = sub ? a - b : a + b;
  const hiddenA: Place[] = task.hiddenDigits?.a ?? [];
  const hiddenB: Place[] = task.hiddenDigits?.b ?? [];
  const sign = sub ? '−' : '+';
  return hiddenA.length + hiddenB.length > 0
    ? `${masked(a, hiddenA)} ${sign} ${masked(b, hiddenB)} = ${formatNumberHe(result)}`
    : `${formatNumberHe(a)} ${sign} ${formatNumberHe(b)}`;
}

/**
 * A hidden digit in one addend (owner, 1.10.2026: the card of 28.9.2026 said
 * "which digit completes the exercise" and never what to build): from the
 * known number, add in each column until the result's digit — past 10, a
 * grouping and a 1 in the memory circle. The question is today's.
 */
function skeletonAddCard(task: any, known: number, blocks: boolean, plural: boolean): SocraticHintResponse {
  const K = formatNumberHe(known);
  const total = formatNumberHe(task.numberA + task.numberB);
  const which = plural ? 'הספרות החסרות' : 'הספרה החסרה';
  const right = plural ? 'הספרות נכונות' : 'הספרה נכונה';
  return card(`${OPEN}בתרגיל ${skeletonShown(task)}, איך מגלים את ${which}?`, 'procedural', blocks ? 'tour-place-value-board' : HL('units'), [
    blocks
      ? [`בונים את ${K}, ובכל טור מוסיפים לבנים עד שמגיעים לספרה של התוצאה`, plural ? 'נכון מאוד! כתבו בכל תיבה ריקה כמה לבנים הוספתם בטור שלה.' : 'נכון מאוד! כתבו בתיבה הריקה כמה לבנים הוספתם בטור שלה.']
      : [`בודקים בכל טור כמה צריך להוסיף לספרה של ${K} כדי לקבל את הספרה של התוצאה`, plural ? 'נכון מאוד! כתבו את הספרות בתיבות הריקות. אם מגיעים ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.' : 'נכון מאוד! אם מגיעים ל-10 או יותר, רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.'],
    // The check is the whole sum: where a ten passes, the column's digits alone do not add up (8 + 7 is 15, not 5).
    [plural ? 'כותבים בכל תיבה ריקה את הספרה של התוצאה' : 'כותבים בתיבה הריקה את הספרה של התוצאה', plural ? `רמז: אם תכתבו בתיבות את הספרות האלה, האם החיבור ייתן ${total}?` : `רמז: אם תכתבו בתיבה את הספרה הזאת, האם החיבור ייתן ${total}?`],
    [plural ? 'מנחשים ספרות וכותבים אותן בתיבות' : 'מנחשים ספרה וכותבים אותה בתיבה', blocks ? `רמז: איך אפשר לבדוק בבית המספרים אם ${right}?` : `רמז: איך אפשר לבדוק בחישוב אם ${right}?`],
  ], 'skeleton', frame('skeleton_missing_addend', 1, 'מהמספר הידוע: מוסיפים בכל טור עד הספרה של התוצאה, וכשמגיעים ל-10 או יותר רושמים 1 בעיגול הזיכרון'));
}

/**
 * A hidden addend digit, the second card: its column, the exercise's own
 * digits. Where a ten passes, the target is 10 more than the result's digit
 * ("from 7 up to 15"); the "smaller from larger" option is offered only where
 * it is wrong (review, 1.10.2026: in 4▢6 + 281 = 737 it gives the answer).
 * Null when the known digit is 0 and nothing comes in: the first card then.
 */
function skeletonAddColumnCard(hiddenOf: number, known: number, p: Place, blocks: boolean, hiddenDigits: readonly number[] = []): SocraticHintResponse | null {
  const result = hiddenOf + known;
  const db = digit(known, p);
  const r = digit(result, p);
  const h = digit(hiddenOf, p);
  const cin = carryInto(hiddenOf, known, p);
  const start = db + cin;
  if (start === 0) return null;
  const base = cin ? `${db} ועוד 1` : `${db}`;
  const pass = start + h >= 10;
  const target = pass ? 10 + r : r;
  const write = blocks ? 'כתבו בתיבה הריקה כמה לבנים הוספתם' : 'כתבו בתיבה הריקה כמה הוספתם';
  // No wrong option and no hint may compute a hidden digit (audit D4: in
  // 2,▢3▢ + 1,554 = 4,191 the hint "כמה זה 4 ועוד 3?" gave the 7): a sum is
  // refused when it, or its units digit, is this column's hidden digit, or
  // when it is any hidden digit of the exercise.
  const gives = (n: number) => n === h || n % 10 === h || hiddenDigits.includes(n);
  const guess: [string, string] = ['מנחשים ספרה וכותבים אותה בתיבה', 'רמז: איך אפשר לבדוק בחישוב אם הספרה נכונה?'];
  const smallFromLarge = Math.abs(r - start);
  const distractors: [string, string][] = [];
  // 9 and a carried 1 make 10: then the result's digit IS the missing one.
  distractors.push(r !== h ? [`כותבים ${r}, כמו בספרת התוצאה`, 'רמז: האם הספרה של התוצאה היא גם הספרה החסרה?'] : guess);
  if (pass && smallFromLarge !== h && !gives(start + smallFromLarge)) {
    distractors.push(['מחסרים את הספרה הקטנה מהגדולה', `רמז: כמה זה ${start} ועוד ${smallFromLarge}?`]);
  } else if (r !== h && !gives(start + r)) {
    distractors.push([`מוסיפים ${r} ל-${base}`, `רמז: כמה זה ${start} ועוד ${r}?`]);
  } else if (distractors[0] !== guess) {
    distractors.push(guess);
  } else if (db !== h) {
    distractors.push(['כותבים את הספרה של המספר הידוע, כמו שהיא', 'רמז: אם תכתבו את הספרה הזאת, האם התרגיל ייתן את התוצאה?']);
  } else {
    distractors.push(['משאירים את התיבה ריקה', 'רמז: האם אפשר לבדוק את התרגיל כשחסרה בו ספרה?']);
  }
  return card(`${OPEN}ב${COLUMN[p]}, כמה צריך להוסיף ל-${base} כדי לקבל ${r} בספרת התוצאה?`, 'procedural', HL(p), [
    [`מוסיפים ל-${base} עד שמגיעים ל-${target}, וסופרים כמה הוספתם`, !pass ? `נכון מאוד! ${write}.`
      : blocks && next(p) ? `נכון מאוד! ${write}. אחר כך לחצו על הכפתור "קבצו 10" שבראש ${COLUMN[p]}. רשמו 1 בעיגול הזיכרון שמעל ${COLUMN[next(p)!]}.`
      : `נכון מאוד! ${write}. אחר כך רשמו 1 בעיגול הזיכרון שמעל הטור שמשמאל.`],
    ...distractors,
  ], 'skeleton_2', frame('skeleton_missing_addend_column', 2, `ב${COLUMN[p]}: כמה מוסיפים לספרה הידועה כדי להגיע לספרת התוצאה, ומה קורה כשמגיעים ל-10 או יותר`));
}

/** A hidden digit in the first number of a subtraction (owner, 1.10.2026): work backwards — what is left, and what was taken, back together. */
function skeletonSubCard(task: any, a: number, b: number, blocks: boolean, plural: boolean): SocraticHintResponse {
  const R = formatNumberHe(a - b);
  const B = formatNumberHe(b);
  const right = plural ? 'הספרות נכונות' : 'הספרה נכונה';
  const write = plural ? 'כתבו בתיבות הריקות את הספרות החסרות.' : 'כתבו בתיבה הריקה את הספרה החסרה.';
  return card(`${OPEN}בתרגיל ${skeletonShown(task)}, איך מגלים את ${plural ? 'הספרות החסרות' : 'הספרה החסרה'}?`, 'procedural', blocks ? 'tour-place-value-board' : HL('units'), [
    blocks
      ? [`בונים את ${R}, ומחזירים לבית המספרים את ${B}`, `נכון מאוד! כך מקבלים את המספר שממנו חיסרו. קבצו כל 10 לבנים בטור. אחר כך ${write}`]
      : [`מחברים את ${R} ואת ${B}`, `נכון מאוד! הסכום הוא המספר שממנו חיסרו. ${write}`],
    [`מחסרים את ${B} מ-${R}`, `רמז: האם ${R} הוא המספר שהיה בהתחלה, או מה שנשאר?`],
    [plural ? 'מנחשים ספרות וכותבים אותן בתיבות' : 'מנחשים ספרה וכותבים אותה בתיבה', blocks ? `רמז: איך אפשר לבדוק בבית המספרים אם ${right}?` : `רמז: איך אפשר לבדוק בחישוב אם ${right}?`],
  ], 'skeleton', frame('skeleton_hidden_minuend', 1, 'עובדים הפוך: מה שנשאר ועוד מה שחיסרו הוא המספר שממנו חיסרו'));
}

/** A hidden digit of the first number of a subtraction, the second card: its column (owner's intent: which column gave the ten, what did it hold before). */
function skeletonSubColumnCard(a: number, b: number, p: Place, plural: boolean): SocraticHintResponse {
  const q = prevPlace(p);
  const gave = gaveRight(a, b, p);
  const borrowed = borrowColumns(a, b).includes(p);
  const write = borrowed
    ? 'נכון מאוד! אם יצא 10 או יותר, כתבו בתיבה רק את ספרת היחידות של מה שיצא.'
    : plural ? 'נכון מאוד! כתבו את מה שקיבלתם בתיבה של הטור הזה.' : 'נכון מאוד! כתבו את מה שקיבלתם בתיבה הריקה.';
  if (gave && q) {
    return card(`${OPEN}${COLUMN[p]} נתן ${ONE[p]} ל${COLUMN[q]}. איך מגלים מה הייתה ספרת ה${PLURAL[p]} לפני החיסור?`, 'conceptual', HL(p), [
      [`מחברים את ה${PLURAL[p]} של התוצאה, את ה${PLURAL[p]} שחיסרו ואת ${THE_ONE[p]} שהטור נתן`, write],
      [`מחברים רק את ה${PLURAL[p]} של התוצאה ואת ה${PLURAL[p]} שחיסרו`, `רמז: מה עוד יצא מ${COLUMN[p]} חוץ ממה שחיסרו?`],
      [`מחסרים את ה${PLURAL[p]} שחיסרו מה${PLURAL[p]} של התוצאה`, `רמז: האם לפני החיסור היו בטור יותר ${PLURAL[p]} או פחות?`],
    ], 'skeleton_2', frame('skeleton_hidden_minuend_column', 2, `${COLUMN[q]} היה צריך ${ONE[p]} מ${COLUMN[p]}: מה שנשאר, ועוד מה שחיסרו, ועוד מה שעבר — זה מה שהיה בטור`));
  }
  const writeResultIsRight = digit(b, p) === 0 && !borrowed;
  return card(`${OPEN}איך מגלים מה הייתה ספרת ה${PLURAL[p]} לפני החיסור?`, 'conceptual', HL(p), [
    ['מחברים את הספרה של התוצאה ואת הספרה שחיסרו', write],
    ['מחסרים את הספרה שחיסרו מהספרה של התוצאה', 'רמז: האם לפני החיסור היה בטור יותר או פחות ממה שנשאר?'],
    writeResultIsRight
      ? ['מנחשים ספרה וכותבים אותה בתיבה', 'רמז: איך אפשר לבדוק בחישוב אם הספרה נכונה?']
      : ['כותבים את הספרה של התוצאה', 'רמז: מה חיסרו בטור הזה?'],
  ], 'skeleton_2', frame('skeleton_hidden_minuend_column', 2, 'מה שנשאר בטור ועוד מה שחיסרו ממנו הוא מה שהיה בו לפני החיסור'));
}

/**
 * Skeleton exercises (stations 5–8): the card of the hidden digits' kind,
 * and its second card for the column the child is at — the trigger's column,
 * or the first hidden digit not yet right.
 */
function skeletonCard(task: any, blocks: boolean, ctx: StaticCardContext): SocraticHintResponse {
  const a: number = task.numberA;
  const b: number = task.numberB;
  const sub = Boolean(task.isSubtraction);
  const hiddenA: Place[] = task.hiddenDigits?.a ?? [];
  const hiddenB: Place[] = task.hiddenDigits?.b ?? [];
  // A hidden digit in the number subtracted: no such exercise; the card of 28.9.2026.
  if ((sub && hiddenB.length) || (hiddenA.length && hiddenB.length)) return missingDigitsCard(task, blocks);
  const side: 'a' | 'b' = hiddenA.length ? 'a' : 'b';
  const hidden = [...(side === 'a' ? hiddenA : hiddenB)].sort((x, y) => LOW_TO_HIGH.indexOf(x) - LOW_TO_HIGH.indexOf(y));
  const hiddenOf = side === 'a' ? a : b;
  const known = side === 'a' ? b : a;
  const plural = hidden.length > 1;
  if (!shownIn(ctx, 'skeleton')) {
    return sub ? skeletonSubCard(task, a, b, blocks, plural) : skeletonAddCard(task, known, blocks, plural);
  }
  const typed = (p: Place) => {
    const v = ctx.operandDigits?.[side]?.[p];
    return v === undefined || v === '' ? null : Number(v);
  };
  const f = ctx.focusColumn && hidden.includes(ctx.focusColumn) && columnTrigger(ctx) ? ctx.focusColumn : null;
  const p = f ?? hidden.find((x) => typed(x) !== digit(hiddenOf, x)) ?? hidden[0];
  if (sub) return skeletonSubColumnCard(a, b, p, plural);
  return skeletonAddColumnCard(hiddenOf, known, p, blocks, hidden.map((x) => digit(hiddenOf, x))) ?? skeletonAddCard(task, known, blocks, plural);
}

// ─────────────────────────────────────────────────────────────
// Representations, flexible, missing part, small change
// ─────────────────────────────────────────────────────────────

/**
 * The card of meeting 3 when nothing about the task can be named: which
 * number is built in the number house. It marks no representation wrong
 * (owner, 28.9.2026, שהB.1): also the fallback for any meeting-3 task this
 * module does not recognise (SocraticEngine.resolveStaticHint).
 */
export function whichNumberIsBuiltCard(): SocraticHintResponse {
  return card(`${OPEN}איך יודעים איזה מספר בנוי בבית המספרים?`, 'conceptual', 'tour-place-value-board', [
    // Stations 3–7 hide the digit beside the column name (core/columnDigits.ts,
    // owner 29–30.9.2026): the child counts the blocks of each column. Wrong
    // options get a guiding question, not an explanation (owner, 30.9.2026).
    ['סופרים את הלבנים בכל טור לחוד', 'נכון מאוד! כמה לבנים יש בכל טור?'],
    ['סופרים את כל הלבנים יחד', 'רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?'],
    ['מנחשים מספר', 'רמז: מה אפשר לספור בבית המספרים כדי לבדוק?'],
  ], 'which_number', frame('which_number_built', 1, 'סופרים את הלבנים בכל טור לחוד כדי לדעת איזה מספר בנוי'));
}

/** Is this the card of whichNumberIsBuiltCard? */
const isWhichNumberIsBuilt = (c: SocraticHintResponse) => c.questionHe === whichNumberIsBuiltCard().questionHe;

/**
 * Every column below 10: one digit per column, 0 for an empty one after the
 * first digit (the second card after "which number is built", and after C7).
 * "Only the columns with blocks" is offered as a wrong option only where the
 * number has a 0 after its first digit (340, 2,500): for 125 it would be right.
 */
function writeDigitsCard(kind: StaticCardKind, situation: string, n: number | undefined): SocraticHintResponse {
  const zeroAfterFirst = typeof n === 'number' && places(n).slice(0, -1).some((p) => digit(n, p) === 0);
  return card(`${OPEN}אחרי שסופרים את הלבנים בכל טור, איך כותבים את המספר?`, 'conceptual', 'tour-place-value-board', [
    ['כותבים ספרה אחת לכל טור, מהטור השמאלי שיש בו לבנים ועד טור היחידות', 'נכון מאוד! אחרי הספרה הראשונה, בשביל כל טור ריק כותבים 0.'],
    zeroAfterFirst
      ? ['כותבים רק את הטורים שיש בהם לבנים', 'רמז: מה כותבים בשביל טור שאין בו לבנים?']
      : ['כותבים קודם את הספרה של טור היחידות', 'רמז: באיזה טור נמצאת הספרה הראשונה של המספר?'],
    ['כותבים כמה לבנים יש בבית המספרים כולו', 'רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?'],
  ], kind, frame(situation, 2, 'כל טור נותן ספרה אחת במספר, וטור ריק אחרי הספרה הראשונה נותן 0'));
}

/**
 * A column holds 10 or more and the board must stay so (after a break, in
 * station 3 and meeting 1's 347): every 10 blocks count as one block of the
 * column on the left — in the head, not with the button, or the board no
 * longer shows what the instruction asks.
 */
function regroupReadCard(kind: StaticCardKind, oneBox: boolean, big: Place = 'hundreds', small: Place = 'tens', meeting1 = false): SocraticHintResponse {
  return card(`${OPEN}באחד הטורים יש 10 לבנים או יותר. איך יודעים איזה מספר מייצגות הלבנים?`, 'conceptual', 'tour-place-value-board', [
    ['סופרים כל 10 לבנים כמו לבנה אחת של הטור שמשמאל', 'נכון מאוד! ספרו כך בלי ללחוץ על הכפתור "קבצו 10". אחר כך כתבו את המספר.'],
    ['סופרים את כל הלבנים יחד', sameWorthHint(big, small)],
    ['כותבים את מספר הלבנים של כל טור, זה אחרי זה', oneBox && !meeting1 ? 'רמז: כמה ספרות כותבים במספר בשביל כל טור?' : HINT.oneDigitPerBox],
  ], kind, frame('read_with_ten_or_more', 1, 'כל 10 לבנים בטור שוות ללבנה אחת של הטור שמשמאל: סופרים כך בראש, בלי לשנות את בית המספרים'));
}

/** The second card after "which number is built": by the board, and by what was written. */
function whichNumberLevel2(task: any, ctx: StaticCardContext, counts?: BoardCounts): SocraticHintResponse {
  if (counts && LOW_TO_HIGH.some((p) => (counts[p] ?? 0) >= 10)) return regroupReadCard('which_number_2', true);
  const n = numberWritten(task);
  const typed = typedNumber(ctx);
  // 340 written 34: the zero at the end was dropped.
  if (typeof n === 'number' && typed !== null && n % 10 === 0 && typed === Math.floor(n / 10)) {
    const z = zeroPositionCard(task, ctx, 'which_number_2');
    if (z) return z;
  }
  return writeDigitsCard('which_number_2', 'write_digits', n);
}

/**
 * A place-value slip on a representation in the usual way (★ chosen by the
 * agent, 28.9.2026; owner's rule שהB.1): where the instruction names an empty
 * column ("טור העשרות נשאר ריק"), the digit just right of it moves into it
 * (506 → "5 מאות ו-6 עשרות", 6,030 → "6 אלפים ו-3 מאות"); otherwise the two
 * highest digits trade places (340 → "4 מאות ו-3 עשרות"). Its value is never N.
 */
function placeValueSlip(task: any, n: number, standard: Counts): [string, string] | null {
  const N = formatNumberHe(n);
  const ps = [...LOW_TO_HIGH].reverse().filter((p) => (standard[p] ?? 0) > 0);
  const empty = LOW_TO_HIGH.find((p) => (standard[p] ?? 0) === 0 && onScreen(task, `${COLUMN[p]} נשאר ריק`));
  if (empty) {
    const i = LOW_TO_HIGH.indexOf(empty);
    const from = LOW_TO_HIGH.slice(0, i).reverse().find((p) => (standard[p] ?? 0) > 0);
    if (from) {
      const moved: Counts = { ...standard, [empty]: standard[from], [from]: 0 };
      return [
        `משתמשים ${withBe(countsPhrase(moved))}`,
        `רמז: לאיזה טור שייכת הספרה ${standard[from]} במספר ${N}?`,
      ];
    }
  }
  if (ps.length >= 2 && standard[ps[0]] !== standard[ps[1]]) {
    const [p1, p2] = ps;
    const swapped: Counts = { ...standard, [p1]: standard[p2], [p2]: standard[p1] };
    return [
      `משתמשים ${withBe(countsPhrase(swapped))}`,
      `רמז: לאיזה טור שייכת הספרה ${standard[p1]} במספר ${N}?`,
    ];
  }
  return null;
}

/**
 * Build a representation on the board and write the number (meetings 3 and 7).
 * The owner's rule (28.9.2026, שהב.1): the correct option lists exactly the
 * blocks the instruction asks for; no wrong option lists them; a wrong option
 * that is also N says so and says what the instruction asks instead. The
 * question names the criterion: which blocks the instruction asks for.
 */
function representationCard(task: any): SocraticHintResponse {
  const n: number = task.numberA;
  const N = formatNumberHe(n);
  const required: Counts = task.requiredCounts ?? {};
  const requiredPhrase = countsPhrase(required);
  if (!numberOnScreen(task, n) || !requiredPhrase || !onScreen(task, requiredPhrase)) {
    // The number (or the blocks) is what the child is asked to find: name neither.
    return whichNumberIsBuiltCard();
  }
  const standard = standardCounts(n);
  const isStandard = sameCounts(required, standard);
  const choices: [string, string][] = [[`משתמשים ${withBe(requiredPhrase)}`, 'נכון מאוד! בנו את זה בבית המספרים.']];
  if (!isStandard) {
    // Also N — said so (שהB.1) — then the question of the card. No "בדרך
    // הרגילה": the owner rejected the phrase as unclear to children (30.9.2026).
    choices.push([`משתמשים ${withBe(countsPhrase(standard))}`, `רמז: גם זה ${N}. באילו לבנים ההנחיה מבקשת לבנות אותו?`]);
  } else {
    const slip = placeValueSlip(task, n, standard);
    if (slip) choices.push(slip);
  }
  if (!sameCounts(required, { units: n })) {
    choices.push([`משתמשים ב-${N} יחידות`, `רמז: גם זה ${N}. האם ההנחיה מבקשת לבנות אותו רק מלבני יחידה?`]);
  }
  if (choices.length < 3) {
    choices.push(['כותבים את המספר בלי לבנות אותו', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?']);
  }
  return card(`${OPEN}באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`, 'conceptual', 'tour-place-value-board', choices.slice(0, 3), undefined,
    frame('representation_blocks', 1, 'בונים בדיוק את הלבנים שההנחיה מבקשת'));
}

/** Two different representations of one number. */
function flexibleCard(task: any): SocraticHintResponse {
  const N = typeof task.numberA === 'number' ? formatNumberHe(task.numberA) : '';
  const what = N && numberOnScreen(task, task.numberA) ? `את המספר ${N}` : 'את אותה כמות';
  return card(`${OPEN}איך מוצאים דרך נוספת לייצג ${what}?`, 'conceptual', 'tour-place-value-board', [
    ['פורטים לבנה אחת לעשר לבנים קטנות ממנה, או מקבצים עשר לבנים ללבנה אחת', 'נכון מאוד! כך הלבנים מסודרות אחרת, והכמות נשארת אותה כמות.'],
    ['מוסיפים לבנים חדשות', 'רמז: אם תוסיפו לבנים חדשות, האם הכמות תישאר אותה כמות?'],
    ['לכל מספר יש רק דרך אחת', 'רמז: פרטו לבנה אחת בבית המספרים. האם הכמות השתנתה?'],
  ], 'flexible', frame('flexible_second_way', 1, 'דרך נוספת: פורטים לבנה לעשר קטנות ממנה, או מקבצים עשר לבנים לאחת, והכמות לא משתנה'));
}

/** s7_r_t7, "in each way the number of tens is even" (1.10.2026): a ten broken into units changes the tens by one. */
function flexibleEvenTensCard(task: any): SocraticHintResponse {
  const N = typeof task.numberA === 'number' && numberOnScreen(task, task.numberA) ? formatNumberHe(task.numberA) : '';
  const same = N ? `האם המספר יישאר ${N}?` : 'האם הכמות תישאר אותה כמות?';
  return card(`${OPEN}איך מייצגים את ${N ? `המספר ${N}` : 'הכמות'} כך שמספר לבני העשרת יהיה זוגי?`, 'conceptual', 'tour-place-value-board', [
    ['פורטים לבנת עשרת אחת לעשר לבני יחידה', 'נכון מאוד! אחרי כל פריטה, בדקו אם מספר לבני העשרת זוגי.'],
    ['מוסיפים לבנת עשרת חדשה', `רמז: אם תוסיפו לבנה חדשה, ${same}`],
    // As the number is written: 1 hundred and 5 tens (not "without breaking": 1 hundred, 4 tens and 10 units can come straight from the tool box).
    [N ? `בונים את ${N} כמו שכותבים אותו` : 'בונים את המספר כמו שכותבים אותו', 'רמז: האם מספר לבני העשרת יהיה אז זוגי?'],
  ], 'flexible', frame('flexible_even_tens', 1, 'מספר לבני העשרת צריך להיות זוגי: פריטה של עשרת אחת לעשר יחידות משנה אותו'));
}

/** Two representations, the second card: the button that keeps the first one (frame 3). */
function flexibleSecondCard(): SocraticHintResponse {
  return card(`${OPEN}איך שומרים דרך אחת ובונים דרך נוספת?`, 'procedural', 'tour-place-value-board', [
    ['לוחצים על הכפתור "הוספת ייצוג", ואז פורטים לבנה או מקבצים לבנים', 'נכון מאוד! כשהדרך השנייה מוכנה, לחצו שוב על "הוספת ייצוג".'],
    ['בונים שוב את אותן לבנים', 'רמז: האם אותן לבנים הן דרך אחרת?'],
    ['מוסיפים לבנים חדשות', HINT.addBlocks],
  ], 'flexible_2', frame('second_representation', 3, 'שומרים דרך אחת בכפתור "הוספת ייצוג", ובונים דרך שונה בפריטה או בהקבצה'));
}

/** "המספר 160 מורכב ממאה אחת ועוד כמה?" */
function missingElementCard(task: any): SocraticHintResponse | null {
  const part = task.numberA;
  const whole = task.numberB;
  if (typeof part !== 'number' || typeof whole !== 'number') return null;
  const W = formatNumberHe(whole);
  const partWords = countsPhrase(standardCounts(part));
  const P = onScreen(task, partWords) ? partWords : formatNumberHe(part);
  const fromP = /^\d/.test(P) ? `מ-${P}` : `מ${P}`;
  return card(`${OPEN}איך מגלים מה יש במספר ${W} חוץ ${fromP}?`, 'conceptual', 'tour-place-value-board', [
    [`בונים את ${W} בבית המספרים ובודקים מה יש בו חוץ ${fromP}`, `נכון מאוד! כתבו בתיבת התשובה מה יש ${withBe(W)} חוץ ${fromP}.`],
    ['מחברים את שני המספרים', `רמז: האם ${W} הוא המספר כולו או רק חלק ממנו?`],
    [`כותבים ${W} בתיבת התשובה`, 'רמז: מה מחפשים: את המספר כולו או את החלק החסר?'],
  ], 'missing_part', frame('missing_part', 1, 'בונים את המספר כולו ובודקים מה יש בו חוץ מהחלק הנתון'));
}

/**
 * "160 = 100 + ?" (s3_r_t7), the second card — or the first, when the child
 * wrote how many tens (6 for 60): what the tens of the missing part are worth
 * together (analysts' matrix 3.11, 1.10.2026). Tens only; otherwise null.
 */
function missingPartValueCard(task: any): SocraticHintResponse | null {
  const part = task.numberA;
  const whole = task.numberB;
  if (typeof part !== 'number' || typeof whole !== 'number') return null;
  const missing = whole - part;
  if (missing <= 0 || missing % 10 !== 0 || missing >= 100) return null;
  return card(`${OPEN}החלק החסר בנוי מלבני עשרת. איך יודעים כמה הוא שווה?`, 'conceptual', 'tour-place-value-board', [
    ['סופרים את לבני העשרת בעשרות: עשר, עשרים, שלושים…', 'נכון מאוד! כתבו בתיבה כמה שווה החלק החסר.'],
    ['סופרים כמה לבנים יש בו', 'רמז: כמה שווה לבנת עשרת אחת?'],
    ['מחברים אותו למאה', 'רמז: האם ההנחיה שואלת על המספר כולו, או רק על החלק החסר?'],
  ], 'missing_part_2', frame('missing_part_value', 1, 'החלק החסר בנוי מלבני עשרת: סופרים אותן בעשרות, כי כל לבנת עשרת שווה 10'));
}

/** "What changes if we change one digit?" — a closed question about two near exercises. */
function smallChangeCard(task: any): SocraticHintResponse {
  const sub = typeof task.givenHe === 'string' && task.givenHe.includes('−');
  return card(`${OPEN}איך מגלים מה ישתנה בתרגיל החדש?`, 'procedural', HL('units'), [
    ['פותרים את התרגיל החדש טור אחר טור, מטור היחידות, ומשווים לתרגיל הראשון', `נכון מאוד! בדקו בכל טור אם יש ${sub ? 'פריטה' : 'המרה'}.`],
    ['בודקים רק את הטור שבו הספרה השתנתה', 'רמז: האם שינוי בטור אחד יכול לשנות גם את הטור שמשמאלו?'],
    ['בוחרים תשובה בלי לפתור', 'רמז: איך תדעו שהתשובה נכונה בלי לפתור?'],
  ], 'small_change', frame('small_change_compare', 2, 'פותרים את התרגיל החדש טור אחר טור, מטור היחידות, ומשווים לתרגיל הראשון'));
}

// ─────────────────────────────────────────────────────────────
// The cards of 30.9.2026 (owner-approved; only the block names follow the
// task's path). The station-3 redesign takes the answer out of the
// instruction, and the instructions of stations 5–7 no longer say where to
// convert: the card is where help lives, and a wrong option gets a question.
// ─────────────────────────────────────────────────────────────

/** The station-3 task kinds (and the grouping proofs of station 7). */
export type RepresentationKind = 'read_write' | 'compose_break' | 'decompose' | 'compose_group';

/** The task's own `representationKind`, or its id's (data/representationLocks.ts). */
export function representationKindOf(task: any): RepresentationKind | null {
  return representationKindOfTask(task);
}

/** An empty column between two that hold blocks: 506, 6,030 — not 340. */
function hasEmptyColumnInside(n: number): boolean {
  const held = places(n).filter((p) => digit(n, p) > 0).map((p) => LOW_TO_HIGH.indexOf(p));
  if (held.length < 2) return false;
  return LOW_TO_HIGH.slice(held[0] + 1, held[held.length - 1]).some((p) => digit(n, p) === 0);
}

/** The highest empty column between two that hold blocks (506 → tens, 6,030 → hundreds). */
function emptyColumnInside(n: number): Place | null {
  const held = places(n).filter((p) => digit(n, p) > 0);
  if (held.length < 2) return null;
  const lo = LOW_TO_HIGH.indexOf(held[0]);
  const hi = LOW_TO_HIGH.indexOf(held[held.length - 1]);
  return LOW_TO_HIGH.slice(lo + 1, hi).reverse().find((p) => digit(n, p) === 0) ?? null;
}

/** The block broken by a compose_break exercise, and what it breaks into (the first break). */
function breakOf(task: any): { broken: Place; into: Place } | null {
  const n = numberWritten(task);
  const after: Counts | undefined = task.requiredCounts;
  if (typeof n !== 'number' || !after) return null;
  const before = standardCounts(n);
  const broken = [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) < (before[p] ?? 0));
  const into = broken ? prevPlace(broken) : null;
  return broken && into ? { broken, into } : null;
}

/**
 * C1 — station 3, a number built and then a block broken ("build 340, break
 * a hundred into tens, write the number"). The block names follow the break:
 * a hundred into tens, a ten into units (85), a thousand into hundreds (green
 * path; 5,230 breaks a thousand first). requiredCounts is the board after it.
 */
function composeBreakCard(task: any): SocraticHintResponse | null {
  const n = numberWritten(task);
  const after: Counts | undefined = task.requiredCounts;
  if (typeof n !== 'number' || !after || countsValue(after) !== n) return null;
  const b = breakOf(task);
  if (!b) return null;
  const { broken, into } = b;
  // s3_g_t4 breaks twice: "הפריטות", as its instruction (owner, 4.10.2026).
  const noun = conversionNounHe(true, task);
  const changed = noun === 'הפריטה' ? 'שינתה' : 'שינו';
  return card(`${OPEN}לפני ${noun} בניתם מספר. האם ${noun} ${changed} אותו?`, 'conceptual', 'tour-place-value-board', [
    ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', `נכון מאוד! איזה מספר בניתם לפני ${noun}?`],
    ['כן. עכשיו יש יותר לבנים, ולכן המספר גדל', `רמז: מאיפה הגיעו ${BLOCKS_THE[into]} החדשות? האם הוספתם לבנים?`],
    [`כן. עכשיו יש פחות ${BLOCKS[broken]}, ולכן המספר קטן`, `רמז: מה קרה ל${BLOCK_THE[broken]}? מה קיבלתם במקומה?`],
  ], 'compose_break', frame('number_after_break', 1, 'הפריטה משנה את הלבנים ולא את המספר'));
}

/**
 * C2 — station 3, a number built from one kind of block only ("450 from tens
 * only", written 45): how many of them one block of the next column is worth.
 * Green path: hundreds in a thousand.
 */
function decomposeCard(task: any): SocraticHintResponse | null {
  const required: Counts | undefined = task.requiredCounts;
  const only = required ? [...LOW_TO_HIGH].reverse().find((p) => (required[p] ?? 0) > 0) : undefined;
  const bigger = only ? next(only) : null;
  if (!only || !bigger) return null;
  const tryIt = `רמז: הניחו ${BLOCK[bigger]} בבית המספרים. פרטו אותה ל${BLOCKS[only]}. כמה ${BLOCKS[only]} קיבלתם?`;
  return card(`${OPEN}כמה ${BLOCKS[only]} שוות ל${BLOCK[bigger]} אחת?`, 'conceptual', 'tour-place-value-board', [
    [`10 ${BLOCKS[only]}`, `נכון מאוד! בנו כל ${WORTH[bigger]} מ-10 ${BLOCKS[only]}. אחר כך ספרו את כל ${BLOCKS_THE[only]}.`],
    [`${BLOCK[only]} אחת`, tryIt],
    [`100 ${BLOCKS[only]}`, tryIt],
  ], 'decompose', frame('blocks_in_bigger_block', 1, `10 ${BLOCKS[only]} שוות ל${BLOCK[bigger]} אחת: בונים כל ${WORTH[bigger]} מ-10 מהן וסופרים`));
}

/** The kind of block a decompose exercise builds with (450 from tens only → tens). */
const decomposeBlock = (task: any): Place | null => {
  const required: Counts | undefined = task?.requiredCounts;
  return required ? [...LOW_TO_HIGH].reverse().find((p) => (required[p] ?? 0) > 0) ?? null : null;
};

/** C2, the second card: counting many blocks of one kind. */
function countInTensCard(only: Place): SocraticHintResponse {
  return card(`${OPEN}איך סופרים הרבה ${BLOCKS[only]} בלי להתבלבל?`, 'procedural', 'tour-place-value-board', [
    ['סופרים אותן בקבוצות של 10', 'נכון מאוד! ספרו כמה קבוצות של 10 יש, ואחר כך את הלבנים שנשארו.'],
    // Not "one by one": counting one block after another is a fair way too (review, 1.10.2026).
    ['סופרים כמה שורות של לבנים יש בטור', 'רמז: האם בכל שורה יש לבנה אחת בלבד?'],
    ['מנחשים לפי הגובה של הטור', 'רמז: מה אפשר לספור בבית המספרים במקום לנחש?'],
  ], 'decompose_2', frame('count_in_tens', 1, `סופרים את ${BLOCKS_THE[only]} בקבוצות של 10`));
}

/** "450 from tens only": built right, but the number written instead of how many blocks. */
function countNotNumberCard(only: Place): SocraticHintResponse {
  return card(`${OPEN}מה ההנחיה מבקשת לכתוב בשורת התוצאה?`, 'conceptual', 'tour-task-card', [
    [`בכמה ${BLOCKS[only]} השתמשתם`, `נכון מאוד! ספרו את ${BLOCKS_THE[only]} שבבית המספרים, וכתבו כמה הן.`],
    ['איזה מספר בניתם', 'רמז: מה כתוב בהנחיה אחרי המילה "בכמה"?'],
    ['כמה לבנים יש בכל טור', 'רמז: מאילו לבנים בניתם את המספר?'],
  ], 'count_not_number', frame('count_not_number', 1, 'ההנחיה שואלת בכמה לבנים השתמשו, לא איזה מספר בנו'));
}

/**
 * C3 — station 3, reading and writing a number with an empty column inside
 * (506, 6,030). "0" is a digit of the answer, and the rule the card teaches
 * (owner's exception, 30.9.2026). Station 3 writes the number in one answer
 * box, so the card speaks of the column's place in the number, not of a box.
 * Any other number: which number is built.
 */
function readWriteCard(task: any): SocraticHintResponse {
  const n = numberWritten(task);
  if (typeof n !== 'number' || !hasEmptyColumnInside(n)) return whichNumberIsBuiltCard();
  return card(`${OPEN}יש טור שאין בו לבנים. מה כותבים במספר בשביל הטור הזה?`, 'conceptual', 'tour-place-value-board', [
    ['כותבים 0', 'נכון מאוד! האפס שומר את המקום של הטור הריק.'],
    ['לא כותבים כלום וממשיכים', 'רמז: אם לא תכתבו כלום בשביל הטור הזה, איך תקראו את המספר?'],
    ['כותבים 1', 'רמז: כמה לבנים יש בטור הזה?'],
  ], 'read_write_zero', frame('zero_keeps_place', 1, 'טור שאין בו לבנים מקבל 0 במספר'));
}

/**
 * C3 (and "which number is built"), the second card: where the 0 goes — it
 * names the empty column. The column inside the number (506, 6,030); or, when
 * the number written dropped the zero at its end (603 for 6,030, 34 for 340),
 * the units column (review, 1.10.2026).
 */
function zeroPositionCard(task: any, ctx: StaticCardContext, kind: StaticCardKind = 'read_write_zero_2'): SocraticHintResponse | null {
  const n = numberWritten(task);
  if (typeof n !== 'number') return null;
  const typed = typedNumber(ctx);
  const droppedEnd = typed !== null && n % 10 === 0 && n > 0 && typed === Math.floor(n / 10);
  if (droppedEnd) {
    return card(`${OPEN}בטור היחידות אין לבנים. איפה כותבים בשבילו 0 במספר?`, 'conceptual', HL('units'), [
      ['בסוף המספר, אחרי ספרת העשרות', 'נכון מאוד! ה-0 שומר לכל ספרה את המקום שלה.'],
      ['לא כותבים 0, כי אין שם לבנים', 'רמז: אם לא תכתבו 0, כמה ספרות יהיו במספר?'],
      ['בתחילת המספר', 'רמז: האם מספר יכול להתחיל ב-0?'],
    ], kind, frame('zero_position', 2, 'טור היחידות ריק: ה-0 שלו נכתב בסוף המספר'));
  }
  const z = emptyColumnInside(n);
  const left = z ? next(z) : null;
  const right = z ? prevPlace(z) : null;
  if (!z || !left || !right) return null;
  return card(`${OPEN}ב${COLUMN[z]} אין לבנים. איפה כותבים בשבילו 0 במספר?`, 'conceptual', HL(z), [
    [`בין ספרת ה${PLURAL[left]} לספרת ה${PLURAL[right]}`, 'נכון מאוד! ה-0 שומר לכל ספרה את המקום שלה.'],
    ['לא כותבים 0, כי אין שם לבנים', 'רמז: אם לא תכתבו 0, כמה ספרות יהיו במספר?'],
    ['בתחילת המספר', 'רמז: האם מספר יכול להתחיל ב-0?'],
  ], kind, frame('zero_position', 2, `ה-0 של ${COLUMN[z]} נכתב במקום של הטור הזה, בין הספרות של הטורים שמשני צדדיו`));
}

/**
 * C7 — station 7, blocks built in one way and then grouped ("12 tens and 5
 * units", group 10 tens → 125; "14 hundreds and 3 tens", group 10 hundreds →
 * 1,430; "25 hundreds", group twice → 2,500). The grouping makes the highest
 * column of the number from the one below it, one block per grouping. One
 * grouping: the owner's singular wording. More (2,500 makes two thousand
 * blocks from 20 hundred blocks): the plural wording he chose (30.9.2026).
 */
function composeGroupCard(task: any): SocraticHintResponse | null {
  const n = numberWritten(task);
  const after: Counts | undefined = task.requiredCounts ?? (typeof n === 'number' ? standardCounts(n) : undefined);
  const made = after ? [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) > 0) : undefined;
  const from = made ? LOW_TO_HIGH[LOW_TO_HIGH.indexOf(made) - 1] : undefined;
  if (!after || !made || !from) return null;
  const groupings = after[made] ?? 1;
  const madeOption: [string, string] = groupings > 1
    ? [`כן. עכשיו יש ${BLOCKS[made]}, ולכן המספר גדל`, `רמז: מאיפה הגיעו ${BLOCKS_THE[made]}? האם הוספתם לבנים?`]
    : [`כן. עכשיו יש ${BLOCK[made]}, ולכן המספר גדל`, `רמז: מאיפה הגיעה ${BLOCK_THE[made]}? האם הוספתם לבנה?`];
  // s7_g_t1 groups twice: "ההקבצות", as its instruction (owner, 4.10.2026).
  const noun = conversionNounHe(false, task);
  const changed = noun === 'ההקבצה' ? 'שינתה' : 'שינו';
  return card(`${OPEN}לפני ${noun} בניתם מספר. האם ${noun} ${changed} אותו?`, 'conceptual', 'tour-place-value-board', [
    ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', `נכון מאוד! איזה מספר בניתם לפני ${noun}?`],
    ['כן. עכשיו יש פחות לבנים, ולכן המספר קטן', `רמז: מה קרה ל-${10 * groupings} ${BLOCKS_THE[from]}? מה קיבלתם במקומן?`],
    madeOption,
  ], 'compose_group', frame('number_after_grouping', 1, 'ההקבצה משנה את הלבנים ולא את המספר'));
}

/**
 * Stations 3 and 7, a representation exercise on an empty board (★ chosen by
 * the agent, 30.9.2026, in the style of the owner's cards): build first what
 * the instruction names. No count and no number — the instruction on the
 * screen says them. Meeting 1 too (1.10.2026): 347 and 713 + 94.
 */
export function buildFirstCard(): SocraticHintResponse {
  return card(`${OPEN}בית המספרים עדיין ריק. מה עושים קודם?`, 'procedural', 'tour-place-value-board', [
    ['בונים בבית המספרים את מה שההנחיה מבקשת', 'נכון מאוד! קראו את ההנחיה. בנו בבית המספרים את מה שהיא מבקשת.'],
    ['כותבים מספר בשורת התוצאה', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?'],
    ['מנחשים את התשובה', 'רמז: מה אפשר לבנות בבית המספרים במקום לנחש?'],
  ], 'build_first', frame('board_empty_build_first', 1, 'בונים קודם בבית המספרים את מה שההנחיה מבקשת'));
}

/**
 * Stations 3 and 7, a break or grouping exercise whose conversion is not done
 * yet (★ chosen by the agent, 30.9.2026, in the style of the owner's cards):
 * the conversion the instruction names, in its words — C1 and C7 ask about
 * the number after it, so they wait until it is done. No count, no answer.
 * The card follows what the board allows:
 *  - the board already shows the blocks AFTER the conversion, built by hand:
 *    build the instruction's blocks again, then convert them yourselves;
 *  - the block to break is not on the board, or the column to group holds
 *    fewer than 10 blocks (the "קבצו 10" button is not there yet): build all
 *    the blocks the instruction names first;
 *  - otherwise: how to break the block, or which button groups.
 */
function conversionCard(task: any, kind: 'compose_break' | 'compose_group', ctx: StaticCardContext, counts: BoardCounts): SocraticHintResponse | null {
  const write = (verb: string): [string, string] => [`כותבים את המספר בלי ${verb}`, 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים את המספר?'];
  const n = numberWritten(task);
  const after: Counts | undefined = task.requiredCounts;
  const rebuilt = Boolean(after) && sameCounts(counts, after!);
  const addOne = (to: Place): [string, string] => [`מוסיפים ${BLOCK[to]} חדשה`, 'רמז: אם תוסיפו לבנה חדשה, האם המספר יישאר אותו מספר?'];
  /** Built by hand in its final form: build the instruction's blocks, then convert. */
  const rebuildCard = (yourselves: string, pres: string, step: string, add: [string, string]) =>
    card(`${OPEN}ההנחיה מבקשת ${yourselves} בעצמכם. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
      [`בונים מחדש את הלבנים שבהנחיה, ואחר כך ${pres}`, `נכון מאוד! לחצו על פח האשפה כדי לנקות את בית המספרים. בנו את הלבנים שבהנחיה. אחר כך ${step}`],
      ['כותבים את המספר, כי הלבנים כבר מסודרות', 'רמז: מה ההנחיה מבקשת שתעשו בעצמכם לפני שכותבים?'],
      add,
    ], 'convert_yourselves', frame('convert_yourselves', 3, 'ההנחיה מבקשת לעשות את הפריטה או ההקבצה בעצמכם: בונים מחדש ועושים אותה'));
  /** Not everything is built yet: build the instruction's blocks first. */
  const buildCard = (inf: string, pres: string, step: string, partial: [string, string], from: Place) =>
    card(`${OPEN}מה עושים לפני ש${pres}?`, 'procedural', HL(from), [
      ['בונים בבית המספרים את כל הלבנים שההנחיה מבקשת', `נכון מאוד! בנו את כל הלבנים שבהנחיה. אחר כך ${step}`],
      partial,
      write(inf),
    ], 'build_before_convert', frame('build_before_conversion', 1, 'בונים קודם את כל הלבנים שההנחיה מבקשת, ורק אחר כך פורטים או מקבצים'));
  // The levels of each (2.10.2026, audit D5): built by hand → which blocks
  // come before the conversion; not all built → how blocks get onto the
  // board; how to break or group → what the click or the button gives.
  const rebuildLadder = (c: () => SocraticHintResponse) =>
    ladder(ctx, 'convert_yourselves', [['convert_yourselves', c], ['blocks_before_convert', () => blocksBeforeConvertCard(kind, task)]]);
  const buildLadder = (c: () => SocraticHintResponse) =>
    ladder(ctx, 'build_before_convert', [['build_before_convert', c], ['build_first_how', buildHowCard]]);
  if (kind === 'compose_break') {
    const before = typeof n === 'number' ? standardCounts(n) : undefined;
    const derived = after && before ? [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) < (before[p] ?? 0)) : undefined;
    const from = ctx.pendingConversion ? next(ctx.pendingConversion) : derived;
    const into = from ? LOW_TO_HIGH[LOW_TO_HIGH.indexOf(from) - 1] : undefined;
    if (!from || !into) return null;
    const step = `לחצו על ${BLOCK[from]} כדי לפרוט אותה.`;
    if (rebuilt) return rebuildLadder(() => rebuildCard('שתפרטו', 'פורטים', step, [`מוסיפים ${BLOCKS[into]} חדשות`, HINT.addBlocks]));
    // The block to break is not there, or the board is not yet the number
    // (still building, or built otherwise): build the instruction's blocks
    // first — breaking a block of another number does not mend it.
    if ((counts[from] ?? 0) === 0 || (typeof n === 'number' && boardValue(counts) !== n)) {
      return buildLadder(() => buildCard('לפרוט', 'פורטים', step, ['פורטים לבנה אחרת שכבר נמצאת בבית המספרים', 'רמז: איזו לבנה ההנחיה מבקשת לפרוט?'], from));
    }
    return ladder(ctx, 'convert_as_asked', [
      ['break_as_asked', () => card(`${OPEN}ההנחיה מבקשת לפרוט ${BLOCK[from]} אחת לעשר ${BLOCKS[into]}. איך פורטים אותה?`, 'procedural', HL(from), [
        [`לוחצים על ${BLOCK[from]}`, `נכון מאוד! ${step}`],
        [`מוסיפים ${BLOCKS[into]} חדשות`, HINT.addBlocks],
        write('לפרוט'),
      ], 'break_as_asked', frame('break_as_asked', 3, `ההנחיה מבקשת לפרוט ${BLOCK[from]}: לוחצים עליה`))],
      ['break_result', () => breakResultCard(from, into)],
    ]);
  }
  const made = after ? [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) > 0) : undefined;
  const derived = made ? LOW_TO_HIGH[LOW_TO_HIGH.indexOf(made) - 1] : undefined;
  const from = ctx.pendingConversion ?? derived;
  const to = from ? next(from) : null;
  if (!from || !to) return null;
  const step = `לחצו על הכפתור "קבצו 10" שבראש ${COLUMN[from]}.`;
  if (rebuilt) return rebuildLadder(() => rebuildCard('שתקבצו', 'מקבצים', step, addOne(to)));
  if ((counts[from] ?? 0) < 10) {
    return buildLadder(() => buildCard('לקבץ', 'מקבצים', step, [`מקבצים את הלבנים שכבר נמצאות ב${COLUMN[from]}`, `רמז: כמה ${BLOCKS[from]} מקבצים ל${BLOCK[to]} אחת?`], from));
  }
  const again = ctx.conversionAgain ? 'שוב ' : '';
  return ladder(ctx, 'convert_as_asked', [
    ['group_as_asked', () => card(`${OPEN}ההנחיה מבקשת לקבץ ${again}10 ${BLOCKS[from]} ל${BLOCK[to]} אחת. איך מקבצים אותן?`, 'procedural', HL(from), [
      ['לוחצים על הכפתור "קבצו 10" שבראש הטור', `נכון מאוד! ${step}`],
      addOne(to),
      write('לקבץ'),
    ], 'group_as_asked', frame('group_as_asked', 3, `ההנחיה מבקשת לקבץ 10 ${BLOCKS[from]}: לוחצים על הכפתור "קבצו 10" שבראש הטור`))],
    ['group_result', () => groupResultCard(from, to)],
  ]);
}

/** A block broken that the instruction does not ask to break (station 3; meeting 1's 347). */
function extraBreakCard(): SocraticHintResponse {
  return card(`${OPEN}פרטתם לבנה שההנחיה לא מבקשת לפרוט. מה עושים?`, 'procedural', 'tour-action-buttons', [
    ['מבטלים את הפריטה הזאת בכפתור ביטול הפעולה ↺', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺. אחר כך בדקו שבית המספרים מראה את מה שההנחיה מבקשת.'],
    ['כותבים את המספר בלי לתקן', 'רמז: האם בית המספרים מראה עכשיו את מה שההנחיה מבקשת?'],
    ['פורטים עוד לבנה', 'רמז: האם עוד פריטה תחזיר את הלבנים למה שההנחיה מבקשת?'],
  ], 'extra_break', frame('extra_break', 1, 'נפרטה לבנה שההנחיה לא מבקשת: מבטלים אותה בכפתור ביטול הפעולה'));
}

/** After the instruction's breaks, the same number on more blocks than the instruction asks for. */
function extraBreakOn(task: any, counts: BoardCounts): boolean {
  const required: Counts | undefined = task?.requiredCounts;
  const n = numberWritten(task);
  return Boolean(required) && typeof n === 'number' && boardValue(counts) === n &&
    !sameCounts(counts, required!) && blockCount(counts) > blockCount(required!);
}

/**
 * More blocks than the exercise needs (owner, 1.10.2026; audit C13/C14).
 * With a column (an addition of stations 3–7): that column. Meeting 1, and a
 * representation, name no column.
 */
export function strayBlocksCard(column?: Place | null, representation = false): SocraticHintResponse {
  if (column) {
    const n = next(column);
    return card(`${OPEN}יש ב${COLUMN[column]} לבנים שהתרגיל לא צריך. מה עושים?`, 'procedural', HL(column), [
      [`בודקים כמה ${BLOCKS[column]} התרגיל צריך, ומוציאים לפח האשפה את המיותרות`, 'נכון מאוד! אפשר גם ללחוץ על כפתור ביטול הפעולה ↺.'],
      n
        ? [`מקבצים 10 ${BLOCKS[column]} ל${BLOCK[n]} אחת`, 'רמז: האם הקבצה מוציאה את הלבנים המיותרות מבית המספרים?']
        : ['משאירים אותן, כי הן לא מפריעות', 'רמז: האם המספר שבבית המספרים הוא המספר שהתרגיל צריך?'],
      ['משאירים אותן וכותבים את התוצאה', 'רמז: האם בית המספרים מראה עכשיו רק את מה שהתרגיל צריך?'],
    ], 'stray', frame('stray_blocks', 2, `יש ב${COLUMN[column]} לבנים שהתרגיל לא צריך: בודקים כמה צריך ומוציאים את המיותרות`));
  }
  const needs = representation ? 'ההנחיה מבקשת' : 'התרגיל צריך';
  return card(`${OPEN}איך בודקים אם יש בבית המספרים לבנים מיותרות?`, 'procedural', 'tour-place-value-board', [
    [`בודקים בכל טור כמה לבנים ${needs}`, 'נכון מאוד! הוציאו לפח האשפה את הלבנים המיותרות, או לחצו על כפתור ביטול הפעולה ↺.'],
    ['סופרים את כל הלבנים יחד', 'רמז: האם כל הלבנים בבית המספרים שוות אותו דבר?'],
    ['מקבצים 10 לבנים ללבנה אחת', 'רמז: האם הקבצה משנה את המספר שבבית המספרים?'],
  ], 'stray', frame('stray_blocks', 1, 'יש בבית המספרים לבנים מיותרות: בודקים בכל טור כמה לבנים צריך ומוציאים את המיותרות'));
}

/**
 * An addition with more blocks than its two numbers need (stations 1, 3–7;
 * audit C13: 456 + 281 with 12 hundreds, C14: 142 + 23 with 12 hundreds): the
 * board is worth more than a + b. The column, when one holds more than both
 * numbers and a carry can put there. A board worth a + b or less is not
 * stray: 713 built as 7 hundreds and 13 units is 713, and grouping fixes it.
 */
export function strayAddition(task: any, counts: BoardCounts): { column: Place | null } | null {
  const a = task?.numberA;
  const b = task?.numberB;
  if (typeof a !== 'number' || typeof b !== 'number' || task?.isSubtraction) return null;
  if (task?.hiddenDigits?.a?.length || task?.hiddenDigits?.b?.length) return null;
  if (task?.type !== 'vertical_addition' && task?.type !== 'addition_simple') return null;
  if (boardValue(counts) <= a + b) return null;
  const full = [...LOW_TO_HIGH].reverse().find((p) => (counts[p] ?? 0) > digit(a, p) + digit(b, p) + carryInto(a, b, p));
  return { column: full ?? null };
}

/** Stations 3 and 7, 506 built as 5 hundreds and 6 tens: the number's digits in the wrong columns. */
function placeSlipOf(task: any, counts: BoardCounts): Place | null {
  const kind = representationKindOf(task);
  if (kind !== 'read_write' && kind !== 'compose_break') return null;
  const n = typeof task.numberA === 'number' ? task.numberA : null;
  if (n === null || boardValue(counts) === n || LOW_TO_HIGH.some((p) => (counts[p] ?? 0) >= 10)) return null;
  const std = standardCounts(n);
  const sortNum = (xs: number[]) => [...xs].sort((x, y) => x - y).join(',');
  const boardDigits = LOW_TO_HIGH.map((p) => counts[p] ?? 0).filter((x) => x > 0);
  const numberDigits = LOW_TO_HIGH.map((p) => std[p] ?? 0).filter((x) => x > 0);
  if (sortNum(boardDigits) !== sortNum(numberDigits)) return null;
  return [...LOW_TO_HIGH].reverse().find((p) => (counts[p] ?? 0) > 0 && (std[p] ?? 0) === 0)
    ?? [...LOW_TO_HIGH].reverse().find((p) => (counts[p] ?? 0) !== (std[p] ?? 0))
    ?? null;
}

function placeSlipCard(task: any, wrong: Place, counts: BoardCounts, ctx: StaticCardContext): SocraticHintResponse {
  const std = standardCounts(task.numberA);
  // The column the misplaced part belongs to: where the number has that digit and the board nothing.
  const home = LOW_TO_HIGH.find((p) => (std[p] ?? 0) === (counts[wrong] ?? 0) && (counts[p] ?? 0) === 0 && p !== wrong);
  // The second card names the column (read_write only: a break exercise's instruction also names the blocks the break makes).
  if (shownIn(ctx, 'place_slip') && representationKindOf(task) === 'read_write' && (std[wrong] ?? 0) === 0 && home) {
    return card(`${OPEN}האם במילים של המספר שבהנחיה יש ${PLURAL[wrong]}?`, 'conceptual', HL(wrong), [
      [`לא, ולכן הלבנים שב${COLUMN[wrong]} לא במקומן`, `נכון מאוד! הוציאו אותן לפח האשפה, ובנו את אותה כמות לבנים ב${COLUMN[home]}.`],
      [`כן, כי כבר בניתם לבנים ב${COLUMN[wrong]}`, `רמז: האם כתוב בהנחיה משהו על ${PLURAL[wrong]}?`],
      ['לא משנה באיזה טור בונים', sameWorthHint(wrong, home)],
    ], 'place_slip_2', frame('place_slip', 2, `במספר שבהנחיה אין ${PLURAL[wrong]}: הלבנים שב${COLUMN[wrong]} שייכות ל${COLUMN[home]}`));
  }
  // A break exercise, the second card: the blocks its instruction lists
  // before "פרטו" (its instruction names the blocks the break makes too, so
  // "does it ask for blocks in that column" has no clear answer).
  if (shownIn(ctx, 'place_slip') && representationKindOf(task) === 'compose_break') {
    return inFamily(blocksBeforeConvertCard('compose_break', task), 'place_slip');
  }
  const ps = [...places(task.numberA)].reverse().map((p) => `כמה ${PLURAL[p]}`);
  const list = ps.length > 1 ? `${ps.slice(0, -1).join(', ')} ו${ps[ps.length - 1]}` : ps[0];
  return card(`${OPEN}חלק מהמספר בנוי בטור הלא נכון. איך מוצאים לאיזה טור הוא שייך?`, 'conceptual', 'tour-place-value-board', [
    [`בודקים ${list} יש במספר שבהנחיה`, 'נכון מאוד! הוציאו לפח האשפה את הלבנים שבטור הלא נכון. אחר כך בנו כל חלק בטור שלו.'],
    ['לפי הסדר שבו בונים', 'רמז: האם הסדר שבו בונים קובע לאיזה טור שייכת לבנה?'],
    ['כל חלק לטור הראשון שיש בו מקום', 'רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?'],
  ], 'place_slip', frame('place_slip', 1, 'חלק מהמספר בנוי בטור הלא נכון: בודקים לפי ההנחיה לאיזה טור שייך כל חלק'));
}

/**
 * Station 7's two-step exercises (★ chosen numbers, sessionTasks.ts): build a
 * number, add blocks, then remove blocks. Audit C29: 5 hundreds and 4 tens on
 * the board, the child wrote 540 twice — "count the blocks in each column"
 * confirmed it. The card follows the steps (owner, 1.10.2026).
 */
/** The steps, and the amounts in words (read aloud, "2 המאות" may be said "שתיים"): */
const STEPS_BY_ID: Record<string, { start: number; add: Counts; remove: Counts; addWords: string; removeWords: string; removeIndef: string }> = {
  s7_r_t6: { start: 340, add: { hundreds: 2 }, remove: { tens: 3 }, addWords: 'שתי המאות', removeWords: 'שלוש העשרות', removeIndef: 'שלוש עשרות' },
  s7_g_t5: { start: 3400, add: { thousands: 1 }, remove: { hundreds: 6 }, addWords: 'האלף', removeWords: 'שש המאות', removeIndef: 'שש מאות' },
};
export const stepsOf = (task: any) => (typeof task?.id === 'string' ? STEPS_BY_ID[task.id] ?? null : null);

/** "2 לבני מאה", "לבנת אלף אחת". */
const blocksPhrase = (c: Counts) => {
  const p = LOW_TO_HIGH.find((x) => (c[x] ?? 0) > 0)!;
  const k = c[p]!;
  return { p, k, text: k === 1 ? `${BLOCK[p]} אחת` : `${k} ${BLOCKS[p]}` };
};
/** The same count of another kind of block, for a distractor ("2 לבני עשרת" for "2 לבני מאה"). */
const otherKind = (p: Place, k: number) => {
  const q = prevPlace(p) ?? next(p)!;
  return k === 1 ? `${BLOCK[q]} אחת` : `${k} ${BLOCKS[q]}`;
};

function stepsCard(task: any, steps: NonNullable<ReturnType<typeof stepsOf>>, counts: BoardCounts, ctx: StaticCardContext): SocraticHintResponse | null {
  const S = steps.start;
  const A = countsValue(steps.add);
  const R = countsValue(steps.remove);
  const T = S + A - R;
  const v = boardValue(counts);
  if (v === 0) return ladder(ctx, 'build_first', [['build_first', buildFirstCard], ['build_first_how', buildHowCard]]);
  if (v === T) return null;
  const add = blocksPhrase(steps.add);
  const rem = blocksPhrase(steps.remove);
  const removeWords = steps.removeIndef;
  if (v === S + A && (counts[rem.p] ?? 0) < rem.k) {
    const n = next(rem.p)!;
    // Not enough to remove; the second card, the click that breaks one (frame 3).
    if (shownIn(ctx, 'steps')) return inFamily(withKind(breakActionCard(n, rem.p), 'break_result'), 'steps');
    return card(`${OPEN}ההנחיה מבקשת להסיר ${removeWords}. מה עושים אם אין מספיק ${BLOCKS[rem.p]}?`, 'procedural', HL(n), [
      [`פורטים ${BLOCK[n]} אחת לעשר ${BLOCKS[rem.p]}`, `נכון מאוד! לחצו על ${BLOCK[n]} כדי לפרוט אותה. אחר כך הוציאו ${rem.text} לפח האשפה.`],
      [`מוציאים את כל ${BLOCKS_THE[rem.p]} שיש`, `רמז: האם כך תסירו ${removeWords}?`],
      [`מוסיפים ${BLOCKS[rem.p]} מארגז הכלים`, HINT.addBlocks],
    ], 'steps', frame('steps_not_enough', 2, `אין מספיק ${BLOCKS[rem.p]} כדי להסיר: פורטים ${BLOCK[n]} לעשר ${BLOCKS[rem.p]}`));
  }
  const pendingAdd = v === S || v === S - R;
  const pendingRemove = v === S + A;
  if (shownIn(ctx, 'steps') && pendingAdd) {
    return card(`${OPEN}האם כבר הוספתם את ${steps.addWords} שההנחיה מבקשת?`, 'procedural', HL(add.p), [
      [`עוד לא. מוסיפים עכשיו ${add.text}`, `נכון מאוד! גררו ${add.text} מארגז הכלים לבית המספרים.`],
      ['כן, ועכשיו כותבים את המספר', `רמז: אחרי שבניתם את ${formatNumberHe(S)}, האם הוספתם לבנים?`],
      [`עוד לא. מוסיפים עכשיו ${otherKind(add.p, add.k)}`, 'רמז: אילו לבנים ההנחיה מבקשת להוסיף?'],
    ], 'steps', frame('steps_add', 2, `הפעולה שעוד לא נעשתה: להוסיף ${add.text}`));
  }
  if (shownIn(ctx, 'steps') && pendingRemove) {
    return card(`${OPEN}האם כבר הסרתם את ${steps.removeWords} שההנחיה מבקשת?`, 'procedural', HL(rem.p), [
      [`עוד לא. מוציאים עכשיו ${rem.text} לפח האשפה`, `נכון מאוד! גררו ${rem.text} לפח האשפה.`],
      ['כן, ועכשיו כותבים את המספר', 'רמז: האם הוצאתם לבנים לפח האשפה אחרי שהוספתם?'],
      [`עוד לא. מוציאים עכשיו ${otherKind(rem.p, rem.k)}`, 'רמז: אילו לבנים ההנחיה מבקשת להסיר?'],
    ], 'steps', frame('steps_remove', 2, `הפעולה שעוד לא נעשתה: להסיר ${rem.text}`));
  }
  // Its second card, on a board that is none of the steps: how the starting number is built.
  if (shownIn(ctx, 'steps') && !pendingAdd && !pendingRemove) return inFamily(buildNumberCard(S, 'steps'), 'steps');
  return card(`${OPEN}מה עושים לפני שכותבים את המספר?`, 'procedural', 'tour-task-card', [
    ['בודקים שעשיתם כל פעולה בהנחיה, לפי הסדר', 'נכון מאוד! עשו עכשיו את הפעולה הראשונה שעוד לא עשיתם.'],
    ['סופרים את הלבנים וכותבים את המספר', 'רמז: האם כבר עשיתם את כל הפעולות שבהנחיה?'],
    ['בונים שוב את המספר שבתחילת ההנחיה', 'רמז: האם המספר שבתחילת ההנחיה הוא המספר שכותבים?'],
  ], 'steps', frame('steps_progress', 1, 'בודקים אילו מהפעולות שבהנחיה כבר נעשו, ועל איזה סוג לבנים'));
}

/** The value a multi-step exercise ends on: crowding on the way to it is not a mess (s7_g_t5: 3 thousands and 14 hundreds). */
export function multiStepTarget(task: any): number | null {
  const s = stepsOf(task);
  return s ? s.start + countsValue(s.add) - countsValue(s.remove) : null;
}

function kindCard(task: any, kind: RepresentationKind, ctx: StaticCardContext, counts?: BoardCounts): SocraticHintResponse | null {
  switch (kind) {
    case 'read_write': {
      // 506 or 6,030 built another way, a column holding 10 or more (owner,
      // 4.10.2026): "יש טור שאין בו לבנים" is not this board. Which number is
      // built; then how 10 or more in a column are read.
      if (counts && builtAnyWay(task, counts) && LOW_TO_HIGH.some((p) => (counts[p] ?? 0) >= 10)) {
        return shownIn(ctx, 'which_number') ? whichNumberLevel2(task, ctx, counts) : whichNumberIsBuiltCard();
      }
      const c = readWriteCard(task);
      if (c.cardKind === 'read_write_zero' && shownIn(ctx, 'read_write_zero')) return zeroPositionCard(task, ctx) ?? c;
      if (isWhichNumberIsBuilt(c) && shownIn(ctx, 'which_number')) return whichNumberLevel2(task, ctx, counts);
      return c;
    }
    case 'compose_break': {
      const c = composeBreakCard(task);
      if (c && shownIn(ctx, 'compose_break')) {
        const b = breakOf(task)!;
        return regroupReadCard('compose_break_2', true, b.broken, b.into);
      }
      return c;
    }
    case 'decompose': {
      const c = decomposeCard(task);
      const only = decomposeBlock(task);
      if (c && only && shownIn(ctx, 'decompose')) return countInTensCard(only);
      return c;
    }
    case 'compose_group': {
      const c = composeGroupCard(task);
      if (c && shownIn(ctx, 'compose_group')) return writeDigitsCard('compose_group_2', 'number_after_grouping_digits', numberWritten(task));
      return c;
    }
  }
}

/**
 * C4 — stations 4–7, a vertical exercise: the first card of the exercise that
 * opens while the result row's place cues are on (a digit was written in
 * another column's box). A later card goes back to the exercise's own card.
 */
function placeCuesCard(): SocraticHintResponse {
  return card(`${OPEN}איך יודעים באיזו תיבה בשורת התוצאה כותבים כל ספרה?`, 'conceptual', 'tour-task-card', [
    ['לכל טור יש תיבה משלו, מתחת לטור', 'נכון מאוד! כתבו כל ספרה בתיבה של הטור שלה.'],
    ['כותבים את הספרות לפי הסדר שבו מחשבים אותן', 'רמז: מתחת לאיזה טור נמצאת התיבה שבה כתבתם?'],
    ['כותבים כל ספרה בתיבה הפנויה הראשונה', 'רמז: לאיזה טור שייכת כל תיבה?'],
  ], 'place_cues', frame('digit_in_its_box', 1, 'לכל טור תיבה משלו בשורת התוצאה, מתחת לטור'));
}

/** Station 7's error analysis: "תלמיד פתר 247 + 135 וקיבל 372…" (s7_r_t5), 4,857 + 3,568 → 7,425 (s7_g_t4). */
const ERROR_ANALYSIS_IDS = new Set(['s7_r_t5', 's7_g_t4']);
const isErrorAnalysis = (task: any) =>
  ERROR_ANALYSIS_IDS.has(task?.id) || (typeof task?.instructionHe === 'string' && /תלמיד פתר .+ וקיבל/.test(task.instructionHe));

/** C6 — station 7, error analysis. */
function errorAnalysisCard(): SocraticHintResponse {
  return card(`${OPEN}איך מוצאים איפה התלמיד טעה?`, 'procedural', 'tour-task-card', [
    ['פותרים את התרגיל בלבנים ומשווים לתוצאה שלו, טור אחר טור', 'נכון מאוד! חפשו את הטור שבו התוצאה שלכם שונה מהתוצאה שלו.'],
    ['מחפשים את הספרה הגדולה ביותר בתוצאה שלו', 'רמז: איך אפשר לדעת שספרה לא נכונה בלי לפתור את התרגיל?'],
    ['מוחקים את התוצאה שלו ומתחילים מחדש', 'רמז: אם תמחקו את התוצאה שלו, איך תמצאו איפה הוא טעה?'],
  ], 'error_analysis', frame('find_student_error', 1, 'פותרים בעצמכם ומשווים לתוצאה של התלמיד, טור אחר טור'));
}

/** C6, the second card (owner's D9, 1.10.2026): check the student's work column by column — the wrong column is not named. */
function errorAnalysisSecondCard(): SocraticHintResponse {
  return card(`${OPEN}איך בודקים בכל טור אם התלמיד צדק?`, 'procedural', 'tour-task-card', [
    ['פותרים כל טור בעצמכם, ומשווים לספרה שהתלמיד כתב בטור הזה', 'נכון מאוד! התחילו בטור היחידות, ובדקו טור אחר טור.'],
    ['בודקים רק את הספרה הראשונה של התוצאה שלו', 'רמז: האם טעות יכולה להיות גם בטור אחר?'],
    ['מחברים רק את שתי הספרות של הטור', 'רמז: מה קורה לטור כשהטור שמימינו מגיע ל-10 או יותר?'],
  ], 'error_analysis_2', frame('check_student_columns', 1, 'בודקים את התוצאה של התלמיד טור אחר טור, כולל מה שעבר מהטור שמימין'));
}

/** Stations 3–7: the number house hidden by the top-bar button — the first card shows it (owner, 1.10.2026). */
export function showBoardCard(): SocraticHintResponse {
  return card(`${OPEN}בית המספרים מוסתר. איך רואים שוב את הלבנים?`, 'procedural', 'tour-action-buttons', [
    ['לוחצים על הכפתור "הצגת בית המספרים" שבסרגל העליון', 'נכון מאוד! לחצו עליו, והלבנים יחזרו למסך.'],
    ['כותבים את התשובה בלי לבנים', 'רמז: איך תבדקו את התשובה בלי לבנים?'],
    ['מתחילים את התרגיל מההתחלה', 'רמז: האם הלבנים נמחקו, או שהן רק מוסתרות?'],
  ], 'show_board', frame('show_board_button', 3, 'בית המספרים מוסתר: מציגים אותו בכפתור שבסרגל העליון ועובדים בלבנים'));
}

/**
 * Stations 3–7 with the number house hidden (allowed there, register יא),
 * after the one card that suggests showing it again: the exercise's column
 * card worded without blocks — the digits, the boxes and the memory circles,
 * as in meeting 8 — so a child who works without the board still gets help
 * (coordinator's decision, 2.10.2026, audit D15). Null for an exercise that is
 * not a vertical addition or subtraction: it cannot be done without blocks.
 */
export function noBoardColumnCard(task: any, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task || typeof task.numberA !== 'number' || typeof task.numberB !== 'number') return null;
  if (!(task.type === undefined || task.type === 'vertical_addition' || task.type === 'addition_simple')) return null;
  if (task.hiddenDigits?.a?.length || task.hiddenDigits?.b?.length) return skeletonCard(task, false, ctx);
  const oneBox = Array.isArray(task.revealedResultDigits);
  return task.isSubtraction
    ? subtractionCard(task.numberA, task.numberB, false, undefined, ctx, oneBox)
    : additionCard(task.numberA, task.numberB, false, undefined, ctx, oneBox);
}

/**
 * The static card of a meeting 3–8 exercise, or null when the exercise has a
 * shape this module does not know (the caller then falls back further).
 * `ctx` is what the store knows beyond the board: the place cues, the cards
 * already shown in this exercise (none, when it is not given), and — since
 * 1.10.2026 — the trigger, the column, the digits typed and the conversions
 * done. Each new reading falls back to the board alone when its field is missing.
 */
export function exerciseCard(task: any, counts?: BoardCounts, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task) return null;
  const meeting = meetingOfTaskId(task.id);
  const blocks = blocksOnScreen(meeting);
  const kind = representationKindOf(task);
  const built = counts ? boardValue(counts) > 0 : false;
  // Stations 3 and 7, a representation on an empty board: build first what the
  // instruction names — not "which number is built", nor C1/C7's "before the
  // break you built a number" (owner, 30.9.2026).
  const emptyBoard = Boolean(counts) && !built && (meeting === 3 || meeting === 7) && task.type === 'representation';
  const composing = kind === 'compose_break' || kind === 'compose_group';
  // Station 7's two-step exercises follow their steps (1.10.2026).
  const steps = stepsOf(task);
  if (steps && counts && blocks) {
    const byStep = stepsCard(task, steps, counts, ctx);
    if (byStep) return byStep;
  }
  // An empty board: build first what the instruction names; the second card,
  // how blocks get onto the board (2.10.2026).
  const buildFirst = () => ladder(ctx, 'build_first', [['build_first', buildFirstCard], ['build_first_how', buildHowCard]]);
  // An exercise that opened with its blocks on the board (station 7's 2,730,
  // owner 4.10.2026), and they are not what it gave — deleted, added, the board
  // cleared, or the final blocks arranged by hand with nothing grouped: back
  // to the blocks it started with (B1/B2, cards round 2), before "build first",
  // the crowded column and "which number is built".
  const givenChanged = givenBlocksChangedCard(task, counts, ctx);
  if (givenChanged) return givenChanged;
  // C3 too: "יש טור שאין בו לבנים" says nothing on a board with no blocks at all.
  if (emptyBoard && (composing || kind === 'read_write')) return buildFirst();
  // A part of the number built in another column (1.10.2026): before any
  // break — breaking a block of a wrong board does not mend it.
  if (task.type === 'representation' && built && counts && blocks && meeting !== 1) {
    const slip = placeSlipOf(task, counts);
    if (slip) return placeSlipCard(task, slip, counts, ctx);
  }
  // A number said in words, built otherwise (audit D10: "which number is
  // built" taught the child to read and write the wrong board): compare the
  // board with the words; the second card names the first column that does
  // not match. No count is stated.
  if (kind === 'read_write' && built && counts && blocks && meeting !== 1 && typeof task.numberA === 'number' &&
    boardValue(counts) !== task.numberA && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) {
    const std = standardCounts(task.numberA);
    const col = LOW_TO_HIGH.find((p) => (counts[p] ?? 0) !== (std[p] ?? 0)) ?? 'units';
    return ladder(ctx, 'compare_words', [['compare_words', compareWordsCard], ['compare_words_column', () => compareWordsColumnCard(col)]]);
  }
  // C1 and C7 ask about the number after the break / the grouping: only once
  // every conversion the instruction names is done (s7_g_t1: both groupings).
  // Before that, the conversion itself.
  if (composing && built && ctx.conversionDone === false) {
    const conv = conversionCard(task, kind, ctx, counts!);
    if (conv) return conv;
  }
  // What the board shows against the instruction (1.10.2026): a block broken
  // too many, more blocks than asked for, or — "450 from tens only" — the
  // number written instead of how many blocks.
  if (task.type === 'representation' && built && counts && blocks && meeting !== 1) {
    if (kind === 'compose_break' && extraBreakOn(task, counts)) {
      return ladder(ctx, 'extra_break', [['extra_break', extraBreakCard], ['extra_break_which', extraBreakWhichCard]]);
    }
    const n = typeof task.numberA === 'number' ? task.numberA : null;
    if (n !== null && boardValue(counts) > n && kind !== 'compose_group' && !steps) {
      return ladder(ctx, 'stray', [['stray', () => strayBlocksCard(null, true)], ['stray_which', strayWhichCard]]);
    }
    const only = kind === 'decompose' ? decomposeBlock(task) : null;
    if (only && task.requiredCounts && sameCounts(counts, task.requiredCounts)) {
      const typed = typedNumber(ctx);
      if (typed !== null && typed !== task.correctAnswer && typed === task.numberA) {
        return ladder(ctx, 'decompose', [['count_not_number', () => countNotNumberCard(only)], ['decompose_2', () => countInTensCard(only)]]);
      }
    }
  }
  if (kind && (built || !composing)) {
    const byKind = kindCard(task, kind, ctx, counts);
    if (byKind) return emptyBoard && isWhichNumberIsBuilt(byKind) ? buildFirst() : byKind;
    // A representation task of a known kind this module cannot read: the
    // card that marks no representation wrong (owner, 28.9.2026, שהB.1).
    if (task.type === 'representation') return emptyBoard ? buildFirst() : whichNumberIsBuiltCard();
  }
  if (emptyBoard) {
    const byType = typeof task.numberA === 'number' ? representationCard(task) : null;
    return !byType || isWhichNumberIsBuilt(byType) ? buildFirst() : byType;
  }
  switch (task.type) {
    case 'representation': {
      if (typeof task.numberA !== 'number') return null;
      const c = representationCard(task);
      return isWhichNumberIsBuilt(c) && shownIn(ctx, 'which_number') ? whichNumberLevel2(task, ctx, counts) : c;
    }
    case 'flexible_decomp': {
      // Another number on the board (analysts' matrix 3.12): which number is
      // built there, before a second way of building the one asked for; the
      // second card, how the number asked for is built.
      const n = typeof task.numberA === 'number' ? task.numberA : null;
      if (n !== null && counts && built && boardValue(counts) !== n) {
        return ladder(ctx, 'which_number', [['which_number', whichNumberIsBuiltCard], ['build_number', () => buildNumberCard(n, 'another_way')]]);
      }
      if (shownIn(ctx, 'flexible')) return flexibleSecondCard();
      return task.requireEvenTens ? flexibleEvenTensCard(task) : flexibleCard(task);
    }
    case 'missing_element': {
      const second = missingPartValueCard(task);
      const typed = typedNumber(ctx);
      const tensWritten = typed !== null && typeof task.numberA === 'number' && typeof task.numberB === 'number' &&
        typed > 0 && typed * 10 === task.numberB - task.numberA;
      if (second && (shownIn(ctx, 'missing_part') || tensWritten)) return second;
      return missingElementCard(task);
    }
    case 'small_change': {
      const sub = typeof task.givenHe === 'string' && task.givenHe.includes('−');
      return ladder(ctx, 'small_change', [['small_change', () => smallChangeCard(task)], ['small_change_column', () => smallChangeColumnCard(sub)]]);
    }
    case undefined:
    case 'vertical_addition':
    case 'addition_simple': {
      const a = task.numberA;
      const b = task.numberB;
      if (typeof a !== 'number' || typeof b !== 'number') return null;
      if (blocks && ctx.placeCuesShown && !shownIn(ctx, 'place_cues')) return placeCuesCard();
      // C6 once per exercise, then the column-by-column check (D9); the third
      // card is the exercise's own addition card.
      const errorAnalysis = blocks && isErrorAnalysis(task);
      if (errorAnalysis && !shownIn(ctx, 'error_analysis')) return errorAnalysisCard();
      if (errorAnalysis && !shownIn(ctx, 'error_analysis_2')) return errorAnalysisSecondCard();
      const skeleton = Boolean(task.hiddenDigits?.a?.length || task.hiddenDigits?.b?.length);
      if (skeleton) return skeletonCard(task, blocks, ctx);
      // Meeting 8 (D8): the first card names no column — unless the first was
      // מסמך 03's own card for three undos in a row, which names none either.
      if (meeting === 8 && !shownIn(ctx, 's8_check') && !shownIn(ctx, 'guessing')) return s8CheckCard(Boolean(task.isSubtraction));
      // One result digit missing (s4_r_t7, s6_r_t7): the exercise's own card,
      // which is how the digit is found (the brief of 1.10.2026: s6_r_t7 is
      // מסמך 03 §3.6's zero card, not "which digit completes the exercise").
      const oneBox = Array.isArray(task.revealedResultDigits);
      return task.isSubtraction ? subtractionCard(a, b, blocks, counts, ctx, oneBox) : additionCard(a, b, blocks, counts, ctx, oneBox, errorAnalysis);
    }
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Meeting 1 (owner, 29.9.2026: no count and no column named where the
// difficulty is; D10 of 1.10.2026: the hint rule of 30.9 applies here too)
// ─────────────────────────────────────────────────────────────

/** Meeting 1: 10 or more blocks in a column that has no grouping button (no thousands column there). */
export function s1NoButtonCard(): SocraticHintResponse {
  return card(`${OPEN}באחד הטורים יש 10 לבנים או יותר, ואין בראשו הכפתור "קבצו 10". מה עושים?`, 'procedural', 'tour-place-value-board', [
    ['בודקים בהנחיה איזה מספר בונים, ומוציאים את הלבנים המיותרות', 'נכון מאוד! אפשר גם ללחוץ על כפתור ביטול הפעולה ↺ כדי לחזור צעד אחד אחורה.'],
    ['מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו', 'רמז: האם בבית המספרים יש טור משמאל לטור הזה?'],
    ['משאירים את כל הלבנים בטור', HINT.oneDigitPerBox],
  ], 'no_button', frame('s1_crowded_no_button', 1, 'בטור בלי כפתור הקבצה יש יותר לבנים ממה שהמספר צריך: בודקים כמה צריך ומוציאים את המיותרות'));
}

/** Meeting 1, the second "10 or more" card: the button, in the meeting's words (no column named). */
export function s1GroupActionCard(): SocraticHintResponse {
  return card(`${OPEN}איך מקבצים 10 לבנים ללבנה אחת?`, 'procedural', 'tour-place-value-board', [
    ['לוחצים על הכפתור "קבצו 10" שבראש הטור', 'נכון מאוד! הכפתור מופיע בראש הטור כשיש בו 10 לבנים או יותר.'],
    ['גוררים לבנה חדשה מארגז הכלים', HINT.addBlock],
    ['גוררים 10 לבנים לפח האשפה', HINT.deleteBlocks],
  ], 's1_crowded_2', frame('group_action', 3, 'מקבצים 10 לבנים בכפתור "קבצו 10" שבראש הטור'));
}

/** Meeting 1, the second "which column is short" card: where the block to break comes from. */
export function s1DeficitSecondCard(): SocraticHintResponse {
  return card(`${OPEN}מאיפה לוקחים לבנה כדי לפרוט אותה?`, 'procedural', 'tour-place-value-board', [
    ['מהטור שמשמאל לטור שאין בו מספיק לבנים', 'נכון מאוד! לחצו על לבנה בטור שמשמאל, או גררו אותה אל הטור שאין בו מספיק לבנים כדי לחסר.'],
    ['מארגז הכלים', 'רמז: אם תוסיפו לבנה מארגז הכלים, האם המספר יישאר אותו מספר?'],
    ['מהטור שאין בו מספיק לבנים', 'רמז: כשפורטים לבנה, לאיזה טור עוברות הלבנים הקטנות?'],
  ], 's1_deficit_2', frame('borrow_source', 1, 'את הלבנה שפורטים לוקחים מהטור שמשמאל לטור שאין בו מספיק לבנים כדי לחסר'));
}

/**
 * Meeting 1's 347, after the break (3 hundreds, 3 tens, 17 units): what
 * became of the ten. No "347", no "נשאר / לא משתנה / נשמר" (the analysts'
 * phrase rule, for the owner). Not "did a block leave?": the ten block did
 * leave, literally, and a literal reader answers yes (review, 1.10.2026).
 */
function s1AfterBreakCard(): SocraticHintResponse {
  return card(`${OPEN}מה קרה לעשרת שפרטתם?`, 'conceptual', 'tour-place-value-board', [
    ['היא הפכה לעשר יחידות, וכולן בבית המספרים', 'נכון מאוד! עכשיו כתבו בשורת התוצאה איזה מספר מייצגות הלבנים.'],
    ['היא יצאה מבית המספרים, ולכן המספר קטן יותר', 'רמז: מאיפה הגיעו עשר היחידות החדשות?'],
    ['נוספו עשר לבנים חדשות, ולכן המספר גדל', 'רמז: האם הוספתם לבנים מארגז הכלים?'],
  ], 's1_after_break', frame('s1_after_break', 1, 'העשרת שפרטתם הפכה לעשר יחידות, וכולן בבית המספרים: מה שוות יחד כל הלבנים'));
}

/**
 * Meeting 1: what goes in each box. The wrong option that skips a column is
 * offered only where the number has a 0 inside it (807): for 26 or 482 it
 * would be right (review, 1.10.2026).
 */
function s1WriteBoxesCard(target: number, op: 'group' | 'add' | 'sub' | 'words'): SocraticHintResponse {
  const zero = hasEmptyColumnInside(target);
  const third: [string, string] = zero
    ? ['רק בתיבות של טורים שיש בהם לבנים', HINT.emptyColumnBox]
    : op === 'sub'
      ? ['את מספר הלבנים שהיו בטור לפני שהוצאתם', 'רמז: האם כותבים את מה שהיה בטור, או את מה שנשאר?']
      : op === 'words'
        ? ['את המילים של המספר, מילה בכל תיבה', 'רמז: מה כותבים בתיבה: מילה או ספרה?']
        : ['את מספר הלבנים שהיו בטור לפני ההקבצה', 'רמז: מה כותבים: את מה שהיה בטור, או את מה שיש בו עכשיו?'];
  return card(`${OPEN}מה כותבים בכל תיבה בשורת התוצאה?`, 'procedural', 'tour-place-value-board', [
    ['את מספר הלבנים שבטור של אותה תיבה', zero ? 'נכון מאוד! כתבו ספרה בכל תיבה, גם בתיבה של טור שאין בו לבנים.' : 'נכון מאוד! ספרו את הלבנים בכל טור, וכתבו את מספרן בתיבה של אותו טור.'],
    ['את מספר כל הלבנים יחד, בתיבה אחת', HINT.oneDigitPerBox],
    third,
  ], 'write_boxes', frame('write_result_boxes', 1, 'בכל תיבה כותבים את מספר הלבנים שבטור שלה, גם 0'));
}

/**
 * Meeting 1's 347: a block broken that the instruction does not ask to break
 * — a hundred, or a second ten (analysts' matrix S16, S17). The number is the
 * same; the board is not the one asked for. The "10 or more" card read it as
 * a mess to group; the card is the station-3 one (undo the break).
 */
export function s1WrongBreakCard(task: any, counts: BoardCounts, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task?.requiresUngrouping || typeof task.numberA !== 'number') return null;
  const required: Counts | undefined = task.requiredCounts;
  if (!required || boardValue(counts) !== task.numberA || sameCounts(counts, required)) return null;
  const b = breakOf({ ...task, correctAnswer: task.numberA });
  if (!b) return null;
  const above = LOW_TO_HIGH.slice(LOW_TO_HIGH.indexOf(b.broken) + 1);
  const wrongBlock = above.some((p) => (counts[p] ?? 0) < (required[p] ?? 0));
  const brokenTooMany = (counts[b.broken] ?? 0) < (required[b.broken] ?? 0);
  return wrongBlock || brokenTooMany ? ladder(ctx, 'extra_break', [['extra_break', extraBreakCard], ['extra_break_which', extraBreakWhichCard]]) : null;
}

/**
 * Station 7's 2,730 (owner, 4.10.2026): the exercise put 1 thousand, 16
 * hundreds and 13 tens on the board, to be grouped twice. The board is no
 * longer worth what it gave (blocks deleted or added, the board cleared), or
 * it shows the final blocks with the groupings not made (arranged by hand):
 * back to the given blocks. Two ways, one card each (cards round 3,
 * owner-approved): B1 the undo button, B2 the trash and the toolbox with the
 * instruction's own list.
 * - Served on any board that is not on the way (ctx.givenOnTheWay: the
 *   opening board, or it with exactly the groupings recorded so far — the
 *   accepted final board included). Without the store, the board alone: worth
 *   the given number and not the final blocks with a grouping pending.
 * - B1 only while undoing every step leads back to the opening board (the
 *   oldest undo frame is it: ctx.undoReachesStart); otherwise B2 at once.
 *   Never back from B2 to B1.
 * - B2 on an empty board: nothing to throw away, so its feedback skips the trash.
 * Not meeting 1's 26 units (s1StartChangedCard: its instruction hides the count).
 */
export function givenBlocksChangedCard(task: any, counts: BoardCounts | undefined, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task?.initialCounts || task.requiresGrouping || task.representationKind || typeof task.numberA !== 'number' || !counts) return null;
  if (meetingOfTaskId(task.id) === 1) return null;
  const onTheWay = typeof ctx.givenOnTheWay === 'boolean'
    ? ctx.givenOnTheWay
    : boardValue(counts) === task.numberA &&
      !(task.requiredCounts && sameCounts(counts, task.requiredCounts) && ctx.conversionDone === false);
  if (onTheWay) return null;
  const emptyBoard = boardValue(counts) === 0;
  const b2 = () => givenBlocksFromInstructionCard(emptyBoard);
  if (ctx.undoReachesStart === false || shownIn(ctx, 'restore_given_how')) {
    return inFamily(withKind(b2(), 'restore_given_how'), 'restore_given');
  }
  return ladder(ctx, 'restore_given', [['restore_given', givenBlocksRestoreCard], ['restore_given_how', b2]]);
}

/** B1 (frame 1): the board does not look as it did at the start — undo, step by step, until the button is grey. */
function givenBlocksRestoreCard(): SocraticHintResponse {
  return card(`${OPEN}בית המספרים לא נראה עכשיו כמו בתחילת התרגיל. מה עושים?`, 'procedural', 'tour-action-buttons', [
    ['מחזירים את הלבנים שהיו בתחילת התרגיל', 'נכון מאוד! לחצו שוב ושוב על כפתור ביטול הפעולה ↺, עד שהוא יהיה אפור. אחר כך המשיכו לפי ההנחיה.'],
    ['ממשיכים בתרגיל בלי להחזיר את הלבנים', 'רמז: אילו לבנים ההנחיה מתארת?'],
    ['כותבים מספר בשורת התוצאה', 'רמז: מה ההנחיה מבקשת לעשות עם הלבנים שהיו בתחילת התרגיל?'],
  ], 'restore_given', frame('restore_given', 1, 'הלבנים שהתרגיל נתן השתנו: מחזירים אותן בכפתור ביטול הפעולה, ורק אז מקבצים'));
}

/** B2 (frame 3): the instruction lists the given blocks — the trash (not on an empty board), then the toolbox. */
function givenBlocksFromInstructionCard(emptyBoard = false): SocraticHintResponse {
  return card(`${OPEN}ההנחיה מבקשת לקבץ את הלבנים שהיו בתחילת התרגיל. איך יודעים אילו לבנים היו?`, 'procedural', 'tour-task-card', [
    ['קוראים בהנחיה אילו לבנים היו', emptyBoard
      ? 'נכון מאוד! הוסיפו מארגז הכלים לבית המספרים את הלבנים שההנחיה מתארת.'
      : 'נכון מאוד! לחצו על פח האשפה. אחר כך הוסיפו מארגז הכלים לבית המספרים את הלבנים שההנחיה מתארת.'],
    ['אי אפשר לדעת', 'רמז: מה כתוב במשפט הראשון של ההנחיה?'],
    ['מנחשים אילו לבנים היו', 'רמז: איפה על המסך כתוב אילו לבנים היו בבית המספרים?'],
  ], 'restore_given_how', frame('restore_given_how', 3, 'ההנחיה מונה את הלבנים שהיו בהתחלה: מנקים את בית המספרים, מוסיפים אותן שוב מארגז הכלים ומקבצים'));
}

/**
 * Meeting 1's 26 (the exercise starts with 26 unit blocks) worth another
 * number now — blocks deleted or added (analysts' matrix S14; audit D8): is
 * it still the same number? Then back to the blocks it started with (the
 * undo button), before any "10 or more" card.
 */
export function s1StartChangedCard(task: any, counts: BoardCounts, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task?.requiresGrouping || !task.initialCounts || typeof task.numberA !== 'number') return null;
  if (boardValue(counts) === task.numberA) return null;
  return ladder(ctx, 'start_changed', [['same_number', sameNumberCard], ['restore_start', s1RestoreCard]]);
}

/**
 * Meeting 1's 26: the blocks it started with are changed — some deleted, some
 * added, or the result built by hand without grouping (analysts' matrix S14,
 * S15). Back to them first.
 */
function s1RestoreCard(): SocraticHintResponse {
  return card(`${OPEN}ההנחיה מבקשת לקבץ את הלבנים שהיו בהתחלה, אבל הן השתנו. מה עושים?`, 'procedural', 'tour-action-buttons', [
    ['מחזירים אותן בכפתור ביטול הפעולה ↺, ואז מקבצים', 'נכון מאוד! לחצו על כפתור ביטול הפעולה ↺ עד שהלבנים יחזרו להיות כמו בהתחלה. אחר כך קבצו כל 10 לבנים בכפתור "קבצו 10".'],
    ['כותבים את המספר שהלבנים מראות עכשיו', 'רמז: מה ההנחיה מבקשת לעשות עם הלבנים שהיו בתחילת התרגיל?'],
    ['לוחצים על פח האשפה', 'רמז: מה קורה ללבנים כשלוחצים על פח האשפה?'],
  ], 'restore_start', frame('s1_restore_start', 1, 'הלבנים שהתרגיל נתן השתנו: מחזירים אותן בכפתור ביטול הפעולה, ורק אז מקבצים'));
}

/** Meeting 1, 703 and 482 said in words, the second card: how many blocks go in each column. */
function s1WordsSecondCard(): SocraticHintResponse {
  return card(`${OPEN}איך יודעים כמה לבנים לשים בכל טור?`, 'conceptual', 'tour-place-value-board', [
    ['לפי המילים: כמה מאות, כמה עשרות וכמה יחידות יש במספר', 'נכון מאוד! בנו כל חלק של המספר בטור שלו.'],
    ['שמים בכל טור אותו מספר של לבנים', 'רמז: האם בכל חלק של המספר יש אותה כמות?'],
    ['שמים את כל הלבנים בטור אחד', 'רמז: האם לבנת מאה ולבנת יחידה שוות אותו דבר?'],
  ], 'build_from_words', frame('build_from_words', 1, 'המילים של המספר אומרות כמה לבנים בונים בכל טור'));
}

/** "ספרת היחידות", "ספרת העשרות", "ספרת המאות" — the Ministry's names, as stations 4 and 6 use them. */
const DIGIT_OF_HE: Record<Place, string> = { units: 'ספרת היחידות', tens: 'ספרת העשרות', hundreds: 'ספרת המאות', thousands: 'ספרת האלפים' };

/**
 * Meeting 1, 368 — the value of a digit, the second card (owner, 4.10.2026,
 * cards round 2, A): which digit of the written number the 6 is. Anchored in
 * the number, not in the blocks, so it is true for every board worth 368 —
 * since 4.10.2026 any such board is accepted (2 hundreds, 16 tens, 8 units
 * too), and "באיזה טור בניתם את הספרה 6" was not.
 */
function s1ValueSecondCard(task: any): SocraticHintResponse | null {
  const n: number = task.numberA;
  const v = typeof task.correctAnswer === 'number' ? task.correctAnswer : null;
  const p = v !== null ? LOW_TO_HIGH.find((x) => v === digit(n, x) * DIVISOR[x] && digit(n, x) > 0) : undefined;
  if (!p) return null;
  const d = digit(n, p);
  const N = formatNumberHe(n);
  const cols = places(n);
  if (cols.length !== 3) return null;
  const others = cols.filter((x) => x !== p);
  return card(`${OPEN}במספר ${N}, הספרה ${d} היא ${cols.map((x) => DIGIT_OF_HE[x]).join(', ').replace(/, ([^,]+)$/, ' או $1')}?`, 'conceptual', 'tour-place-value-board', [
    [DIGIT_OF_HE[p], `נכון מאוד! כמה שוות ${d} ${BLOCKS[p]} יחד?`],
    ...others.map((x): [string, string] => [DIGIT_OF_HE[x], `רמז: איזו ספרה במספר ${N} היא ${DIGIT_OF_HE[x]}?`]),
  ], 'digit_column', frame('digit_column', 1, 'ערך הספרה לפי מקומה במספר: כמה שוות הלבנים של הטור הזה יחד'));
}

/**
 * Meeting 1's situations beyond its own card (TASK_HINTS) and the live cards
 * (owner, 1.10.2026). Null: the exercise's own card (TASK_HINTS) is the fitting one.
 */
export function meeting1Card(task: any, counts: BoardCounts, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task || task.type === 'session1_intro') return null;
  const value = boardValue(counts);
  const level2 = shownIn(ctx, 's1_card');
  // The levels (2.10.2026, audit D5): every situation has its second card;
  // none names the column where the difficulty is, nor a count (owner, 29.9.2026).
  const writeBoxes = (target: number, op: 'group' | 'add' | 'sub' | 'words') =>
    ladder(ctx, 'write_boxes', [['write_boxes', () => s1WriteBoxesCard(target, op)], ['write_boxes_check', writeBoxesCheckCard]]);
  const stray = (second: () => SocraticHintResponse) => ladder(ctx, 'stray', [['stray', () => strayBlocksCard(null, true)], ['stray_which', second]]);
  if (task.type === 'representation') {
    const n = typeof task.numberA === 'number' ? task.numberA : null;
    const required: Counts | undefined = task.requiredCounts;
    if (n === null) return null;
    if (task.requiresUngrouping) {
      // 347: build 347, break one ten, write the number the blocks show.
      if (value === 0) return ladder(ctx, 'build_first', [['build_first', buildFirstCard], ['build_first_how', buildHowCard]]);
      if (required && sameCounts(counts, required)) {
        // Built by hand in its final form, nothing broken (audit D16).
        if (ctx.conversionDone === false) return conversionCard({ ...task, correctAnswer: n }, 'compose_break', ctx, counts);
        return shownIn(ctx, 's1_after_break') ? inFamily(regroupReadCard('s1_card', false, 'tens', 'units', true), 's1_after_break') : s1AfterBreakCard();
      }
      if (extraBreakOn({ ...task, correctAnswer: n }, counts)) return ladder(ctx, 'extra_break', [['extra_break', extraBreakCard], ['extra_break_which', extraBreakWhichCard]]);
      const wrongBreak = s1WrongBreakCard(task, counts, ctx);
      if (wrongBreak) return wrongBreak;
      if (value > n) return stray(strayWhichCard);
      if (level2 && (counts.tens ?? 0) > 0) return conversionCard({ ...task, correctAnswer: n }, 'compose_break', ctx, counts);
      return null;
    }
    if (task.requiresGrouping) {
      // 26 units grouped into tens: once grouped, what goes in each box — unless
      // the result was built by hand. Blocks deleted or added: is it the same
      // number? Then back to the blocks the exercise started with (audit D8).
      if (required && sameCounts(counts, required)) {
        return ctx.conversionDone === false
          ? ladder(ctx, 'start_changed', [['restore_start', s1RestoreCard], ['group_yourselves', s1GroupYourselvesCard]])
          : writeBoxes(n, 'group');
      }
      if (value !== n) return ladder(ctx, 'start_changed', [['same_number', sameNumberCard], ['restore_start', s1RestoreCard]]);
      return level2 ? s1GroupActionCard() : null;
    }
    // 703 and 482 said in words, built otherwise (analysts' matrix S10): the
    // exercise's own card would have the child write what the wrong board
    // shows. First how many blocks go in each column; then, for digits in the
    // wrong columns (730, 73; audit D9), which column each part belongs to —
    // naming no column. More blocks than the number, not a slip of columns:
    // the stray-blocks card.
    const words = task.correctAnswer === n;
    const wrongBuild = value > 0 && value !== n && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10);
    const digitsOf = (c: Counts) => LOW_TO_HIGH.map((p) => c[p] ?? 0).filter((x) => x > 0).sort((x, y) => x - y).join(',');
    const permuted = digitsOf(counts) === digitsOf(standardCounts(n));
    if (words && wrongBuild && (permuted || value < n)) {
      if (!level2) return { ...s1WordsSecondCard(), cardKind: 's1_card' };
      if (permuted) return inFamily(placeSlipCard(task, 'tens', counts, {}), 's1_card');
      return inFamily(compareWordsCard(), 's1_card');
    }
    if (value > n) return stray(s1WordsSecondCard);
    // 703 / 482 built another way, a column holding 10 or more (owner,
    // 4.10.2026: any build is right): how that board is read, from the first
    // card on. The exercise's own card says "write in each box how many
    // blocks its column holds" — on 6 hundreds, 10 tens and 3 units that is
    // 6, 10, 3. No other card fits this board, so the next one is this again.
    const crowded = LOW_TO_HIGH.find((p) => (counts[p] ?? 0) >= 10);
    if (words && value === n && crowded) {
      return inFamily(regroupReadCard('s1_card', false, next(crowded) ?? 'hundreds', crowded, true), 's1_card');
    }
    if (!level2) return null;
    if (typeof task.correctAnswer === 'number' && task.correctAnswer !== n) return s1ValueSecondCard(task);
    if (value === n && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) return writeBoxes(n, 'words');
    return s1WordsSecondCard();
  }
  const a = task.numberA;
  const b = task.numberB;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (!task.isSubtraction) {
    const ex = `${formatNumberHe(a)} + ${formatNumberHe(b)}`;
    if (value === 0) return ladder(ctx, 'build_first', [['build_first', buildFirstCard], ['build_both', () => addBuildCard(ex)]]);
    if (value === a + b && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) return writeBoxes(a + b, 'add');
    if (a !== b && (value === a || value === b)) {
      return ladder(ctx, 'one_number', [['one_number', () => oneNumberMissingCard(ex, a, b, value)], ['build_number', () => buildNumberCard(value === a ? b : a, 'add')]]);
    }
    return level2 ? addBuildCard(ex) : null;
  }
  // Subtraction (61 − 24, 806 − 351): the empty board and a short column have
  // their live cards (SocraticEngine.analyzeLiveBoardState).
  const ex = `${formatNumberHe(a)} − ${formatNumberHe(b)}`;
  if (value > a) {
    return [10, 100, 1000].includes(value - a)
      ? ladder(ctx, 'borrow_from_box', [['borrow_from_box', paletteBorrowCard], ['borrow_from_box_next', s1DeficitSecondCard]])
      : ladder(ctx, 'build_only_first', [['build_only_first', () => buildOnlyFirstCard(ex, a)], ['build_only_first_undo', () => undoToFirstCard(ex, a, b)]]);
  }
  if (value === a - b) return level2 ? writeBoxes(a - b, 'sub') : null;
  // The first number on the board — just after the break, too (audit D6: the
  // second card here sent the child to undo the right break): take it away
  // now. The exercise's own card first ("איך יודעים שסיימתם").
  if (value === a) return level2 ? ladder(ctx, 'take_away', [['take_away_how', () => takeAwayHowCard(b)]]) : null;
  // Too much taken away (audit D7) — no column named in meeting 1.
  const over = ctx.blocksRemoved === true && value <= a ? overTakenColumn(a, b, counts, ctx) : null;
  if (ctx.blocksRemoved === true && (value < a - b || over)) {
    return ladder(ctx, 'took_too_many', [['took_too_many', overRemovalCard], ['took_too_many_next', () => undoTakenCard(b)]]);
  }
  // Less than the first number with nothing taken away: it is not complete,
  // or the second number was built (analysts' matrix 5–6 #15).
  if (ctx.blocksRemoved === false) {
    return ladder(ctx, 'build_first_number', [['build_first_number', () => buildFirstNumberCard(ex, a, b)], ['build_number', () => buildNumberCard(a, 'sub')]]);
  }
  if (value > 0) return ladder(ctx, 'check_before_taking', [['check_before_taking', () => checkBeforeTakingCard(ex)], ['take_away_progress', () => takeAwayProgressCard(b)]]);
  return null;
}
