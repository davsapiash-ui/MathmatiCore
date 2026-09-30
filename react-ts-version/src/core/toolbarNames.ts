/**
 * What the learner's toolbar calls its buttons — one place, so the button, its
 * announced name and every sentence that tells the child which button to press
 * cannot drift apart.
 *
 * Owner, 28.9.2026: the child's screens address the class in the plural or in
 * neutral words, never in the masculine singular (register decision ט). The
 * three toolbar texts that were still singular masculine — the proceed button
 * "התקדם", the logout button "התנתק" and the badge "תלמיד 12" — now read:
 *  - "ממשיכים": the same form as "מתחילים" on the station opening screens;
 *  - "יציאה": a word a third-grader knows, the name of the action (like
 *    "הקראה בקול" and "ביטול הפעולה האחרונה");
 *  - "מספר 12": the login screen calls it "המספר שלי בכיתה".
 * Owner, 28.9.2026, later: the badge reads "מספר תלמיד: 12" — a label (the
 * learner's number), not the child addressed in the masculine singular. Only
 * the number changes, 1–12, with the learner who signed in.
 */
export const PROCEED_HE = 'ממשיכים';

export const LOGOUT_HE = 'יציאה';
export const LOGOUT_ARIA_HE = 'יציאה מהמערכת';
export const LOGGING_OUT_HE = 'יוצאים…';

/** The learner's anonymous badge (PRD Module 1: an id 1–12, no name). */
export function studentBadgeHe(studentNumber: number | string): string {
  return `מספר תלמיד: ${studentNumber}`;
}

/**
 * The sentence that tells the child to press the proceed button, in two halves
 * around the button's name: the screen draws the name as a small copy of the
 * button, the read-aloud button reads the whole sentence.
 */
export const PROCEED_SENTENCE_HE = {
  before: 'לחצו על הכפתור',
  after: 'בסרגל העליון כדי לעבור לשלב הבא!',
} as const;

/** The sentence as read aloud: the button's name in quotes, as in every other sentence that names it. */
export const proceedSentenceHe = (): string =>
  `${PROCEED_SENTENCE_HE.before} "${PROCEED_HE}" ${PROCEED_SENTENCE_HE.after}`;
