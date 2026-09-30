/**
 * How a count of blocks is said aloud (owner, 30.9.2026).
 *
 * לבנה is feminine, so the number before "לבני", "לבנת" or "לבנים" is said in
 * the feminine: "2 לבני מאה" is "שתי לבני מאה", "3" "שלוש", "8" "שמונה", "10"
 * "עשר", "12" "שתים-עשרה", "25" "עשרים וחמש"; "ו-4 לבני עשרת" is "וארבע לבני
 * עשרת". A voice left to itself reads a bare digit as it likes ("שתיים לבני
 * מאה", "שנים עשר"). The digits stay on the screen — only speech changes, like
 * the missing-digit boxes (missingDigitSpeech.ts). The read-aloud button speaks
 * through TTSService.cleanTextForSpeech, which calls this.
 *
 * Only a whole number from 2 to 99 standing alone before the word is said this
 * way. A number with a thousands comma, a number joined to another word ("450
 * מלבני", "ללבנת") and 1 ("לבנת מאה אחת" is written in words) stay as written.
 * A prefix letter joined by a hyphen is kept and glued to the words: "מ-10
 * לבני עשרת" is "מעשר לבני עשרת", "ל-12 לבני" "לשתים-עשרה לבני", and after a
 * "ו" too ("ומ-3" "ומשלוש").
 */

const ONES = ['', 'אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע'];
const TEENS = ['עשר', 'אחת-עשרה', 'שתים-עשרה', 'שלוש-עשרה', 'ארבע-עשרה', 'חמש-עשרה', 'שש-עשרה', 'שבע-עשרה', 'שמונה-עשרה', 'תשע-עשרה'];
const TENS = ['', '', 'עשרים', 'שלושים', 'ארבעים', 'חמישים', 'שישים', 'שבעים', 'שמונים', 'תשעים'];

/** 2–99 said before a feminine noun: "שתי" (not "שתיים"), "שלוש", …, "עשרים וחמש". Null outside 2–99. */
export function feminineCountHe(n: number): string | null {
  if (!Number.isInteger(n) || n < 2 || n > 99) return null;
  if (n === 2) return 'שתי';
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = TENS[Math.floor(n / 10)];
  const ones = n % 10;
  return ones === 0 ? tens : `${tens} ו${ONES[ones]}`;
}

/**
 * A number of one or two digits, alone (after the start, a space or a
 * bracket), optionally with a joined "ו-" or a prefix letter "מ-", "ל-", "ב-",
 * "ש-", "כ-" (after an optional "ו"), before the word לבני / לבנת / לבנים.
 */
const BLOCK_COUNT = /(^|[\s(])(ו-?|ו?[מלבשכ]-)?(\d{1,2})(\s+)(?=(?:לבני|לבנת|לבנים)(?:$|[\s.,!?:;)]))/g;

export function speakBlockCounts(text: string): string {
  return text.replace(BLOCK_COUNT, (whole: string, lead: string, prefix: string | undefined, digits: string, space: string) => {
    const words = feminineCountHe(Number(digits));
    return words ? `${lead}${(prefix ?? '').replace('-', '')}${words}${space}` : whole;
  });
}
