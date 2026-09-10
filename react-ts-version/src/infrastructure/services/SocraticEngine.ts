import { functions, authReady } from "@/infrastructure/firebase";
import { httpsCallable } from "firebase/functions";
import type { GeminiSocraticRequest, GeminiSocraticResponse, GeminiSocraticOption } from "@/types";
import type { TelemetryEventType, TelemetryPayload } from "@/types/telemetry";
import { normalizeStudentId } from "@/application/useChatStore";
import { digitAt, type Place } from "@/core/placeValue";

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
  return {
    ...card,
    questionHe: `${context}: ${card.questionHe}`,
    tts_text: card.tts_text ? `${context}: ${card.tts_text}` : card.tts_text,
  };
}

/**
 * Static-card keys for a session 3–8 exercise id (compulsory or early-finisher):
 * the path-specific card first (`s3_r_card`), then the session card (`s3_card`).
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
  | 'conversion_not_performed';

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
      if (texts.some((t) => re.test(t))) return 'final answer leaked';
    }
  }
  return null;
}

/** Same operation inference analyzeLiveBoardState uses, so the AI and the static engine never disagree on the sign. */
export function inferIsSubtraction(task: any, targetNode?: string): boolean {
  if (!task) return targetNode === 'subtraction_regrouping';
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
const TASK_HINTS: Record<string, SocraticHintResponse> = {

  // ── Session 1 ──────────────────────────────────────────────

  // Task: ארגז חול — גרירת 5 פריטים + מחיקת 1 בפח
  // DO NOT show Socratic coach for this task (handled in requestHelp)
  // This entry exists only as a fallback safety net
  's1_sandbox_controlled': {
    pedagogical_intent: "procedural",
    tts_text: "בוא נסתכל על רשימת המשימות שלנו בצד. איזו פעולה נשאר לנו לעשות כדי לעבור לשלב הבא?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "בוא נסתכל על רשימת המשימות שלנו בצד. איזו פעולה נשאר לנו לעשות כדי לעבור לשלב הבא?",
    choices: [
      {
        id: "1",
        textHe: "לגרור את אחד הפריטים מהלוח אל פח המחזור",
        feedbackHe: "בדיוק! זו המשימה שעוד נשארה לנו כדי לסיים את האימון הטכני.",
        isCorrect: true
      },
      {
        id: "2",
        textHe: "לקבץ 10 עשרות ולהמיר אותן למאה אחת",
        feedbackHe: "זה נכון מבחינה מתמטית, אבל שים לב להוראות המשימה כרגע. אנחנו מתאמנים על שימוש בכלים במערכת, לא על פתרון תרגיל.",
        isCorrect: false
      },
      {
        id: "3",
        textHe: "לגרור עוד פריטים לבית המספרים",
        feedbackHe: "את המשימה הזו כבר סיימנו בהצלחה (מסומן לידה 'וי' ירוק). בדוק מה המשימה שעליה יש סימן שעון חול.",
        isCorrect: false
      }
    ],
    correctChoiceId: "1"
  },

  // Task: בניית מספרים עגולים — 420 = 4 מאות + 2 עשרות
  's1_license_test': {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את 420: ארבעה בלוקים בטור המאות ושניים בטור העשרות.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את המספר 420 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "4 בלוקים בטור המאות + 2 בלוקים בטור העשרות" },
      { id: "opt_2", textHe: "42 קוביות בטור היחידות" },
      { id: "opt_3", textHe: "4 בלוקים בטור העשרות + 2 בטור היחידות" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: תרגול חיבור בלי המרות — 240 + 135
  's1_t7': {
    pedagogical_intent: "conceptual",
    tts_text: "בנו את שני המספרים בטבלה וספרו כל טור בנפרד: מאות, עשרות, יחידות.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך מחברים 240 + 135 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים את שני המספרים ואז סופרים את הבלוקים בכל טור בנפרד" },
      { id: "opt_2", textHe: "רק בונים את 240 ורושמים את 135 בתיבת התשובה" },
      { id: "opt_3", textHe: "מוחקים את הבלוקים וכותבים ישירות 375" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: תרגול חיבור עם קיבוץ — 385 + 152 (requiresGrouping in Tens column: 8 tens + 5 tens = 13 tens)
  's1_t8': {
    pedagogical_intent: "procedural",
    tts_text: "בחיבור 385 + 152: 8 עשרות + 5 עשרות הן 13 עשרות. קבצו 10 עשרות למאה אחת בטור המאות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "בתרגיל 385 + 152, בטור העשרות הצטברו 8 + 5 = 13 עשרות (יותר מ-9). מה הצעד הבא שנבצע?",
    choices: [
      { id: "opt_1", textHe: "נקבץ 10 עשרות למאה אחת בטור המאות (ונשאיר 3 עשרות בטור העשרות)", isCorrect: true, feedbackHe: "נכון מאוד! 10 עשרות מומרות למאה אחת בטור המאות." },
      { id: "opt_2", textHe: "נמחק 10 עשרות לפח מבלי להוסיף מאה", isCorrect: false, feedbackHe: "רמז: מחיקת בלוקים לפח משנה את ערך המספר הכולל! יש להמיר למאה." },
      { id: "opt_3", textHe: "נרשום 13 בתוך משבצת העשרות", isCorrect: false, feedbackHe: "רמז: בכל משבצת בבית המספרים מותרת ספרה אחת בלבד (0 עד 9)." }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: חיסור — 470 − 250 (ללא פריטה)
  's1_t9': {
    pedagogical_intent: "procedural",
    tts_text: "בחיסור, בונים רק את המספר הגדול ומוציאים ממנו בלוקים לפח המחזור.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "איך מבצעים חיסור 470 − 250 בבית המספרים?",
    choices: [
      { id: "opt_1", textHe: "בונים 470 בלבד ומוחקים 2 מאות + 5 עשרות לפח המחזור" },
      { id: "opt_2", textHe: "בונים גם 470 וגם 250 ואז משווים" },
      { id: "opt_3", textHe: "כותבים 470 - 250 ישירות בתיבת התשובה" }
    ],
    correctChoiceId: "opt_1"
  },

  // Task: חיסור עם פריטת עשרות — 425 − 162 (requiresUngrouping)
  's1_t10': {
    pedagogical_intent: "procedural",
    tts_text: "חסרות לנו עשרות כדי לחסר — לחצו על קוביית המאה בלוח כדי לפרוט אותה ל-10 עשרות.",
    suggested_highlight: "tour-column-tens",
    questionHe: "חסרות לנו עשרות בלוח כדי לחסר — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "לוחצים על קוביית המאה (או גוררים לטור העשרות) — והיא נפרטת ל-10 עשרות" },
      { id: "opt_2", textHe: "מוסיפים עשרות מהמחסן" },
      { id: "opt_3", textHe: "חוסרים מלמטה למעלה בלי פריטה" }
    ],
    correctChoiceId: "opt_1"
  },

  // ── Sessions 3–8 — the Socratic cards written in מסמך 03 (one card per session,
  //    served for every exercise of that session; session 3 has a card per path). ──
  // מסמך 03 §3.3
  's3_r_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    choices: [
      { id: "opt_1", textHe: 'נשתמש ב-34 עשרות', isCorrect: true, feedbackHe: 'נכון מאוד! צברתם את הכמות המדויקת בלוח הלבנים.' },
      { id: "opt_2", textHe: 'נשתמש ב-3 מאות ו-4 עשרות', isCorrect: false, feedbackHe: 'רמז: זהו הייצוג הסטנדרטי הרגיל. אנו מבקשים לייצג את המספר באמצעות עשרות בלבד.' },
      { id: "opt_3", textHe: 'נשתמש ב-340 יחידות בודדות', isCorrect: false, feedbackHe: 'רמז: ייצוג זה צפוף ומעמיס מדי על הלוח. השתמשו בעמודת העשרות.' }
    ],
    correctChoiceId: "opt_1"
  },
  's3_g_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    suggested_highlight: "tour-column-hundreds",
    questionHe: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    choices: [
      { id: "opt_1", textHe: 'נשתמש ב-34 מאות', isCorrect: true, feedbackHe: 'נכון מאוד! צברתם את הכמות המדויקת בלוח הלבנים.' },
      { id: "opt_2", textHe: 'נשתמש ב-3 אלפים ו-4 מאות', isCorrect: false, feedbackHe: 'רמז: זהו הייצוג הסטנדרטי הרגיל. אנו מבקשים לייצג את המספר באמצעות מאות בלבד.' },
      { id: "opt_3", textHe: 'נשתמש ב-3,400 יחידות בודדות', isCorrect: false, feedbackHe: 'רמז: ייצוג זה צפוף ומעמיס מדי על הלוח. השתמשו בעמודת המאות.' }
    ],
    correctChoiceId: "opt_1"
  },
  's3_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    suggested_highlight: "tour-column-hundreds",
    questionHe: 'בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות?',
    choices: [
      { id: "opt_1", textHe: 'נשתמש ב-34 מאות', isCorrect: true, feedbackHe: 'נכון מאוד! צברתם את הכמות המדויקת בלוח הלבנים.' },
      { id: "opt_2", textHe: 'נשתמש ב-3 אלפים ו-4 מאות', isCorrect: false, feedbackHe: 'רמז: זהו הייצוג הסטנדרטי הרגיל. אנו מבקשים לייצג את המספר באמצעות מאות בלבד.' },
      { id: "opt_3", textHe: 'נשתמש ב-3,400 יחידות בודדות', isCorrect: false, feedbackHe: 'רמז: ייצוג זה צפוף ומעמיס מדי על הלוח. השתמשו בעמודת המאות.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.4
  's4_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'בואו נחשוב רגע יחד: נצברו עשר יחידות בטור. מה עושים איתן?',
    suggested_highlight: "tour-column-units",
    questionHe: 'בואו נחשוב רגע יחד: נצברו עשר יחידות בטור. מה עושים איתן?',
    choices: [
      { id: "opt_1", textHe: 'מקבצים 10 יחידות לעשרת אחת ומעבירים אותה שמאלה לטור העשרות', isCorrect: true, feedbackHe: 'נכון מאוד! בואו נלחץ על הקבץ ונצפה בעשרת הנודדת שמאלה.' },
      { id: "opt_2", textHe: 'משאירים את כולן בטור היחידות', isCorrect: false, feedbackHe: 'רמז: טור היחידות קטן וצפוף. הוא יכול להכיל רק ספרה אחת בין 0 ל-9.' },
      { id: "opt_3", textHe: 'מוחקים את היחידות המיותרות', isCorrect: false, feedbackHe: 'רמז: מומלץ לשמור על הקוביות. הכמות המתמטית נשמרת תמיד.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.5
  's5_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'בואו נחשוב רגע יחד: אין מספיק יחידות כדי להחסיר. מה עושים?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'בואו נחשוב רגע יחד: אין מספיק יחידות כדי להחסיר. מה עושים?',
    choices: [
      { id: "opt_1", textHe: 'פורטים עשרת אחת לעשר יחידות בודדות ומעבירים אותן לטור היחידות', isCorrect: true, feedbackHe: 'נכון מאוד! בואו נלחץ על כפתור הפריטה ונצפה בעשרת המתפרקת ליחידות.' },
      { id: "opt_2", textHe: 'מחסירים את המספר הקטן מהמספר הגדול בטור היחידות', isCorrect: false, feedbackHe: 'רמז: בואו נשמור על סדר התרגיל ונחסיר את המחסר מהמחוסר.' },
      { id: "opt_3", textHe: 'כותבים את התשובה בטור העשרות תחילה', isCorrect: false, feedbackHe: 'רמז: באלגוריתם הטורי מומלץ להתחיל מטור היחידות.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.6
  's6_card':   {
    pedagogical_intent: "conceptual",
    error_category: "conceptual",
    tts_text: 'בואו נחשוב רגע יחד: איך פורטים כשבטור העשרות יש אפס?',
    suggested_highlight: "tour-column-hundreds",
    questionHe: 'בואו נחשוב רגע יחד: איך פורטים כשבטור העשרות יש אפס?',
    choices: [
      { id: "opt_1", textHe: 'פרטו תחילה לבנת מאה אחת לעשר עשרות בטור העשרות', isCorrect: true, feedbackHe: 'מצוין! כעת בואו נלחץ על לבנת המאה ונצפה בעשרות הנוצרות על הלוח.' },
      { id: "opt_2", textHe: 'התעלמו מהאפס והמשיכו לטור הבא', isCorrect: false, feedbackHe: 'רמז: ספרת האפס היא שומר מקום חשוב. בואו נתחשב בה בחישוב.' },
      { id: "opt_3", textHe: 'הוסיפו עשרת אחת לטור היחידות ללא פריטה', isCorrect: false, feedbackHe: 'רמז: בואו נשמור על ערך המספר המקורי תמיד.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.7
  's7_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'בואו נחשוב רגע יחד: איך נגלה כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    suggested_highlight: "tour-column-tens",
    questionHe: 'בואו נחשוב רגע יחד: איך נגלה כמה יחידות או עשרות חסרות כדי להגיע לתוצאה?',
    choices: [
      { id: "opt_1", textHe: 'ניעזר בלבני הדינס משמאל: נבדוק כמה עשרות יש לנו כעת וכמה חסרות כדי להגיע לתוצאה הרשומה בלוח בית המספרים', isCorrect: true, feedbackHe: 'מדויק! בואו נבצע את הבדיקה על הלוח ונכתוב את הספרה החסרה.' },
      { id: "opt_2", textHe: 'ננחש מספר אקראי ונכתוב אותו בתיבת התשובה', isCorrect: false, feedbackHe: 'רמז: בואו נשתמש בלוח הלבנים כדי להוכיח את התשובה בבטחה.' },
      { id: "opt_3", textHe: 'נעבור לפתור את הטור הבא תחילה', isCorrect: false, feedbackHe: 'רמז: באלגוריתם הטורי מומלץ להתקדם לפי הסדר כדי לנהל נכון את ההמרות בעיגולי הזיכרון.' }
    ],
    correctChoiceId: "opt_1"
  },
  // מסמך 03 §3.8
  's8_card':   {
    pedagogical_intent: "procedural",
    error_category: "procedural",
    tts_text: 'בואו נחשוב רגע יחד: כיצד תפתרו את התרגיל כאשר אין לכם לבני דינס על המסך?',
    suggested_highlight: "tour-column-units",
    questionHe: 'בואו נחשוב רגע יחד: כיצד תפתרו את התרגיל כאשר אין לכם לבני דינס על המסך?',
    choices: [
      { id: "opt_1", textHe: 'נתבונן בלוח בית המספרים וניעזר בעיגולי הזיכרון בראש הטורים כדי לנהל את ההמרה או הפריטה בשלבים', isCorrect: true, feedbackHe: 'מצוין! התקדמו טור אחר טור ורשמו את המעברים בעיגולי הזיכרון.' },
      { id: "opt_2", textHe: 'ננחש את התוצאה הסופית ונקליד אותה מיד', isCorrect: false, feedbackHe: 'רמז: הימנעו מניחושים מהירים. פתרו את התרגיל בצורה מסודרת מימין לשמאל.' },
      { id: "opt_3", textHe: 'נמתין שהמערכת תציג לנו את התשובה הנכונה', isCorrect: false, feedbackHe: 'רמז: המערכת לא תציג תשובות מוכנות. האוטונומיה היא שלכם, נסו לפתור שלב אחר שלב.' }
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
      { id: "opt_1", textHe: "בונים את שני המספרים וסופרים את הבלוקים בכל טור בנפרד" },
      { id: "opt_2", textHe: "בונים רק את המספר הגדול" },
      { id: "opt_3", textHe: "מוחקים את כל הבלוקים ורושמים ישירות" }
    ],
    correctChoiceId: "opt_1"
  },
  regrouping_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "כאשר יש 10 בלוקים ומעלה בטור — יש לבצע קיבוץ לטור הבא.",
    suggested_highlight: "tour-column-units",
    questionHe: "יש יותר מ-9 בלוקים בטור — מה עושים?",
    choices: [
      { id: "opt_1", textHe: "מקבצים 10 בלוקים לבלוק גדול אחד בטור הבא" },
      { id: "opt_2", textHe: "כותבים 10 בתוצאה" },
      { id: "opt_3", textHe: "מוחקים בלוקים מיותרים" }
    ],
    correctChoiceId: "opt_1"
  },
  flexible_regrouping: {
    pedagogical_intent: "conceptual",
    tts_text: "ניתן לפרוט בלוק גדול לקטנים יותר — הכמות הכוללת לא משתנה.",
    suggested_highlight: "tour-column-hundreds",
    questionHe: "כיצד מייצגים את אותו מספר בדרך אחרת?",
    choices: [
      { id: "opt_1", textHe: "פורטים בלוק גדול לבלוקים קטנים — הכמות נשמרת" },
      { id: "opt_2", textHe: "מוסיפים בלוקים נוספים" },
      { id: "opt_3", textHe: "לכל מספר יש ייצוג אחד בלבד" }
    ],
    correctChoiceId: "opt_1"
  },
  procedural_fluency: {
    pedagogical_intent: "procedural",
    tts_text: "עבדו טור טור מימין לשמאל — אל תשכחו לרשום שארית.",
    suggested_highlight: "tour-column-units",
    questionHe: "מה הסדר הנכון בחיבור במאונך?",
    choices: [
      { id: "opt_1", textHe: "מתחילים מיחידות, עוברים לעשרות, מאות — ורושמים שאריות" },
      { id: "opt_2", textHe: "מתחילים מהמספר הגדול" },
      { id: "opt_3", textHe: "אין חשיבות לסדר" }
    ],
    correctChoiceId: "opt_1"
  },
  zero_placeholder: {
    pedagogical_intent: "conceptual",
    tts_text: "כאשר טור ריק לחלוטין — כותבים 0 כדי לשמור על ערכי הטורים האחרים.",
    suggested_highlight: "tour-column-tens",
    questionHe: "מה קורה לספרות האחרות אם לא נרשום 0 בטור הריק?",
    choices: [
      { id: "opt_1", textHe: "הספרות יזוזו שמאלה וישנו את ערך המספר כולו" },
      { id: "opt_2", textHe: "כלום — אפשר לדלג על טורים ריקים" },
      { id: "opt_3", textHe: "הטורים הריקים לא משפיעים" }
    ],
    correctChoiceId: "opt_1"
  },
  relational_thinking: {
    pedagogical_intent: "focus",
    tts_text: "חשבו: אם הפעולה הפוכה — חיבור ↔ חיסור — מה אפשר לגלות מכך?",
    suggested_highlight: "tour-place-value-board",
    questionHe: "איך פעולה הפוכה עוזרת לנו לבדוק תשובה?",
    choices: [
      { id: "opt_1", textHe: "מחסירים את אחד המחוברים מהסכום — אם מקבלים את השני, נכון" },
      { id: "opt_2", textHe: "עושים שוב את אותה פעולה" },
      { id: "opt_3", textHe: "פעולה הפוכה לא קשורה לבדיקה" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_subtrahend: {
    pedagogical_intent: "conceptual",
    tts_text: "אם יודעים מה נשאר — נחסר אותו מהמספר המקורי כדי לגלות מה חסרנו.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים את הספרה החסרה בחיסור?",
    choices: [
      { id: "opt_1", textHe: "תוצאה - מה שנשאר = הספרה שחסרנו" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "אי אפשר למצוא" }
    ],
    correctChoiceId: "opt_1"
  },
  missing_addend: {
    pedagogical_intent: "conceptual",
    tts_text: "מחוברים + מחוברים = סכום. אם חסר מחוברים, אפשר לחסר מהסכום.",
    suggested_highlight: "tour-place-value-board",
    questionHe: "כיצד מוצאים מחוברים חסר?",
    choices: [
      { id: "opt_1", textHe: "סכום - מחוברים ידוע = מחוברים חסר" },
      { id: "opt_2", textHe: "מנחשים" },
      { id: "opt_3", textHe: "מחברים את כל המספרים" }
    ],
    correctChoiceId: "opt_1"
  }
};

const GENERAL_FALLBACK: SocraticHintResponse = {
  pedagogical_intent: "focus",
  tts_text: "בדקו מה בנוי בלוח ומה הצעד הבא הנדרש.",
  suggested_highlight: "tour-place-value-board",
  questionHe: "מה הצעד הבא שצריך לעשות בבית המספרים?",
  choices: [
    { id: "opt_1", textHe: "בודק את הלוח — מספר הבלוקים בכל טור ומה חסר" },
    { id: "opt_2", textHe: "כותב את התשובה מיד" },
    { id: "opt_3", textHe: "מוחק הכל ומתחיל מחדש" }
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
        tts_text: "חסרות לנו יחידות בלוח כדי לחסר. פרטו עשרת אחת ל-10 יחידות.",
        suggested_highlight: "tour-column-units",
        questionHe: "חסרות לנו יחידות בלוח לחיסור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "פורטים עשרת אחת מטור העשרות ל-10 יחידות" },
          { id: "opt_2", textHe: "מוסיפים יחידות מהמחסן" },
          { id: "opt_3", textHe: "חוסרים מלמטה למעלה" }
        ],
        correctChoiceId: "opt_1"
      },
      addition_regrouping: {
        pedagogical_intent: "procedural",
        tts_text: "יש יותר מ-9 קוביות בטור — קבצו 10 לבלוק אחד גדול יותר.",
        suggested_highlight: "tour-column-units",
        questionHe: "יש יותר מ-9 קוביות בטור — מה עושים?",
        choices: [
          { id: "opt_1", textHe: "מקבצים 10 יחידות לעשרת אחת" },
          { id: "opt_2", textHe: "מוחקים את הקוביות המיותרות" },
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

    // 1. Overcrowding Check (>= 10 blocks in a column)
    if (counts.units >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור היחידות יש ${counts.units} קוביות. עלינו לקבץ 10 מהן לעשרת אחת.`,
        suggested_highlight: "tour-column-units",
        questionHe: `בטור היחידות הצטברו ${counts.units} קוביות (יותר מ-9). מה הצעד הבא שנבצע?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 יחידות מטור היחידות ונמיר אותן לעשרת אחת בטור העשרות", 
            isCorrect: true, 
            feedbackHe: "תשובה נכונה! לחצו על כפתור הקבץ (10) שבראש טור היחידות." 
          },
          { 
            id: "opt_2", 
            textHe: "נמחק 10 יחידות מטור היחידות לפח מבלי להוסיף עשרת", 
            isCorrect: false, 
            feedbackHe: "רמז: מחיקת בלוקים לפח משנה את ערך המספר! עלינו לשמר את הכמות הכוללת בעזרת המרה. אפשר להשתמש בביטול ↩️." 
          },
          { 
            id: "opt_3", 
            textHe: "נעביר קובייה אחת בלבד לטור העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: 1 עשרת שווה בדיוק ל-10 יחידות. העברת קובייה אחת אינה שקולה לעשרת. אפשר להשתמש בביטול ↩️." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.tens >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור העשרות יש ${counts.tens} עשרות. עלינו לקבץ 10 מהן למאה אחת.`,
        suggested_highlight: "tour-column-tens",
        questionHe: `בטור העשרות הצטברו ${counts.tens} עשרות (יותר מ-9). מה עלינו לעשות?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 עשרות ונקבץ אותן למאה אחת בטור המאות", 
            isCorrect: true, 
            feedbackHe: "נכון מאוד! לחצו על כפתור הקבץ (10) שבראש טור העשרות כדי להמיר למאה אחת." 
          },
          { 
            id: "opt_2", 
            textHe: "נמחק עשרות מיותרות לפח המחזור", 
            isCorrect: false, 
            feedbackHe: "רמז: אסור למחוק בלוקים ללא המרה כדי לא לאבד מהערך הכולל של המספר." 
          },
          { 
            id: "opt_3", 
            textHe: "נרשום מספר דו-ספרתי במשבצת העשרות", 
            isCorrect: false, 
            feedbackHe: "רמז: בכל משבצת בבית המספרים מותרת רק ספרה אחת (0 עד 9)." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    if (counts.hundreds >= 10) {
      return {
        pedagogical_intent: "procedural",
        tts_text: `בטור המאות יש ${counts.hundreds} מאות. עלינו לקבץ 10 מהן לאלף אחד.`,
        suggested_highlight: "tour-column-hundreds",
        questionHe: `בטור המאות הצטברו ${counts.hundreds} מאות (יותר מ-9). מה הפעולה הנדרשת?`,
        choices: [
          { 
            id: "opt_1", 
            textHe: "נאסוף 10 מאות ונקבץ אותן לאלף אחד בטור האלפים", 
            isCorrect: true, 
            feedbackHe: "מצוין! לחצו על כפתור הקבץ (10) שבראש טור המאות לקבצן לאלף אחד." 
          },
          { 
            id: "opt_2", 
            textHe: "נשאיר 10 מאות באותו הטור", 
            isCorrect: false, 
            feedbackHe: "רמז: כל טור יכול להכיל לכל היותר 9 בלוקים." 
          },
          { 
            id: "opt_3", 
            textHe: "נמחק מאות לפח המחזור", 
            isCorrect: false, 
            feedbackHe: "רמז: שמרו על הכמות הכוללת בעזרת קיבוץ לאלפים." 
          }
        ],
        correctChoiceId: "opt_1"
      };
    }

    // 2. Subtraction Deficit Checks
    const isSubtraction = currentTask?.isSubtraction || 
                          (typeof currentTask?.instructionHe === 'string' && (currentTask.instructionHe.includes('חסר') || currentTask.instructionHe.includes('הפחת'))) ||
                          (typeof currentTask?.exercise === 'string' && currentTask.exercise.includes('-')) ||
                          targetNode === 'subtraction_regrouping';

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
          tts_text: `בחיסור בונים בבית המספרים רק את המספר הראשון${minuend !== undefined ? ` (${minuend})` : ''}, ואחר כך מוציאים ממנו.`,
          suggested_highlight: "tour-palette",
          questionHe: `בית המספרים עדיין ריק. בחיסור, מה בונים קודם?`,
          choices: [
            {
              id: "opt_1",
              textHe: `נבנה רק את המספר הראשון${minuend !== undefined ? ` (${minuend})` : ''} מהמחסן, ואחר כך נוציא ממנו ${subtrahend} לפח המחזור`,
              isCorrect: true,
              feedbackHe: "נכון! גררו קוביות מהמחסן עד שהלוח מראה את המספר הראשון, ורק אז הוציאו ממנו."
            },
            {
              id: "opt_2",
              textHe: "נבנה את שני המספרים בבית המספרים ונחבר אותם",
              isCorrect: false,
              feedbackHe: "רמז: בחיסור לא בונים את שני המספרים. בונים את הראשון ומוציאים ממנו את השני."
            },
            {
              id: "opt_3",
              textHe: "נקליד את התוצאה בלי לבנות כלום",
              isCorrect: false,
              feedbackHe: "רמז: קודם מייצגים את המספר בקוביות, ורק אחר כך כותבים את התוצאה."
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

      // Check Units Deficit — real for this exercise, and not yet resolved on the board.
      if (needUnits && unitsB > 0 && counts.units < unitsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.units} יחידות בלוח ואנו צריכים להחסיר ${unitsB}. פרטו עשרת אחת ל-10 יחידות.`,
          suggested_highlight: "tour-column-tens",
          questionHe: `יש לנו ${counts.units} יחידות בלוח ואנו צריכים להחסיר ${unitsB} יחידות. מה הצעד הנכון לבצע?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על עשרת אחת מטור העשרות כדי לפרוט אותה ל-10 יחידות", 
              isCorrect: true, 
              feedbackHe: "מעולה! לחצו על בלוק העשרת בלוח כדי לפרוט אותו ל-10 יחידות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${unitsB} פחות ${counts.units} יחידות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו מוציאים רק מהכמות הקיימת. אי אפשר להחסיר הפוך מלמטה למעלה. אפשר להשתמש בביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: `נוסיף ${unitsB - counts.units} יחידות חדשות מהמחסן`, 
              isCorrect: false, 
              feedbackHe: "רמז: הוספת בלוקים מהמחסן משנה את ערך המספר המקורי! יש לבצע פריטה משכן כדי לשמור על הכמות." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Tens Deficit
      if (needTens && tensB > 0 && counts.tens < tensB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.tens} עשרות ואנו צריכים להחסיר ${tensB}. פרטו מאה אחת ל-10 עשרות.`,
          suggested_highlight: "tour-column-hundreds",
          questionHe: `יש לנו ${counts.tens} עשרות בלוח ואנו צריכים להחסיר ${tensB} עשרות. מאיזה טור שכן נוכל לפרוט בלוק?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על מאה אחת מטור המאות כדי לפרוט אותה ל-10 עשרות", 
              isCorrect: true, 
              feedbackHe: "מצוין! לחצו על בלוק המאה בלוח כדי לפרוט אותו ל-10 עשרות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${tensB} פחות ${counts.tens} עשרות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו מוציאים מהכמות שיש לנו. אסור להחסיר הפוך. אפשר להשתמש בביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: "נמחק את ספרת המאות לפח המחזור", 
              isCorrect: false, 
              feedbackHe: "רמז: מחיקת מאות ללא פריטה תקטין את המספר במקום לשמר את הכמות הכוללת." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }

      // Check Hundreds Deficit
      if (needHundreds && hundredsB > 0 && counts.hundreds < hundredsB) {
        return {
          pedagogical_intent: "procedural",
          tts_text: `יש לנו ${counts.hundreds} מאות ואנו צריכים להחסיר ${hundredsB}. פרטו אלף אחד ל-10 מאות.`,
          suggested_highlight: "tour-column-thousands",
          questionHe: `יש לנו ${counts.hundreds} מאות בלוח ואנו צריכים להחסיר ${hundredsB} מאות. מה עלינו לעשות?`,
          choices: [
            { 
              id: "opt_1", 
              textHe: "נלחץ על אלף אחד מטור האלפים כדי לפרוט אותו ל-10 מאות", 
              isCorrect: true, 
              feedbackHe: "מדויק! לחצו על בלוק האלף בטור האלפים כדי לפרוט אותו ל-10 מאות." 
            },
            { 
              id: "opt_2", 
              textHe: `נחסיר הפוך: ${hundredsB} פחות ${counts.hundreds} מאות`, 
              isCorrect: false, 
              feedbackHe: "רמז: בחיסור אנו גורעים רק מהכמות הקיימת. נסה לחקור את הפריטה בעזרת כפתור הביטול ↩️." 
            },
            { 
              id: "opt_3", 
              textHe: "נוסיף מאות נוספות מהמחסן", 
              isCorrect: false, 
              feedbackHe: "רמז: הוספת בלוקים מהמחסן משנה את המספר. עלינו לשמר את הכמות על ידי פריטה מטור האלפים." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    // 3. Zero Placeholder Awareness
    if (targetNode === 'zero_placeholder') {
      const numStr = String(currentTask?.numberA || '');
      if (numStr.includes('0') && counts.tens === 0) {
        return {
          pedagogical_intent: "conceptual",
          tts_text: "כאשר אין קוביות בטור העשרות, נרשום 0 כדי לשמור על ערך המקום.",
          suggested_highlight: "tour-column-tens",
          questionHe: "כאשר אין קוביות בעמודת העשרות, איזה מספר נרשום בבית המספרים?",
          choices: [
            { 
              id: "opt_1", 
              textHe: "נרשום 0 בעמודת העשרות כדי לשמור על ערך המקום של שאר הספרות", 
              isCorrect: true, 
              feedbackHe: "מדויק! ה-0 שומר שהמאות לא יזוזו ימינה ויהפכו לעשרות." 
            },
            { 
              id: "opt_2", 
              textHe: "נשאיר את העמודה ריקה לחלוטין ללא ספרה", 
              isCorrect: false, 
              feedbackHe: "רמז: אם נשאיר ריק, הספרות יתחברו והמספר כולו ישתנה!" 
            },
            { 
              id: "opt_3", 
              textHe: "נרשום 1 בעמודת העשרות", 
              isCorrect: false, 
              feedbackHe: "רמז: אין בלוקים בעמודה זו, ולכן הערך שלה הוא 0." 
            }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

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
      const operands: { a: number; b: number; isSubtraction: boolean } | null =
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
        const da = digitAt(operands.a, activeColumn);
        const db = digitAt(operands.b, activeColumn);
        exerciseContext = {
          operation: operands.isSubtraction ? 'subtraction' : 'addition',
          number_a: operands.a,
          number_b: operands.b,
          session_id: sessionId,
          session_topic: String(currentTask?.titleHe ?? '').slice(0, 120),
          active_column: activeColumn,
          active_column_index: colIdx,
          target_sub_problem: operands.isSubtraction ? `${da} - ${db}` : `${da} + ${db}`,
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

      const violation = socraticTextViolation(
        [guidingQuestion, ...choices.flatMap((c: { textHe: string; feedbackHe?: string }) => [c.textHe, c.feedbackHe ?? ''])],
        operands
      );
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
      trigger_reason: 'hesitation_45s' | 'consecutive_errors_4' | 'consecutive_undos_3' | 'conversion_not_performed';
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
    const staticFallback: SocraticHintResponse = (fallbackTask?.id && TASK_HINTS[fallbackTask.id]) ||
      TASK_HINTS['s1_license_test'] || {
        pedagogical_intent: 'conceptual',
        error_category: 'conceptual',
        questionHe: 'מה הפעולה המתמטית שנרצה לבצע בבית המספרים?',
        choices: [
          { id: 'opt_1', textHe: 'לבדוק את כמות הבלוקים בכל טור בבית המספרים', isCorrect: true },
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

    return staticFallback;
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
    const a = Number(currentTask?.numberA);
    const b = Number(currentTask?.numberB);
    const operands = Number.isFinite(a) && Number.isFinite(b)
      ? { a, b, isSubtraction: inferIsSubtraction(currentTask) }
      : null;

    const violation = socraticTextViolation(
      [card.questionHe, ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])],
      operands
    );
    if (!violation) return card;

    console.warn('[SocraticEngine] Static card rejected by the Module 13 iron rule:', violation, currentTask?.id);
    return GENERAL_FALLBACK;
  }

  public static getSynchronousTaskHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse {
    return SocraticEngine.enforceIronRule(
      SocraticEngine.resolveStaticHint(currentTask, counts),
      currentTask
    );
  }

  private static resolveStaticHint(
    currentTask?: any,
    counts?: { units: number; tens: number; hundreds: number; thousands: number }
  ): SocraticHintResponse {
    const currentCounts = counts || { units: 0, tens: 0, hundreds: 0, thousands: 0 };
    const taskId: string | undefined = currentTask?.id;
    const taskType: string | undefined = currentTask?.type;
    const targetNode: string = currentTask?.targetNode || (currentTask?.requiresGrouping ? 'regrouping_fluency' : currentTask?.requiresUngrouping ? 'subtraction_regrouping' : 'basic_addition_fluency');

    // 1. Live Board Evaluation (overcrowding >=10 in any column or subtraction deficit)
    const liveHint = SocraticEngine.analyzeLiveBoardState(currentTask, targetNode, currentCounts);
    if (liveHint) return liveHint;

    // 2. Direct lookup in TASK_HINTS with exact ID or normalized ID (e.g. s3_g_t1 -> s3_t1)
    const normalizedId = normalizeTaskIdForHints(taskId);
    if (taskId && TASK_HINTS[taskId]) return TASK_HINTS[taskId];
    if (normalizedId && TASK_HINTS[normalizedId]) return TASK_HINTS[normalizedId];

    if (taskType === 'session1_intro') return TASK_HINTS['s1_sandbox_controlled'];

    // 3. Mathematical operand-specific calculation
    const numA = currentTask?.numberA;
    const numB = currentTask?.numberB;
    const isSub = currentTask?.isSubtraction || (currentTask?.type === 'vertical_addition' && currentTask?.isSubtraction);

    if (numA !== undefined && numB !== undefined && !isSub) {
      const unitsSum = (numA % 10) + (numB % 10);
      const tensSum = Math.floor((numA % 100) / 10) + Math.floor((numB % 100) / 10);

      if (tensSum >= 10 || currentTask?.requiresGrouping) {
        return {
          pedagogical_intent: "procedural",
          error_category: "procedural",
          questionHe: `בתרגיל ${numA} + ${numB}, בטור העשרות הצטברו יותר מ-9 עשרות. מה הצעד הבא שנבצע?`,
          choices: [
            { id: "opt_1", textHe: "נקבץ 10 עשרות למאה אחת בטור המאות (ונשאיר את שאר העשרות בטור העשרות)", isCorrect: true, feedbackHe: "נכון מאוד! 10 עשרות שוות בדיוק למאה אחת בטור המאות." },
            { id: "opt_2", textHe: "נמחק 10 עשרות לפח מבלי להוסיף מאה", isCorrect: false, feedbackHe: "רמז: מחיקת בלוקים לפח משנה את ערך המספר הכולל!" },
            { id: "opt_3", textHe: "נרשום מספר דו-ספרתי במשבצת העשרות", isCorrect: false, feedbackHe: "רמז: בכל משבצת בבית המספרים מותרת ספרה אחת בלבד (0 עד 9)." }
          ],
          correctChoiceId: "opt_1"
        };
      } else if (unitsSum >= 10) {
        return {
          pedagogical_intent: "procedural",
          error_category: "procedural",
          questionHe: `בתרגיל ${numA} + ${numB}, בטור היחידות הצטברו ${unitsSum} יחידות (יותר מ-9). מה עלינו לעשות?`,
          choices: [
            { id: "opt_1", textHe: "נקבץ 10 יחידות לעשרת אחת בטור העשרות", isCorrect: true, feedbackHe: "מדויק! 10 יחידות מומרות לעשרת אחת." },
            { id: "opt_2", textHe: "נמחק 10 יחידות לפח המחזור", isCorrect: false, feedbackHe: "רמז: יש להמיר לעשרת כדי לשמור על הכמות הכוללת." },
            { id: "opt_3", textHe: "נרשום את שתי הספרות במשבצת היחידות", isCorrect: false, feedbackHe: "רמז: בכל משבצת מותרת רק ספרה אחת." }
          ],
          correctChoiceId: "opt_1"
        };
      }
    }

    if (numA !== undefined && numB !== undefined && isSub) {
      return {
        pedagogical_intent: "procedural",
        error_category: "procedural",
        questionHe: `בחיסור ${numA} − ${numB}, כיצד נבצע את החיסור בבית המספרים?`,
        choices: [
          { id: "opt_1", textHe: `בונים את ${numA} בלוח ומוציאים מתוכו את חלקי המספר ${numB}`, isCorrect: true, feedbackHe: "נכון מאוד! בחיסור בונים רק את המספר הגדול וגורעים ממנו." },
          { id: "opt_2", textHe: `בונים גם את ${numA} וגם את ${numB} בלוח`, isCorrect: false, feedbackHe: "רמז: בחיסור אין צורך לבנות את שני המספרים." },
          { id: "opt_3", textHe: "מחסירים מלמטה למעלה ללא פריטה", isCorrect: false, feedbackHe: "רמז: בחיסור אנו גורעים רק מהכמות הקיימת." }
        ],
        correctChoiceId: "opt_1"
      };
    }

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

    // 4. Fallback: Return the grounded baseline anchor
    return baselineAnchor;
  }
}
