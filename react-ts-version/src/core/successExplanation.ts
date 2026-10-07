import { PLACE_ORDER, type Place, type PlaceCounts } from './placeValue';

/**
 * What the child reads after a correct answer, while the solved board stays on
 * the screen (owner, 7.10.2026): not only "נכון", but why — the trades the
 * child made, what the number house now holds, and that it is the number
 * written. "קיבצתם 10 יחידות לעשרת אחת. עכשיו בבית המספרים יש אלף אחד, 5 מאות,
 * 7 עשרות ו-3 יחידות, וזה בדיוק 1,573."
 *
 * Read from the board itself, so it can only say what is true there: when the
 * board does not hold the answer in its plain form (a column over nine, a
 * skeleton exercise solved by the number found, a choice question), the
 * exercise's own success sentence is used instead. A place inside the number
 * that holds nothing is named — "אין עשרות, ולכן כותבים 0 במקום העשרות" — the
 * zero as a placeholder (מסמך 03 §3.6).
 */

const ONE_HE: Record<Place, string> = {
  units: 'יחידה אחת',
  tens: 'עשרת אחת',
  hundreds: 'מאה אחת',
  thousands: 'אלף אחד',
};
const MANY_HE: Record<Place, string> = {
  units: 'יחידות',
  tens: 'עשרות',
  hundreds: 'מאות',
  thousands: 'אלפים',
};
const NEXT_UP: Partial<Record<Place, Place>> = { units: 'tens', tens: 'hundreds', hundreds: 'thousands' };
const NEXT_DOWN: Partial<Record<Place, Place>> = { tens: 'units', hundreds: 'tens', thousands: 'hundreds' };

export interface Trade {
  kind: 'group' | 'split';
  /** The column the trade started in: the ten that grouped, or the block that broke. */
  from: Place;
}

/** "5 מאות" / "מאה אחת". */
function amountHe(place: Place, n: number): string {
  return n === 1 ? ONE_HE[place] : `${n} ${MANY_HE[place]}`;
}

/** "א, ב ו-ג" — Hebrew list, with a hyphen before a digit after ו. */
function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const last = items[items.length - 1];
  const and = /^[0-9]/.test(last) ? `ו-${last}` : `ו${last}`;
  return `${items.slice(0, -1).join(', ')} ${and}`;
}

function writtenNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function valueOf(counts: PlaceCounts): number {
  return counts.units + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;
}

/**
 * The trades still in effect in this exercise, oldest first, read from the
 * undo stack: each regrouping frame holds the board before it, the next
 * frame (or the board now) the board after. A trade that was undone has left
 * the stack, so it is not told. A palette block that lands as ten lower
 * blocks took nothing from a column, so it is not a trade.
 */
export function tradesFromUndoStack(
  stack: ReadonlyArray<{ counts: PlaceCounts; actionType?: string | null }>,
  now: PlaceCounts
): Trade[] {
  const trades: Trade[] = [];
  stack.forEach((frame, i) => {
    if (frame.actionType !== 'REGROUPING_SUCCESS') return;
    const before = frame.counts;
    const after = stack[i + 1]?.counts ?? now;
    for (const place of PLACE_ORDER) {
      const d = after[place] - before[place];
      const up = NEXT_UP[place];
      const down = NEXT_DOWN[place];
      if (d === -10 && up && after[up] - before[up] === 1) trades.push({ kind: 'group', from: place });
      else if (d === -1 && down && after[down] - before[down] === 10) trades.push({ kind: 'split', from: place });
    }
  });
  return trades;
}

/** "קיבצתם 10 יחידות לעשרת אחת." / "פרטתם מאה אחת ל-10 עשרות." — one sentence per kind of trade. */
function tradeSentencesHe(trades: Trade[]): string[] {
  const seen = new Map<string, { trade: Trade; times: number }>();
  for (const t of trades) {
    const key = `${t.kind}:${t.from}`;
    const entry = seen.get(key);
    if (entry) entry.times += 1;
    else seen.set(key, { trade: t, times: 1 });
  }
  // More than two kinds of trade is a story, not a sentence: say only the board.
  if (seen.size > 2) return [];
  return [...seen.values()].map(({ trade, times }) => {
    if (trade.kind === 'group') {
      const up = NEXT_UP[trade.from] as Place;
      return times === 1
        ? `קיבצתם 10 ${MANY_HE[trade.from]} ל${ONE_HE[up]}.`
        : `קיבצתם ${times === 2 ? 'פעמיים' : `${times} פעמים`} 10 ${MANY_HE[trade.from]}, ובכל פעם קיבלתם ${ONE_HE[up]}.`;
    }
    const down = NEXT_DOWN[trade.from] as Place;
    return times === 1
      ? `פרטתם ${ONE_HE[trade.from]} ל-10 ${MANY_HE[down]}.`
      : `פרטתם ${times} ${MANY_HE[trade.from]}, כל ${trade.from === 'thousands' ? 'אחד' : 'אחת'} ל-10 ${MANY_HE[down]}.`;
  });
}

/**
 * The explanation, or `fallback` when the board does not show the answer in
 * its plain form. `answer` is the number the exercise asked for.
 */
export function successExplanationHe(input: {
  counts: PlaceCounts;
  answer: number | null;
  trades: Trade[];
  fallback: string;
}): string {
  const { counts, answer, trades, fallback } = input;
  if (answer === null || answer <= 0) return fallback;
  if (PLACE_ORDER.some((p) => counts[p] < 0 || counts[p] > 9)) return fallback;
  if (valueOf(counts) !== answer) return fallback;

  const highFirst = [...PLACE_ORDER].reverse();
  const top = highFirst.find((p) => counts[p] > 0) as Place;
  const shown = highFirst.filter((p) => counts[p] > 0).map((p) => amountHe(p, counts[p]));
  // Places inside the number (below its highest place) that hold nothing.
  const empty = PLACE_ORDER.filter((p) => PLACE_ORDER.indexOf(p) < PLACE_ORDER.indexOf(top) && counts[p] === 0).reverse();

  const sentences = tradeSentencesHe(trades);
  const board = `${sentences.length ? 'עכשיו ' : ''}בבית המספרים יש ${joinHe(shown)}, וזה בדיוק ${writtenNumber(answer)}.`;
  sentences.push(board);
  if (empty.length > 0) {
    const names = empty.map((p) => MANY_HE[p]);
    const where = empty.map((p) => `0 במקום ה${MANY_HE[p]}`);
    sentences.push(`אין ${joinHe(names)}, ולכן כותבים ${joinHe(where)}.`);
  }
  return sentences.join(' ');
}
