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

const digit = (n: number, p: Place) => Math.floor(n / DIVISOR[p]) % 10;
const next = (p: Place): Place | null => LOW_TO_HIGH[LOW_TO_HIGH.indexOf(p) + 1] ?? null;
const places = (n: number): Place[] => LOW_TO_HIGH.slice(0, Math.max(1, String(Math.abs(n)).length));

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
    const out: number[] = typeof a === 'number' && !onScreen(task, formatNumberHe(a)) ? [a] : [];
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

/**
 * Block counts written in words, as the cards and the instructions write
 * them: "3 אלפים ו-4 מאות", "4 מאות, 10 עשרות ו-6 יחידות", "מאה אחת ו-6 עשרות".
 * Each maximal run is one group. Used on the AI card: a group worth a secret
 * number gives it away as surely as its digits, and on a representation task
 * a group is an option's representation.
 */
const PART = /(\d[\d,]*)\s+(יחידות|עשרות|מאות|אלפים)|(יחידה אחת|עשרת אחת|מאה אחת|אלף אחד)/g;
const PART_PLACE: Record<string, Place> = {
  'יחידות': 'units', 'עשרות': 'tens', 'מאות': 'hundreds', 'אלפים': 'thousands',
  'יחידה אחת': 'units', 'עשרת אחת': 'tens', 'מאה אחת': 'hundreds', 'אלף אחד': 'thousands',
};
const JOIN = /^(\s*,\s*|\s+ו-?|\s*,\s*ו-?|\s+ועוד\s+)$/;
type Part = { place: Place; n: number };
function countRunsIn(text: string): Part[][] {
  const runs: Part[][] = [];
  let current: Part[] | null = null;
  let lastEnd = -1;
  const plain = stripDigitGroupSeparators(text);
  for (const m of plain.matchAll(PART)) {
    const part = { place: PART_PLACE[m[2] ?? m[3]], n: m[1] ? Number(m[1].replace(/,/g, '')) : 1 };
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

/**
 * On a representation task the instruction names the blocks: an AI card that
 * marks them wrong, or marks other blocks right, contradicts the screen
 * (owner, 28.9.2026, שהB.1: no path may mark the instruction's own
 * representation wrong). Only an option that IS a choice of blocks is read —
 * "משתמשים ב-34 מאות", "בונים את המספר ב-3 אלפים ו-4 מאות", and the same
 * in the first person, which the model may still write ("נשתמש…", "נבנה…") —
 * not a step ("פורטים מאה אחת ל-10 עשרות") or an action on the blocks
 * ("כותבים 3 מאות ו-4 עשרות בלי לבנות אותן").
 */
const REPRESENTATION_CHOICE = /^(נשתמש|משתמשים|נבנה|בונים|נייצג|מייצגים)(\s+אותו|\s+את(\s+המספר)?(\s+[\d,]+)?)?\s+ב-?(?=\d|יחידה|עשרת|מאה|אלף)/;
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
  for (const c of choices) {
    const chosen = chosenCounts(c.textHe);
    if (!chosen) continue;
    if (!c.isCorrect && sameCounts(chosen, required)) return true;
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
export type StaticCardKind =
  | 'compose_break' // C1
  | 'decompose' // C2
  | 'read_write_zero' // C3
  | 'place_cues' // C4
  | 'borrow_check' // C5
  | 'error_analysis' // C6
  | 'compose_group'; // C7

/** What the card chooser knows about the exercise so far, beyond the board. */
export interface StaticCardContext {
  /** The result row's place cues are on (useWorkspaceStore.placeCuesShown; stations 3–7, owner 30.9.2026). */
  placeCuesShown?: boolean;
  /** Cards already shown in this exercise. */
  shownKinds?: readonly StaticCardKind[];
}

const shownIn = (ctx: StaticCardContext, kind: StaticCardKind) => (ctx.shownKinds ?? []).includes(kind);

function card(
  questionHe: string,
  intent: 'procedural' | 'conceptual',
  highlight: string,
  choices: [string, string][],
  cardKind?: StaticCardKind,
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
  addOrTakeOut: 'רמז: בחיסור, מוסיפים לבנים לבית המספרים או מוציאים ממנו?',
  secondNumber: 'רמז: בחיסור, מוסיפים את המספר השני או מוציאים אותו?',
} as const;

/** "רמז: 10 לבני יחידה שוות לאיזו לבנה?" — for 10 or more blocks left in one column. */
export const tenBlocksHint = (p: Place) => `רמז: 10 ${BLOCKS[p]} שוות לאיזו לבנה?`;

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

/**
 * Vertical addition, both numbers on the screen. With blocks on the screen
 * (meetings 3–7) the board decides between two cards: all the blocks of both
 * numbers are there and grouped (board value = a + b, nothing to group — the
 * live card speaks while a column holds 10 or more), or the exercise's first
 * conversion column. The second card's advice is true in every board state:
 * the "קבצו 10" button only appears once a column holds 10 blocks.
 */
function additionCard(a: number, b: number, blocks: boolean, counts?: BoardCounts): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} + ${formatNumberHe(b)}`;
  if (blocks && counts && boardValue(counts) === a + b && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) {
    return card(`${OPEN}בתרגיל ${ex}, כל הלבנים כבר בבית המספרים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
      ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
      ['מוסיפים עוד לבנים', 'רמז: האם חסרות עוד לבנים בבית המספרים?'],
      ['מקבצים את היחידות לעשרת אחת', 'רמז: האם יש בטור היחידות 10 לבנים או יותר?'],
    ]);
  }
  const c = carryColumns(a, b)[0];
  const n = c ? next(c) : null;
  if (!c || !n) {
    return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחבר?`, 'procedural', HL('units'), [
      ['מטור היחידות, ואחר כך טור אחר טור שמאלה', blocks ? 'נכון מאוד! חברו את הלבנים בכל טור, והתחילו בטור היחידות.' : 'נכון מאוד! חברו את הספרות בכל טור, והתחילו בטור היחידות.'],
      ['מהטור השמאלי ביותר', HINT.startAdd],
      ['מחברים את כל הספרות יחד', 'רמז: האם מחברים יחידות עם עשרות?'],
    ]);
  }
  const it = MASC[n] ? 'אותו' : 'אותה';
  const question = `${OPEN}בתרגיל ${ex}, ב${COLUMN[c]} מצטברות 10 ${PLURAL[c]} או יותר. מה עושים איתן?`;
  if (blocks) {
    return card(question, 'procedural', HL(c), [
      [`מקבצים 10 ${PLURAL[c]} ל${ONE[n]} ומעבירים ${it} שמאלה ל${COLUMN[n]}`, `נכון מאוד! כשיש ב${COLUMN[c]} 10 לבנים או יותר, לחצו על הכפתור "קבצו 10" שבראש הטור.`],
      [`משאירים את כולן ב${COLUMN[c]}`, tenBlocksHint(c)],
      [`מוחקים את ה${PLURAL[c]} המיותרות`, HINT.deleteBlocks],
    ]);
  }
  return card(question, 'procedural', HL(c), [
    [`ממירים 10 ${PLURAL[c]} ל${ONE[n]}, ורושמים ${it} בעיגול הזיכרון שמעל ${COLUMN[n]}`, `נכון מאוד! רשמו 1 בעיגול הזיכרון שמעל ${COLUMN[n]}.`],
    [`כותבים את שתי הספרות בתיבת ה${PLURAL[c]}`, HINT.oneDigitPerBox],
    [`ממשיכים ל${COLUMN[n]} בלי לרשום דבר בעיגול הזיכרון`, `רמז: אם לא תרשמו דבר בעיגול הזיכרון, איך תזכרו לחבר עוד ${ONE[n]} ב${COLUMN[n]}?`],
  ]);
}

/**
 * The decomposition card: column `c` has `have` and must give `need`; the
 * blocks come from `m`, across the empty columns `zeros` (מסמך 03 §3.6 when
 * there are any, §3.5 otherwise).
 */
function borrowCard(ex: string, c: Place, have: number, need: number, zeros: Place[], m: Place, blocks: boolean): SocraticHintResponse {
  const n = next(c)!;
  const writeZero = `רמז: אם תכתבו 0, האם חיסרתם את כל מה שצריך לחסר ב${COLUMN[c]}?`;
  if (zeros.length > 0) {
    const below = LOW_TO_HIGH[LOW_TO_HIGH.indexOf(m) - 1];
    const where = zeros.length === 1 ? `ב${COLUMN[zeros[0]]} יש אפס` : `${zeros.map((z) => `ב${COLUMN[z]}`).join(' ו')} יש אפסים`;
    return card(`${OPEN}בתרגיל ${ex}, איך פורטים כש${where}?`, 'conceptual', HL(m), [
      blocks
        ? [`פורטים תחילה ${ONE[m]} ל${TEN_OF[below]} ב${COLUMN[below]}`, `נכון מאוד! לחצו על ${BLOCK[m]} כדי לפרוט אותה. אחר כך פורטים שוב, טור אחר טור, עד ${COLUMN[c]}.`]
        : [`פורטים תחילה ${ONE[m]} ל${TEN_OF[below]}, ורושמים את השינוי בעיגולי הזיכרון`, `נכון מאוד! אחר כך פורטים שוב, טור אחר טור, עד ${COLUMN[c]}.`],
      // What a decomposition gives: the next column, never straight into the one that is short.
      [zeros.length === 1 ? 'מדלגים על האפס וממשיכים לטור הבא' : 'מדלגים על האפסים וממשיכים לטור הבא', `רמז: כשפורטים ${ONE[m]}, מה מקבלים: ${TEN_OF[below]} או ${TEN_OF[c]}?`],
      blocks
        ? [`מוסיפים ${ONE[n]} ל${COLUMN[c]} בלי לפרוט`, HINT.addBlocks]
        : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, writeZero],
    ]);
  }
  const haveText = have === 0 ? `ב${COLUMN[c]} אין ${NONE[c]}` : `ב${COLUMN[c]} יש ${count(have, c)}`;
  return card(`${OPEN}בתרגיל ${ex}, ${haveText}, וצריך לחסר ${count(need, c)}. מה עושים?`, 'procedural', HL(n), [
    blocks
      ? [`פורטים ${ONE[n]} ל${TEN_OF[c]} ומעבירים אותן ל${COLUMN[c]}`, `נכון מאוד! לחצו על ${BLOCK[n]} כדי לפרוט אותה.`]
      : [`פורטים ${ONE[n]} ל${TEN_OF[c]}, ורושמים בעיגול הזיכרון שמעל ${COLUMN[n]} כמה ${PLURAL[n]} נשארו`, `נכון מאוד! עכשיו יש מספיק ${PLURAL[c]} כדי לחסר.`],
    [`מחסרים הפוך: ${need} פחות ${have}`, HINT.topOrBottom],
    blocks
      ? [`מוסיפים לבנים חדשות ל${COLUMN[c]}`, HINT.addBlocks]
      : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, writeZero],
  ]);
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
  ], 'borrow_check');
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

/**
 * Vertical subtraction, both numbers on the screen. Without blocks (meeting
 * 8) the card reads the exercise. With blocks it reads the board, because
 * the child does the decompositions there:
 *  - the first number is on the board (board value = a): the first column
 *    that still has fewer blocks than it must give, and where its blocks come
 *    from — across empty columns if need be; or, when every column has
 *    enough, "take away";
 *  - more than the first number on the board: in subtraction only the first
 *    number is built;
 *  - what is left after taking all of it away (board value = a − b): the
 *    result row;
 *  - anything else — the first number still being built, or taking away
 *    under way; the board alone cannot tell which — what to check before
 *    taking from a column, which is true in both.
 * The empty board has its own live card ("מה בונים קודם?").
 * With blocks, the first card of the exercise that would name the short
 * column is C5 (borrowCheckCard); the next one names it.
 */
function subtractionCard(a: number, b: number, blocks: boolean, counts: BoardCounts | undefined, ctx: StaticCardContext): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} − ${formatNumberHe(b)}`;
  const takeAway = countsPhrase(standardCounts(b));
  const value = counts ? boardValue(counts) : 0;
  const checkFirst = blocks && !shownIn(ctx, 'borrow_check');
  if (blocks && counts && value > 0) {
    if (value === a) {
      const c = LOW_TO_HIGH.find((p) => (counts[p] ?? 0) < digit(b, p));
      if (c) {
        const { zeros, m } = source(c, (p) => counts[p] ?? 0);
        if (m) return checkFirst ? borrowCheckCard() : borrowCard(ex, c, counts[c] ?? 0, digit(b, c), zeros, m, true);
      }
      // A column still short with nothing to its left to decompose (5,432
      // built as 54 hundreds: 0 thousands, 2 to take): "every column has
      // enough" would be false. The check before taking away is true.
      if (!c) return card(`${OPEN}בתרגיל ${ex}, בכל טור יש מספיק לבנים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
        [`מוציאים לפח האשפה ${takeAway}`, 'נכון מאוד! אחר כך כותבים בשורת התוצאה את מה שנשאר בבית המספרים.'],
        ['פורטים עוד לבנה', 'רמז: האם יש טור שאין בו מספיק לבנים?'],
        ['מוסיפים לבנים', HINT.addOrTakeOut],
      ]);
    }
    if (value > a) {
      return card(`${OPEN}בתרגיל ${ex}, בבית המספרים יש יותר מ-${formatNumberHe(a)}. מה בונים בחיסור?`, 'procedural', 'tour-place-value-board', [
        [`רק את המספר הראשון, ${formatNumberHe(a)}`, 'נכון מאוד! אחר כך מוציאים ממנו לפח את מה שמחסרים.'],
        ['את שני המספרים', HINT.secondNumber],
        ['רק את המספר השני', 'רמז: מאיזה מספר מחסרים?'],
      ]);
    }
    // The board holds a − b: after taking away, or — rarely — on the way to
    // building a (78 − 25 with 5 tens and 3 units while still building 78).
    // The question says "if", so it is true in both and does not tell the child
    // the board holds the result.
    if (value === a - b) {
      return card(`${OPEN}בתרגיל ${ex}, אם כבר הוצאתם לפח את כל מה שמחסרים, מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
        ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
        ['מוציאים עוד לבנים', 'רמז: כמה צריך להוציא בתרגיל הזה?'],
        ['מוסיפים לבנים', HINT.addOrTakeOut],
      ]);
    }
    return card(`${OPEN}בתרגיל ${ex}, מה בודקים לפני שמוציאים לבנים מטור?`, 'procedural', 'tour-place-value-board', [
      ['אם יש בטור מספיק לבנים להוציא', 'נכון מאוד! אם אין מספיק, פורטים לבנה מהטור שמשמאל.'],
      ['שום דבר, מוציאים מיד', 'רמז: מה יקרה אם בטור אין מספיק לבנים להוציא?'],
      ['מוסיפים לבנים חדשות לטור', HINT.addBlocks],
    ]);
  }
  const c = borrowColumns(a, b)[0];
  if (!c) {
    return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחסר?`, 'procedural', HL('units'), [
      ['מטור היחידות, ואחר כך טור אחר טור שמאלה', 'נכון מאוד! בכל טור מחסרים את הספרה התחתונה מהעליונה. מתחילים בטור היחידות.'],
      ['מהטור השמאלי ביותר', HINT.startSub],
      ['מחברים את שני המספרים', 'רמז: איזה סימן כתוב בין המספרים?'],
    ]);
  }
  if (checkFirst) return borrowCheckCard();
  const { zeros, m } = source(c, (p) => digit(a, p));
  return borrowCard(ex, c, digit(a, c), digit(b, c), zeros, m ?? next(c)!, blocks);
}

/** Skeleton exercise: digits of an operand hidden, or one result digit missing. */
function missingDigitsCard(task: any, blocks: boolean): SocraticHintResponse {
  const a: number = task.numberA;
  const b: number = task.numberB;
  const sub = Boolean(task.isSubtraction);
  const sign = sub ? '−' : '+';
  const result = sub ? a - b : a + b;
  const hiddenA: Place[] = task.hiddenDigits?.a ?? [];
  const hiddenB: Place[] = task.hiddenDigits?.b ?? [];
  const operandHidden = hiddenA.length + hiddenB.length > 0;
  const shown = operandHidden
    ? `${masked(a, hiddenA)} ${sign} ${masked(b, hiddenB)} = ${formatNumberHe(result)}`
    : `${formatNumberHe(a)} ${sign} ${formatNumberHe(b)}`;
  const missing = operandHidden ? hiddenA.length + hiddenB.length : places(result).length - (task.revealedResultDigits?.length ?? 0);
  return card(
    `${OPEN}בתרגיל ${shown}, איך מגלים את ${missing === 1 ? 'הספרה החסרה' : 'הספרות החסרות'}?`,
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
  );
}

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
  ]);
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
        `רמז: באיזה טור נמצאת הספרה ${standard[from]} במספר ${N}?`,
      ];
    }
  }
  if (ps.length >= 2 && standard[ps[0]] !== standard[ps[1]]) {
    const [p1, p2] = ps;
    const swapped: Counts = { ...standard, [p1]: standard[p2], [p2]: standard[p1] };
    return [
      `משתמשים ${withBe(countsPhrase(swapped))}`,
      `רמז: באיזה טור נמצאת הספרה ${standard[p1]} במספר ${N}?`,
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
  if (!onScreen(task, N) || !requiredPhrase || !onScreen(task, requiredPhrase)) {
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
  return card(`${OPEN}באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`, 'conceptual', 'tour-place-value-board', choices.slice(0, 3));
}

/** Two different representations of one number. */
function flexibleCard(task: any): SocraticHintResponse {
  const N = typeof task.numberA === 'number' ? formatNumberHe(task.numberA) : '';
  const what = N && onScreen(task, N) ? `את המספר ${N}` : 'את אותה כמות';
  return card(`${OPEN}איך מוצאים דרך נוספת לייצג ${what}?`, 'conceptual', 'tour-place-value-board', [
    ['פורטים לבנה אחת לעשר לבנים קטנות ממנה, או מקבצים עשר לבנים ללבנה אחת', 'נכון מאוד! כך הלבנים מסודרות אחרת, והכמות נשארת אותה כמות.'],
    ['מוסיפים לבנים חדשות', 'רמז: אם תוסיפו לבנים חדשות, האם הכמות תישאר אותה כמות?'],
    ['לכל מספר יש רק דרך אחת', 'רמז: פרטו לבנה אחת בבית המספרים. האם הכמות השתנתה?'],
  ]);
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
    [`בונים את ${W} בבית המספרים ובודקים מה יש בו חוץ ${fromP}`, 'נכון מאוד! את מה שנשאר כתבו בתיבת התשובה.'],
    ['מחברים את שני המספרים', `רמז: האם ${W} הוא המספר כולו או רק חלק ממנו?`],
    [`כותבים ${W} בתיבת התשובה`, 'רמז: מה מחפשים: את המספר כולו או את החלק החסר?'],
  ]);
}

/** "What changes if we change one digit?" — a closed question about two near exercises. */
function smallChangeCard(task: any): SocraticHintResponse {
  const sub = typeof task.givenHe === 'string' && task.givenHe.includes('−');
  return card(`${OPEN}איך מגלים מה ישתנה בתרגיל החדש?`, 'procedural', HL('units'), [
    ['פותרים את התרגיל החדש טור אחר טור, מטור היחידות, ומשווים לתרגיל הראשון', `נכון מאוד! בדקו בכל טור אם יש ${sub ? 'פריטה' : 'המרה'}.`],
    ['בודקים רק את הטור שבו הספרה השתנתה', 'רמז: האם שינוי בטור אחד יכול לשנות גם את הטור שמשמאלו?'],
    ['בוחרים תשובה בלי לפתור', 'רמז: איך תדעו שהתשובה נכונה בלי לפתור?'],
  ]);
}

// ─────────────────────────────────────────────────────────────
// The cards of 30.9.2026 (owner-approved; only the block names follow the
// task's path). The station-3 redesign takes the answer out of the
// instruction, and the instructions of stations 5–7 no longer say where to
// convert: the card is where help lives, and a wrong option gets a question.
// ─────────────────────────────────────────────────────────────

/** The station-3 task kinds (and the grouping proofs of station 7). */
export type RepresentationKind = 'read_write' | 'compose_break' | 'decompose' | 'compose_group';

/** Until every task carries `representationKind` (the station-3 redesign adds it). */
const KIND_BY_ID: Record<string, RepresentationKind> = {
  s3_r_t1: 'read_write', s3_r_t5: 'read_write', s3_g_t1: 'read_write', s3_g_t5: 'read_write',
  s3_r_reinforce_1: 'read_write', s3_g_reinforce_1: 'read_write',
  s3_r_t2: 'compose_break', s3_r_t4: 'compose_break', s3_r_t6: 'compose_break',
  s3_g_t2: 'compose_break', s3_g_t4: 'compose_break', s3_g_t6: 'compose_break',
  s3_r_t3: 'decompose', s3_g_t3: 'decompose', s3_r_reinforce_2: 'decompose', s3_g_reinforce_2: 'decompose',
  s7_r_t1: 'compose_group', s7_g_t1: 'compose_group',
};
const KINDS: RepresentationKind[] = ['read_write', 'compose_break', 'decompose', 'compose_group'];

export function representationKindOf(task: any): RepresentationKind | null {
  if (KINDS.includes(task?.representationKind)) return task.representationKind;
  return typeof task?.id === 'string' ? KIND_BY_ID[task.id] ?? null : null;
}

/** An empty column between two that hold blocks: 506, 6,030 — not 340. */
function hasEmptyColumnInside(n: number): boolean {
  const held = places(n).filter((p) => digit(n, p) > 0).map((p) => LOW_TO_HIGH.indexOf(p));
  if (held.length < 2) return false;
  return LOW_TO_HIGH.slice(held[0] + 1, held[held.length - 1]).some((p) => digit(n, p) === 0);
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
  const before = standardCounts(n);
  const broken = [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) < (before[p] ?? 0));
  const into = broken ? LOW_TO_HIGH[LOW_TO_HIGH.indexOf(broken) - 1] : undefined;
  if (!broken || !into) return null;
  return card(`${OPEN}לפני הפריטה בניתם מספר. האם הפריטה שינתה אותו?`, 'conceptual', 'tour-place-value-board', [
    ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', 'נכון מאוד! איזה מספר בניתם לפני הפריטה?'],
    ['כן. עכשיו יש יותר לבנים, ולכן המספר גדל', `רמז: מאיפה הגיעו ${BLOCKS_THE[into]} החדשות? האם הוספתם לבנים?`],
    [`כן. עכשיו יש פחות ${BLOCKS[broken]}, ולכן המספר קטן`, `רמז: מה קרה ל${BLOCK_THE[broken]}? מה קיבלתם במקומה?`],
  ], 'compose_break');
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
  ], 'decompose');
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
  ], 'read_write_zero');
}

/**
 * C7 — station 7, blocks built in one way and then grouped ("12 tens and 5
 * units", group 10 tens → 125; "25 hundreds", group twice → 2,500). The
 * grouping makes the highest column of the number from the one below it.
 */
function composeGroupCard(task: any): SocraticHintResponse | null {
  const n = numberWritten(task);
  const after: Counts | undefined = task.requiredCounts ?? (typeof n === 'number' ? standardCounts(n) : undefined);
  const made = after ? [...LOW_TO_HIGH].reverse().find((p) => (after[p] ?? 0) > 0) : undefined;
  const from = made ? LOW_TO_HIGH[LOW_TO_HIGH.indexOf(made) - 1] : undefined;
  if (!made || !from) return null;
  return card(`${OPEN}לפני ההקבצה בניתם מספר. האם ההקבצה שינתה אותו?`, 'conceptual', 'tour-place-value-board', [
    ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', 'נכון מאוד! איזה מספר בניתם לפני ההקבצה?'],
    ['כן. עכשיו יש פחות לבנים, ולכן המספר קטן', `רמז: מה קרה ל-10 ${BLOCKS_THE[from]}? מה קיבלתם במקומן?`],
    [`כן. עכשיו יש ${BLOCK[made]}, ולכן המספר גדל`, `רמז: מאיפה הגיעה ${BLOCK_THE[made]}? האם הוספתם לבנה?`],
  ], 'compose_group');
}

function kindCard(task: any, kind: RepresentationKind): SocraticHintResponse | null {
  switch (kind) {
    case 'read_write': return readWriteCard(task);
    case 'compose_break': return composeBreakCard(task);
    case 'decompose': return decomposeCard(task);
    case 'compose_group': return composeGroupCard(task);
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
  ], 'place_cues');
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
  ], 'error_analysis');
}

/**
 * The static card of a meeting 3–8 exercise, or null when the exercise has a
 * shape this module does not know (the caller then falls back further).
 * `ctx` is what the store knows beyond the board: the place cues, and the
 * cards already shown in this exercise (none, when it is not given).
 */
export function exerciseCard(task: any, counts?: BoardCounts, ctx: StaticCardContext = {}): SocraticHintResponse | null {
  if (!task) return null;
  const blocks = blocksOnScreen(meetingOfTaskId(task.id));
  const kind = representationKindOf(task);
  if (kind) {
    const byKind = kindCard(task, kind);
    if (byKind) return byKind;
    // A representation task of a known kind this module cannot read: the
    // card that marks no representation wrong (owner, 28.9.2026, שהB.1).
    if (task.type === 'representation') return whichNumberIsBuiltCard();
  }
  switch (task.type) {
    case 'representation':
      return typeof task.numberA === 'number' ? representationCard(task) : null;
    case 'flexible_decomp':
      return flexibleCard(task);
    case 'missing_element':
      return missingElementCard(task);
    case 'small_change':
      return smallChangeCard(task);
    case undefined:
    case 'vertical_addition':
    case 'addition_simple': {
      const a = task.numberA;
      const b = task.numberB;
      if (typeof a !== 'number' || typeof b !== 'number') return null;
      if (blocks && ctx.placeCuesShown && !shownIn(ctx, 'place_cues')) return placeCuesCard();
      if (blocks && isErrorAnalysis(task)) return errorAnalysisCard();
      const skeleton = Boolean(task.hiddenDigits?.a?.length || task.hiddenDigits?.b?.length || task.revealedResultDigits);
      if (skeleton) return missingDigitsCard(task, blocks);
      return task.isSubtraction ? subtractionCard(a, b, blocks, counts, ctx) : additionCard(a, b, blocks, counts);
    }
    default:
      return null;
  }
}
