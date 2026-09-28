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
    return typeof a === 'number' && !onScreen(task, formatNumberHe(a)) ? [a] : [];
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

// ─────────────────────────────────────────────────────────────
// Cards
// ─────────────────────────────────────────────────────────────

const OPEN = 'בואו נחשוב רגע יחד: ';

function card(
  questionHe: string,
  intent: 'procedural' | 'conceptual',
  highlight: string,
  choices: [string, string][],
): SocraticHintResponse {
  return {
    pedagogical_intent: intent,
    error_category: intent,
    tts_text: questionHe,
    suggested_highlight: highlight,
    questionHe,
    choices: choices.map(([textHe, feedbackHe], i) => ({ id: `opt_${i + 1}`, textHe, feedbackHe, isCorrect: i === 0 })),
    correctChoiceId: 'opt_1',
  };
}

const HL = (p: Place) => `tour-column-${p}`;
const ONE_DIGIT_PER_BOX = 'רמז: בכל תיבה בשורת התוצאה כותבים ספרה אחת בלבד, מ-0 עד 9.';

export type BoardCounts = Record<Place, number>;
const boardValue = (c: BoardCounts) => LOW_TO_HIGH.reduce((sum, p) => sum + (c[p] ?? 0) * DIVISOR[p], 0);

/**
 * Vertical addition, both numbers on the screen. With blocks on the screen
 * (meetings 3–7) the board decides between two cards: all the blocks of both
 * numbers are there and grouped (board value = a + b, nothing to group — the
 * live card speaks while a column holds 10 or more), or the exercise's first
 * conversion column. The second card's advice is true in every board state:
 * the "הקבץ 10" button only appears once a column holds 10 blocks.
 */
