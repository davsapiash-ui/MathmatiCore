import * as admin from "firebase-admin";

/**
 * Per-meeting measurements derived from the learner's own telemetry events.
 * Shared by the per-meeting report (Module 23) and the research export
 * (Module 24) so both describe a meeting with the same numbers.
 */

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

