import * as admin from "firebase-admin";

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

export const DIAGNOSTIC_COMPULSORY_COUNT = 7;

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
    const raw = isExerciseEvent(ev) ? String(ev.exercise_id || "") : "";
    const exId = MEETING1_TOOL_STEPS.includes(raw) ? "" : raw;
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
  drag: "גרירת לבנים ללוח",
  decompose: "פירוק לבנה (פריטה)",
  compose: "הקבצה בכפתור \"הקבץ\"",
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
  "המפגש אינו מקבל ציון ואינו מסווג לקבוצת עבודה (PRD, מודול 14). " +
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
 *   compose   — REGROUPING_SUCCESS, regrouping_type "composition" (the "הקבץ" button)
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
  return type !== "SESSION_START" && type !== "REFLECTION_SUBMITTED";
}

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
): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const docs: Array<{ id: string; data: Record<string, any> }> = [];
  const query = base.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const pageQuery: admin.firestore.Query = last ? query.startAfter(last) : query;
    const snap: admin.firestore.QuerySnapshot = await pageQuery.get();
    if (snap.empty) break;
    for (const d of snap.docs) docs.push({ id: d.id, data: d.data() });
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
 * `compulsoryTotal` is the meeting's number of compulsory exercises (7 for the
 * diagnostic meeting, the bank's count otherwise). `compulsoryIds` is which
 * exercises those are.
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
  const counts = (exId: string) => !compulsoryIds || compulsoryIds.size === 0 || compulsoryIds.has(exId);
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
  };
  for (const ev of events) {
    const t = typeof ev.client_timestamp === "number" ? ev.client_timestamp : null;
    if (t !== null) {
      first = first === null ? t : Math.min(first, t);
      last = last === null ? t : Math.max(last, t);
    }
    const exId = String(ev.exercise_id || "");
    if (exId && isExerciseEvent(ev)) attempted.add(exId);
    switch (ev.event_type) {
      case "PROBLEM_COMPLETE": if (exId) completed.add(exId); break;
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
      default: break;
    }
  }
  s.first_event_at = first;
  s.last_event_at = last;
  s.active_minutes = first !== null && last !== null ? Math.round(((last - first) / 60000) * 10) / 10 : 0;
  s.exercises_attempted = attempted.size;
  s.exercises_completed = completed.size;
  return s;
}

/**
 * How many compulsory exercises a meeting has for a given path, and which
 * ones they are, from the Module 26 catalog in Firestore; 7 for the
 * diagnostic meeting; null when the bank is not there.
 *
 * The ids matter as much as the count: the score's numerator must count the
 * same exercises its denominator does. Counting an optional early-finisher
 * task towards a compulsory-only denominator is what let a learner who failed
 * a third of the required work be reported at 100%.
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
  if (sessionNumber === 2) return DIAGNOSTIC_COMPULSORY_COUNT;
  const key = `${sessionNumber}:${path}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let total: number | null = null;
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
        total = chosen.length;
        if (idsOut) {
          idsOut.set(key, new Set(chosen.map((t: any) => String(t?.id ?? "")).filter(Boolean)));
        }
        break;
      }
    } catch {
      /* catalog unavailable: fall through to null */
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
  sessionNumber: number
): Promise<Record<string, any>[]> {
  const snap = await db.collection("telemetry_logs").where("student_id", "==", studentNumber).get();
  const docs = snap.docs
    .map((d) => d.data())
    .filter((e) => sessionNumberFromId(String(e?.session_id || "")) === sessionNumber);
  docs.sort((a, b) => (a.client_timestamp || 0) - (b.client_timestamp || 0));
  return docs;
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
// מדדי המחקר 3 ו-4 (PRD 7.3, Module 23 §ב "מדדי המחקר"). Measures 1 and 2 are
// the first-attempt score above and the Persistence Index of Module 16.
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
// בדוח הלומד ובדוח הכיתה"). It was computed on the learner's device only, at
// the reflection board, and appeared in neither report.
// ---------------------------------------------------------------------------

export interface PersistenceIndex {
  /** U: UNDO_EXECUTED events. */
  undos: number;
  /** E: DIGIT_ENTERED with is_correct === false (null is not counted at all). */
  wrong_digits: number;
  /** G: SOCRATIC_OPTION_SELECTED with is_correct === false. */
  wrong_options: number;
  /** U ÷ (U + E + G) × 100; 100 when U + E + G = 0 (Module 16 §ב, the edge case). */
  percent: number;
}

export function computePersistenceIndex(events: Record<string, any>[]): PersistenceIndex {
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

/** Measure 2 as text, with its three counts beside the percentage. */
export function persistenceHe(p: PersistenceIndex | null): string {
  if (!p) return "לא נמדד";
  return `${p.percent}% (ביטולים ${p.undos}, ספרות שגויות ${p.wrong_digits}, בחירות שגויות בכרטיס ${p.wrong_options})`;
}
