/**
 * How a hidden digit is said aloud: one form for the vertical exercise's
 * screen-reader label and for the read-aloud button (TTSService).
 *
 * A skeleton exercise hides the digits the child has to find, and its
 * instruction writes each one as a box: "3▢6 + 271 = 657". Said aloud, a
 * number with a box is read digit by digit, each box as "ספרה חסרה", separated
 * by commas: "3, ספרה חסרה, 6". A thousands comma inside such a number is
 * dropped, since its digits are said one by one: "6,0▢▢" is
 * "6, 0, ספרה חסרה, ספרה חסרה". A number with no box, and every other word,
 * is left exactly as it is. Only speech uses this form; the screen keeps the
 * box. PRD Module 13 §א: the answer is never revealed.
 */

export const MISSING_DIGIT_BOX = '▢';
export const MISSING_DIGIT_HE = 'ספרה חסרה';

/** A written number: digits and boxes, with thousands commas between groups of three. */
const WRITTEN_NUMBER = /[0-9▢]+(?:,[0-9▢]{3})*/g;

export function speakMissingDigits(text: string): string {
  return text.replace(WRITTEN_NUMBER, (written) =>
    written.includes(MISSING_DIGIT_BOX)
      ? [...written.replace(/,/g, '')].map((c) => (c === MISSING_DIGIT_BOX ? MISSING_DIGIT_HE : c)).join(', ')
      : written
  );
}
