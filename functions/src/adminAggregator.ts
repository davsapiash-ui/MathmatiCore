import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {
  computeFirstAttemptScore,
  isScoredMeeting,
  readAllDocs,
  resolveCompulsoryTotal,
  sessionNumberFromId,
  studentNumberFromSessionId,
  summarizeMeeting,
} from "./meetingMetrics";

/**
 * hourlyAdminAggregator (Module 24: Store Cache & Admin Aggregator)
 * Aggregates statistics across all schools, classrooms and sessions into store_cache/admin_metrics,
 * so the admin console reads one cached document instead of running live queries.
 *
 * Schedule: once a day at 14:30 Israel time — after the school day, before anyone opens the
 * admin console. The PRD (Module 24 §ב) says once an hour; the product owner chose daily on
 * 2026-09-04 because the pilot runs one or two lessons a week and an hourly pass recomputed
 * unchanged data 23 times out of 24 (מסמכי אפיון/סטיות_מהאפיון.md, item 5). The export name is
 * kept: renaming a deployed function creates a new one and orphans the old.
 */
export const hourlyAdminAggregator = onSchedule({
  schedule: "every day 14:30",
  timeZone: "Asia/Jerusalem",
  region: "us-central1",
}, async () => {
  const aggregatedMetrics = await recomputeAdminMetrics(admin.firestore());
  logger.info("Updated admin_metrics cache successfully via daily schedule", aggregatedMetrics);
});

/**
 * Recomputes store_cache/admin_metrics from the live collections and writes it.
 *
 * Shared by the daily schedule above and by the Module 23א system reset: the
 * cache is a derivative of the learning data, so a reset that "מוחק את כלל
 * נתוני הלמידה" (PRD 23א §ב.3) must not leave the admin console showing the
 * pre-reset summary until 14:30 the next day.
 */
export async function recomputeAdminMetrics(db: admin.firestore.Firestore) {

  const [schoolsSnap, classesSnap, studentsSnap, sessionDocs, telemetry] = await Promise.all([
    db.collection("schools").get(),
    db.collection("classes").get(),
    db.collection("students").get(),
    readAllDocs(db.collection("sessions")),
    readAllDocs(db.collection("telemetry_logs")),
  ]);

  // The learners' live records: the last meeting each one completed
  // (highestCompletedMeeting) and the path that picks the compulsory bank.
  // Only meeting 2 has a session document, so without this record meetings
  // 3–8 never had a completion to count.
  const learners = await readLearnerRecords();

  const byMeeting = groupTelemetryByMeeting(telemetry.map((d) => d.data));
  const compulsory = new Map<string, { total: number | null; ids: ReadonlySet<string> | null }>();
  const totalsCache = new Map<string, number | null>();
  const idsByBank = new Map<string, ReadonlySet<string>>();
  for (const [meeting, perLearner] of byMeeting) {
    for (const n of perLearner.keys()) {
      const path = learners.pathByLearner.get(n) ?? "green_path";
      const key = `${meeting}:${path}`;
      if (compulsory.has(key)) continue;
      const total = await resolveCompulsoryTotal(db, meeting, path, totalsCache, idsByBank);
      compulsory.set(key, { total, ids: idsByBank.get(key) ?? null });
    }
  }

  const metrics = buildAdminMetrics({
    byMeeting,
    sessionDocs,
    highestCompletedByLearner: learners.highestCompletedByLearner,
    pathByLearner: learners.pathByLearner,
    compulsory,
  });

  const aggregatedMetrics = {
    updated_at: Date.now(),
    total_schools: schoolsSnap.size,
    total_classrooms: classesSnap.size,
    total_students: studentsSnap.size,
    ...metrics,
  };

  // A whole replacement, not a merge: a merge keeps nested keys, so a meeting
  // that no longer has data (after a system reset) kept its old row.
  await db.collection("store_cache").doc("admin_metrics").set(aggregatedMetrics);
  return aggregatedMetrics;
}

type LearnerPath = "green_path" | "remediation_path";