function additionCard(a: number, b: number, blocks: boolean, counts?: BoardCounts): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} + ${formatNumberHe(b)}`;
  if (blocks && counts && boardValue(counts) === a + b && LOW_TO_HIGH.every((p) => (counts[p] ?? 0) < 10)) {
    return card(`${OPEN}בתרגיל ${ex}, כל הלבנים כבר בבית המספרים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
      ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
      ['מוסיפים עוד לבנים', 'רמז: כל הלבנים של שני המספרים כבר בבית המספרים.'],
      ['מקבצים את טור היחידות', 'רמז: מקבצים רק כשיש בטור 10 לבנים או יותר.'],
    ]);
  }
  const c = carryColumns(a, b)[0];
  const n = c ? next(c) : null;
  if (!c || !n) {
    return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחבר?`, 'procedural', HL('units'), [
      ['מטור היחידות, ואחר כך טור אחר טור שמאלה', blocks ? 'נכון מאוד! חברו את הלבנים בכל טור, והתחילו בטור היחידות.' : 'נכון מאוד! חברו את הספרות בכל טור, והתחילו בטור היחידות.'],
      ['מהטור השמאלי ביותר', 'רמז: בחיבור במאונך מתחילים בטור היחידות, בצד ימין.'],
      ['מחברים את כל הספרות יחד', 'רמז: מחברים כל טור לחוד: יחידות עם יחידות, עשרות עם עשרות.'],
    ]);
  }
  const it = MASC[n] ? 'אותו' : 'אותה';
  const question = `${OPEN}בתרגיל ${ex}, ב${COLUMN[c]} מצטברות 10 ${PLURAL[c]} או יותר. מה עושים איתן?`;
  if (blocks) {
    return card(question, 'procedural', HL(c), [
      [`מקבצים 10 ${PLURAL[c]} ל${ONE[n]} ומעבירים ${it} שמאלה ל${COLUMN[n]}`, `נכון מאוד! כשיש ב${COLUMN[c]} 10 לבנים או יותר, לחצו על כפתור הקבץ 10 שבראש הטור.`],
      [`משאירים את כולן ב${COLUMN[c]}`, 'רמז: בסוף החיבור יש בכל טור 9 לבנים לכל היותר. 10 לבנים הופכות ללבנה אחת בטור שמשמאל.'],
      [`מוחקים את ה${PLURAL[c]} המיותרות`, 'רמז: מחיקת לבנים משנה את המספר. שומרים על כל הלבנים.'],
    ]);
  }
  return card(question, 'procedural', HL(c), [
    [`ממירים 10 ${PLURAL[c]} ל${ONE[n]}, ורושמים ${it} בעיגול הזיכרון שמעל ${COLUMN[n]}`, `נכון מאוד! רשמו 1 בעיגול הזיכרון שמעל ${COLUMN[n]}.`],
    [`כותבים את שתי הספרות בתיבת ה${PLURAL[c]}`, ONE_DIGIT_PER_BOX],
    [`ממשיכים ל${COLUMN[n]} בלי לרשום דבר בעיגול הזיכרון`, `רמז: 10 ${PLURAL[c]} הן ${ONE[n]}. רושמים ${it} בעיגול הזיכרון, כדי לחבר ${it} ב${COLUMN[n]}.`],
  ]);
}

/**
 * The decomposition card: column `c` has `have` and must give `need`; the
 * blocks come from `m`, across the empty columns `zeros` (מסמך 03 §3.6 when
 * there are any, §3.5 otherwise).
 */
function borrowCard(ex: string, c: Place, have: number, need: number, zeros: Place[], m: Place, blocks: boolean): SocraticHintResponse {
  const n = next(c)!;
  if (zeros.length > 0) {
    const below = LOW_TO_HIGH[LOW_TO_HIGH.indexOf(m) - 1];
    const where = zeros.length === 1 ? `ב${COLUMN[zeros[0]]} יש אפס` : `${zeros.map((z) => `ב${COLUMN[z]}`).join(' ו')} יש אפסים`;
    return card(`${OPEN}בתרגיל ${ex}, איך פורטים כש${where}?`, 'conceptual', HL(m), [
      blocks
        ? [`פורטים תחילה ${ONE[m]} ל${TEN_OF[below]} ב${COLUMN[below]}`, `מצוין! לחצו על ${BLOCK[m]} כדי לפרוט אותה. אחר כך פורטים שוב, טור אחר טור, עד ${COLUMN[c]}.`]
        : [`פורטים תחילה ${ONE[m]} ל${TEN_OF[below]}, ורושמים את השינוי בעיגולי הזיכרון`, `מצוין! אחר כך פורטים שוב, טור אחר טור, עד ${COLUMN[c]}.`],
      ['מדלגים על האפס וממשיכים לטור הבא', 'רמז: ספרת האפס היא שומר מקום חשוב. בואו נתחשב בה בחישוב.'],
      blocks
        ? [`מוסיפים ${ONE[n]} ל${COLUMN[c]} בלי לפרוט`, 'רמז: בואו נשמור על ערך המספר המקורי תמיד.']
        : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, `רמז: לא מדלגים. פורטים ${ONE[m]}, ואחר כך ממשיכים לפרוט טור אחר טור עד ${COLUMN[c]}.`],
    ]);
  }
  const haveText = have === 0 ? `ב${COLUMN[c]} אין ${NONE[c]}` : `ב${COLUMN[c]} יש ${count(have, c)}`;
  return card(`${OPEN}בתרגיל ${ex}, ${haveText}, וצריך לחסר ${count(need, c)}. מה עושים?`, 'procedural', HL(n), [
    blocks
      ? [`פורטים ${ONE[n]} ל${TEN_OF[c]} ומעבירים אותן ל${COLUMN[c]}`, `נכון מאוד! לחצו על ${BLOCK[n]} כדי לפרוט אותה.`]
      : [`פורטים ${ONE[n]} ל${TEN_OF[c]}, ורושמים בעיגול הזיכרון שמעל ${COLUMN[n]} כמה ${PLURAL[n]} נשארו`, `נכון מאוד! עכשיו יש מספיק ${PLURAL[c]} כדי לחסר.`],
    [`מחסרים הפוך: ${need} פחות ${have}`, 'רמז: בכל טור מחסרים את הספרה התחתונה מהספרה העליונה. לא מחליפים את הסדר.'],
    blocks
      ? [`מוסיפים לבנים חדשות ל${COLUMN[c]}`, 'רמז: לבנים חדשות משנות את המספר. פורטים לבנה מהטור שמשמאל.']
      : [`כותבים 0 בתיבת ה${PLURAL[c]} וממשיכים`, `רמז: לא מדלגים. פורטים ${ONE[n]}, ואז יש מספיק ${PLURAL[c]}.`],
  ]);
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
 */
function subtractionCard(a: number, b: number, blocks: boolean, counts?: BoardCounts): SocraticHintResponse {
  const ex = `${formatNumberHe(a)} − ${formatNumberHe(b)}`;
  const takeAway = countsPhrase(standardCounts(b));
  const value = counts ? boardValue(counts) : 0;
  if (blocks && counts && value > 0) {
    if (value === a) {
      const c = LOW_TO_HIGH.find((p) => (counts[p] ?? 0) < digit(b, p));
      if (c) {
        const { zeros, m } = source(c, (p) => counts[p] ?? 0);
        if (m) return borrowCard(ex, c, counts[c] ?? 0, digit(b, c), zeros, m, true);
      }
      return card(`${OPEN}בתרגיל ${ex}, בכל טור יש מספיק לבנים. מה עושים עכשיו?`, 'procedural', 'tour-place-value-board', [
        [`מוציאים לפח האשפה ${takeAway}`, 'נכון מאוד! אחר כך כותבים בשורת התוצאה את מה שנשאר בבית המספרים.'],
        ['פורטים עוד לבנה', 'רמז: פורטים רק כשאין בטור מספיק לבנים.'],
        ['מוסיפים לבנים', 'רמז: בחיסור מוציאים מבית המספרים ולא מוסיפים.'],
      ]);
    }
    if (value > a) {
      return card(`${OPEN}בתרגיל ${ex}, בבית המספרים יש יותר מ-${formatNumberHe(a)}. מה בונים בחיסור?`, 'procedural', 'tour-place-value-board', [
        [`רק את המספר הראשון, ${formatNumberHe(a)}`, 'נכון מאוד! אחר כך מוציאים ממנו לפח את מה שמחסרים.'],
        ['את שני המספרים', 'רמז: בחיסור לא בונים את שני המספרים. בונים את הראשון ומוציאים ממנו את השני.'],
        ['רק את המספר השני', 'רמז: בונים את המספר שמחסרים ממנו: המספר הראשון.'],
      ]);
    }
    if (value === a - b) {
      return card(`${OPEN}בתרגיל ${ex}, מה עושים אחרי שמוציאים את כל מה שמחסרים?`, 'procedural', 'tour-place-value-board', [
        ['כותבים בכל תיבה בשורת התוצאה את מספר הלבנים שבטור שלה', 'נכון מאוד! התחילו בטור היחידות.'],
        ['מוציאים עוד לבנים', 'רמז: מוציאים רק את מה שמחסרים.'],
        ['מוסיפים לבנים', 'רמז: בחיסור לא מוסיפים לבנים.'],
      ]);
    }
    return card(`${OPEN}בתרגיל ${ex}, מה בודקים לפני שמוציאים לבנים מטור?`, 'procedural', 'tour-place-value-board', [
      ['אם יש בטור מספיק לבנים להוציא', 'נכון מאוד! אם אין מספיק, פורטים לבנה מהטור שמשמאל.'],
      ['שום דבר, מוציאים מיד', 'רמז: אם אין בטור מספיק לבנים, קודם פורטים לבנה מהטור שמשמאל.'],
      ['מוסיפים לבנים חדשות לטור', 'רמז: בחיסור לא מוסיפים לבנים. פורטים לבנה מהטור שמשמאל.'],
    ]);
  }
  const c = borrowColumns(a, b)[0];
  if (!c) {
    return card(`${OPEN}בתרגיל ${ex}, מאיזה טור מתחילים לחסר?`, 'procedural', HL('units'), [
      ['מטור היחידות, ואחר כך טור אחר טור שמאלה', 'נכון מאוד! בכל טור מחסרים את הספרה התחתונה מהעליונה. מתחילים בטור היחידות.'],
      ['מהטור השמאלי ביותר', 'רמז: בחיסור במאונך מתחילים בטור היחידות, בצד ימין.'],
      ['מחברים את שני המספרים', 'רמז: זה תרגיל חיסור. בדקו את הסימן שבין המספרים.'],
    ]);
  }
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
    `${OPEN}בתרגיל ${shown}, איך נגלה את ${missing === 1 ? 'הספרה החסרה' : 'הספרות החסרות'}?`,
    'procedural',
    blocks ? 'tour-place-value-board' : HL('units'),
    [
      [
        'נבדוק טור אחר טור, מטור היחידות, איזו ספרה משלימה את התרגיל',
        `מדויק! ${blocks ? 'בדקו בלבנים בבית המספרים' : 'שימו לב לעיגולי הזיכרון'}, וכתבו ${missing === 1 ? 'את הספרה בתיבה הריקה' : 'את הספרות בתיבות הריקות'}.`,
      ],
      [missing === 1 ? 'ננחש ספרה ונכתוב אותה בתיבה' : 'ננחש ספרות ונכתוב אותן בתיבות', blocks ? 'רמז: בואו נשתמש בבית המספרים כדי להוכיח את התשובה.' : 'רמז: הימנעו מניחושים. פתרו את התרגיל בצורה מסודרת, טור אחר טור.'],
      ['נתחיל מהטור השמאלי', sub ? 'רמז: מתחילים בטור היחידות, כדי לדעת אם צריך לפרוט מהטור שמשמאלו.' : 'רמז: מתחילים בטור היחידות, כדי לדעת אם יש המרה לטור שמשמאלו.'],
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
    ['מסתכלים על הספרה שליד שם כל טור', 'נכון מאוד! כתבו כל ספרה בשורת התוצאה, בתיבה של הטור שלה.'],
    ['סופרים את כל הלבנים יחד', 'רמז: לבנת מאה שווה יותר מלבנת יחידה. סופרים כל טור לחוד.'],
    ['מנחשים מספר', 'רמז: אין צורך לנחש. בית המספרים עוזר לכם לבדוק.'],
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
        `נשתמש ${withBe(countsPhrase(moved))}`,
        `רמז: במספר ${N} הספרה ${standard[from]} היא ספרת ה${PLURAL[from]}, ו${COLUMN[empty]} נשאר ריק.`,
      ];
    }
  }
  if (ps.length >= 2 && standard[ps[0]] !== standard[ps[1]]) {
    const [p1, p2] = ps;
    const swapped: Counts = { ...standard, [p1]: standard[p2], [p2]: standard[p1] };
    return [
      `נשתמש ${withBe(countsPhrase(swapped))}`,
      `רמז: במספר ${N} הספרה ${standard[p1]} היא ספרת ה${PLURAL[p1]}, והספרה ${standard[p2]} היא ספרת ה${PLURAL[p2]}.`,
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
  const choices: [string, string][] = [[`נשתמש ${withBe(requiredPhrase)}`, 'נכון מאוד! בנו את זה בבית המספרים.']];
  if (!isStandard) {
    choices.push([`נשתמש ${withBe(countsPhrase(standard))}`, `רמז: גם זה ${N}, בדרך הרגילה. ההנחיה מבקשת דרך אחרת. קראו אותה שוב.`]);
  } else {
    const slip = placeValueSlip(task, n, standard);
    if (slip) choices.push(slip);
  }
  if (!sameCounts(required, { units: n })) {
    choices.push([`נשתמש ב-${N} יחידות`, `רמז: גם זה ${N}, אבל ההנחיה מבקשת לבנות אותו בטורים אחרים.`]);
  }
  if (choices.length < 3) {
    choices.push(['נכתוב את המספר בלי לבנות אותו', 'רמז: קודם בונים בבית המספרים, ורק אחר כך כותבים בשורת התוצאה.']);
  }
  return card(`${OPEN}באילו לבנים ההנחיה מבקשת לבנות את המספר ${N}?`, 'conceptual', 'tour-place-value-board', choices.slice(0, 3));
}

/** Two different representations of one number. */
function flexibleCard(task: any): SocraticHintResponse {
  const N = typeof task.numberA === 'number' ? formatNumberHe(task.numberA) : '';
  const what = N && onScreen(task, N) ? `את המספר ${N}` : 'את אותה כמות';
  return card(`${OPEN}איך מוצאים דרך נוספת לייצג ${what}?`, 'conceptual', 'tour-place-value-board', [
    ['פורטים לבנה אחת לעשר לבנים קטנות ממנה, או מקבצים עשר לבנים ללבנה אחת', 'נכון מאוד! כך הלבנים מסודרות אחרת, והכמות נשארת אותה כמות.'],
    ['מוסיפים לבנים חדשות', 'רמז: לבנים חדשות משנות את הכמות.'],
    ['לכל מספר יש רק דרך אחת', 'רמז: אפשר לפרוט לבנה אחת לעשר לבנים קטנות. נסו!'],
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
  return card(`${OPEN}איך נגלה מה יש במספר ${W} חוץ ${fromP}?`, 'conceptual', 'tour-place-value-board', [
    [`נבנה את ${W} בבית המספרים ונבדוק מה יש בו חוץ ${fromP}`, 'נכון מאוד! את מה שנשאר כתבו בתיבת התשובה.'],
    ['נחבר את שני המספרים', `רמז: ${W} הוא המספר כולו. מחפשים רק את החלק החסר.`],
    [`נכתוב ${W} בתיבת התשובה`, `רמז: ${W} הוא המספר כולו. התשובה היא רק החלק החסר.`],
  ]);
}

/** "What changes if we change one digit?" — a closed question about two near exercises. */
function smallChangeCard(task: any): SocraticHintResponse {
  const sub = typeof task.givenHe === 'string' && task.givenHe.includes('−');
  return card(`${OPEN}איך נגלה מה ישתנה בתרגיל החדש?`, 'procedural', HL('units'), [
    ['נפתור את התרגיל החדש טור אחר טור, מטור היחידות, ונשווה לתרגיל הראשון', `נכון מאוד! בדקו בכל טור אם יש ${sub ? 'פריטה' : 'המרה'}.`],
    ['נבדוק רק את הטור שבו הספרה השתנתה', 'רמז: שינוי בטור אחד יכול לשנות גם את הטור שמשמאלו. בדקו את כל הטורים.'],
    ['נבחר תשובה בלי לפתור', 'רמז: הימנעו מניחושים. פתרו את התרגיל החדש בעצמכם.'],
  ]);
}

/**
 * The static card of a meeting 3–8 exercise, or null when the exercise has a
 * shape this module does not know (the caller then falls back further).
 */
export function exerciseCard(task: any, counts?: BoardCounts): SocraticHintResponse | null {
  if (!task) return null;
  const blocks = blocksOnScreen(meetingOfTaskId(task.id));
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
      const skeleton = Boolean(task.hiddenDigits?.a?.length || task.hiddenDigits?.b?.length || task.revealedResultDigits);
      if (skeleton) return missingDigitsCard(task, blocks);
      return task.isSubtraction ? subtractionCard(a, b, blocks, counts) : additionCard(a, b, blocks, counts);
    }
    default:
      return null;
  }
}
