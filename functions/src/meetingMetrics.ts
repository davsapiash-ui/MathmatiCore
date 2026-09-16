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
    if (!exId) continue;
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
    if (exId) attempted.add(exId);
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
    if (!exId) continue;
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