function learnerNumber(v: unknown): number | null {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

async function readLearnerRecords(): Promise<{
  highestCompletedByLearner: Map<number, number>;
  pathByLearner: Map<number, LearnerPath>;
}> {
  const highestCompletedByLearner = new Map<number, number>();
  const pathByLearner = new Map<number, LearnerPath>();
  let node: Record<string, any> = {};
  try {
    node = (await admin.database().ref("users/students").get()).val() || {};
  } catch (err) {
    // Without the live records the cache still carries the telemetry counts;
    // completion then comes from the session documents alone.
    logger.warn("admin_metrics: users/students unavailable", err);
  }
  // A learner can sit under several keys (student_user3, student_3, 3); the
  // canonical student_userN, which the live client writes, wins.
  const rank = (k: string) => (/^student_user\d+$/.test(k) ? 0 : /^student_\d+$/.test(k) ? 1 : 2);
  const entries = Object.entries(node).sort(([a], [b]) => rank(a) - rank(b));
  for (const [key, raw] of entries) {
    const n = learnerNumber(key);
    if (n === null || !raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, any>;
    if (!highestCompletedByLearner.has(n) && typeof rec.highestCompletedMeeting === "number") {
      highestCompletedByLearner.set(n, rec.highestCompletedMeeting);
    }
    if (!pathByLearner.has(n)) {
      pathByLearner.set(n, rec.teacher_selected_path === "remediation_path" || rec.pedagogicalPath === "remediation_path" ? "remediation_path" : "green_path");
    }
  }
  return { highestCompletedByLearner, pathByLearner };
}

/** Telemetry events grouped by meeting (1–8), then by learner (1–12). */
export function groupTelemetryByMeeting(events: Record<string, any>[]): Map<number, Map<number, Record<string, any>[]>> {
  const out = new Map<number, Map<number, Record<string, any>[]>>();
  for (const ev of events) {
    const m = sessionNumberFromId(String(ev?.session_id || ""));
    const n = learnerNumber(ev?.student_id);
    if (m === null || n === null) continue;
    if (!out.has(m)) out.set(m, new Map());
    const perLearner = out.get(m)!;
    if (!perLearner.has(n)) perLearner.set(n, []);
    perLearner.get(n)!.push(ev);
  }
  return out;
}

export interface MeetingBreakdown {
  /** Learners who started the meeting. */
  created: number;
  /** Learners who completed it. */
  completed: number;
  completion_rate_percent: number;
  /** Mean score of the learners who completed it and have a score; 0 when none. */
  average_score_percent: number;
  exercises_completed: number;
  digits_entered: number;
  wrong_digits: number;
  digit_error_rate_percent: number;
  deletions: number;
  undos: number;
  hesitations: number;
  socratic_cards: number;
}

/**
 * PRD Module 24 §ב: "מחשבת מדדים מצטברים (אחוזי השלמת מפגשים, סך תרגילים
 * שנפתרו, מדדי שגיאות גלובליים)". Aggregates only — no learner number, school
 * or class leaves this function.
 *
 * A learner started a meeting when she has events in it or a session document
 * for it, and completed it when that document says is_completed or her live
 * record's highestCompletedMeeting has reached it. The score is the session
 * document's where there is one (meeting 2), otherwise the PRD's first-attempt
 * rule over the meeting's own events (Module 23 §ב), the reader the reports
 * use. Meeting 1 is not scored (Module 14 §ב).
 */
export function buildAdminMetrics(input: {
  byMeeting: ReadonlyMap<number, ReadonlyMap<number, Record<string, any>[]>>;
  sessionDocs: Array<{ id: string; data: Record<string, any> }>;
  highestCompletedByLearner: ReadonlyMap<number, number>;
  pathByLearner: ReadonlyMap<number, LearnerPath>;
  compulsory: ReadonlyMap<string, { total: number | null; ids: ReadonlySet<string> | null }>;
}) {
  const docsByMeeting = new Map<number, Map<number, Record<string, any>>>();
  for (const { id, data } of input.sessionDocs) {
    const n = learnerNumber(data.student_id) ?? studentNumberFromSessionId(String(data.session_id || "")) ?? studentNumberFromSessionId(id);
    const m = Number(data.session_number) || sessionNumberFromId(String(data.session_id || "")) || sessionNumberFromId(id);
    if (n === null || !m || m < 1 || m > 8) continue;
    if (!docsByMeeting.has(m)) docsByMeeting.set(m, new Map());
    const perLearner = docsByMeeting.get(m)!;
    // Report runs left stubs without a score; the document with the score wins.
    if (typeof data.session_score_percent === "number" || !perLearner.has(n)) perLearner.set(n, data);
  }

  const breakdown: Record<string, MeetingBreakdown> = {};
  const totals = {
    created: 0, completed: 0, scoreSum: 0, scored: 0,
    exercises_completed: 0, digits_entered: 0, wrong_digits: 0,
    deletions: 0, undos: 0, hesitations: 0, socratic_cards: 0,
  };
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

  for (let m = 1; m <= 8; m++) {
    const events = input.byMeeting.get(m) ?? new Map<number, Record<string, any>[]>();
    const docs = docsByMeeting.get(m) ?? new Map<number, Record<string, any>>();
    const started = new Set<number>(events.keys());
    const completed = new Set<number>();
    for (const [n, d] of docs) {
      if (typeof d.is_completed === "boolean") started.add(n);
      if (d.is_completed === true) completed.add(n);
    }
    // A completion counts for a meeting the learner has a trace of: a record
    // that says "up to 5" does not invent a meeting 3 with no events in it.
    for (const [n, highest] of input.highestCompletedByLearner) {
      if (highest >= m && started.has(n)) completed.add(n);
    }
    if (started.size === 0) continue;

    const row: MeetingBreakdown = {
      created: started.size,
      completed: completed.size,
      completion_rate_percent: pct(completed.size, started.size),
      average_score_percent: 0,
      exercises_completed: 0,
      digits_entered: 0,
      wrong_digits: 0,
      digit_error_rate_percent: 0,
      deletions: 0,
      undos: 0,
      hesitations: 0,
      socratic_cards: 0,
    };
    for (const evs of events.values()) {
      const s = summarizeMeeting(evs);
      row.exercises_completed += s.exercises_completed;
      row.digits_entered += s.digits_entered;
      row.wrong_digits += s.wrong_digits;
      row.deletions += s.deletions;
      row.undos += s.undos;
      row.hesitations += s.hesitations;
      row.socratic_cards += s.socratic_cards;
    }
    row.digit_error_rate_percent = pct(row.wrong_digits, row.digits_entered);

    let scoreSum = 0;
    let scored = 0;
    if (isScoredMeeting(m)) {
      for (const n of completed) {
        const docScore = docs.get(n)?.session_score_percent;
        let score: number | null = typeof docScore === "number" ? docScore : null;
        const evs = events.get(n);
        if (score === null && evs) {
          const c = input.compulsory.get(`${m}:${input.pathByLearner.get(n) ?? "green_path"}`);
          if (c && c.total !== null) score = computeFirstAttemptScore(evs, c.total, c.ids).scorePercent;
        }
        if (score !== null) {
          scoreSum += score;
          scored++;
        }
      }
    }
    row.average_score_percent = scored > 0 ? Math.round(scoreSum / scored) : 0;
    breakdown[String(m)] = row;

    totals.created += row.created;
    totals.completed += row.completed;
    totals.scoreSum += scoreSum;
    totals.scored += scored;
    totals.exercises_completed += row.exercises_completed;
    totals.digits_entered += row.digits_entered;
    totals.wrong_digits += row.wrong_digits;
    totals.deletions += row.deletions;
    totals.undos += row.undos;
    totals.hesitations += row.hesitations;
    totals.socratic_cards += row.socratic_cards;
  }

  return {
    total_sessions_created: totals.created,
    total_sessions_completed: totals.completed,
    average_mastery_percent: totals.scored > 0 ? Math.round(totals.scoreSum / totals.scored) : 0,
    completion_rate_percent: pct(totals.completed, totals.created),
    total_exercises_completed: totals.exercises_completed,
    global_error_metrics: {
      digits_entered: totals.digits_entered,
      wrong_digits: totals.wrong_digits,
      digit_error_rate_percent: pct(totals.wrong_digits, totals.digits_entered),
      deletions: totals.deletions,
      undos: totals.undos,
      hesitations: totals.hesitations,
      socratic_cards: totals.socratic_cards,
    },
    session_breakdown: breakdown,
  };
}
