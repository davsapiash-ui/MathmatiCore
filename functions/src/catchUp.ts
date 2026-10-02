/**
 * Catch-up time ("זמן השלמה") — the server's copy of the shared contract.
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן
 * נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש
 * הבא".
 *
 * The source of truth is react-ts-version/src/core/catchUp.ts. The functions
 * build cannot import from the frontend, so the list and its labels are a
 * copy, and __tests__/catchUpParity.test.ts fails the moment the two differ.
 * Data shape: catchup_records/{session_0N_student_K} — see the frontend file.
 */

export const CATCHUP_COLLECTION = "catchup_records";

export const CATCHUP_REASON_KEYS = [
  "slow_pace",
  "partial_absence",
  "technical_fault",
  "content_difficulty",
  "other",
] as const;
export type CatchUpReasonKey = typeof CATCHUP_REASON_KEYS[number];

export const CATCHUP_REASON_HE: Record<CatchUpReasonKey, string> = {
  slow_pace: "עבד בקצב איטי",
  partial_absence: "נעדר בחלק מהשיעור",
  technical_fault: "תקלה טכנית",
  content_difficulty: "התקשה בתוכן",
  other: "אחר",
};

export function isCatchUpReasonKey(v: unknown): v is CatchUpReasonKey {
  return typeof v === "string" && (CATCHUP_REASON_KEYS as readonly string[]).includes(v);
}

export function catchUpReasonHe(v: unknown): string | null {
  return isCatchUpReasonKey(v) ? CATCHUP_REASON_HE[v] : null;
}

export const CATCHUP_NOTE_MAX_LENGTH = 300;

export function catchUpDocId(meeting: number, studentNumber: number): string {
  return `session_${String(meeting).padStart(2, "0")}_student_${studentNumber}`;
}

export type CatchUpAction = "reopen" | "continue";
export type CatchUpClosedBy = "teacher" | "switch" | "auto_45min" | "teacher_disconnect_grace" | "other";

export interface CatchUpRound {
  action: CatchUpAction;
  reason: CatchUpReasonKey;
  note: string | null;
  stopped_at: string | null;
  recorded_by: string;
  recorded_at: number;
  opened_at: number | null;
  closed_at: number | null;
  closed_by: CatchUpClosedBy | null;
  active_minutes: number | null;
}

export interface CatchUpRecord {
  student_id: number;
  session_number: number;
  class_id: string;
  rounds: Record<string, CatchUpRound>;
}

export interface CatchUpSummary {
  rounds: number;
  minutes: number;
  hasOpenRound: boolean;
  reasons: CatchUpReasonKey[];
  notes: string[];
}

function roundsOldestFirst(record: Partial<CatchUpRecord> | null | undefined): CatchUpRound[] {
  const rounds = record?.rounds && typeof record.rounds === "object" ? Object.values(record.rounds) : [];
  return rounds
    .filter((r): r is CatchUpRound => Boolean(r) && isCatchUpReasonKey((r as CatchUpRound).reason))
    .sort((a, b) => (Number(a.recorded_at) || 0) - (Number(b.recorded_at) || 0));
}

/** Same rule as the frontend summarizeCatchUpRecord. */
export function summarizeCatchUpRecord(record: Partial<CatchUpRecord> | null | undefined): CatchUpSummary | null {
  const rounds = roundsOldestFirst(record);
  if (rounds.length === 0) return null;
  const opened = rounds.filter((r) => r.action === "reopen" && typeof r.opened_at === "number");
  return {
    rounds: opened.length,
    minutes: opened.reduce((sum, r) => sum + (typeof r.active_minutes === "number" ? r.active_minutes : 0), 0),
    hasOpenRound: opened.some((r) => r.closed_at === null || r.closed_at === undefined),
    reasons: rounds.map((r) => r.reason),
    notes: rounds.map((r) => (typeof r.note === "string" ? r.note.trim() : "")).filter(Boolean),
  };
}

function minutesHe(n: number): string {
  return n === 1 ? "דקה אחת" : `${n} דקות`;
}

/** Same sentence as the frontend catchUpSummaryHe (the parity test checks both on the same inputs). */
export function catchUpSummaryHe(summary: CatchUpSummary | null): string | null {
  if (!summary) return null;
  const reasons = Array.from(new Set(summary.reasons)).map((r) => CATCHUP_REASON_HE[r]).join(", ");
  const head = summary.rounds === 0
    ? "לא סיים את המפגש"
    : summary.hasOpenRound
      ? "מקבל עכשיו זמן השלמה"
      : `קיבל זמן השלמה: ${minutesHe(summary.minutes)}`;
  const note = summary.notes.length > 0 ? ` · הערה: ${summary.notes.join(" | ")}` : "";
  return `${head} · סיבה: ${reasons}${note}`;
}

/**
 * The research export's meetings file: four columns appended at the END (after
 * was_reset / reset_count / reset_times_iso, register gap יג); the existing
 * columns do not change.
 */
export const CATCHUP_EXPORT_COLUMNS = ["catchup_rounds", "catchup_minutes", "catchup_reason", "catchup_note"] as const;

/**
 * One meetings-file row's catch-up cells. No record: 0, 0, "", "". Reasons are
 * the stored keys, oldest first, joined by "|"; notes joined by " | ".
 */
export function catchUpExportCells(record: Partial<CatchUpRecord> | null | undefined): Record<typeof CATCHUP_EXPORT_COLUMNS[number], string | number> {
  const s = summarizeCatchUpRecord(record);
  return {
    catchup_rounds: s?.rounds ?? 0,
    catchup_minutes: s?.minutes ?? 0,
    catchup_reason: s ? s.reasons.join("|") : "",
    catchup_note: s ? s.notes.join(" | ") : "",
  };
}

/**
 * The class report's catch-up block (class_reports/class_1_session_N.catch_up),
 * built by classReport.ts (part D2) and printed by reportHtml.ts (part D1) and
 * the dashboard's class-report panel (part D2).
 */
export interface ClassCatchUpSummary {
  /** One row per learner with a record, ascending by learner number. */
  learners: Array<{ student_number: number; rounds: number; minutes: number; reasons: CatchUpReasonKey[]; note: string | null; line_he: string }>;
  /** How many learners each reason was recorded for (a learner counted once per reason). */
  reason_counts: Record<CatchUpReasonKey, number>;
  /** Learners who got at least one catch-up round, and the minutes over all of them. */
  learners_with_rounds: number;
  total_minutes: number;
}

/** Part D2. Records keyed by learner number. */
export function buildClassCatchUpSummary(_records: Record<number, Partial<CatchUpRecord> | null | undefined>): ClassCatchUpSummary {
  throw new Error("not implemented: buildClassCatchUpSummary (part D2)");
}
