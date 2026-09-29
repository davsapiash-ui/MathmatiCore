import { functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption } from "@/types";
import type { TelemetryEventType, TelemetryPayload } from "@/types/telemetry";
import { normalizeStudentId } from "@/application/useChatStore";
import { digitAt, type Place } from "@/core/placeValue";
import { researchErrorCategory } from "./socraticResearchCategory";
import { exerciseCard, whichNumberIsBuiltCard, meetingOfTaskId, blocksOnScreen, secretNumbersOf, revealsSecret, formatNumberHe, stripDigitGroupSeparators, revealsSecretInCounts, contradictsRequiredRepresentation } from "./staticSocraticCards";

export type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption };

/**
 * Wire payload of callGeminiSocraticProxy — the Module 13 §ב contract, and
 * nothing else. The free-text fields (prompt/context/history) were removed
 * together with the server path that read them: forwarding caller prose to
 * the model is the open-ended chat Module 13 forbids.
 */
export interface SocraticProxyPayload {
  socratic_request?: GeminiSocraticRequest;
  anchor?: { questionHe: string; pedagogical_intent?: string; choices: { id: string; textHe: string; isCorrect?: boolean }[] };
}

async function ready(): Promise<void> {
  await authReady;
}

export interface SocraticChoice {
  id: string;
  textHe: string;
  isCorrect?: boolean;
  hint?: string;
  feedbackHe?: string;
}

export interface SocraticHintResponse {
  pedagogical_intent?: "conceptual" | "procedural" | "focus";
  error_category?: 'calculation' | 'procedural' | 'conceptual' | null;
  tts_text?: string;
  suggested_highlight?: string | null;
  questionHe: string;
  choices: SocraticChoice[];
  correctChoiceId?: string;
}

export function normalizeTaskIdForHints(id?: string): string {
  if (!id) return '';
  // Normalize e.g. s3_g_t1 or s3_r_t1 -> s3_t1
  return id.replace(/^(s\d+)_[gr]_t(\d+)$/, '$1_t$2');
}

/**
 * PRD Module 13 (חוק ברזל — השילוש הפדגוגי ההוליסטי): a guiding question may not
 * float free of the exercise. מסמך 03 writes one card per session, so when that
 * card is the only thing left to serve, name the exercise inside its question.
 */
export function groundCardInExercise(card: SocraticHintResponse, currentTask?: any): SocraticHintResponse {
  const a = currentTask?.numberA;
  const b = currentTask?.numberB;
  let context: string | null = null;
  if (typeof a === 'number' && typeof b === 'number') {
    context = `בתרגיל ${a.toLocaleString('he-IL')} ${currentTask?.isSubtraction ? 'פחות' : 'ועוד'} ${b.toLocaleString('he-IL')}`;
  } else if (typeof a === 'number') {
    context = `בתרגיל על המספר ${a.toLocaleString('he-IL')}`;
  }
  if (!context) return card;
  // "נסו לחשוב: בתרגיל 61 פחות 24, אין מספיק יחידות…", not two
  // colons in a row ("בתרגיל 61 פחות 24: נסו לחשוב: …").
  const OPENING = 'נסו לחשוב: ';
  const grounded = (text: string) =>
    text.startsWith(OPENING) ? `${OPENING}${context}, ${text.slice(OPENING.length)}` : `${context}: ${text}`;
  return {
    ...card,
    questionHe: grounded(card.questionHe),
    tts_text: card.tts_text ? grounded(card.tts_text) : card.tts_text,
  };
}

/**
 * Static-card keys for a session 3–8 exercise id (compulsory or early-finisher):
 * the path-specific card first (`s4_r_card`), then the session card (`s4_card`).
 * מסמך 03 writes one Socratic card per session, so every exercise of a session
 * shares it; only session 3 differs by path (34 tens vs 34 hundreds).
 */
export function sessionCardKeysForTaskId(id?: string): string[] {
  const m = id ? /^s([3-8])_(?:([gr])_)?(?:t\d+|reinforce_\d+|challenge_\d+)$/.exec(id) : null;
  if (!m) return [];
  const [, session, path] = m;
  return path ? [`s${session}_${path}_card`, `s${session}_card`] : [`s${session}_card`];
}

/** Ceiling on how long a learner waits for an AI hint before the static one is served (Module 13 §4). */
export const SOCRATIC_PROXY_TIMEOUT_MS = 8000;

export type SocraticTriggerReasonWire =
  | 'hesitation_45s'
  | 'consecutive_errors_4'
  | 'consecutive_undos_3'
  | 'conversion_not_performed'
  | 'repeated_errors';

/**
 * Pillar 3 of PRD Module 13's triad — what the platform has MONITORED about
 * the learner's steps on this exercise. The store fills it from live state
 * (useWorkspaceStore.fetchSocraticHint); the engine turns it into the
 * student_progress_state of the GeminiSocraticRequest so the model reasons
 * over facts instead of a prose summary of them.
 */
export interface SocraticMonitoringSnapshot {
  studentId?: number | string;
  sessionNumber?: number;
  triggerReason?: SocraticTriggerReasonWire | null;
  consecutiveErrors?: number;
  consecutiveUndos?: number;
  hesitationSeconds?: number;
  /** Memory-circle (carry) digits per place, as typed. */
  memoryCircles?: Partial<Record<string, string | number>>;
  /** Result-row digits per place, as typed. */
  answerDigits?: Partial<Record<string, string>>;
  /** Effective operands (ASD-adjusted) so completed columns are judged against what is on screen. */
  operands?: { a: number; b: number; isSubtraction: boolean } | null;
  activeColumnIndex?: number;
  hasRegroupedInCanvas?: boolean;
  recentEvents?: TelemetryPayload<TelemetryEventType>[];
}

const WIRE_COLUMNS: Place[] = ['units', 'tens', 'hundreds', 'thousands'];

/** Terminology PRD Module 13 forbids in anything a learner reads; mirrored from functions/src/socraticContract.ts. */
const FORBIDDEN_TERMS_HE = [
  'שבירה', 'לשבור', 'שוברים', 'נשבור',
  'הלוואה', 'ללוות', 'לווים', 'נלווה', 'להלוות',
  'נשיאה', 'נושאים', 'לשאת',
  'אבקוס', 'חשבונייה', 'מקלות', 'חרוזים', 'אצבעות', 'מטבעות', 'גפרורים', 'קשיות',
  // One name per component (owner, 27.9.2026, register ט).
  'קובי', 'בלוק', 'לוח הדינס', 'לוח הלבנים', 'קנבס',
];

/**
 * Client-side copy of the server's two hard content rules (defence in depth —
 * the proxy already enforces them, but a card is shown to a child, so the
 * client refuses to render a leaked answer or a forbidden term even if a
 * stale or third-party server let one through).
 */
export function socraticTextViolation(
  texts: string[],
  operands?: { a: number; b: number; isSubtraction: boolean } | null
): string | null {
  for (const t of texts) {
    for (const term of FORBIDDEN_TERMS_HE) if (t.includes(term)) return `forbidden term: ${term}`;
  }
  if (operands) {
    const answer = operands.isSubtraction ? operands.a - operands.b : operands.a + operands.b;
    const exempt = answer === 10 || answer === 100 || answer === 1000 || answer === operands.a || answer === operands.b;
    if (!exempt) {
      const re = new RegExp(`(^|[^0-9])${answer}(?![0-9])`);
      // "1,573" and "1 573" are 1573 to the child (stripDigitGroupSeparators).
      if (texts.some((t) => re.test(stripDigitGroupSeparators(t)))) return 'final answer leaked';
    }
  }
  return null;
}

/**
 * Words for aids that meeting 8 does not put on the screen (PRD Module 14 §ב:
 * no blocks and no board in meetings 2 and 8). A card that names them points
 * the child at something that is not there (Module 13 §א). Mirrored on the
 * server (functions/src/socraticContract.ts).
 */
const WORD = (w: string) => new RegExp(`(^|[^א-ת])[ובלמהשכ]{0,4}(${w})(?![א-ת])`);
export const ABSENT_AIDS_MEETING_8_HE: RegExp[] = [
  WORD('לבנה|לבנים|לבנת|לבני'), // not "לבנות" (to build)
  WORD('פח'), // not "לפחות"
  WORD('מחסן'),
  WORD('לוח'), // not "לוחצים"
  WORD('קבץ'), // the button "קבץ 10 לעשרת"
  WORD('דינס'),
  /קובי/,
  /בית המספרים/,
];

export function absentAidViolation(texts: string[], sessionNumber?: number | null): string | null {
  if (sessionNumber !== 8) return null;
  for (const raw of texts) {
    // מסמך 03's own meeting-8 question names the blocks to say they are gone
    // (its "לבני דינס" is "לבנים" on the screen: owner, 28.9.2026, register ט).
    const t = raw.replace(/אין לכם לבנים על המסך/g, '');
    for (const re of ABSENT_AIDS_MEETING_8_HE) if (re.test(t)) return `aid not on screen: ${re.source}`;
  }
  return null;
}

/** Exercises that are neither an addition nor a subtraction: no exercise_context goes to the model. */
export const NON_ARITHMETIC_TYPES = ['representation', 'flexible_decomp', 'missing_element'];

/** Same operation inference analyzeLiveBoardState uses, so the AI and the static engine never disagree on the sign. */
export function inferIsSubtraction(task: any, targetNode?: string): boolean {
  if (!task) return targetNode === 'subtraction_regrouping';
  // A bank exercise says what it is. Guessing from the instruction read
  // "חסרות שתי ספרות" (missing digits) and "החלק החסר" as a subtraction and
  // coached "build the first number, take the second away" on additions.
  if (typeof task.isSubtraction === 'boolean') return task.isSubtraction;
  if (['vertical_addition', 'addition_simple', 'representation', 'flexible_decomp', 'missing_element', 'small_change', 'session1_intro'].includes(task.type)) return false;
  return Boolean(task.isSubtraction) ||
    task.requiresUngrouping === true ||
    targetNode === 'subtraction_regrouping' ||
    (typeof task.instructionHe === 'string' && (task.instructionHe.includes('חסר') || task.instructionHe.includes('הפחת'))) ||
    (typeof task.exercise === 'string' && task.exercise.includes('-'));
}

