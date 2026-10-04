/**
 * How a sentence that holds an exercise is laid out on a right-to-left screen.
 *
 * An exercise written inside a Hebrew sentence ("בתרגיל 4▢2 − 128 = 314 חסרה…")
 * is a run of numbers and signs. Left to the browser's bidi algorithm in an RTL
 * paragraph, the signs and the boxes take the paragraph's direction, so the
 * child read "314=128−2▢4" and "▢3▢,2" instead of the exercise's numbers
 * (student-journey audit 4.10.2026, A6-101). Each exercise is therefore isolated
 * left to right; everything else — the Hebrew, a lone plain number, the comma
 * or period after the exercise — stays in the sentence's own direction.
 *
 * The written number is the one the read-aloud uses (core/missingDigitSpeech.ts,
 * WRITTEN_NUMBER): digits and boxes, with thousands commas between groups of
 * three. A trailing ", " is not a thousands comma, so it stays outside.
 */

/** A written number: digits and boxes, with thousands commas between groups of three. */
export const WRITTEN_NUMBER_SOURCE = '[0-9▢]+(?:,[0-9▢]{3})*';

/** Written numbers joined by the signs an exercise uses. */
const EXPRESSION = new RegExp(`${WRITTEN_NUMBER_SOURCE}(?:\\s*[+−=×]\\s*${WRITTEN_NUMBER_SOURCE})*`, 'g');

export type MathTextPart = { text: string; ltr: boolean };

/** Splits a sentence into plain runs and left-to-right exercise runs. Joining the parts gives the text back. */
export function mathTextParts(text: string): MathTextPart[] {
  const parts: MathTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(EXPRESSION)) {
    const match = m[0];
    // A lone plain number already reads correctly; only an exercise or a box is isolated.
    if (!/[+−=×▢]/.test(match)) continue;
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), ltr: false });
    parts.push({ text: match, ltr: true });
    last = start + match.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), ltr: false });
  return parts;
}
