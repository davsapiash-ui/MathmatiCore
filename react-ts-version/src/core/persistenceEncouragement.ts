/**
 * The encouraging sentence a child reads at the end of a meeting, chosen by
 * that meeting's persistence index — and never the index itself.
 *
 * Owner decision, 27.9.2026 (register, approved deviation 24; decisions E1
 * and E2). The child never sees a number, a score, a ranking or a grade-like
 * word. The persistence index of PRD Module 16 §ב,
 *
 *     U ÷ (U + E + G) × 100
 *
 * (U = undo actions, E = wrong typed digits, G = wrong coaching-card choices),
 * is used here only to CHOOSE one of four sentences. The index itself is
 * computed and saved by the server from the telemetry and shown to the
 * teachers (meeting report, class report, research export).
 *
 * The counting is the server's own (functions/src/meetingMetrics.ts,
 * computePersistenceIndex): U counts UNDO_EXECUTED, E counts DIGIT_ENTERED
 * whose details.is_correct is exactly false, G counts SOCRATIC_OPTION_SELECTED
 * whose details.is_correct is exactly false — all of ONE meeting.
 *
 * Where the child meets it (E2): at the end of meetings 3 to 7, and in stage 3
 * of the reflection board of meeting 8. Meetings 1 (the sandbox) and 2 (the
 * diagnostic, deliberately without support) have no such sentence.
 */

/** The three counts of one meeting. */
export interface PersistenceCounts {
  /** U: undo actions (UNDO_EXECUTED). */
  undos: number;
  /** E: wrong typed digits (DIGIT_ENTERED, is_correct === false). */
  wrongDigits: number;
  /** G: wrong coaching-card choices (SOCRATIC_OPTION_SELECTED, is_correct === false). */
  wrongOptions: number;
}

export const EMPTY_PERSISTENCE_COUNTS: Readonly<PersistenceCounts> = Object.freeze({ undos: 0, wrongDigits: 0, wrongOptions: 0 });

/** The four sentences, word for word as the owner approved them (E1). */
export const ENCOURAGEMENT_SENTENCES_HE = {
  /** Rule 1: E + G ≤ 2 — almost no mistakes. */
  fewMistakes: 'כל הכבוד! פתרתם את התרגילים בריכוז ובדיוק, כמו מתמטיקאים אמיתיים. המשיכו לחקור ולאתגר את עצמכם!',
  /** Rule 2: index ≥ 67. */
  selfCorrecting: 'כל הכבוד! ראינו שחקרתם, ניסיתם ותיקנתם טעויות בעצמכם כמו מתמטיקאים אמיתיים! המשיכו להאמין בכוח שלכם!',
  /** Rule 3: 34 ≤ index ≤ 66. */
  persevering: 'כל הכבוד! ראינו שהתאמצתם ולא ויתרתם. גם מתמטיקאים אמיתיים עוצרים לפעמים, בודקים ומתקנים. המשיכו כך!',
  /** Rule 4: index < 34. */
  keepTrying: 'כל הכבוד שהתמדתם עד הסוף! כל טעות היא עוד צעד בדרך ללמידה. כשמשהו לא מסתדר, אפשר לעצור רגע, לבדוק ולנסות שוב. אנחנו מאמינים בכם!',
} as const;

export type EncouragementKey = keyof typeof ENCOURAGEMENT_SENTENCES_HE;

const count = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * The persistence index exactly as the server computes it: rounded to a whole
 * percent, and 100 when there was nothing to count.
 */
export function persistenceIndexPercent(c: PersistenceCounts): number {
  const u = count(c.undos);
  const denominator = u + count(c.wrongDigits) + count(c.wrongOptions);
  return denominator === 0 ? 100 : Math.round((u / denominator) * 100);
}

/** Which of the four sentences — the E1 rule, checked in this order. */
export function encouragementKey(c: PersistenceCounts): EncouragementKey {
  // 1. Almost no mistakes: at most two wrong digits and wrong card choices together.
  if (count(c.wrongDigits) + count(c.wrongOptions) <= 2) return 'fewMistakes';
  const index = persistenceIndexPercent(c);
  // 2. Most mistakes were met with an undo of their own.
  if (index >= 67) return 'selfCorrecting';
  // 3. About a third to two thirds.
  if (index >= 34) return 'persevering';
  // 4. Fewer than a third.
  return 'keepTrying';
}

/** The sentence itself, for one meeting's U, E and G. */
export function encouragementSentenceHe(c: PersistenceCounts): string {
  return ENCOURAGEMENT_SENTENCES_HE[encouragementKey(c)];
}

/**
 * The sentence split for stage 3 of meeting 8's reflection board: its first
 * exclamation ("כל הכבוד!", "כל הכבוד שהתמדתם עד הסוף!") as the heading, the
 * rest under it. Together they are the sentence word for word. (Kept out of
 * the screen's file for the fast-refresh lint rule, only-export-components.)
 */
export function splitEncouragement(sentence: string): { title: string; body: string } {
  const at = sentence.indexOf('!');
  if (at < 0) return { title: sentence, body: '' };
  return { title: sentence.slice(0, at + 1), body: sentence.slice(at + 1).trim() };
}

/**
 * E2: the meetings whose end carries one closing sentence and nothing else —
 * no board, no question, no number. Meeting 8 gets its sentence on stage 3 of
 * the reflection board instead; meetings 1 and 2 get none.
 */
export function hasClosingSentence(meeting: number): boolean {
  return Number.isInteger(meeting) && meeting >= 3 && meeting <= 7;
}

/** The part of a telemetry event this counting reads. */
export interface PersistenceEventLike {
  event_type: string;
  details?: unknown;
}

/** U, E, G or nothing — the server's classification of one event. */
export function persistenceEventKind(event: PersistenceEventLike): keyof PersistenceCounts | null {
  const isCorrect = (event.details as { is_correct?: unknown } | null | undefined)?.is_correct;
  if (event.event_type === 'UNDO_EXECUTED') return 'undos';
  if (event.event_type === 'DIGIT_ENTERED' && isCorrect === false) return 'wrongDigits';
  if (event.event_type === 'SOCRATIC_OPTION_SELECTED' && isCorrect === false) return 'wrongOptions';
  return null;
}

/** The counts after one more event (unchanged when the event is not counted). */
export function addPersistenceEvent(c: PersistenceCounts, event: PersistenceEventLike): PersistenceCounts {
  const kind = persistenceEventKind(event);
  return kind ? { ...c, [kind]: count(c[kind]) + 1 } : c;
}

/** "session_4_student_7" / "session_04_student_7" → 4; anything else → null. */
export function meetingOfSessionId(sessionId: unknown): number | null {
  const m = typeof sessionId === 'string' ? /^session_0*(\d+)_/.exec(sessionId) : null;
  return m ? Number(m[1]) : null;
}
