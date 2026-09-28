/**
 * The one phone-number pattern of the functions package (PRD Module 3 §א,
 * Module 22 §ב.2, architecture principle 1: Zero-PII). scrubPII (teacher-admin
 * chat) and the research-export PII gate both use it.
 *
 * An Israeli number as people actually write it: a leading 0, or the country
 * code 972 / +972, then 8 or 9 more digits, with at most one separator between
 * two groups — a space, '-', '.', or parentheses:
 *   050-123-4567 · 050 123 4567 · 050.123.4567 · 0501234567 · (050) 1234567
 *   +972501234567 · +972 50 123 4567 · 972-50-1234567 · 02-1234567
 *
 * Both callers read text full of arithmetic — adult prose about exercises, and
 * research CSVs with numbers in every column — and a false positive destroys a
 * real message or blocks a real export. So a candidate counts only when it has
 * a phone's shape: its first group has at least two digits ("050", "02",
 * "972"), and its last group at least three ("4567", "1234567"). A decimal
 * ("0.12345678"), a date with a time ("05.10.2026 10:00") and a spaced counting
 * row ("0 1 2 3 4 5 6 7 8 9") fail that. Numbers with a thousands comma
 * ("7,651 − 3,381", "4,553") never start a match: the comma is not a separator
 * here, and a match cannot begin inside a number.
 */
const SPACE = String.raw`[    ]`;
const SEP = `(?:${SPACE}|[.\\-]|\\)${SPACE}?|${SPACE}?\\()`;

/** Global, so it serves String.replace directly; use the helpers below to test text. */
export const PHONE_NUMBER_PATTERN = new RegExp(
  // Not inside a number or an ASCII identifier (uids, document ids), and not
  // after a '+' — the match starts at the '+'. A Hebrew prefix letter may be
  // attached ("ל0501234567").
  String.raw`(?<![A-Za-z0-9_+])` +
    String.raw`(?:\+972|972|\(?0)` +
    // Lazy, so an 8-digit number followed by a stray group is still caught.
    `(?:${SEP}?\\d){8,9}?` +
    String.raw`(?![A-Za-z0-9_])`,
  "g"
);

/** The first digit group has at least two digits and the last at least three. */
function hasPhoneShape(candidate: string): boolean {
  const groups = candidate.split(/\D+/).filter(Boolean);
  return groups.length > 0 && groups[0].length >= 2 && groups[groups.length - 1].length >= 3;
}

/** Replaces every phone number in the text. */
export function redactPhoneNumbers(text: string, replacement = "[REDACTED_PHONE]"): string {
  if (!text) return text;
  return text.replace(PHONE_NUMBER_PATTERN, (m) => (hasPhoneShape(m) ? replacement : m));
}

/** Whether the text contains a phone number. */
export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;
  // A private copy: a shared global regex carries lastIndex between callers.
  const pattern = new RegExp(PHONE_NUMBER_PATTERN.source, PHONE_NUMBER_PATTERN.flags);
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (hasPhoneShape(m[0])) return true;
  }
  return false;
}
