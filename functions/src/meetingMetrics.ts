import * as admin from "firebase-admin";
import { isCompletedReset } from "./resetAudit";

/**
 * Per-meeting measurements derived from the learner's own telemetry events.
 * Shared by the per-meeting report (Module 23) and the research export
 * (Module 24) so both describe a meeting with the same numbers.
 */

/**
 * "session_02_student_4" / "session_3_student_user4" → 4; anything else → null.
 *
 * No session document carries a student_id field — the client writes the
 * SessionDocument type, which has none, and the Firestore schema does not
 * allow one. The learner is in the document id. Both the class report and
 * the research export read `data.student_id`, got undefined, and so never
 * attached a single session document to a learner: score_source was never
 * "session_document", and four research columns were empty for all twelve
 * learners in every meeting.
 */
export function studentNumberFromSessionId(sessionId: string): number | null {
  const m = /_student_(?:user)?(\d{1,2})$/.exec(String(sessionId || ""));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** "session_3_student_user4" / "session_03_student_4" → 3; anything else → null. */
export function sessionNumberFromId(sessionId: string): number | null {
  const m = /^session_0?(\d)(?:_|$)/.exec(String(sessionId || ""));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 8 ? n : null;
}

/**
 * PRD Module 14 §ב: "מספר משימות החובה קבוע על שבע בכל אחד מהמפגשים 2 עד 8,
 * לרבות מפגש 2 ומפגש 8". The score's denominator in every scored meeting.
 */
export const DIAGNOSTIC_COMPULSORY_COUNT = 7;
export const COMPULSORY_EXERCISES_PER_MEETING = DIAGNOSTIC_COMPULSORY_COUNT;

/**
 * PRD Module 14 §ב: "מפגש 1 הוא ארגז חול חקירתי ואינו כולל משימות חובה
 * ממוספרות, אינו מקבל ציון, ואינו מפעיל את נוסחת session_score_percent."
 *
 * Meeting 1 lets the learner meet the tools and refresh what meeting 2 will
 * diagnose, so that a wrong answer there is a real gap and not the interface
 * or rust (owner, 24.9.2026). A percentage measured while the child is still
 * learning where to drag would mix exactly those two things, and a teacher
 * could read it as a diagnosis before the diagnosis. Every score path asks
 * here — the trigger, the individual report, the class report and the research
 * export — so none of them can grade meeting 1 on its own.
 */
export const UNSCORED_MEETINGS: ReadonlySet<number> = new Set([1]);

export function isScoredMeeting(sessionNumber: number): boolean {
  return !UNSCORED_MEETINGS.has(sessionNumber);
}

/** How the learner finished one exercise. */
export type ExerciseOutcome = "first_try" | "after_correction" | "incomplete";

/**
 * Per exercise: opened and not finished, finished after a wrong digit, or
 * finished first try. The same rule as the score's numerator (Module 23 §ב),
 * without turning it into a percentage — so meeting 1 can show the teacher what
 * happened in each refresh exercise without grading it.
 */
/**
 * Meeting 1's tool steps (מסמך 03 §3.1, steps 1–5; react-ts-version
 * SESSION1_TASKS of type session1_intro). The learner does something with a
 * tool and nothing is checked, so there is no outcome to report: the report
 * shows them as tool mastery, and lists only the exercises (מסמך 04: "כיצד
 * הסתיים כל תרגיל ריענון"). A client test keeps this list equal to the bank.
 */
export const MEETING1_TOOL_STEPS: readonly string[] = [
  "s1_sandbox_controlled",
  "s1_decompose_hundred",
  "s1_build_305",
  "s1_undo_trash",
];

export function computeExerciseOutcomes(events: Record<string, any>[]): Record<string, ExerciseOutcome> {
  const sorted = [...events].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  const wrongInExercise = new Set<string>();
  const outcomes: Record<string, ExerciseOutcome> = {};
  for (const ev of sorted) {
    const exId = isExerciseEvent(ev) ? String(ev.exercise_id || "") : "";
    if (exId && !outcomes[exId]) outcomes[exId] = "incomplete";
    if (ev.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) {
      if (exId) wrongInExercise.add(exId);
    } else if (ev.event_type === "PROBLEM_COMPLETE" && exId) {
      outcomes[exId] = wrongInExercise.has(exId) ? "after_correction" : "first_try";
    }
  }
  return outcomes;
}

/** The six interface actions a learner needs before the diagnostic. */
export const TOOLS = ["drag", "decompose", "compose", "type", "undo", "trash"] as const;
export type Tool = typeof TOOLS[number];

export const TOOL_LABEL_HE: Record<Tool, string> = {
  drag: "גרירת לבני הדינס לבית המספרים",
  decompose: "פירוק לבנה (פריטה)",
  compose: "הקבצה בכפתור \"קבצו 10\"",
  type: "הקלדת ספרות",
  undo: "ביטול פעולה",
  trash: "פח האשפה",
};

/**
 * What meeting 1 is for, stated once for every reader of its reports — the
 * teacher's PDFs and the AI engine alike.
 */
export const SANDBOX_MEETING_PURPOSE_HE =
  "מפגש 1 הוא ארגז חול: היכרות עם כלי המערכת וריענון קל של החומר, לקראת מפגש האבחון (מפגש 2). " +
  "המפגש אינו מקבל ציון ואינו מסווג לקבוצת עבודה. " +
  "מטרתו שטעות באבחון תשקף פער ידע אמיתי, ולא אי-היכרות עם הממשק או שכחה.";

export interface ToolMastery {
  /** How many times the learner performed each action in the meeting. */
  used: Record<Tool, number>;
  /** The actions the learner never performed — what the teacher checks before meeting 2. */
  not_used: Tool[];
}

/**
 * Which interface tools the learner actually operated, read from the events:
 *   drag      — BLOCK_DRAG_COMPLETE onto the board (not into the trash)
 *   decompose — REGROUPING_SUCCESS, regrouping_type "decomposition" (click or drag right)
 *   compose   — REGROUPING_SUCCESS, regrouping_type "composition" (the "קבצו 10" button)
 *   type      — DIGIT_ENTERED
 *   undo      — UNDO_EXECUTED
 *   trash     — a drag into the trash, or BOARD_CLEARED
 * A drag into the trash carries the column the block left in both column
 * fields (Module 8 §א, register "ביקורת צד הילד"); no other drag does, since a
 * drag within the same column is silent.
 */
export function computeToolMastery(events: Record<string, any>[]): ToolMastery {
  const used: Record<Tool, number> = { drag: 0, decompose: 0, compose: 0, type: 0, undo: 0, trash: 0 };
  for (const ev of events) {
    switch (ev?.event_type) {
      case "BLOCK_DRAG_COMPLETE": {
        const col = ev.column_index;
        const source = ev.details?.source_column_index;
        const intoTrash = typeof col === "number" && typeof source === "number" && col === source;
        if (intoTrash) used.trash++;
        else used.drag++;
        break;
      }
      case "BOARD_CLEARED": used.trash++; break;
      case "REGROUPING_SUCCESS":
        if (ev.details?.regrouping_type === "composition") used.compose++;
        else if (ev.details?.regrouping_type === "decomposition") used.decompose++;
        break;
      case "DIGIT_ENTERED": used.type++; break;
      case "UNDO_EXECUTED": used.undo++; break;
      default: break;
    }
  }
  return { used, not_used: TOOLS.filter((t) => used[t] === 0) };
}

/**
 * Whether an event belongs to an exercise. SESSION_START carries the placeholder
 * id "ex_N_01" and REFLECTION_SUBMITTED "reflection_meeting_N": neither is an
 * exercise the learner opened. Counted as one, they put a phantom first
 * paragraph in every report ("בתרגיל הראשון (ex_3_01) הלומד… לא השלים את
 * התרגיל"), shifted every ordinal by one, added a row "פתחו 12, סיימו 0" to the
 * class table and one to every learner's attempted count.
 */
export function isExerciseEvent(ev: Record<string, any> | null | undefined): boolean {
  const type = ev?.event_type;
  if (type === "SESSION_START" || type === "REFLECTION_SUBMITTED") return false;
  // Meeting 1's tool steps are tool mastery, not exercises — in the outcomes,
  // the attempted/completed counts, the class table, the CSV and the AI input.
  return !MEETING1_TOOL_STEPS.includes(String(ev?.exercise_id ?? ""));
}

/**
 * Appendix A §2 `path_type`: a compulsory exercise, or one of the early-finisher
 * choice exercises — "consolidation" (נתיב החזרה והביסוס) or "challenge"
 * (נתיב האתגר והעומק).
 */
export type ExercisePathType = "compulsory" | "consolidation" | "challenge";

/**
 * The choice banks (react-ts-version/src/data/sessionBranchTasks.ts) are not
 * published to the catalog, so the server knows a choice exercise by its id:
 * `s{N}_{g|r}_reinforce_{k}` and `s{N}_{g|r}_challenge_{k}`. A test pins every
 * id of those banks, and every compulsory id, against this pattern.
 */
const CHOICE_EXERCISE_ID = /^s\d+_[gr]_(reinforce|challenge)_\d+$/;

/**
 * מסמך 03: "ביצועי הלומדים במשימות האקסטרה של נתיבי הבחירה … יופיעו בדוחות
 * המורה מסומנים כתרגילי בחירה, בנפרד משבעת תרגילי החובה". A catalog task that
 * declares itself optional is trusted first; otherwise the id decides.
 */
export function exercisePathType(
  exerciseId: string,
  task?: { isOptionalChoiceTask?: unknown; branchType?: unknown } | null
): ExercisePathType {
  if (task && task.isOptionalChoiceTask === true) {
    return task.branchType === "challenge" ? "challenge" : "consolidation";
  }
  const m = CHOICE_EXERCISE_ID.exec(String(exerciseId ?? ""));
  if (!m) return "compulsory";
  return m[1] === "challenge" ? "challenge" : "consolidation";
}

export function isChoiceExercise(exerciseId: string): boolean {
  return exercisePathType(exerciseId) !== "compulsory";
}

/**
 * The titles of the choice exercises, as the teacher's screen shows them
 * (react-ts-version/src/data/sessionBranchTasks.ts, `titleHe`; the screen
 * prefixes the path label, LearnerJourneyService `exerciseTitle`). The banks
 * are not published to the catalog, so the server keeps this copy; a test
 * pins it against the bank, id by id.
 */
export const CHOICE_TITLES_HE: Readonly<Record<string, string>> = {
  s3_r_reinforce_1: "ביסוס 1: ייצוג סטנדרטי של 270",
  s3_r_reinforce_2: "ביסוס 2: 270 בעשרות בלבד",
  s3_r_challenge_1: "אתגר: כל הדרכים לייצג את 320",
  s3_g_reinforce_1: "ביסוס 1: ייצוג סטנדרטי של 3,600",
  s3_g_reinforce_2: "ביסוס 2: 3,600 במאות בלבד",
  s3_g_challenge_1: "אתגר: כל הדרכים לייצג את 4,200",
  s4_r_reinforce_1: "ביסוס 1: חיבור ללא המרה",
  s4_r_reinforce_2: "ביסוס 2: המרה אחת בטור היחידות",
  s4_r_challenge_1: "אתגר: שתי המרות עוקבות",
  s4_g_reinforce_1: "ביסוס 1: חיבור ללא המרה",
  s4_g_reinforce_2: "ביסוס 2: המרה אחת בטור היחידות",
  s4_g_challenge_1: "אתגר: שלוש המרות רצופות",
  s5_r_reinforce_1: "ביסוס 1: חיסור ללא פריטה",
  s5_r_reinforce_2: "ביסוס 2: פריטה אחת בטור היחידות",
  s5_r_challenge_1: "אתגר: שתי פריטות עוקבות",
  s5_g_reinforce_1: "ביסוס 1: חיסור ללא פריטה",
  s5_g_reinforce_2: "ביסוס 2: פריטה אחת בטור היחידות",
  s5_g_challenge_1: "אתגר: שלוש פריטות רצופות",
  s6_r_reinforce_1: "ביסוס 1: קריאת האפס כשומר מקום, ללא פריטה",
  s6_r_reinforce_2: "ביסוס 2: חיסור ללא פריטה",
  s6_r_challenge_1: "אתגר: פריטה כפולה דרך שני אפסים עוקבים",
  s6_g_reinforce_1: "ביסוס 1: חיסור ללא פריטה עם אפסים",
  s6_g_reinforce_2: "ביסוס 2: חיסור ללא פריטה עם אפסים",
  s6_g_challenge_1: "אתגר: פריטה משולשת רצופה דרך שלושה אפסים",
  s7_r_reinforce_1: "ביסוס 1: ספרת יחידות חסרה בחיבור ללא המרה",
  s7_r_reinforce_2: "ביסוס 2: ספרת עשרות חסרה בחיסור ללא פריטה",
  s7_r_challenge_1: "אתגר: תרגיל שלד עם שלוש ספרות חסרות",
  s7_g_reinforce_1: "ביסוס 1: שתי ספרות חסרות בחיבור עם המרה אחת",
  s7_g_reinforce_2: "ביסוס 2: הקבצת 10 מאות לאלף אחד",
  s7_g_challenge_1: "אתגר: תרגיל שלד בתחום הרבבה עם ארבע ספרות חסרות",
};

/**
 * An exercise's name in a report: its catalog title; a choice exercise's
 * title as the teacher's screen shows it (CHOICE_TITLES_HE); otherwise a
 * Hebrew label, never the id (coordinator's decision, 2.10.2026: reports are
 * Hebrew only). Reports name meetings, not stations ("במפגש N"). The number
 * in an id is an identifier, not the exercise's place in the meeting (s1_t8 is
 * not meeting 1's eighth exercise): it is printed as one, so two unnamed
 * exercises of the same meeting stay apart.
 */
export function exerciseLabelHe(titles: Record<string, string> | null | undefined, exerciseId: string): string {
  const title = titles?.[exerciseId];
  if (typeof title === "string" && title.trim()) return title;
  const id = String(exerciseId ?? "");
  const known = CHOICE_TITLES_HE[id];
  if (known) return known;
  const choice = /^s(\d+)_(?:[gr]_)?(reinforce|challenge)_(\d+)$/.exec(id);
  if (choice) return `${choice[2] === "challenge" ? "אתגר" : "ביסוס"} ${Number(choice[3])} במפגש ${choice[1]}`;
  const meeting = /^(?:ex|s)_?(\d+)_(.*)$/.exec(id);
  if (meeting) {
    const index = /(\d+)$/.exec(meeting[2]);
    return index ? `תרגיל במפגש ${meeting[1]}, מס׳ זיהוי ${Number(index[1])}` : `תרגיל במפגש ${meeting[1]}`;
  }
  return "תרגיל";
}

/** How a choice exercise is named in the teacher's reports (the path names of מסמך 03). */
export const CHOICE_PATH_LABEL_HE: Record<Exclude<ExercisePathType, "compulsory">, string> = {
  consolidation: "תרגיל בחירה — נתיב החזרה והביסוס",
  challenge: "תרגיל בחירה — נתיב האתגר והעומק",
};

/**
 * The ids a learner's SessionDocument of one meeting can have. The client
 * writes "session_02_student_4"; telemetry uses another spelling
 * ("session_2_student_student_user4"), and the report used to look the document
 * up under THAT id, never found it, and recomputed a score that could
 * contradict the one the gate acted on.
 */
export function sessionDocumentIdCandidates(studentNumber: number, sessionNumber: number): string[] {
  const two = String(sessionNumber).padStart(2, "0");
  return [
    `session_${two}_student_${studentNumber}`,
    `session_${sessionNumber}_student_${studentNumber}`,
    `session_${two}_student_user${studentNumber}`,
    `session_${sessionNumber}_student_user${studentNumber}`,
  ];
}

const PAGE = 500;
const MAX_PAGES = 2000; // one million documents — a hard stop, never reached by a pilot class

/**
 * Every document of a query, page by page, ordered by document id. No cap.
 * Pass a base query without orderBy/limit.
 */
export async function readAllDocs(
  base: admin.firestore.Query
): Promise<Array<{ id: string; data: Record<string, any>; writtenAtMs: number | null }>> {
  const docs: Array<{ id: string; data: Record<string, any>; writtenAtMs: number | null }> = [];
  const query = base.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pageQuery: admin.firestore.Query = last ? query.startAfter(last) : query;
    const snap: admin.firestore.QuerySnapshot = await pageQuery.get();
    if (snap.empty) break;
    // The server's write time travels with the data: the reports cut a meeting at its last reset by it.
    for (const d of snap.docs) {
      const data = d.data();
      const writtenAtMs = d.createTime?.toMillis?.() ?? null;
      noteEventArrival(data, writtenAtMs);
      docs.push({ id: d.id, data, writtenAtMs });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }
  return docs;
}

export interface FirstAttemptScore {
  /** null when the meeting's compulsory count is unknown: there is no score to report. */
  scorePercent: number | null;
  correctFirstAttempt: number | null;
  attempted: number;
  denominator: number | null;
}

/**
 * PRD Module 23 §ב, applied to one meeting's telemetry:
 * "נפתר נכון בניסיון ראשון" = a PROBLEM_COMPLETE for the exercise with no
 * earlier DIGIT_ENTERED whose is_correct === false in the same exercise_id;
 * is_correct === null is ignored entirely. Score = correct ÷ compulsory × 100.
 *
 * `compulsoryTotal` is the meeting's number of compulsory exercises (7 in
 * meetings 2–8, Module 14 §ב; see resolveCompulsoryTotal). `compulsoryIds` is
 * which exercises those are.
 *
 * Two things used to go wrong here, and both produced a confident percentage
 * that was not a measurement.
 *
 * The numerator counted EVERY exercise the learner finished first try, while
 * the denominator counted compulsory exercises only. An early finisher who
 * solved 4 of 6 compulsory exercises and then 3 optional ones scored
 * min(7, 6) / 6 = 100% and was routed to the independent challenge track,
 * having failed a third of the required work.
 *
 * And when the compulsory count could not be read, the exercises the learner
 * happened to open became the denominator: opening one exercise and solving
 * it read as 100%. A session with no exercise events at all read as 0% and
 * sent the child to a remediation group on the strength of nothing.
 *
 * Now: the numerator counts compulsory exercises only when we know which they
 * are, and an unknown denominator returns null rather than a number.
 */
export function computeFirstAttemptScore(
  telemetryDocs: Record<string, any>[],
  compulsoryTotal: number | null,
  compulsoryIds?: ReadonlySet<string> | null
): FirstAttemptScore {
  const wrongBeforeComplete = new Set<string>();
  const completedFirstTry = new Set<string>();
  const attempted = new Set<string>();
  // A choice exercise never counts — also when the compulsory ids are unknown
  // (conceptual independence is measured on the compulsory exercises only).
  const counts = (exId: string) =>
    !isChoiceExercise(exId) && (!compulsoryIds || compulsoryIds.size === 0 || compulsoryIds.has(exId));
  for (const ev of telemetryDocs) {
    const exId = String(ev?.exercise_id || "");
    if (!exId || !isExerciseEvent(ev)) continue;
    attempted.add(exId);
    if (ev.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) {
      wrongBeforeComplete.add(exId);
    } else if (ev.event_type === "PROBLEM_COMPLETE" && !wrongBeforeComplete.has(exId)) {
      completedFirstTry.add(exId);
    }
  }
  const denominator = compulsoryTotal && compulsoryTotal > 0 ? compulsoryTotal : null;
  if (denominator === null) {
    return { scorePercent: null, correctFirstAttempt: null, attempted: attempted.size, denominator: null };
  }
  const firstTryCompulsory = [...completedFirstTry].filter(counts);
  const correct = Math.min(firstTryCompulsory.length, denominator);
  return {
    scorePercent: Math.round((correct / denominator) * 100),
    correctFirstAttempt: correct,
    attempted: attempted.size,
    denominator,
  };
}

/**
 * PRD 14 §ב0 / 23 §ב / 24: "דקות פעילות = מספר הדקות השלמות שבהן הגיע מהלומד
 * לפחות אירוע טלמטריה אחד במפגש" — the one definition of active minutes, for
 * the catch-up rounds (catchUpRounds.ts) as for the reports and the research
 * export. A minute is floor(t / 60000) of the time the event reached the
 * server (the telemetry_logs document's createTime); an event whose arrival is
 * unknown (built in memory, a test) counts by its client_timestamp.
 */
const arrivalTimes = new WeakMap<object, number>();

/** The readers note each event's server write time here (readAllDocs, readMeetingTelemetry, the runs). */
export function noteEventArrival(event: Record<string, any> | null | undefined, writtenAtMs: number | null | undefined): void {
  if (event && typeof event === "object" && typeof writtenAtMs === "number" && Number.isFinite(writtenAtMs)) {
    arrivalTimes.set(event, writtenAtMs);
  }
}

/** When the event reached the server, else its client_timestamp; null when neither is known. */
export function eventArrivalMs(event: Record<string, any> | null | undefined): number | null {
  if (!event || typeof event !== "object") return null;
  const written = arrivalTimes.get(event);
  if (typeof written === "number") return written;
  return typeof event.client_timestamp === "number" && Number.isFinite(event.client_timestamp) ? event.client_timestamp : null;
}

/** Pure. Distinct whole minutes (floor(t / 60000)) among the times, within [from, to] when given. */
export function countActiveMinutes(timesMs: Array<number | null | undefined>, from = -Infinity, to = Infinity): number {
  if (!(from <= to)) return 0;
  const minutes = new Set<number>();
  for (const t of timesMs) {
    if (typeof t === "number" && Number.isFinite(t) && t >= from && t <= to) minutes.add(Math.floor(t / 60000));
  }
  return minutes.size;
}

/** Active minutes of one meeting's events (countActiveMinutes over eventArrivalMs). */
export function activeMinutesOfEvents(events: Record<string, any>[]): number {
  return countActiveMinutes(events.map(eventArrivalMs));
}

export interface MeetingSummary {
  events: number;
  first_event_at: number | null;
  last_event_at: number | null;
  active_minutes: number;
  exercises_attempted: number;
  exercises_completed: number;
  wrong_digits: number;
  digits_entered: number;
  deletions: number;
  undos: number;
  hesitations: number;
  hesitation_seconds_total: number;
  regroupings: number;
  socratic_cards: number;
  reflection_submitted: boolean;
  /** Module 10 grid opened by the 30s hesitation stage. */
  grid_openings: number;
  /** Module 10 grid brought back by the learner after closing it (מסמך 03 §1.3 ב'). */
  grid_reopenings: number;
  /** Module 9: digit keys pressed on a locked result cell. */
  keyboard_lock_blocks: number;
  /** Silent calls to the teacher. */
  help_requests: number;
  /** Silent calls the learner took back with a second press (owner, 30.9.2026). Research data only. */
  help_withdrawals: number;
  /** Register deviation 28: the result-row place-cue scaffold appeared (a digit in the wrong place). */
  place_cue_scaffolds: number;
  /** Requests for help from the chat (owner, 1.10.2026). Also help in measure 2א. */
  chat_help_requests: number;
}

/** Counters of what happened in one meeting, straight from its events. */
export function summarizeMeeting(events: Record<string, any>[]): MeetingSummary {
  const attempted = new Set<string>();
  const completed = new Set<string>();
  let first: number | null = null;
  let last: number | null = null;
  const s: MeetingSummary = {
    events: events.length,
    first_event_at: null,
    last_event_at: null,
    active_minutes: 0,
    exercises_attempted: 0,
    exercises_completed: 0,
    wrong_digits: 0,
    digits_entered: 0,
    deletions: 0,
    undos: 0,
    hesitations: 0,
    hesitation_seconds_total: 0,
    regroupings: 0,
    socratic_cards: 0,
    reflection_submitted: false,
    grid_openings: 0,
    grid_reopenings: 0,
    keyboard_lock_blocks: 0,
    help_requests: 0,
    help_withdrawals: 0,
    place_cue_scaffolds: 0,
    chat_help_requests: 0,
  };
  for (const ev of events) {
    const t = typeof ev.client_timestamp === "number" ? ev.client_timestamp : null;
    if (t !== null) {
      first = first === null ? t : Math.min(first, t);
      last = last === null ? t : Math.max(last, t);
    }
    const exId = String(ev.exercise_id || "");
    const isExercise = Boolean(exId) && isExerciseEvent(ev);
    if (isExercise) attempted.add(exId);
    switch (ev.event_type) {
      // Completed only what was attempted: a completion without an exercise
      // (a tool step) is not one more exercise completed.
      case "PROBLEM_COMPLETE": if (isExercise) completed.add(exId); break;
      case "DIGIT_ENTERED":
        s.digits_entered++;
        if (ev.details?.is_correct === false) s.wrong_digits++;
        break;
      case "DIGIT_DELETED": s.deletions++; break;
      case "UNDO_EXECUTED": s.undos++; break;
      case "HESITATION_DETECTED":
        s.hesitations++;
        if (typeof ev.details?.hesitation_seconds === "number") s.hesitation_seconds_total += ev.details.hesitation_seconds;
        break;
      case "REGROUPING_SUCCESS": s.regroupings++; break;
      case "SOCRATIC_CARD_SHOWN": s.socratic_cards++; break;
      case "REFLECTION_SUBMITTED": s.reflection_submitted = true; break;
      case "ADAPTIVE_GRID_TOGGLED":
        if (ev.details?.action === "opened") {
          if (ev.details?.source === "learner") s.grid_reopenings++;
          else s.grid_openings++;
        }
        break;
      case "KEYBOARD_LOCK_BLOCKED": s.keyboard_lock_blocks++; break;
      case "HELP_REQUESTED": s.help_requests++; break;
      case "HELP_WITHDRAWN": s.help_withdrawals++; break;
      case "PLACE_CUES_SHOWN": s.place_cue_scaffolds++; break;
      case "CHAT_HELP_REQUESTED": s.chat_help_requests++; break;
      default: break;
    }
  }
  s.first_event_at = first;
  s.last_event_at = last;
  // Whole minutes in which an event arrived — not the span from first to last
  // event (PRD 14 §ב0: one definition, the catch-up rounds' own).
  s.active_minutes = activeMinutesOfEvents(events);
  s.exercises_attempted = attempted.size;
  s.exercises_completed = completed.size;
  return s;
}

/**
 * The Hebrew title of every exercise in a meeting's published banks (both
 * paths), as the teacher's screens show them — the reports used to print the
 * ids ("s4_g_t1"). The choice banks are not published, so a choice exercise is
 * not here and keeps its id.
 */
export async function readExerciseTitles(
  db: admin.firestore.Firestore,
  sessionNumber: number
): Promise<Record<string, string>> {
  const titles: Record<string, string> = {};
  for (const bankId of [`session_${sessionNumber}`, `session_${sessionNumber}_green_path`, `session_${sessionNumber}_remediation_path`]) {
    try {
      const bankDoc = await db.collection("curriculum_catalog").doc(bankId).get();
      const tasks = bankDoc.exists ? (bankDoc.data() || {}).tasks : null;
      if (!Array.isArray(tasks)) continue;
      for (const t of tasks) {
        if (t && typeof t.id === "string" && typeof t.titleHe === "string" && t.titleHe.trim() && !titles[t.id]) titles[t.id] = t.titleHe;
      }
    } catch {
      /* catalog unavailable: the exercise keeps its id */
    }
  }
  return titles;
}

/**
 * How many compulsory exercises a meeting has, and which ones they are for a
 * given path.
 *
 * The count is the PRD's, not the catalog's: Module 14 §ב fixes it at seven in
 * every meeting from 2 to 8, so the denominator is 7 there, and null in
 * meeting 1, which has no compulsory exercises. It used to be the number of
 * non-choice tasks in the published bank, so a bank published with six or
 * eight tasks silently changed the formula (Module 23 §ב: "÷ 7").
 *
 * The ids still come from the Module 26 catalog in Firestore: the score's
 * numerator must count the same exercises its denominator does. Counting an
 * optional early-finisher task towards a compulsory-only denominator is what
 * let a learner who failed a third of the required work be reported at 100%.
 * When the bank is not there the ids are unknown, and the numerator falls
 * back to every non-choice exercise (computeFirstAttemptScore), capped at 7.
 */
export async function resolveCompulsoryTotal(
  db: admin.firestore.Firestore,
  sessionNumber: number,
  path: "green_path" | "remediation_path",
  cache: Map<string, number | null> = new Map(),
  idsOut?: Map<string, ReadonlySet<string>>
): Promise<number | null> {
  // Meeting 1 has no compulsory exercises (Module 14 §ב), so no denominator —
  // and no denominator is no score, on every path that asks.
  if (!isScoredMeeting(sessionNumber)) return null;
  if (sessionNumber === 2) return COMPULSORY_EXERCISES_PER_MEETING;
  const key = `${sessionNumber}:${path}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const total = COMPULSORY_EXERCISES_PER_MEETING;
  const bankIds = sessionNumber >= 3 && sessionNumber <= 8
    ? [`session_${sessionNumber}_${path}`, `session_${sessionNumber}`]
    : [`session_${sessionNumber}`];
  for (const bankId of bankIds) {
    try {
      const bankDoc = await db.collection("curriculum_catalog").doc(bankId).get();
      const tasks = bankDoc.exists ? (bankDoc.data() || {}).tasks : null;
      if (Array.isArray(tasks) && tasks.length > 0) {
        const compulsory = tasks.filter((t: any) => t && t.isOptionalChoiceTask !== true);
        const chosen = compulsory.length > 0 ? compulsory : tasks;
        if (idsOut) {
          idsOut.set(key, new Set(chosen.map((t: any) => String(t?.id ?? "")).filter(Boolean)));
        }
        break;
      }
    } catch {
      /* catalog unavailable: the count stands, the ids stay unknown */
    }
  }
  cache.set(key, total);
  return total;
}

/**
 * Every telemetry event of one meeting, in the order the learner produced
 * them. A meeting is a few hundred events; the old single page of 100 cut the
 * narrative and the analysis off after the first exercise or two.
 */
const TELEMETRY_PAGE = 500;
const TELEMETRY_MAX_PAGES = 200; // 100,000 events — far beyond one learner's meeting.

/**
 * Every telemetry event one learner produced in one meeting, whatever spelling
 * the session id happens to have.
 *
 * The learner's SessionDocument is `session_02_student_4`, but the events of
 * that same meeting carry `session_2_student_student_user4`. Reading the events
 * by the document's own `session_id` (as the score trigger did) therefore
 * matched none of them, and the meeting scored 0%.
 */
export async function readMeetingTelemetry(
  db: admin.firestore.Firestore,
  studentNumber: number,
  sessionNumber: number,
  options: { writtenAfterMs?: number | null } = {}
): Promise<Record<string, any>[]> {
  const snap = await db.collection("telemetry_logs").where("student_id", "==", studentNumber).get();
  const after = options.writtenAfterMs;
  const docs = snap.docs
    // The server's own write time, not the tablet's clock: a device clock that
    // runs behind would otherwise drop the new run's events as "before".
    .filter((d) => after == null || (d.createTime?.toMillis?.() ?? Infinity) > after)
    .map((d) => {
      const data = d.data();
      noteEventArrival(data, d.createTime?.toMillis?.() ?? null);
      return data;
    })
    .filter((e) => sessionNumberFromId(String(e?.session_id || "")) === sessionNumber);
  docs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  return docs;
}

/**
 * When the learner's current run of this meeting began: the last reset that
 * restarted this meeting for this learner, or null when there was none.
 *
 * A reset keeps the telemetry (register deviation 20, backup only), but PRD
 * 23א §ב.2 "מחזיר לתחילת המפגש": the meeting's first attempts are the new
 * run's. The score read every event the learner ever sent in the meeting, so a
 * wrong digit before a reset removed that exercise from "נכון בניסיון ראשון"
 * for good — a perfect replay scored 29% and was sent to remediation (owner,
 * live, 28.9.2026: "עשיתי הכל מושלם למה אני צריך מסלול צמצום פערי קדם").
 *
 * A reset restarts the meeting when it was carried out (not a failed attempt)
 * and covers the learner: the whole system, the whole learner, or this
 * meeting ("active_session", for the learner or the class).
 */
export function lastResetOfMeeting(
  entries: Record<string, any>[],
  studentNumber: number,
  sessionNumber: number
): number | null {
  const resets = resetsOfMeeting(entries, studentNumber, sessionNumber);
  return resets.length === 0 ? null : resets[resets.length - 1].at;
}

/** One reset that restarted a meeting for one learner (the rule of lastResetOfMeeting). */
export interface MeetingReset {
  /** performed_at: the server's time when the reset was carried out. */
  at: number;
  /** The teacher's reason from the closed list (exportDriveReport VALID_RESET_REASONS), or null. */
  reason: string | null;
  /** What was reset: the whole system, the whole learner, or this meeting. */
  scope: "system" | "full_student" | "active_session";
}

/**
 * Every reset that restarted this meeting for this learner, oldest first. The
 * same rule as lastResetOfMeeting, which is the last of these.
 */
export function resetsOfMeeting(
  entries: Record<string, any>[],
  studentNumber: number,
  sessionNumber: number
): MeetingReset[] {
  const out: MeetingReset[] = [];
  for (const e of entries) {
    // PRD 23א §ד: only a reset whose deletion completed counts (resetAudit.ts).
    if (!isCompletedReset(e)) continue;
    if (!Array.isArray(e.affected_student_ids) || !e.affected_student_ids.includes(studentNumber)) continue;
    const scope: MeetingReset["scope"] | null =
      e.reset_level === "system"
        ? "system"
        : e.reset_level === "single_student" && e.reset_scope === "full_student"
          ? "full_student"
          : e.reset_level === "single_student" && e.reset_scope === "active_session" && Number(e.session_number) === sessionNumber
            ? "active_session"
            : null;
    const at = Number(e.performed_at);
    if (scope === null || !Number.isFinite(at)) continue;
    out.push({ at, reason: typeof e.reset_reason === "string" ? e.reset_reason : null, scope });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * One meeting of one learner, cut at the last reset of that meeting.
 *
 * Owner, 2.10.2026: "אני כן רוצה אבל שיהיה תיעוד איפה היו טעויות בלי הורדת
 * ציונים". The score, the working group and the exercise table of every report
 * count `current` only — the run since the last reset, by the server's write
 * time, as the meeting-2 gate score already did (PR #161). `beforeReset` is
 * kept for the reports' "לפני האיפוס" section, which documents the earlier
 * mistakes and never enters a score.
 */
export interface MeetingRuns {
  resets: MeetingReset[];
  /** Since the last reset (every event when there was none), in the order the learner produced them. */
  current: Record<string, any>[];
  /** Before the last reset; empty when there was none. */
  beforeReset: Record<string, any>[];
  /** Server write time of the meeting's earliest event, when known. */
  firstWrittenAtMs: number | null;
}

/** A telemetry event with the server's own write time (null when unknown: counted in the current run). */
export interface WrittenEvent {
  data: Record<string, any>;
  writtenAtMs: number | null;
}

const byClientTime = (a: Record<string, any>, b: Record<string, any>) => (a.client_timestamp || 0) - (b.client_timestamp || 0);

export function splitMeetingRuns(events: WrittenEvent[], resets: MeetingReset[]): MeetingRuns {
  const cut = resets.length === 0 ? null : resets[resets.length - 1].at;
  const current: Record<string, any>[] = [];
  const beforeReset: Record<string, any>[] = [];
  let first: number | null = null;
  for (const e of events) {
    noteEventArrival(e.data, e.writtenAtMs);
    if (e.writtenAtMs !== null && (first === null || e.writtenAtMs < first)) first = e.writtenAtMs;
    // The same test as readMeetingTelemetry's writtenAfterMs.
    if (cut === null || e.writtenAtMs === null || e.writtenAtMs > cut) current.push(e.data);
    else beforeReset.push(e.data);
  }
  current.sort(byClientTime);
  beforeReset.sort(byClientTime);
  return { resets, current, beforeReset, firstWrittenAtMs: first };
}

/**
 * Every meeting of one learner, each cut at its own last reset: one read of the
 * learner's telemetry and one of the reset log. Meetings with no event are absent.
 */
/** The reset log could not be read: a reader must not fall back to counting the whole history. */
export class ResetLogUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`reset_audit_log could not be read: ${String((cause as Error)?.message ?? cause)}`);
    this.name = "ResetLogUnavailableError";
  }
}

export async function readLearnerMeetingRuns(
  db: admin.firestore.Firestore,
  studentNumber: number
): Promise<Map<number, MeetingRuns>> {
  const [telemetry, resetLog] = await Promise.all([
    db.collection("telemetry_logs").where("student_id", "==", studentNumber).get(),
    // A failure here is told apart from a telemetry failure (ResetLogUnavailableError).
    db.collection("reset_audit_log").where("affected_student_ids", "array-contains", studentNumber).get()
      .catch((err) => { throw new ResetLogUnavailableError(err); }),
  ]);
  const entries = resetLog.docs.map((d) => d.data());
  const byMeeting = new Map<number, WrittenEvent[]>();
  for (const d of telemetry.docs) {
    const data = d.data();
    const m = sessionNumberFromId(String(data?.session_id || ""));
    if (m === null) continue;
    const list = byMeeting.get(m) ?? [];
    list.push({ data, writtenAtMs: d.createTime?.toMillis?.() ?? null });
    byMeeting.set(m, list);
  }
  const out = new Map<number, MeetingRuns>();
  for (const [m, events] of byMeeting) out.set(m, splitMeetingRuns(events, resetsOfMeeting(entries, studentNumber, m)));
  return out;
}

/**
 * The events by which a learner answers: a digit typed, a coaching-card
 * choice, an exercise completed, a reflection sent. Opening the screen is not
 * one — the client logs SESSION_START and PROBLEM_LOAD as soon as the meeting
 * reopens after a reset, before the child has done anything.
 */
export const ANSWER_EVENT_TYPES: ReadonlySet<string> = new Set([
  "DIGIT_ENTERED",
  "SOCRATIC_OPTION_SELECTED",
  "PROBLEM_COMPLETE",
  "REFLECTION_SUBMITTED",
]);

export function hasAnswerEvent(events: Record<string, any>[]): boolean {
  return events.some((e) => ANSWER_EVENT_TYPES.has(String(e?.event_type ?? "")));
}

/**
 * Reset, worked on before it, and not answered anything since: the meeting has
 * not been redone yet. Scoring the screen-open events of the new run gave 0%
 * and the lowest group to a child who had not started (review of PR #209).
 */
export function isAwaitingRerun(runs: MeetingRuns | null | undefined): boolean {
  return Boolean(runs && runs.resets.length > 0 && runs.beforeReset.length > 0 && !hasAnswerEvent(runs.current));
}

/**
 * Every learner × meeting of a telemetry read, each cut at its own last reset:
 * key `${learner}:${meeting}`. For the readers that read the whole collection
 * (the class report, the research export, the admin metrics).
 */
export function meetingRunsByLearner(
  docs: Array<{ data: Record<string, any>; writtenAtMs: number | null }>,
  resetEntries: Record<string, any>[]
): Map<string, MeetingRuns> {
  const written = new Map<string, WrittenEvent[]>();
  for (const { data, writtenAtMs } of docs) {
    const m = sessionNumberFromId(String(data?.session_id || ""));
    const raw = parseInt(String(data?.student_id ?? "").replace(/\D/g, ""), 10);
    const n = Number.isFinite(raw) && raw >= 1 && raw <= 12 ? raw : null;
    if (n === null || m === null) continue;
    const key = `${n}:${m}`;
    const list = written.get(key) ?? [];
    list.push({ data, writtenAtMs });
    written.set(key, list);
  }
  const out = new Map<string, MeetingRuns>();
  for (const [key, events] of written) {
    const [n, m] = key.split(":").map(Number);
    out.set(key, splitMeetingRuns(events, resetsOfMeeting(resetEntries, n, m)));
  }
  return out;
}

export type LearningPath = "green_path" | "remediation_path";

/** The id spelling of the compulsory and choice banks of meetings 3–8: s4_g_t1, s4_r_reinforce_2. */
const PATH_EXERCISE_ID = /^s\d+_([gr])_/;

/**
 * The path the learner actually worked on in one meeting, from the exercises
 * they answered there: the path whose exercises they opened most. The bank ids
 * of the published catalog are trusted first, the id spelling after them. Null
 * when the events name no exercise of either path (or as many of each).
 *
 * The score used to take the learner's CURRENT path. The two paths have
 * different exercise ids, so a learner moved to the other track after meeting
 * 3 got 0% on every report of meeting 3 produced afterwards (audit reports-14).
 */
export function pathOfMeeting(
  events: Record<string, any>[],
  idsByPath: Partial<Record<LearningPath, ReadonlySet<string> | null | undefined>> = {}
): LearningPath | null {
  const seen: Record<LearningPath, Set<string>> = { green_path: new Set(), remediation_path: new Set() };
  for (const ev of events) {
    const exId = String(ev?.exercise_id || "");
    if (!exId || !isExerciseEvent(ev)) continue;
    if (idsByPath.green_path?.has(exId)) seen.green_path.add(exId);
    else if (idsByPath.remediation_path?.has(exId)) seen.remediation_path.add(exId);
    else {
      const m = PATH_EXERCISE_ID.exec(exId);
      if (m) seen[m[1] === "g" ? "green_path" : "remediation_path"].add(exId);
    }
  }
  const g = seen.green_path.size;
  const r = seen.remediation_path.size;
  return g === r ? null : g > r ? "green_path" : "remediation_path";
}

/**
 * The path a meeting is scored on: the one the learner worked on in it
 * (pathOfMeeting), else `fallback` (the learner's current path). Meetings 1
 * and 2 have no path of their own. Fills `idsOut` for both paths, as
 * resolveCompulsoryTotal does.
 */
export async function resolveMeetingPath(
  db: admin.firestore.Firestore,
  sessionNumber: number,
  events: Record<string, any>[],
  fallback: LearningPath,
  cache: Map<string, number | null> = new Map(),
  idsOut: Map<string, ReadonlySet<string>> = new Map()
): Promise<LearningPath> {
  if (sessionNumber < 3 || sessionNumber > 8) return fallback;
  await resolveCompulsoryTotal(db, sessionNumber, "green_path", cache, idsOut);
  await resolveCompulsoryTotal(db, sessionNumber, "remediation_path", cache, idsOut);
  return pathOfMeeting(events, {
    green_path: idsOut.get(`${sessionNumber}:green_path`),
    remediation_path: idsOut.get(`${sessionNumber}:remediation_path`),
  }) ?? fallback;
}

export async function readLastResetOfMeeting(
  db: admin.firestore.Firestore,
  studentNumber: number,
  sessionNumber: number
): Promise<number | null> {
  const snap = await db.collection("reset_audit_log")
    .where("affected_student_ids", "array-contains", studentNumber)
    .get();
  return lastResetOfMeeting(snap.docs.map((d) => d.data()), studentNumber, sessionNumber);
}

export async function readAllTelemetryForSession(
  db: admin.firestore.Firestore,
  sessionId: string
): Promise<Record<string, any>[]> {
  const docs: Record<string, any>[] = [];
  const base = db.collection("telemetry_logs")
    .where("session_id", "==", sessionId)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(TELEMETRY_PAGE);
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < TELEMETRY_MAX_PAGES; page++) {
    const pageQuery: admin.firestore.Query = last ? base.startAfter(last) : base;
    const snap: admin.firestore.QuerySnapshot = await pageQuery.get();
    if (snap.empty) break;
    for (const d of snap.docs) docs.push(d.data());
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < TELEMETRY_PAGE) break;
  }
  docs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  return docs;
}


// ---------------------------------------------------------------------------
// פער הדעיכה (מסמך 03 §1.3 א׳ ו-§3.8; Bassette et al., 2020). Session 8 is
// solved without blocks on numbers the learner already met with blocks in
// sessions 4–6, so the same learner can be compared with themselves on the
// same exercise. Owner, 16.9.2026 (register deviation 19).
// ---------------------------------------------------------------------------

/**
 * Session-8 exercise → the session 4–6 exercise with the same operands
 * (react-ts-version/src/data/sessionTasks.ts; pinned by
 * Module26_FadingPairs.test.ts on the client). Every column exercise of
 * session 8 has a twin since the owner's 16.9.2026 replacement of the two
 * that had none; the missing-digit puzzles are reported as unpaired.
 */
export const FADING_PAIRS: Record<string, string> = {
  s8_r_t1: "s4_r_t1", // 142 + 23
  s8_r_t2: "s4_r_t2", // 128 + 35
  s8_r_t3: "s4_r_t4", // 456 + 281
  s8_r_t4: "s5_r_t1", // 78 − 25
  s8_r_t5: "s5_r_t2", // 53 − 18
  s8_r_t6: "s6_r_t5", // 602 − 145
  s8_g_t1: "s4_g_t1", // 1,245 + 328
  s8_g_t2: "s4_g_t5", // 5,678 + 2,453
  s8_g_t3: "s5_g_t1", // 5,432 − 2,118
  s8_g_t4: "s5_g_t5", // 6,284 − 1,157
  s8_g_t5: "s6_g_t3", // 4,000 − 1,562
};

/** A session-8 exercise finished faster than this, without the blocks, is flagged as rushed (calibration point; owner may change). */
export const FADING_GUESS_SECONDS = 15;

export interface ExerciseAttempt {
  completed: boolean;
  /** Completed with no wrong digit before completion (same rule as computeFirstAttemptScore). */
  first_try: boolean;
  duration_ms: number | null;
}

/** One record per exercise from a meeting's events, in time order. */
export function exerciseAttempts(events: Record<string, any>[]): Record<string, ExerciseAttempt> {
  const sorted = [...events].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  const out: Record<string, ExerciseAttempt> = {};
  const wrong = new Set<string>();
  for (const ev of sorted) {
    const exId = String(ev.exercise_id || "");
    if (!exId || !isExerciseEvent(ev)) continue;
    if (!out[exId]) out[exId] = { completed: false, first_try: false, duration_ms: null };
    if (ev.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) {
      wrong.add(exId);
    } else if (ev.event_type === "PROBLEM_COMPLETE" && !out[exId].completed) {
      out[exId].completed = true;
      out[exId].first_try = !wrong.has(exId);
      const d = ev.details?.total_duration_ms;
      out[exId].duration_ms = typeof d === "number" && d >= 0 ? d : null;
    }
  }
  return out;
}

export interface FadingGap {
  /** Session-8 exercises completed whose twin was also completed in sessions 4–6. */
  pairs_measured: number;
  accuracy_with_blocks_percent: number | null;
  accuracy_without_blocks_percent: number | null;
  mean_seconds_with_blocks: number | null;
  mean_seconds_without_blocks: number | null;
  /** Session-8 exercises completed in under FADING_GUESS_SECONDS. */
  guessed_exercises: string[];
  /** Session-8 exercises attempted that have no session 4–6 twin. */
  unpaired_exercises: string[];
}

export function computeFadingGap(
  session8Events: Record<string, any>[],
  earlierEvents: Record<string, any>[]
): FadingGap {
  const now = exerciseAttempts(session8Events);
  const before = exerciseAttempts(earlierEvents);
  let n = 0;
  let firstWith = 0;
  let firstWithout = 0;
  const secWith: number[] = [];
  const secWithout: number[] = [];
  const guessed: string[] = [];
  const unpaired: string[] = [];
  for (const [id, a] of Object.entries(now)) {
    if (a.completed && a.duration_ms !== null && a.duration_ms < FADING_GUESS_SECONDS * 1000) guessed.push(id);
    const twin = FADING_PAIRS[id];
    if (!twin) { unpaired.push(id); continue; }
    const b = before[twin];
    if (!a.completed || !b || !b.completed) continue;
    n++;
    if (b.first_try) firstWith++;
    if (a.first_try) firstWithout++;
    if (b.duration_ms !== null) secWith.push(b.duration_ms / 1000);
    if (a.duration_ms !== null) secWithout.push(a.duration_ms / 1000);
  }
  const pct = (k: number): number | null => (n === 0 ? null : Math.round((k / n) * 100));
  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : Math.round((xs.reduce((p, c) => p + c, 0) / xs.length) * 10) / 10;
  return {
    pairs_measured: n,
    accuracy_with_blocks_percent: pct(firstWith),
    accuracy_without_blocks_percent: pct(firstWithout),
    mean_seconds_with_blocks: mean(secWith),
    mean_seconds_without_blocks: mean(secWithout),
    guessed_exercises: guessed.sort(),
    unpaired_exercises: unpaired.sort(),
  };
}


// ---------------------------------------------------------------------------
// מדדי המחקר 3 ו-4 (PRD 7.3, Module 23 §ב "מדדי המחקר"). Measure 1 is the
// first-attempt score above; measure 2 (2א and 2ב) is below.
// ---------------------------------------------------------------------------

/**
 * The compulsory exercises whose operation is representation: the learner
 * builds a number on the board (a required structure, or two different ways).
 * They exist in sessions 3 and 7 only, which is why measure 3 is computed
 * there. Mirrors react-ts-version/src/data/sessionTasks.ts and is pinned by
 * Module23_ResearchMeasures.test.ts on the client, like FADING_PAIRS.
 */
export const REPRESENTATION_EXERCISES: ReadonlySet<string> = new Set([
  "s3_r_t1", "s3_r_t2", "s3_r_t3", "s3_r_t4", "s3_r_t5", "s3_r_t6",
  "s3_g_t1", "s3_g_t2", "s3_g_t3", "s3_g_t4", "s3_g_t5", "s3_g_t6", "s3_g_t7",
  "s7_r_t1", "s7_r_t6", "s7_r_t7",
  "s7_g_t1", "s7_g_t5", "s7_g_t6",
]);

export const FLEXIBILITY_SESSIONS: readonly number[] = [3, 7];

/**
 * "session_3_student_user4" → the same learner's eight session ids, in the same
 * spelling. Empty when the id does not follow the pattern.
 */
export function sessionIdsOfSameLearner(sessionId: string): string[] {
  const m = /^session_(0?)\d(_.+)$/.exec(String(sessionId || ""));
  if (!m) return [];
  return [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `session_${m[1]}${k}${m[2]}`);
}

export interface FlexibilityIndex {
  /** T: compulsory representation exercises the learner completed. */
  completed: number;
  /** R: those completed with error_count === 0. */
  first_try: number;
  /** R ÷ T × 100; null when T = 0 — the measure is not computed. */
  percent: number | null;
}

/**
 * Measure 3, one meeting's events (or several meetings' events together for
 * the learner's cumulative value: ΣR ÷ ΣT). An exercise counts once, by its
 * first PROBLEM_COMPLETE. In representation exercises the client's error_count
 * counts every failed board check.
 */
export function computeFlexibilityIndex(events: Record<string, any>[]): FlexibilityIndex {
  const sorted = [...events].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  const seen = new Set<string>();
  let firstTry = 0;
  for (const ev of sorted) {
    if (ev?.event_type !== "PROBLEM_COMPLETE") continue;
    const exId = String(ev.exercise_id || "");
    if (!REPRESENTATION_EXERCISES.has(exId) || seen.has(exId)) continue;
    seen.add(exId);
    if (ev.details?.error_count === 0) firstTry++;
  }
  const completed = seen.size;
  return {
    completed,
    first_try: firstTry,
    percent: completed === 0 ? null : Math.round((firstTry / completed) * 100),
  };
}

export interface MediationEffectiveness {
  /** C: coaching cards shown. Always reported next to the percentage. */
  cards: number;
  /** S: cards after which the learner's next answer in the same exercise was correct. */
  effective: number;
  /** S ÷ C × 100; null when C = 0 — the learner needed no mediation. */
  percent: number | null;
}

/**
 * Measure 4. For each SOCRATIC_CARD_SHOWN, the learner's next answer in the
 * same exercise_id decides: the first DIGIT_ENTERED whose is_correct is not
 * null, or — where no digit is typed — a PROBLEM_COMPLETE that arrives before
 * another card. Another card first, or no answer at all, is not a success.
 * Pass one meeting's events, or all of a learner's meetings for ΣS ÷ ΣC
 * (exercise ids are unique across meetings).
 */
export function computeMediationEffectiveness(events: Record<string, any>[]): MediationEffectiveness {
  const sorted = [...events].sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  let cards = 0;
  let effective = 0;
  // exercise_id → a card is waiting for the learner's next answer there
  const pending = new Set<string>();
  for (const ev of sorted) {
    const exId = String(ev?.exercise_id || "");
    switch (ev?.event_type) {
      case "SOCRATIC_CARD_SHOWN":
        cards++;
        // A card over a still-unanswered card: the earlier one did not help.
        pending.add(exId);
        break;
      case "DIGIT_ENTERED":
        if (pending.has(exId) && typeof ev.details?.is_correct === "boolean") {
          if (ev.details.is_correct) effective++;
          pending.delete(exId);
        }
        break;
      case "PROBLEM_COMPLETE":
        if (pending.has(exId)) {
          effective++;
          pending.delete(exId);
        }
        break;
      default:
        break;
    }
  }
  return { cards, effective, percent: cards === 0 ? null : Math.round((effective / cards) * 100) };
}

/** Measure 3 as text: "2 מתוך 3 (67%)", or that it was not measured. */
export function flexibilityHe(f: FlexibilityIndex | null): string {
  return !f || f.percent === null ? "לא נמדד" : `${f.first_try} מתוך ${f.completed} (${f.percent}%)`;
}

/** Measure 4 as text. C is always shown; C = 0 is a finding of its own, not a percentage. */
export function mediationHe(m: MediationEffectiveness | null): string {
  if (!m) return "לא נמדד";
  return m.percent === null ? "לא נדרש תיווך (0 כרטיסים)" : `${m.effective} מתוך ${m.cards} כרטיסים (${m.percent}%)`;
}

// ---------------------------------------------------------------------------
// מדד 2 — התמדה וויסות עצמי (PRD Module 16 §ב; Module 23 §ב "מדדי המחקר":
// "המערכת מחשבת בצד השרת ארבעה מדדים לכל לומד ולכל מפגש… המדדים מוצגים
// בדוח הלומד ובדוח הכיתה").
//
// Owner, 30.9.2026: measure 2 has two parts, after מסמך 01 ("להתמודד עם
// אתגרים וקשיים, לבצע בקרה עצמית ולתקן טעויות"):
//   2א, התמדה — of the exercises with at least one mistake, how many the
//       learner solved without pressing the silent help call.
//   2ב, תיקון עצמי — Module 16's U ÷ (U + E + G), unchanged. Its data key
//       stays `persistence`, so every stored report still reads the same.
// ---------------------------------------------------------------------------

export interface SelfCorrectionIndex {
  /** U: UNDO_EXECUTED events. */
  undos: number;
  /** E: DIGIT_ENTERED with is_correct === false (null is not counted at all). */
  wrong_digits: number;
  /** G: SOCRATIC_OPTION_SELECTED with is_correct === false. */
  wrong_options: number;
  /** U ÷ (U + E + G) × 100; 100 when U + E + G = 0 (Module 16 §ב, the edge case). */
  percent: number;
}

/** Measure 2ב: Module 16 §ב's formula, exactly as the learner's device computes it. */
export function computeSelfCorrectionIndex(events: Record<string, any>[]): SelfCorrectionIndex {
  let undos = 0;
  let wrongDigits = 0;
  let wrongOptions = 0;
  for (const ev of events) {
    if (ev?.event_type === "UNDO_EXECUTED") undos++;
    else if (ev?.event_type === "DIGIT_ENTERED" && ev.details?.is_correct === false) wrongDigits++;
    else if (ev?.event_type === "SOCRATIC_OPTION_SELECTED" && ev.details?.is_correct === false) wrongOptions++;
  }
  const denominator = undos + wrongDigits + wrongOptions;
  return {
    undos,
    wrong_digits: wrongDigits,
    wrong_options: wrongOptions,
    percent: denominator === 0 ? 100 : Math.round((undos / denominator) * 100),
  };
}

/** Measure 2ב as text, with its three counts beside the percentage. */
export function selfCorrectionHe(p: SelfCorrectionIndex | null): string {
  if (!p) return "לא נמדד";
  return `${p.percent}% (ביטולים: ${p.undos}, ספרות שגויות: ${p.wrong_digits}, בחירות שגויות בכרטיס: ${p.wrong_options})`;
}

export interface PersistenceIndex {
  /** Exercises the learner completed after at least one mistake (a wrong digit or a wrong card choice). */
  exercises_with_errors: number;
  /** Those among them with no request for help: the silent help button or the chat (owner, 1.10.2026). */
  solved_without_help: number;
  /** solved_without_help ÷ exercises_with_errors × 100; null when no exercise had a mistake. */
  percent: number | null;
}

/**
 * Measure 2א (owner, 30.9.2026). A mistake is a DIGIT_ENTERED or a
 * SOCRATIC_OPTION_SELECTED with is_correct === false. Help is a HELP_REQUESTED
 * press in the exercise, even one the learner took back later (HELP_WITHDRAWN
 * is research data, not part of the formula), or a request for help from the
 * chat, CHAT_HELP_REQUESTED (owner, 1.10.2026: "זה אותה נקודה"). A coaching card the system
 * opened by itself is not help: the learner did not ask for it. Only
 * completed exercises count — every exercise must be solved to move on, so an
 * unfinished one is a meeting that ended, not a learner who gave up. A press
 * after the exercise was solved (on its success screen, before "next") is not
 * help with it.
 */
export function computePersistenceIndex(events: Record<string, any>[]): PersistenceIndex {
  const withError = new Set<string>();
  const withHelp = new Set<string>();
  const completed = new Set<string>();
  const sorted = [...events].sort((a, b) => (a?.client_timestamp || 0) - (b?.client_timestamp || 0));
  for (const ev of sorted) {
    const exId = String(ev?.exercise_id || "");
    if (!exId || !isExerciseEvent(ev)) continue;
    const type = ev?.event_type;
    if ((type === "DIGIT_ENTERED" || type === "SOCRATIC_OPTION_SELECTED") && ev.details?.is_correct === false) withError.add(exId);
    else if ((type === "HELP_REQUESTED" || type === "CHAT_HELP_REQUESTED") && !completed.has(exId)) withHelp.add(exId);
    else if (type === "PROBLEM_COMPLETE") completed.add(exId);
  }
  let exercises = 0;
  let alone = 0;
  for (const exId of withError) {
    if (!completed.has(exId)) continue;
    exercises++;
    if (!withHelp.has(exId)) alone++;
  }
  return {
    exercises_with_errors: exercises,
    solved_without_help: alone,
    percent: exercises === 0 ? null : Math.round((alone / exercises) * 100),
  };
}

/**
 * The research measures as the teacher reads them — one name and one sentence
 * each, the same in every report (the session report, the class report, their
 * PDFs and the class report panel on the dashboard). The panel keeps a copy in
 * react-ts-version/src/infrastructure/services/ClassReportService.ts, pinned by
 * a test there.
 */
export const RESEARCH_MEASURES_HE = [
  { key: "persistence", label: "מדד 2א: התמדה", explanation: "מתוך התרגילים שהלומד טעה בהם והשלים אותם, בכמה מהם לא ביקש עזרה: לא בלחצן העזרה השקט ולא בצ׳אט." },
  { key: "self_correction", label: "מדד 2ב: תיקון עצמי", explanation: "מתוך כל הביטולים והטעויות, כמה היו ביטולים (לחיצה על כפתור ביטול הפעולה). כשלא היו ביטולים ולא טעויות, המדד הוא 100%." },
  { key: "flexibility", label: "מדד 3: גמישות ייצוגית", explanation: "מתוך תרגילי בניית המספר שהלומד השלים, כמה מהם השלים בניסיון הראשון. נמדד במפגשים 3 ו-7." },
  { key: "mediation", label: "מדד 4: אפקטיביות התיווך", explanation: "מתוך כרטיסי החניכה שהוצגו, אחרי כמה מהם התשובה הבאה של הלומד הייתה נכונה." },
] as const;

/** Measure 2א as text: "80% (בלי קריאה לעזרה ב-4 מתוך 5 תרגילים עם טעות)", or that no exercise had a mistake. */
export function persistenceHe(p: PersistenceIndex | null): string {
  if (!p) return "לא נמדד";
  if (p.percent === null) return "לא היו טעויות";
  return `${p.percent}% (בלי קריאה לעזרה ב-${p.solved_without_help} מתוך ${p.exercises_with_errors} תרגילים עם טעות)`;
}

/**
 * Module 21: "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש… נרשם דגל
 * recording_truncated: true". The learner's client keeps the budget per
 * meeting and flags it there (recordings/{id}/recorded_bytes/meeting_{N}/
 * truncated; earlier versions wrote users/students/{id}/recorded_bytes — the
 * callers pass the record merged with both, recordingsNode.withRecordings), so
 * a meeting whose budget ran out is flagged even when the recording that hit
 * the cap holds no chunk of its own. Older recordings carry the flag only on
 * the recording node (telemetry_sessions/{id}/recording_truncated); readers
 * check both.
 */
export function meetingRecordingTruncated(learnerNode: Record<string, any> | null | undefined, meeting: number): boolean {
  const budget = learnerNode?.recorded_bytes?.[`meeting_${meeting}`];
  return Boolean(budget && typeof budget === "object" && budget.truncated === true);
}

/** The meetings whose recording budget is flagged as truncated on this learner's record. */
export function truncatedRecordingMeetings(learnerNode: Record<string, any> | null | undefined): number[] {
  const budgets = learnerNode?.recorded_bytes;
  if (!budgets || typeof budgets !== "object") return [];
  const out: number[] = [];
  for (const key of Object.keys(budgets)) {
    const m = /^meeting_(\d)$/.exec(key);
    if (m && meetingRecordingTruncated(learnerNode, Number(m[1]))) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}