/** Columns whose typed result digit already matches the exercise — "what is solved" in pillar 3. */
export function completedColumnsFrom(
  answerDigits: Partial<Record<string, string>> | undefined,
  operands: { a: number; b: number; isSubtraction: boolean } | null | undefined
): Place[] {
  if (!answerDigits || !operands) return [];
  const target = operands.isSubtraction ? operands.a - operands.b : operands.a + operands.b;
  return WIRE_COLUMNS.filter((place) => {
    const typed = answerDigits[place];
    if (typed === undefined || typed === '') return false;
    return parseInt(typed, 10) === digitAt(target, place);
  });
}

function toWireMemoryCircles(raw?: Partial<Record<string, string | number>>): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 9) out[k] = n;
  }
  return out;
}

/** Minimal PRD-schema telemetry events synthesised from the store's counters when no buffer is available. */
function synthesiseRecentEvents(
  m: SocraticMonitoringSnapshot,
  sessionId: string,
  studentId: number,
  exerciseId: string
): TelemetryPayload<TelemetryEventType>[] {
  if (m.recentEvents && m.recentEvents.length > 0) return m.recentEvents.slice(-30);
  const col = m.activeColumnIndex ?? 0;
  const now = Date.now();
  const events: TelemetryPayload<TelemetryEventType>[] = [];
  if ((m.hesitationSeconds ?? 0) >= 45) {
    events.push({ session_id: sessionId, student_id: studentId, exercise_id: exerciseId, event_type: 'HESITATION_DETECTED', column_index: col, timestamp: now, details: { hesitation_seconds: m.hesitationSeconds } } as any);
  }
  for (let i = 0; i < Math.min(m.consecutiveUndos ?? 0, 5); i++) {
    events.push({ session_id: sessionId, student_id: studentId, exercise_id: exerciseId, event_type: 'UNDO_EXECUTED', column_index: col, timestamp: now, details: { undo_stack_depth_before: i + 1, reverted_event_type: 'DIGIT_ENTERED' } } as any);
  }
  for (let i = 0; i < Math.min(m.consecutiveErrors ?? 0, 5); i++) {
    events.push({ session_id: sessionId, student_id: studentId, exercise_id: exerciseId, event_type: 'DIGIT_ENTERED', column_index: col, timestamp: now, details: { digit_value: 0, is_correct: false } } as any);
  }
  return events;
}

// ─────────────────────────────────────────────────────────────
// TASK-LEVEL SOCRATIC HINT MAP
// Each entry is keyed by task ID (exact match from sessionTasks.ts).
// The hints must address ONLY what is pedagogically required in that task.
// ─────────────────────────────────────────────────────────────
/** "יחידה אחת", not "1 יחידות". */
const unitsHe = (n: number) => (n === 1 ? 'יחידה אחת' : `${n} יחידות`);
/** "עשרת אחת", not "1 עשרות". */
const tensHe = (n: number) => (n === 1 ? 'עשרת אחת' : `${n} עשרות`);
/** "מאה אחת", not "1 מאות". */
const hundredsHe = (n: number) => (n === 1 ? 'מאה אחת' : `${n} מאות`);
/**
 * What a column holds, as the exercise card says it ("בטור העשרות יש 2 עשרות"):
 * the column by name, and "אין אף עשרת" rather than "יש לנו 0 עשרות".
 */
const inUnitsHe = (n: number) => (n === 0 ? 'בטור היחידות אין אף יחידה' : `בטור היחידות יש ${unitsHe(n)}`);
const inTensHe = (n: number) => (n === 0 ? 'בטור העשרות אין אף עשרת' : `בטור העשרות יש ${tensHe(n)}`);
const inHundredsHe = (n: number) => (n === 0 ? 'בטור המאות אין אף מאה' : `בטור המאות יש ${hundredsHe(n)}`);

/**
 * Station 1 (meeting 1): nothing on the screen or read aloud gives the child
 * the answer, a block count he must find himself, or where the difficulty is
 * (owner, 29.9.2026). The live cards of the other meetings name the column
 * and its count; in meeting 1 they ask instead, and the highlight is the
 * whole board rather than the column.
 */
const MEETING1_CROWDED_QUESTION = 'באחד הטורים יש 10 לבנים או יותר. מה עושים?';
function meeting1CrowdedCard(): SocraticHintResponse {
  return {
    pedagogical_intent: "procedural",
    tts_text: MEETING1_CROWDED_QUESTION,
    suggested_highlight: "tour-place-value-board",
    questionHe: MEETING1_CROWDED_QUESTION,
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו", isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.' },
      { id: "opt_2", textHe: "מוחקים 10 לבנים לפח בלי להוסיף לבנה", isCorrect: false, feedbackHe: "רמז: מחיקת לבנים לפח משנה את ערך המספר. מקבצים במקום למחוק. אפשר להשתמש בכפתור ביטול פעולה ↺." },
      { id: "opt_3", textHe: "מעבירים לבנה אחת בלבד לטור שמשמאלו", isCorrect: false, feedbackHe: "רמז: לבנה אחת שווה ל-10 לבנים של הטור שמימינה. אפשר להשתמש בכפתור ביטול פעולה ↺." }
    ],
    correctChoiceId: "opt_1"
  };
}

/**
 * Meeting 1's subtraction-shortage card: the child finds the column himself.
 * `lacking` is every column whose blocks are fewer than the digit taken from
 * it, lowest first; the first is the one to fix. With more than one, the
 * question says where to start, so exactly one option is right.
 */
const DEFICIT_PLACES = ['units', 'tens', 'hundreds'] as const;
type DeficitPlace = typeof DEFICIT_PLACES[number];
const IN_COLUMN_HE: Record<DeficitPlace, string> = { units: 'בטור היחידות', tens: 'בטור העשרות', hundreds: 'בטור המאות' };
function meeting1DeficitCard(lacking: DeficitPlace[]): SocraticHintResponse {
  const question = lacking.length > 1
    ? 'בודקים מטור היחידות שמאלה: באיזה טור אין מספיק לבנים כדי להחסיר?'
    : 'באיזה טור אין מספיק לבנים כדי להחסיר?';
  const choices = DEFICIT_PLACES.map((p, i) => {
    const isCorrect = p === lacking[0];
    return {
      id: `opt_${i + 1}`,
      textHe: IN_COLUMN_HE[p],
      isCorrect,
      feedbackHe: isCorrect
        ? "נכון מאוד! לחצו על לבנה בטור שמשמאל לו כדי לפרוט אותה ל-10 לבנים."
        : lacking.includes(p)
          ? "רמז: מתחילים מטור היחידות. בדקו טור שנמצא מימין לו."
          : "רמז: בטור הזה יש מספיק לבנים. בדקו בכל טור אם יש בו מספיק לבנים כדי להחסיר.",
    };
  });
  return {
    pedagogical_intent: "procedural",
    tts_text: question,
    suggested_highlight: "tour-place-value-board",
    questionHe: question,
    choices,
    correctChoiceId: choices.find((c) => c.isCorrect)!.id,
  };
}

