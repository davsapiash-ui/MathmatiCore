/**
 * The client's one phone-number rule (PRD Module 22 §ב.1, Module 3 §א,
 * architecture invariant 1: Zero-PII). The same rule as the server's
 * `functions/src/phonePattern.ts`; a test compares the two on the same cases,
 * so a change to one without the other fails.
 *
 * An Israeli number as people actually write it: a leading 0, or the country
 * code 972 / +972, then 8 or 9 more digits, with at most one separator between
 * two groups — a space, '-', '.', or parentheses:
 *   050-123-4567 · 050 123 4567 · 050.123.4567 · 0501234567 · (050) 1234567
 *   +972501234567 · +972 50 123 4567 · 972-50-1234567 · 02-1234567
 *
 * The chat of a third-grader is full of arithmetic, and a false positive blocks
 * a real question to the teacher. So a candidate counts only when it has a
 * phone's shape: its first group has at least two digits ("050", "02", "972"),
 * and its last group at least three ("4567", "1234567"). A decimal
 * ("0.12345678"), a date with a time ("05.10.2026 10:00") and a spaced counting
 * row ("0 1 2 3 4 5 6 7 8 9") fail that. Numbers with a thousands comma
 * ("7,651 − 3,381", "1,245 ועוד 328") never start a match: the comma is not a
 * separator here, and a match cannot begin inside a number.
 *
 * One difference in form from the server copy, none in meaning: the server
 * says "not inside a number" with a lookbehind. Safari before 16.4 cannot parse
 * a lookbehind, and this module loads with the whole client, so here the
 * preceding character is matched as an optional prefix group and put back.
 */
const SPACE = String.raw`[    ]`;
const SEP = `(?:${SPACE}|[.\\-]|\\)${SPACE}?|${SPACE}?\\()`;

/**
 * Group 1: the character before the number (kept on replace) — not a digit,
 * an ASCII identifier character or '+'; the match starts at the '+'. A Hebrew
 * prefix letter may be attached ("ל0501234567").
 * Group 2: the number.
 */
const PHONE_SOURCE =
  String.raw`(^|[^A-Za-z0-9_+])` +
  String.raw`(` +
  String.raw`(?:\+972|972|\(?0)` +
  // Lazy, so an 8-digit number followed by a stray group is still caught.
  `(?:${SEP}?\\d){8,9}?` +
  String.raw`)(?![A-Za-z0-9_])`;

function freshPattern(): RegExp {
  // A private copy per call: a shared global regex carries lastIndex between callers.
  return new RegExp(PHONE_SOURCE, 'g');
}

/** The first digit group has at least two digits and the last at least three. */
function hasPhoneShape(candidate: string): boolean {
  const groups = candidate.split(/\D+/).filter(Boolean);
  return groups.length > 0 && groups[0].length >= 2 && groups[groups.length - 1].length >= 3;
}

/** Replaces every phone number in the text. */
export function redactPhoneNumbers(text: string, replacement = '[PHONE_REDACTED]'): string {
  if (!text) return text;
  return text.replace(freshPattern(), (whole, before: string, phone: string) =>
    hasPhoneShape(phone) ? `${before}${replacement}` : whole
  );
}

/** Whether the text contains a phone number. */
export function containsPhoneNumber(text: string): boolean {
  if (!text) return false;
  const pattern = freshPattern();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (hasPhoneShape(m[2])) return true;
  }
  return false;
}