export const TASK_HINTS: Record<string, SocraticHintResponse> = {

  // ── Session 1 — ארגז החול המונחה (מסמך 03 §3.1) ────────────────
  // The tool steps (session1_intro) never open a card: "התקדם" stays
  // disabled until the step is done, so no wrong answer is ever checked, and
  // the 45-second hesitation card is off for them (StudentWorkspacePage).
  // The sandbox entry is the one safety net that was there before.

  // Steps 1–2: free dragging, the digits follow the blocks.
  's1_sandbox_controlled': {
    pedagogical_intent: "procedural",
    tts_text: 'הסתכלו ברשימה "מה עושים בשלב הזה". מה עוד נשאר לעשות כדי לעבור לשלב הבא?',
    suggested_highlight: "tour-place-value-board",
    questionHe: 'הסתכלו ברשימה "מה עושים בשלב הזה". מה עוד נשאר לעשות כדי לעבור לשלב הבא?',
    choices: [
      { id: "1", textHe: "לגרור עוד לבנים לטורים ולצפות בספרות בבית המספרים", isCorrect: true, feedbackHe: "בדיוק! כל לבנה שגוררים משנה את הספרה בטור שלה." },
      { id: "2", textHe: "לקבץ 10 עשרות ולהמיר אותן למאה אחת", isCorrect: false, feedbackHe: "זה נכון מבחינה מתמטית, אבל כרגע מכירים את הכלים ולא פותרים תרגיל." },
      { id: "3", textHe: "לכתוב מספר בשורת התוצאה", isCorrect: false, feedbackHe: "במשימה הזו לא כותבים. גוררים לבנים ומסתכלים על בית המספרים." }
    ],
    correctChoiceId: "1"
  },

  // Step 6, the target task (347 → 3 hundreds, 3 tens, 17 units): the card מסמך 03 §3.1 writes for meeting 1, meaning
  // unchanged, in the words of the screen (28.9.2026): "פורטים" as the task says "פרטו" (not "מפרקים"), "בית המספרים" for
  // the board (not "הלוח"), no formal "אנו"; the pieces are "לבנים" (owner, 27.9.2026; register ט).
  // The task asks "which number do the blocks show after the decomposition?"; the document's hints answered it
  // ("שומרת על ערך הכמות הכולל", "הכמות המתמטית נשמרת תמיד"). Now they send the child to the columns and the ten block
  // without saying what happens to the number (owner's instruction, 28.9.2026: change only the wording, so it no longer
  // gives the answer). "פורטים עשרת" takes no "לטור…": one decomposes a ten, into units (owner, 28.9.2026).
  's1_target_347': {
    pedagogical_intent: "conceptual",
    tts_text: "נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?",
    suggested_highlight: "tour-column-tens",
    questionHe: "נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?",
    choices: [
      { id: "opt_1", textHe: "מקבלים עשר יחידות שנוספות לטור היחידות", isCorrect: true, feedbackHe: "נכון מאוד! לחצו על לבנת עשרת, וראו את היחידות שנוספות לטור היחידות." },
      { id: "opt_2", textHe: "בית המספרים נשאר בלי שינוי", isCorrect: false, feedbackHe: "רמז: הפריטה משנה את בית המספרים. בדקו מה קורה בטור העשרות ובטור היחידות." },
      { id: "opt_3", textHe: "העשרת נמחקת מבית המספרים", isCorrect: false, feedbackHe: "רמז: בפריטה לא מוחקים לבנים. בדקו מה קורה ללבנת העשרת." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 2 (owner, 29.9.2026): 368, the value of
  // the 6. Names neither 60 nor "עשרות": the child finds the place himself.
  's1_r_value368': {
    pedagogical_intent: "conceptual",
    tts_text: "איך יודעים מה הערך של ספרה במספר?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך יודעים מה הערך של ספרה במספר?",
    choices: [
      { id: "opt_1", textHe: "בודקים באיזה טור היא נמצאת", isCorrect: true, feedbackHe: "נכון מאוד! בדקו בבית המספרים כמה שווה כל לבנה בטור של הספרה." },
      { id: "opt_2", textHe: "הערך שלה שווה תמיד לספרה", isCorrect: false, feedbackHe: "רמז: אותה ספרה שווה יותר ככל שהטור שלה נמצא יותר שמאלה." },
      { id: "opt_3", textHe: "סופרים את כל הלבנים יחד", isCorrect: false, feedbackHe: "רמז: שואלים רק על ספרה אחת. בדקו את הטור שלה." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 4 (owner, 29.9.2026): a number said in
  // words, written in digits. Names none of its digits.
  's1_r_words482': {
    pedagogical_intent: "conceptual",
    tts_text: "איך כותבים בספרות מספר שכתוב במילים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך כותבים בספרות מספר שכתוב במילים?",
    choices: [
      { id: "opt_1", textHe: "כל חלק בתיבה של הטור שלו", isCorrect: true, feedbackHe: "נכון מאוד! בנו כל חלק בטור שלו, וכתבו ספרה אחת בכל תיבה." },
      { id: "opt_2", textHe: "כל חלק כמו שהוא, זה אחרי זה", isCorrect: false, feedbackHe: "רמז: בכל תיבה בשורת התוצאה כותבים ספרה אחת בלבד." },
      { id: "opt_3", textHe: "רק את החלק הראשון במספר", isCorrect: false, feedbackHe: "רמז: כל חלק במספר תופס תיבה משלו." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 5: 26 unit cubes grouped into tens. With
  // 10 or more units on the board the live card speaks; this one is true in
  // every other state and does not name the result.
  's1_r_group26': {
    pedagogical_intent: "conceptual",
    tts_text: "מה צריך להיות בטור היחידות בסוף התרגיל?",
    suggested_highlight: "tour-column-units",
    questionHe: "מה צריך להיות בטור היחידות בסוף התרגיל?",
    choices: [
      { id: "opt_1", textHe: "פחות מ-10 לבנים", isCorrect: true, feedbackHe: 'נכון מאוד! כשיש בטור 10 יחידות או יותר, לחצו על הכפתור "קבץ 10 לעשרת" שבראש הטור.' },
      { id: "opt_2", textHe: "כל הלבנים שהיו בטור", isCorrect: false, feedbackHe: "רמז: כשיש 10 יחידות או יותר בטור, מקבצים כל 10 יחידות לעשרת אחת." },
      { id: "opt_3", textHe: "אף לבנה, הטור ריק", isCorrect: false, feedbackHe: "רמז: אחרי ההקבצה נשארות בטור היחידות רק הלבנים שלא נכנסו לעשרות." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 6: 713 + 94 (1 ten + 9 tens = exactly 10
  // tens). With 10 or more tens on the board the live card speaks; this one is
  // true before and after the grouping, and does not give the tens digit away.
  's1_t8': {
    pedagogical_intent: "procedural",
    tts_text: "בתרגיל 713 + 94: מה עושים כשבאחד הטורים יש 10 לבנים או יותר?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "בתרגיל 713 + 94: מה עושים כשבאחד הטורים יש 10 לבנים או יותר?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו", isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור שמופיע בראש אותו טור.' },
      { id: "opt_2", textHe: "מוחקים 10 לבנים לפח בלי להוסיף לבנה", isCorrect: false, feedbackHe: "רמז: מחיקת לבנים לפח משנה את ערך המספר. מקבצים במקום למחוק." },
      { id: "opt_3", textHe: "רושמים 10 בתיבה אחת בשורת התוצאה", isCorrect: false, feedbackHe: "רמז: בכל תיבה בשורת התוצאה כותבים ספרה אחת בלבד, מ-0 עד 9." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 3: 61 − 24, one borrow in the units.
  // Before the borrow the live deficit card speaks. This one is true at every
  // later point — just after the borrow, halfway through taking 24 away, or
  // after it — and does not give the result.
  's1_r_sub61': {
    pedagogical_intent: "procedural",
    tts_text: "בחיסור 61 − 24: איך יודעים שסיימתם להוציא מבית המספרים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "בחיסור 61 − 24: איך יודעים שסיימתם להוציא מבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "כשהוצאתם 24 מבית המספרים", isCorrect: true, feedbackHe: "נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים." },
      { id: "opt_2", textHe: "כשפרטתם עוד עשרת אחת", isCorrect: false, feedbackHe: "רמז: פורטים רק כשאין בטור מספיק לבנים." },
      { id: "opt_3", textHe: "כשהוספתם 24 לבית המספרים", isCorrect: false, feedbackHe: "רמז: בחיסור מוציאים מבית המספרים ולא מוסיפים." }
    ],
    correctChoiceId: "opt_1"
  },

  // Refresh, mirrors diagnostic task 7: 806 − 351, a borrow into an empty tens
  // column. Before the borrow the live deficit card speaks. This one is true at
  // every later point, and does not give the result.
  's1_r_sub806': {
    pedagogical_intent: "procedural",
    tts_text: "בחיסור 806 − 351: איך יודעים שסיימתם להוציא מבית המספרים?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "בחיסור 806 − 351: איך יודעים שסיימתם להוציא מבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "כשהוצאתם 351 מבית המספרים", isCorrect: true, feedbackHe: "נכון מאוד! בדקו כמה כבר הוצאתם, וכתבו בשורת התוצאה את מה שנשאר בבית המספרים." },
      { id: "opt_2", textHe: "כשפרטתם עוד מאה אחת", isCorrect: false, feedbackHe: "רמז: פורטים רק כשאין בטור מספיק לבנים." },
      { id: "opt_3", textHe: "כשהוספתם 351 לבית המספרים", isCorrect: false, feedbackHe: "רמז: בחיסור מוציאים מבית המספרים ולא מוסיפים." }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Sessions 3–8 — the Socratic cards written in מסמך 03 (one card per session,
  //    with the board called "בית המספרים" and the pieces "לבנים": owner, 27.9.2026, register ט;
  //    served for every exercise of that session; session 3 has a card per path). ──
  // מסמך 03 §3.3 — no session card: its "34 עשרות / 34 מאות" marked the
  // instruction's own representation wrong in tasks 1, 2 and 4–6 (owner,
  // 28.9.2026, שהB.1). Every meeting-3 task gets the card of its own
  // instruction (staticSocraticCards.ts), and an unrecognised one gets
  // "איך יודעים איזה מספר בנוי בבית המספרים?" (resolveStaticHint).
  // מסמך 03 §3.4
  's4_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: נצברו עשר יחידות בטור. מה עושים איתן?',
    suggested_highlight: "tour-column-units",
    questionHe: 'נסו לחשוב: נצברו עשר יחידות בטור. מה עושים איתן?',
    choices: [
      { id: "opt_1", textHe: 'מקבצים 10 יחידות לעשרת אחת ומעבירים אותה שמאלה לטור העשרות', isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבץ 10" וצפו בעשרת הנודדת שמאלה.' },
      { id: "opt_2", textHe: 'משאירים את כולן בטור היחידות', isCorrect: false, feedbackHe: 'רמז: טור היחידות קטן וצפוף. הוא יכול להכיל רק ספרה אחת בין 0 ל-9.' },
      { id: "opt_3", textHe: 'מוחקים את היחידות המיותרות', isCorrect: false, feedbackHe: 'רמז: מומלץ לשמור על הלבנים. הכמות המתמטית נשמרת תמיד.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.5
  's5_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: אין מספיק יחידות כדי להחסיר. מה עושים?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'נסו לחשוב: אין מספיק יחידות כדי להחסיר. מה עושים?',
    choices: [
      { id: "opt_1", textHe: 'פורטים עשרת אחת לעשר יחידות בודדות ומעבירים אותן לטור היחידות', isCorrect: true, feedbackHe: 'נכון מאוד! לחצו על לבנת עשרת אחת כדי לפרוט אותה לעשר יחידות.' },
      { id: "opt_2", textHe: 'מחסירים את המספר הקטן מהמספר הגדול בטור היחידות', isCorrect: false, feedbackHe: 'רמז: שמרו על סדר התרגיל והחסירו את המחסר מהמחוסר.' },
      { id: "opt_3", textHe: 'כותבים את התשובה בטור העשרות תחילה', isCorrect: false, feedbackHe: 'רמז: בחיסור במאונך מתחילים בטור היחידות, בצד ימין.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.6
  's6_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'נסו לחשוב: איך פורטים כשבטור העשרות יש אפס?',
    suggested_highlight: "tour-column-hundreds",
    questionHe: 'נסו לחשוב: איך פורטים כשבטור העשרות יש אפס?',
    choices: [
      { id: "opt_1", textHe: 'פרטו תחילה לבנת מאה אחת לעשר עשרות בטור העשרות', isCorrect: true, feedbackHe: 'מצוין! כעת לחצו על לבנת המאה וצפו בעשרות הנוצרות בבית המספרים.' },
      { id: "opt_2", textHe: 'התעלמו מהאפס והמשיכו לטור הבא', isCorrect: false, feedbackHe: 'רמז: ספרת האפס היא שומר מקום חשוב. התחשבו בה בחישוב.' },
      { id: "opt_3", textHe: 'הוסיפו עשרת אחת לטור היחידות ללא פריטה', isCorrect: false, feedbackHe: 'רמז: שמרו תמיד על ערך המספר המקורי.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.7
  's7_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: איך מגלים כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'נסו לחשוב: איך מגלים כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    choices: [
      { id: "opt_1", textHe: 'נעזרים בלבנים משמאל, בודקים כמה עשרות יש כעת בבית המספרים וכמה חסרות כדי להגיע לתוצאה הרשומה בתרגיל', isCorrect: true, feedbackHe: 'מדויק! בדקו בבית המספרים וכתבו את הספרה החסרה.' },
      { id: "opt_2", textHe: 'מנחשים מספר אקראי וכותבים אותו בתיבת התשובה', isCorrect: false, feedbackHe: 'רמז: היעזרו בבית המספרים כדי לבדוק את התשובה.' },
      { id: "opt_3", textHe: 'עוברים קודם לטור הבא', isCorrect: false, feedbackHe: 'רמז: פותרים לפי הסדר, טור אחר טור. מה שרושמים בעיגול הזיכרון משנה את החשבון בטור הבא.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.8
  's8_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'נסו לחשוב: כיצד תפתרו את התרגיל כאשר אין לכם לבנים על המסך?',
    suggested_highlight: "tour-column-units",
    questionHe: 'נסו לחשוב: כיצד תפתרו את התרגיל כאשר אין לכם לבנים על המסך?',
    choices: [
      { id: "opt_1", textHe: 'מתבוננים בתרגיל ונעזרים בעיגולי הזיכרון בראש הטורים כדי לנהל את פעולת ההמרה או הפריטה בשלבים', isCorrect: true, feedbackHe: 'מצוין! התקדמו טור אחר טור ורשמו את המעברים בעיגולי הזיכרון.' },
      { id: "opt_2", textHe: 'מנחשים את התוצאה הסופית ומקלידים אותה מיד', isCorrect: false, feedbackHe: 'רמז: הימנעו מניחושים מהירים. פתרו את התרגיל בצורה מסודרת מימין לשמאל.' },
      { id: "opt_3", textHe: 'מחכים שהתשובה הנכונה תופיע על המסך', isCorrect: false, feedbackHe: 'רמז: התשובה לא תופיע מעצמה. אתם יכולים לפתור בעצמכם, שלב אחר שלב.' }
    ],
    correctChoiceId: "opt_1"
  }
};

// ─────────────────────────────────────────────────────────────
// TARGET NODE FALLBACK MAP
// Used when the task has a targetNode but no specific task-ID entry above.
// ─────────────────────────────────────────────────────────────
const NODE_HINTS: Record<string, SocraticHintResponse> = {
  basic_addition_fluency: {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את שני המספרים בבית המספרים וספרו כל טור בנפרד.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מחברים שני מספרים בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים את שני המספרים וסופרים את הלבנים בכל טור בנפרד" },
      { id: "opt_2", textHe: "בונים רק את המספר הגדול" },
      { id: "opt_3", textHe: "מוחקים את כל הלבנים ורושמים ישירות" }
    ],
    correctChoiceId: "opt_1"
  },
  regrouping_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "כאשר יש 10 לבנים ומעלה בטור — מקבצים 10 מהן ללבנה אחת בטור הבא.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש יותר מ-9 לבנים בטור — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 לבנים ללבנה גדולה אחת בטור הבא" },
      { id: "opt_2", textHe: "כותבים 10 בתוצאה" },
      { id: "opt_3", textHe: "מוחקים לבנים מיותרות" }
    ],
    correctChoiceId: "opt_1"
  },
  flexible_regrouping: {
    pedagogical_intent: "conceptual",
    tts_text: "ניתן לפרוט לבנה גדולה לקטנות יותר — הכמות הכוללת לא משתנה.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את אותו מספר בדרך אחרת?",
    choices: [
      { id: "opt_1", textHe: "פורטים לבנה גדולה ללבנים קטנות — הכמות נשמרת" },
      { id: "opt_2", textHe: "מוסיפים לבנים נוספות" },
      { id: "opt_3", textHe: "לכל מספר יש ייצוג אחד בלבד" }
    ],
    correctChoiceId: "opt_1"
  },
  procedural_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "עבדו טור טור מימין לשמאל, ואל תשכחו לרשום את ההמרה בעיגול הזיכרון.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה הסדר הנכון בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מהיחידות, עוברים לעשרות ואחר כך למאות, ורושמים כל המרה בעיגול הזיכרון" },
      { id: "opt_2", textHe: "מתחילים מהמספר הגדול" },
      { id: "opt_3", textHe: "אין חשיבות לסדר" }
    ],
    correctChoiceId: "opt_1"
  },
  zero_placeholder: {
    pedagogical_intent: "conceptual",
    tts_text: "כאשר טור ריק לחלוטין — כותבים 0 כדי לשמור על ערכי הטורים האחרים.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה לספרות האחרות אם לא רושמים 0 בטור הריק?",
    choices: [
      { id: "opt_1", textHe: "הספרות יזוזו ממקומן וישנו את ערך המספר כולו" },
      { id: "opt_2", textHe: "כלום — אפשר לדלג על טורים ריקים" },
      { id: "opt_3", textHe: "הטורים הריקים לא משפיעים" }
    ],
    correctChoiceId: "opt_1"
  },
  relational_thinking: {
    pedagogical_intent: "focus",
    tts_text: "חשבו: אם הפעולה הפוכה — חיבור ↔ חיסור — מה אפשר לגלות מכך?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך פעולה הפוכה עוזרת לבדוק תשובה?",
    choices: [
      { id: "opt_1", textHe: "מחסירים את אחד המחוברים מהסכום — אם מקבלים את השני, נכון" },
      { id: "opt_2", textHe: "עושים שוב את אותה פעולה" },
      { id: "opt_3", textHe: "פעולה הפוכה לא קשורה לבדיקה" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_subtrahend: {
    pedagogical_intent: "conceptual",
    tts_text: "אם יודעים מה נשאר — מורידים אותו מהמספר המקורי כדי לגלות את המספר שמחסרים.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים את המספר שמחסרים?",
    choices: [
      { id: "opt_1", textHe: "מהמספר שממנו מחסרים מורידים את התוצאה, ומקבלים את המספר שמחסרים" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "אי אפשר למצוא" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_addend: {
    pedagogical_intent: "conceptual",
    tts_text: "מחובר ועוד מחובר שווה סכום. אם חסר מחובר, מחסרים מהסכום את המחובר הידוע.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים מחובר חסר?",
    choices: [
      { id: "opt_1", textHe: "מהסכום מחסרים את המחובר הידוע, ומקבלים את המחובר החסר" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "מחברים את כל המספרים" }
    ],
    correctChoiceId: "opt_1"
  }
};

const GENERAL_FALLBACK: SocraticHintResponse = {
  pedagogical_intent: "focus",
  tts_text: "בדקו מה בנוי בבית המספרים ומה הצעד הבא הנדרש.",
  suggested_highlight: "tour-place-value-board",
  questionHe: "מה הצעד הבא שצריך לעשות בבית המספרים?",
  choices: [
    { id: "opt_1", textHe: "בודקים את בית המספרים — מספר הלבנים בכל טור ומה חסר" },
    { id: "opt_2", textHe: "כותבים את התשובה מיד" },
    { id: "opt_3", textHe: "מוחקים הכול ומתחילים מחדש" }
  ],
  correctChoiceId: "opt_1"
};

export class SocraticEngine {
  private static localHintCache: Map<string, SocraticHintResponse> = new Map();

  public static async prefetchSessionHints(sessionNumber: number): Promise<void> {
    // Cache both new node names and legacy node names the tests reference
    const nodesToCache: Record<string, SocraticHintResponse> = {
      regrouping_fluency: NODE_HINTS.regrouping_fluency,
      zero_placeholder: NODE_HINTS.zero_placeholder,
      procedural_fluency: NODE_HINTS.procedural_fluency,
      flexible_regrouping: NODE_HINTS.flexible_regrouping,
      relational_thinking: NODE_HINTS.relational_thinking,
      basic_addition_fluency: NODE_HINTS.basic_addition_fluency,
      // Legacy names kept for backward-compat with tests
      subtraction_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "חסרות יחידות בבית המספרים כדי לחסר. פרטו עשרת אחת ל-10 יחידות.",
        suggested_highlight: "tour-column-units",
        questionHe: "חסרות יחידות בבית המספרים לחיסור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "פורטים עשרת אחת מטור העשרות ל-10 יחידות" },
          { id: "opt_2", textHe: "מוסיפים יחידות חדשות" },
          { id: "opt_3", textHe: "מחסרים מלמטה למעלה" }
        ],
        correctChoiceId: "opt_1"
      },
      addition_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "יש יותר מ-9 לבנים בטור — קבצו 10 ללבנה אחת גדולה יותר.",
        suggested_highlight: "tour-column-units",
        questionHe: "יש יותר מ-9 לבנים בטור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "מקבצים 10 יחידות לעשרת אחת" },
          { id: "opt_2", textHe: "מוחקים את הלבנים המיותרות" },
          { id: "opt_3", textHe: "כותבים את המספר ישירות" }
        ],
        correctChoiceId: "opt_1"
      },
      q_matrix_general: GENERAL_FALLBACK
    };
    for (const [node, hint] of Object.entries(nodesToCache)) {
      this.localHintCache.set(`${sessionNumber}_${node}`, hint);
    }
  }

  public static getCachedHint(sessionNumber: number, targetNode: string): SocraticHintResponse | null {
    return this.localHintCache.get(`${sessionNumber}_${targetNode}`) ||
           this.localHintCache.get(`${sessionNumber}_regrouping_fluency`) ||
           null;
  }

  /**
   * Evaluates the live board state (counts, deficits, overcrowding, active operation)
   * to produce a high-precision, real-time Socratic question and 3 closed pedagogical options.
   */
  public static analyzeLiveBoardState(
    currentTask: any,
    targetNode: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse | null {
    if (!counts) return null;

    // Sandbox / technical training or intro tasks must not trigger regrouping / arithmetic mentoring
    if (currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro') {
      return null;
    }
    // "160 is 100 and how much more?" — 16 tens or 10 units on the board are
    // a way of building 160, not a column to group; the missing-part card
    // speaks in every board state (owner, 28.9.2026, שהB.1).
    if (currentTask?.type === 'missing_element') return null;

    // 1. Overcrowding Check (>= 10 blocks in a column). Three states where ten
    // or more in a column is the goal, not a mess: a representation whose
    // required board holds it (meeting 3's 13 and 14 tens, meeting 1's 347 as
    // 3, 3 and 17), a "two different representations" task (150 as 15 tens),
    // and a subtraction after a borrow (61 − 24 as 5 tens and 11 units).
    // "Group them back" would undo the very step the exercise asks for;
    // subtraction gets its own deficit reading below.
    const required = (currentTask?.requiredCounts ?? {}) as Partial<Record<'units' | 'tens' | 'hundreds', number>>;
    const crowdingIsTheGoal = (place: 'units' | 'tens' | 'hundreds') =>
      currentTask?.isSubtraction === true || currentTask?.type === 'flexible_decomp' || (required[place] ?? 0) >= 10;
    // Meeting 1: the column and its count stay for the child to find (owner, 29.9.2026).
    if (meetingOfTaskId(currentTask?.id) === 1 &&
      (['units', 'tens', 'hundreds'] as const).some((p) => counts[p] >= 10 && !crowdingIsTheGoal(p))) {
      return meeting1CrowdedCard();
    }
    if (counts.units >= 10 && !crowdingIsTheGoal('units')) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור היחידות יש ${counts.units} לבנים. צריך לקבץ 10 מהן לעשרת אחת.`,
        suggested_highlight: "tour-column-units",
        questionHe: `בטור היחידות הצטברו ${counts.units} לבנים (יותר מ-9). מה הצעד הבא?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "אוספים 10 יחידות מטור היחידות וממירים אותן לעשרת אחת בטור העשרות", 
            isCorrect: true, 
            feedbackHe: 'תשובה נכונה! לחצו על הכפתור "קבץ 10" שבראש טור היחידות.'
          },
          { 
            id: "opt_2", 
            textHe: "מוחקים 10 יחידות מטור היחידות לפח האשפה מבלי להוסיף עשרת", 
            isCorrect: false, 
            feedbackHe: "רמז: מחיקת לבנים לפח משנה את ערך המספר! צריך לשמור על הכמות הכוללת בעזרת המרה. אפשר להשתמש בכפתור ביטול פעולה ↺."
          },
          { 
            id: "opt_3", 
            textHe: "מעבירים לבנה אחת בלבד לטור העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: עשרת אחת שווה בדיוק ל-10 יחידות. לבנת יחידה אחת היא לא עשרת. אפשר להשתמש בכפתור ביטול פעולה ↺."
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.tens >= 10 && !crowdingIsTheGoal('tens')) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור העשרות יש ${counts.tens} עשרות. צריך לקבץ 10 מהן למאה אחת.`,
        suggested_highlight: "tour-column-tens",
        questionHe: `בטור העשרות הצטברו ${counts.tens} עשרות (יותר מ-9). מה עושים?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "אוספים 10 עשרות ומקבצים אותן למאה אחת בטור המאות", 
            isCorrect: true, 
            feedbackHe: 'נכון מאוד! לחצו על הכפתור "קבץ 10" שבראש טור העשרות כדי להמיר למאה אחת.'
          },
          { 
            id: "opt_2", 
            textHe: "מוחקים עשרות מיותרות לפח האשפה", 
            isCorrect: false, 
            feedbackHe: "רמז: מחיקת לבנים בלי המרה מורידה מהערך הכולל של המספר. מקבצים במקום למחוק." 
          },
          { 
            id: "opt_3", 
            textHe: "רושמים מספר דו-ספרתי בתיבת העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: בכל תיבה בשורת התוצאה כותבים ספרה אחת בלבד, מ-0 עד 9." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.hundreds >= 10 && !crowdingIsTheGoal('hundreds')) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור המאות יש ${counts.hundreds} מאות. צריך לקבץ 10 מהן לאלף אחד.`,
        suggested_highlight: "tour-column-hundreds",
        questionHe: `בטור המאות הצטברו ${counts.hundreds} מאות (יותר מ-9). מה הפעולה הנדרשת?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "אוספים 10 מאות ומקבצים אותן לאלף אחד בטור האלפים", 
            isCorrect: true, 
            feedbackHe: 'מצוין! לחצו על הכפתור "קבץ 10" שבראש טור המאות כדי לקבץ אותן לאלף אחד.'
          },
          { 
            id: "opt_2", 
            textHe: "משאירים 10 מאות באותו הטור", 
            isCorrect: false, 
            feedbackHe: "רמז: בסוף התרגיל נשארות בכל טור לכל היותר 9 לבנים, כי 10 לבנים יוצרות לבנה אחת בטור השמאלי." 
          },
          { 
            id: "opt_3", 
            textHe: "מוחקים מאות לפח האשפה", 
            isCorrect: false, 
            feedbackHe: "רמז: שמרו על הכמות הכוללת בעזרת הקבצה לאלפים."
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    // 2. Subtraction Deficit Checks
    // A skeleton whose first number is hidden is not solved by building that
    // number — and naming it would give the hidden digits away.
    const isSubtraction = inferIsSubtraction(currentTask, targetNode) && !currentTask?.hiddenDigits?.a?.length;

    let subtrahend = currentTask?.numberB;
    let minuend: number | undefined = typeof currentTask?.numberA === 'number' ? currentTask.numberA : undefined;
    if (typeof currentTask?.exercise === 'string' && currentTask.exercise.includes('-')) {
      const parts = currentTask.exercise.split('-');
      if (!subtrahend && parts[1]) {
        const parsed = parseInt(parts[1].trim(), 10);
        if (!isNaN(parsed)) subtrahend = parsed;
      }
      if (minuend === undefined && parts[0]) {
        const parsed = parseInt(parts[0].replace(/\D/g, ''), 10);
        if (!isNaN(parsed)) minuend = parsed;
      }
    }

    if (isSubtraction && subtrahend) {
      const unitsB = subtrahend % 10;
      const tensB = Math.floor((subtrahend % 100) / 10);
      const hundredsB = Math.floor((subtrahend % 1000) / 100);
      const boardValue = counts.units + counts.tens * 10 + counts.hundreds * 100 + counts.thousands * 1000;

      // Nothing on the canvas yet: the only sensible coaching is "build the first
      // number". A deficit read off an empty board ("יש לנו 0 עשרות") is nonsense.
      if (boardValue === 0) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `בחיסור בונים בבית המספרים רק את המספר הראשון${minuend !== undefined ? ` (${formatNumberHe(minuend)})` : ''}, ואחר כך מוציאים ממנו.`,
          suggested_highlight: "tour-palette",
          questionHe: `בית המספרים עדיין ריק. בחיסור, מה בונים קודם?`,
          choices: [
            {
              id: "opt_1",
              textHe: `בונים רק את המספר הראשון${minuend !== undefined ? ` (${formatNumberHe(minuend)})` : ''} בבית המספרים, ואחר כך מוציאים ממנו ${formatNumberHe(subtrahend)} לפח האשפה`,
              isCorrect: true,
              feedbackHe: "נכון! גררו לבנים לבית המספרים עד שהוא מראה את המספר הראשון, ורק אז הוציאו ממנו."
            },
            {
              id: "opt_2",
              textHe: "בונים את שני המספרים בבית המספרים ומחברים אותם",
              isCorrect: false,
              feedbackHe: "רמז: בחיסור לא בונים את שני המספרים. בונים את הראשון ומוציאים ממנו את השני."
            },
            {
              id: "opt_3",
              textHe: "מקלידים את התוצאה בלי לבנות כלום",
              isCorrect: false,
              feedbackHe: "רמז: קודם מייצגים את המספר בלבנים, ורק אחר כך כותבים את התוצאה."
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // A deficit is a property of the exercise (the minuend's digit is smaller
      // than the subtrahend's, after any borrow the column to its right needs),
      // not of whatever happens to be on the board right now. Reading it off the
      // board turned "470 − 250 with 2 tens left after removing 5" into a
      // demand to decompose a hundred. When the minuend is unknown the old
      // board-only reading is all there is.
      const digitsKnown = minuend !== undefined;
      const unitsA = digitsKnown ? minuend! % 10 : counts.units;
      const tensA = digitsKnown ? Math.floor((minuend! % 100) / 10) : counts.tens;
      const hundredsA = digitsKnown ? Math.floor((minuend! % 1000) / 100) : counts.hundreds;
      const needUnits = unitsA < unitsB;
      const needTens = tensA - (needUnits ? 1 : 0) < tensB;
      const needHundreds = hundredsA - (needTens ? 1 : 0) < hundredsB;

      // From here on the card reads a deficit off the board, which is only true
      // while the first number stands on it whole: once taking away starts,
      // "5 units, and 8 to take" asked for a second decomposition. In meetings
      // 3–7 the exercise card (staticSocraticCards.ts) reads the board itself,
      // and also handles the empty column on the way ("4,000 − 1,562": no ten
      // to break); this reading stays for meeting 1's refresh exercises.
      const deficitMeeting = meetingOfTaskId(currentTask?.id);
      if ((deficitMeeting !== null && deficitMeeting !== 1) || (digitsKnown && boardValue !== minuend)) return null;

      // Meeting 1: the same deficit, but the child finds the column; the
      // card names no column and no count (owner, 29.9.2026).
      if (deficitMeeting === 1) {
        const digitB: Record<DeficitPlace, number> = { units: unitsB, tens: tensB, hundreds: hundredsB };
        const first: DeficitPlace | null =
          needUnits && unitsB > 0 && counts.units < unitsB ? 'units'
          : needTens && tensB > 0 && counts.tens < tensB ? 'tens'
          : needHundreds && hundredsB > 0 && counts.hundreds < hundredsB ? 'hundreds'
          : null;
        if (first) {
          const lacking = DEFICIT_PLACES.filter((p) => p === first ||
            (DEFICIT_PLACES.indexOf(p) > DEFICIT_PLACES.indexOf(first) && digitB[p] > 0 && counts[p] < digitB[p]));
          return meeting1DeficitCard(lacking);
        }
      }

      // Check Units Deficit — real for this exercise, and not yet resolved on the board.
      if (needUnits && unitsB > 0 && counts.units < unitsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inUnitsHe(counts.units)}, וצריך להחסיר ${unitsB}. פרטו עשרת אחת ל-10 יחידות.`,
          suggested_highlight: "tour-column-tens",
          questionHe: `${inUnitsHe(counts.units)}, וצריך להחסיר ${unitsHe(unitsB)}. מה הצעד הנכון לבצע?`,
          choices: [
            {
              id: "opt_1",
              textHe: "לוחצים על עשרת אחת מטור העשרות כדי לפרוט אותה ל-10 יחידות",
              isCorrect: true,
              feedbackHe: "מעולה! לחצו על לבנת העשרת בבית המספרים כדי לפרוט אותה ל-10 יחידות."
            },
            {
              id: "opt_2",
              textHe: `מחסירים הפוך: ${unitsB} פחות ${counts.units}`,
              isCorrect: false,
              feedbackHe: "רמז: בחיסור מוציאים רק מהכמות הקיימת. אי אפשר להחסיר הפוך מלמטה למעלה. אפשר להשתמש בכפתור ביטול פעולה ↺."
            },
            { 
              id: "opt_3", 
              textHe: unitsB - counts.units === 1 ? 'מוסיפים לבנת יחידה אחת חדשה' : `מוסיפים ${unitsB - counts.units} לבני יחידה חדשות`, 
              isCorrect: false, 
              feedbackHe: "רמז: הוספת לבנים חדשות משנה את ערך המספר המקורי! פורטים מהטור השכן כדי לשמור על הכמות." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Tens Deficit
      if (needTens && tensB > 0 && counts.tens < tensB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inTensHe(counts.tens)}, וצריך להחסיר ${tensB}. פרטו מאה אחת ל-10 עשרות.`,
          suggested_highlight: "tour-column-hundreds",
          questionHe: `${inTensHe(counts.tens)}, וצריך להחסיר ${tensHe(tensB)}. מאיזה טור שכן אפשר לפרוט לבנה?`,
          choices: [
            {
              id: "opt_1",
              textHe: "לוחצים על מאה אחת מטור המאות כדי לפרוט אותה ל-10 עשרות",
              isCorrect: true,
              feedbackHe: "מצוין! לחצו על לבנת המאה בבית המספרים כדי לפרוט אותה ל-10 עשרות."
            },
            {
              id: "opt_2",
              textHe: `מחסירים הפוך: ${tensB} פחות ${counts.tens}`,
              isCorrect: false,
              feedbackHe: "רמז: בחיסור מוציאים מהכמות שיש בבית המספרים. אסור להחסיר הפוך. אפשר להשתמש בכפתור ביטול פעולה ↺."
            },
            { 
              id: "opt_3", 
              textHe: "מוחקים לבנת מאה לפח האשפה",
              isCorrect: false,
              feedbackHe: "רמז: מחיקת מאות ללא פריטה תקטין את המספר במקום לשמור על הכמות הכוללת."
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Hundreds Deficit
      if (needHundreds && hundredsB > 0 && counts.hundreds < hundredsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `${inHundredsHe(counts.hundreds)}, וצריך להחסיר ${hundredsB}. פרטו אלף אחד ל-10 מאות.`,
          suggested_highlight: "tour-column-thousands",
          questionHe: `${inHundredsHe(counts.hundreds)}, וצריך להחסיר ${hundredsHe(hundredsB)}. מה עושים?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "לוחצים על אלף אחד מטור האלפים כדי לפרוט אותו ל-10 מאות", 
              isCorrect: true, 
              feedbackHe: "מדויק! לחצו על לבנת האלף בטור האלפים כדי לפרוט אותה ל-10 מאות." 
            },
            { 
              id: "opt_2", 
              textHe: `מחסירים הפוך: ${hundredsB} פחות ${counts.hundreds}`,
              isCorrect: false,
              feedbackHe: "רמז: בחיסור גורעים רק מהכמות הקיימת. נסו לחקור את הפריטה בעזרת כפתור ביטול פעולה ↺."
            },
            {
              id: "opt_3",
              textHe: "מוסיפים לבני מאה חדשות",
              isCorrect: false,
              feedbackHe: "רמז: הוספת לבנים חדשות משנה את המספר. צריך לשמור על הכמות בעזרת פריטה מטור האלפים."
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    // (A "zero placeholder" card used to follow: "when the tens column has no
    // blocks, write 0 in the tens". It fired on every meeting-6 exercise with an
    // empty board — 602 − 145, whose tens result is 5 — and on 6,0▢▢ − 2,847,
    // where it told the child a hidden digit. Removed; the exercise card
    // (staticSocraticCards.ts) speaks of the zero the exercise really has.)

    return null;
  }

  /**
   * Grounded Hybrid Socratic Query via Gemini (Modules 12–13)
   * Feeds both the Q-Matrix baseline reference and live board state into Gemini
   * under the Holistic Pedagogical Triad (Exercise + Board State + Student Progress)
   * to generate a coherent, context-tailored Socratic question and 3 closed options.
   */
  static async fetchGroundedGeminiSocraticQuery(params: {
    currentTask: any;
    targetNode: string;
    activeColumnName: string;
    counts: { units: number; tens: number; hundreds: number; thousands: number };
    recentActions?: string[];
    qMatrixAnchor: SocraticHintResponse;
    monitoring?: SocraticMonitoringSnapshot;
  }): Promise<SocraticHintResponse | null> {
    try {
      const { currentTask, targetNode, activeColumnName, counts, recentActions, qMatrixAnchor } = params;
      const monitoring: SocraticMonitoringSnapshot = params.monitoring ?? {};

      // Sandbox / intro tasks are never AI-coached (Module 12): nothing to diagnose.
      if (currentTask?.id === 's1_sandbox_controlled' || currentTask?.type === 'session1_intro') {
        return null;
      }

      // ── Pillar 1: the exercise ─────────────────────────────────────────
      const colIdx = Math.max(0, Math.min(3, monitoring.activeColumnIndex ?? Math.max(0, ['יחידות', 'עשרות', 'מאות', 'אלפים'].indexOf(activeColumnName))));
      const activeColumn = WIRE_COLUMNS[colIdx];
      // A representation, a "different ways" task and a missing part are
      // not an addition or a subtraction: "160 is 100 and how much more?"
      // went to the model as 100 + 160 (owner, 28.9.2026, שהB.1).
      const arithmetic = !NON_ARITHMETIC_TYPES.includes(currentTask?.type);
      const operands: { a: number; b: number; isSubtraction: boolean } | null = !arithmetic ? null :
        monitoring.operands ??
        (typeof currentTask?.numberA === 'number' && typeof currentTask?.numberB === 'number'
          ? { a: currentTask.numberA, b: currentTask.numberB, isSubtraction: inferIsSubtraction(currentTask, targetNode) }
          : null);

      const rawStudent = monitoring.studentId ?? normalizeStudentId(String(currentTask?.studentId ?? '1'));
      const studentNum = typeof rawStudent === 'number' ? rawStudent : parseInt(String(rawStudent).replace(/\D/g, '') || '1', 10);
      const studentId = Math.min(12, Math.max(1, Number.isNaN(studentNum) ? 1 : studentNum));
      const sessionNumber = monitoring.sessionNumber ?? (parseInt(String(currentTask?.id ?? '').replace(/^s(\d+).*/, '$1'), 10) || 0);
      const sessionId = `session_${sessionNumber || 'x'}_student_${studentId}`;
      const exerciseId = String(currentTask?.id ?? targetNode ?? 'unknown').slice(0, 64);

      let exerciseContext: GeminiSocraticRequest['exercise_context'];
      if (operands && operands.a >= 0 && operands.b >= 0 && !(operands.isSubtraction && operands.b > operands.a)) {
        // A skeleton's hidden digits never leave the client as digits.
        const hiddenA: Place[] = currentTask?.hiddenDigits?.a ?? [];
        const hiddenB: Place[] = currentTask?.hiddenDigits?.b ?? [];
        const da = hiddenA.includes(activeColumn) ? '▢' : digitAt(operands.a, activeColumn);
        const db = hiddenB.includes(activeColumn) ? '▢' : digitAt(operands.b, activeColumn);
        exerciseContext = {
          operation: operands.isSubtraction ? 'subtraction' : 'addition',
          number_a: operands.a,
          number_b: operands.b,
          session_id: sessionId,
          session_topic: String(currentTask?.titleHe ?? '').slice(0, 120),
          active_column: activeColumn,
          active_column_index: colIdx,
          target_sub_problem: operands.isSubtraction ? `${da} - ${db}` : `${da} + ${db}`,
          ...(hiddenA.length || hiddenB.length ? { hidden_places: { a: hiddenA, b: hiddenB } } : {}),
        };
      }

      // ── Pillar 3: what was monitored ───────────────────────────────────
      const memoryCircles = toWireMemoryCircles(monitoring.memoryCircles);
      const completedColumns = completedColumnsFrom(monitoring.answerDigits, operands);
      const currentInput = monitoring.answerDigits?.[activeColumn] ?? null;
      const triggerReason: SocraticTriggerReasonWire =
        monitoring.triggerReason ??
        ((monitoring.consecutiveErrors ?? 0) >= 4
          ? 'consecutive_errors_4'
          : (monitoring.consecutiveUndos ?? 0) >= 3
          ? 'consecutive_undos_3'
          : 'hesitation_45s');
      const recentEvents = synthesiseRecentEvents(monitoring, sessionId, studentId, exerciseId);

      const socraticRequest = SocraticEngine.buildGeminiSocraticRequest({
        studentId,
        sessionId,
        exerciseId,
        activeColumnIndex: colIdx,
        exerciseContext,
        workspaceState: {
          ones_count: counts.units || 0,
          tens_count: counts.tens || 0,
          hundreds_count: counts.hundreds || 0,
          thousands_count: counts.thousands || 0,
          memory_circles: memoryCircles,
          is_regrouped_in_canvas: monitoring.hasRegroupedInCanvas,
        },
        studentProgressState: {
          completed_columns: completedColumns,
          current_column_input: currentInput && /^\d{1,4}$/.test(currentInput) ? currentInput : null,
          memory_circles_state: memoryCircles,
          trigger_reason: triggerReason,
          consecutive_errors_count: monitoring.consecutiveErrors ?? 0,
          recent_actions: recentEvents,
        },
        recentActions: recentEvents,
      });

      // The static card is the pedagogical baseline the model must improve on, never contradict.
      const anchor = {
        questionHe: qMatrixAnchor.questionHe,
        pedagogical_intent: qMatrixAnchor.pedagogical_intent,
        choices: (qMatrixAnchor.choices || []).slice(0, 3).map((c) => ({
          id: c.id,
          textHe: c.textHe,
          isCorrect: c.isCorrect ?? (qMatrixAnchor.correctChoiceId ? c.id === qMatrixAnchor.correctChoiceId : undefined),
        })),
      };

      // Both guards use the same ceiling: the callable's own timeout, and a
      // local race so a hung transport can never outlive the static fallback.
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<{ data: any }>((_, reject) => {
        raceTimer = setTimeout(() => reject(new Error('Gemini Socratic Proxy timeout')), SOCRATIC_PROXY_TIMEOUT_MS);
      });

      const res = await Promise.race([
        SocraticEngine.callGeminiProxy({
          socratic_request: socraticRequest,
          anchor,
        }),
        timeoutPromise,
      ]).finally(() => {
        if (raceTimer) clearTimeout(raceTimer);
      });

      const data = res?.data;
      if (!data) return null;

      const parsed = typeof data === 'string' ? JSON.parse(data) : (data?.rawText ? JSON.parse(data.rawText) : data);
      // PRD shape (guiding_question / options[].option_text) or the older
      // final_intervention wrapper — both are read, the PRD shape wins.
      const body = parsed?.guiding_question ? parsed : (parsed?.final_intervention ?? parsed);
      const guidingQuestion = body?.guiding_question;
      const optionsList = body?.options;
      const rawErrorCategory = body?.error_category;

      const validCategories = ['calculation', 'procedural', 'conceptual'];
      const isValidCategory = typeof rawErrorCategory === 'string' && validCategories.includes(rawErrorCategory.toLowerCase());

      // Module 13(a): Rigid validation — missing guiding_question, wrong options count, or missing/invalid error_category MUST fail validation
      if (typeof guidingQuestion !== 'string' || !guidingQuestion.trim() || !Array.isArray(optionsList) || optionsList.length !== 3 || !isValidCategory) {
        console.warn('[Gemini Proxy] Schema validation failed for response (missing required fields or invalid error_category):', parsed);
        return null;
      }

      const choices = optionsList.map((opt: any, idx: number) => ({
        id: `opt_${idx + 1}`,
        textHe: String(opt?.option_text ?? opt?.text ?? ''),
        feedbackHe: typeof (opt?.feedback_text ?? opt?.feedback) === 'string' ? String(opt.feedback_text ?? opt.feedback) : undefined,
        isCorrect: opt?.is_correct === true,
      }));

      if (choices.some((c: { textHe: string }) => !c.textHe.trim()) || choices.filter((c: { isCorrect: boolean }) => c.isCorrect).length !== 1) {
        console.warn('[Gemini Proxy] Options rejected: every option needs text and exactly one must be correct.');
        return null;
      }

      const aiTexts = [guidingQuestion, ...choices.flatMap((c: { textHe: string; feedbackHe?: string }) => [c.textHe, c.feedbackHe ?? ''])];
      // The model receives the whole exercise, hidden digits included. What
      // the screen hides (a skeleton's operand, a number the task asks for)
      // must not come back in the card; and in meeting 8 there are no blocks,
      // no trash and no number house to point at (PRD Module 13 §א).
      const aiSecrets = secretNumbersOf(currentTask).filter((n) => n !== 10 && n !== 100 && n !== 1000);
      // ...and, where the child finds a number rather than a result, also
      // written as blocks: "6 עשרות" is s3_r_t7's missing 60. Not in an
      // addition or a subtraction, where the board — both numbers built,
      // not yet grouped — is worth the result and naming it is the coaching.
      // Except in meeting 1, where the child finds the counts himself and no
      // card may give them (owner, 29.9.2026).
      const countsAreTheCoaching = arithmetic && sessionNumber !== 1;
      const hiddenLeak = revealsSecret(aiTexts, aiSecrets) ??
        (countsAreTheCoaching ? null : revealsSecretInCounts(aiTexts, aiSecrets));
      const violation =
        // A skeleton exercise shows its result; the digits it hides are the secret.
        socraticTextViolation(aiTexts, Array.isArray(currentTask?.revealedResultDigits) ? null : operands) ??
        (hiddenLeak !== null ? 'hidden number leaked' : null) ??
        (contradictsRequiredRepresentation(currentTask, choices) ? 'marks the instruction\'s representation wrong' : null) ??
        absentAidViolation(aiTexts, sessionNumber);
      if (violation) {
        console.warn('[Gemini Proxy] Response rejected by content rule:', violation);
        return null;
      }

      const errorCategory = rawErrorCategory.toLowerCase() as 'calculation' | 'procedural' | 'conceptual';

      if (parsed.hard_evidence_log && Array.isArray(parsed.hard_evidence_log)) {
        console.info('[Gemini Socratic Engine] Hard Evidence Log:', parsed.hard_evidence_log);
      }

      const correctOpt = choices.find((c: { isCorrect: boolean }) => c.isCorrect) || choices[0];

      return {
        pedagogical_intent: errorCategory === 'conceptual' ? 'conceptual' : 'procedural',
        error_category: errorCategory,
        questionHe: guidingQuestion,
        choices,
        correctChoiceId: correctOpt.id,
      };
    } catch (err) {
      console.warn('[Gemini Socratic Engine] Cloud Function proxy query fallback triggered:', err);
      return null;
    }
  }

  /**
   * Secure Cloud Function Proxy caller for Gemini Socratic queries.
   */
  public static async callGeminiProxy(data: SocraticProxyPayload): Promise<{ data: any }> {
    const fn = httpsCallable<SocraticProxyPayload, any>(
      functions,
      "callGeminiSocraticProxy",
      // Module 13: a hung AI call must yield to the static Socratic hint quickly.
      // The SDK's 70s default leaves a 3rd-grader staring at a spinner mid-exercise
      // when the far cheaper, pedagogically valid fallback is already on hand.
      { timeout: SOCRATIC_PROXY_TIMEOUT_MS }
    );
    return fn(data);
  }

  /**
   * Legacy fetchGeminiSocraticQuery alias for backward-compatibility.
   */
  static async fetchGeminiSocraticQuery(
    studentIdNum: number,
    taskId: string,
    activeColumn: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    memoryCircles?: Partial<Record<string, string>>,
    recentActions?: string[]
  ): Promise<SocraticHintResponse | null> {
    const qMatrixAnchor = TASK_HINTS[taskId] || GENERAL_FALLBACK;
    return SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: { id: taskId, titleHe: `Student #${studentIdNum}` },
      targetNode: taskId,
      activeColumnName: activeColumn,
      counts,
      recentActions,
      qMatrixAnchor
    });
  }

  /**
   * יוצר אובייקט בקשה מאומת בדיוק לפי סכמת GeminiSocraticRequest (נספח א' §6 ומודול 13).
   * משתמש במזהה student_id קנוני (1-12) בלבד ומעביר את כל רכיבי השילוש הפדגוגי ההוליסטי.
   */
  static buildGeminiSocraticRequest(params: {
    studentId: number | string;
    sessionId: string;
    exerciseId: string;
    activeColumnIndex: number;
    exerciseContext?: {
      operation: 'addition' | 'subtraction';
      number_a: number;
      number_b: number;
      session_id: string;
      session_topic: string;
      active_column: 'units' | 'tens' | 'hundreds' | 'thousands';
      active_column_index: number;
      target_sub_problem: string;
    };
    workspaceState: {
      ones_count: number;
      tens_count: number;
      hundreds_count: number;
      thousands_count?: number;
      memory_circles?: Record<string, number>;
      is_regrouped_in_canvas?: boolean;
    };
    studentProgressState?: {
      completed_columns: string[];
      current_column_input: string | null;
      memory_circles_state: Record<string, number>;
      trigger_reason: 'hesitation_45s' | 'consecutive_errors_4' | 'consecutive_undos_3' | 'conversion_not_performed' | 'repeated_errors';
      consecutive_errors_count: number;
      recent_actions: TelemetryPayload<TelemetryEventType>[];
    };
    recentActions?: TelemetryPayload<TelemetryEventType>[];
  }): GeminiSocraticRequest {
    const rawId = typeof params.studentId === 'number' 
      ? params.studentId 
      : parseInt(String(params.studentId).replace(/\D/g, '') || '1', 10);
    const student_id = Math.min(12, Math.max(1, isNaN(rawId) ? 1 : rawId));

    return {
      student_id,
      session_id: params.sessionId,
      exercise_id: params.exerciseId,
      active_column_index: params.activeColumnIndex,
      exercise_context: params.exerciseContext,
      workspace_state: {
        ones_count: params.workspaceState.ones_count,
        tens_count: params.workspaceState.tens_count,
        hundreds_count: params.workspaceState.hundreds_count,
        thousands_count: params.workspaceState.thousands_count || 0,
        memory_circles: params.workspaceState.memory_circles || {},
        is_regrouped_in_canvas: params.workspaceState.is_regrouped_in_canvas,
      },
      student_progress_state: params.studentProgressState,
      recent_actions: params.recentActions || [],
    };
  }

  /**
   * מנגנון עמידות ונסיגה (Fallback):
   * שולח שאילתה ל-Gemini API ובמקרה של כשל רשת, Timeout או שגיאת 500,
   * מזריק מיד רמז סוקרטי סטטי מוגדר מראש ללא קריסת הממשק.
   */
  static async requestSocraticHintWithFallback(
    request: GeminiSocraticRequest,
    fallbackTask?: any
  ): Promise<SocraticHintResponse> {
    const staticFallback: SocraticHintResponse = (fallbackTask?.id && TASK_HINTS[fallbackTask.id]) || {
        pedagogical_intent: 'conceptual',
        error_category: 'conceptual',
        questionHe: 'מה הפעולה המתמטית שצריך לבצע בבית המספרים?',
        choices: [
          { id: 'opt_1', textHe: 'לבדוק את כמות הלבנים בכל טור בבית המספרים', isCorrect: true },
          { id: 'opt_2', textHe: 'לפרוט עשרת אחת ל-10 יחידות', isCorrect: false },
          { id: 'opt_3', textHe: 'לקבץ 10 יחידות לעשרת אחת', isCorrect: false },
        ],
        correctChoiceId: 'opt_1',
      };

    try {
      const hint = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: fallbackTask || { id: request.exercise_id },
        targetNode: request.exercise_id,
        activeColumnName: ['יחידות', 'עשרות', 'מאות'][request.active_column_index] || 'יחידות',
        counts: {
          units: request.workspace_state.ones_count,
          tens: request.workspace_state.tens_count,
          hundreds: request.workspace_state.hundreds_count,
          thousands: 0,
        },
        recentActions: (request.recent_actions || []).map((a) => String(a.event_type)),
        qMatrixAnchor: staticFallback,
        monitoring: {
          studentId: request.student_id,
          sessionNumber: parseInt(String(request.session_id).replace(/^session_(\d+).*/, '$1'), 10) || undefined,
          activeColumnIndex: request.active_column_index,
          triggerReason: request.student_progress_state?.trigger_reason ?? null,
          consecutiveErrors: request.student_progress_state?.consecutive_errors_count ?? 0,
          memoryCircles: request.workspace_state.memory_circles,
          hasRegroupedInCanvas: request.workspace_state.is_regrouped_in_canvas,
          operands: request.exercise_context
            ? { a: request.exercise_context.number_a, b: request.exercise_context.number_b, isSubtraction: request.exercise_context.operation === 'subtraction' }
            : null,
          recentEvents: request.recent_actions,
        },
      });

      if (hint) {
        return hint;
      }
    } catch (err) {
      console.warn('[SocraticEngine] Gemini API error, falling back to static hint:', err);
    }

    // מודול 13: "המנוע נדרש להחזיר את הסיווג בשדה error_category… והמערכת
    // שומרת אותו". הסיווג הוא של המנוע. כשהמנוע לא ענה אין סיווג — והכרטיס
    // הסטטי נשא עד כה ערך קבוע ('conceptual' / 'procedural') שנרשם
    // ב-SOCRATIC_CARD_SHOWN כאילו המנוע קבע אותו, והזין את האות הקוגניטיבי
    // ברדאר (מודול 18) ואת הדוח (מודול 23) במדידה מומצאת (מודול 24 §ב).
    // התוכן הסטטי נשאר; הסיווג — לא.
    return { ...staticFallback, error_category: null };
  }

  /**
   * Resolves a fully calibrated Socratic hint synchronously (0ms) based on the exact active task,
   * live counts, and mathematical operands without awaiting remote network requests.
   */
  /**
   * מודול 13, כלל הברזל: כרטיס חניכה לעולם אינו מוסר את התוצאה הסופית.
   *
   * socraticTextViolation נאכף עד כה על תשובת הבינה בלבד. הכרטיסים
   * הסטטיים — מה שהלומד מקבל בכל פעם שהבינה אינה זמינה, וזה המצב הנפוץ
   * ולא החריג — עקפו אותו לגמרי. חלקם מחושבים מהמספרים של התרגיל עצמו,
   * ו-groundCardInExercise מזריק את המספרים לתוך טקסט כתוב, כך שדווקא
   * שם ההזלגה סבירה יותר.
   *
   * השער עובר עכשיו על כל כרטיס שיוצא מכאן. כרטיס שמפר את הכלל מוחלף
   * בכרטיס הכללי, שאינו מכיל מספרים כלל — עדיף רמז רחב על פני מסירת
   * התשובה לילד.
   */
  private static enforceIronRule(card: SocraticHintResponse, currentTask?: any): SocraticHintResponse {
    const texts = [card.questionHe, ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
    // What the child must find is never shown: the result, the hidden digits of
    // a skeleton, a number the task asks for (staticSocraticCards.secretNumbersOf).
    // 10, 100 and 1,000 are the names of the regroupings themselves.
    const secrets = secretNumbersOf(currentTask).filter((n) => n !== 10 && n !== 100 && n !== 1000);
    const leaked = revealsSecret(texts, secrets);
    const violation =
      socraticTextViolation(texts, null) ??
      (leaked !== null ? 'final answer leaked' : null) ??
      absentAidViolation(texts, meetingOfTaskId(currentTask?.id));
    if (!violation) return card;

    console.warn('[SocraticEngine] Static card rejected by the Module 13 iron rule:', violation, currentTask?.id);
    // Meeting 8 has no blocks on the screen: its fallback is מסמך 03's own
    // meeting-8 card, which speaks of the exercise and the memory circles only.
    return blocksOnScreen(meetingOfTaskId(currentTask?.id)) ? GENERAL_FALLBACK : TASK_HINTS['s8_card'];
  }

  public static getSynchronousTaskHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse {
    const card = SocraticEngine.enforceIronRule(
      SocraticEngine.resolveStaticHint(currentTask, counts),
      currentTask
    );
    // What the child reads follows the exercise; the category stays what main
    // computed for the same exercise and board (socraticResearchCategory.ts).
    // It is no longer recorded: when the static card is what the child sees,
    // SOCRATIC_CARD_SHOWN carries error_category null — the classification is
    // the engine's (owner, 28.9.2026; X19; useWorkspaceStore.fetchSocraticHint).
    return { ...card, error_category: researchErrorCategory(currentTask, counts) };
  }

  private static resolveStaticHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse {
    const currentCounts = counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 };
    const taskId: string | undefined = currentTask?.id;
    const taskType: string | undefined = currentTask?.type;
    const targetNode: string = currentTask?.targetNode || (currentTask?.requiresGrouping ? 'regrouping_fluency' : currentTask?.requiresUngrouping ? 'subtraction_regrouping' : 'basic_addition_fluency');

    // 1. Live Board Evaluation (overcrowding >=10 in any column or subtraction
    //    deficit) — only where there is a board. In meeting 8 no blocks are on
    //    the screen and the counts are always 0: reading them produced "the
    //    number house is empty, build the first number" (PRD Module 14 §ב;
    //    Module 13 §א: no aids that are not on the screen).
    if (blocksOnScreen(meetingOfTaskId(taskId))) {
      const liveHint = SocraticEngine.analyzeLiveBoardState(currentTask, targetNode, currentCounts);
      if (liveHint) return liveHint;
    }

    // 2. Direct lookup in TASK_HINTS with exact ID or normalized ID (e.g. s3_g_t1 -> s3_t1)
    const normalizedId = normalizeTaskIdForHints(taskId);
    if (taskId && TASK_HINTS[taskId]) return TASK_HINTS[taskId];
    if (normalizedId && TASK_HINTS[normalizedId]) return TASK_HINTS[normalizedId];

    if (taskType === 'session1_intro') return TASK_HINTS['s1_sandbox_controlled'];

    // 3. The card computed from the exercise on the screen: its own numbers
    //    (hidden digits stay hidden), the column where it really converts, and
    //    in meeting 8 the memory circles instead of blocks (register, approved
    //    deviation 2; owner, 28.9.2026 — staticSocraticCards.ts).
    const computed = exerciseCard(currentTask, currentCounts);
    if (computed) return computed;
    // A meeting-3 task this module does not recognise gets the card that marks
    // no representation wrong (owner, 28.9.2026, שהB.1).
    if (meetingOfTaskId(taskId) === 3) return whichNumberIsBuiltCard();

    // 4. The מסמך 03 session card, grounded in this exercise. It comes AFTER the
    //    operand-specific computation above: PRD Module 13's holistic-triad rule
    //    forbids a guiding question detached from the exercise and the live board,
    //    so a card written per session is the last resort, never the first answer,
    //    and it is served naming the exercise the learner is actually on.
    for (const key of sessionCardKeysForTaskId(taskId)) {
      const card = TASK_HINTS[key];
      if (card) return groundCardInExercise(card, currentTask);
    }

    if (targetNode && NODE_HINTS[targetNode]) return NODE_HINTS[targetNode];

    return GENERAL_FALLBACK;
  }

  static async getSocraticHint(
    currentTask: any,
    targetNode: string,
    counts: { units: number; tens: number; hundreds: number; thousands: number },
    traceData?: { hesitation_events: number; undo_clicks: number },
    _enhancedCognitiveSupport: boolean = false,
    activeColumnIndex: number = 0,
    recentActions: string[] = [],
    monitoring?: SocraticMonitoringSnapshot
  ): Promise<SocraticHintResponse | null> {
    await ready();

    // 1. Resolve synchronous baseline anchor
    const baselineAnchor = SocraticEngine.getSynchronousTaskHint(currentTask, counts);

    // 2. Map active column index
    const colNames = ['יחידות', 'עשרות', 'מאות', 'אלפים'];
    const activeColumnName = colNames[activeColumnIndex] || 'יחידות';

    // 3. Grounded AI Socratic Query (Synthesize live board numbers with Q-Matrix anchor)
    try {
      const dynamicAiHint = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
        currentTask: currentTask || {},
        targetNode: targetNode || 'general',
        activeColumnName,
        counts,
        recentActions: recentActions.length > 0 ? recentActions : [
          `Hesitations: ${traceData?.hesitation_events || 0}`,
          `Undos: ${traceData?.undo_clicks || 0}`
        ],
        qMatrixAnchor: baselineAnchor,
        monitoring: {
          activeColumnIndex,
          hesitationSeconds: traceData?.hesitation_events ? 45 : 0,
          consecutiveUndos: traceData?.undo_clicks,
          ...(monitoring ?? {}),
        },
      });

      if (dynamicAiHint) {
        return dynamicAiHint;
      }
    } catch (err) {
      console.warn('[SocraticEngine] Dynamic AI hint synthesis notice, using baseline anchor:', err);
    }

    // 4. Fallback: the grounded baseline anchor — its content, not its
    // classification. error_category is the engine's verdict (Module 13);
    // the anchor's hard-coded value would be stored as if the engine had
    // spoken. See requestSocraticHintWithFallback for the same rule.
    return baselineAnchor ? { ...baselineAnchor, error_category: null } : baselineAnchor;
  }
}
