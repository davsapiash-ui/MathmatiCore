/**
 * Catch-up time ("זמן השלמה") — the shared contract.
 *
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן
 * נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש
 * הבא". The class stays in one meeting at a time. When the teacher closes a
 * meeting (or opens another) while learners who started it have not finished,
 * she records, per learner, why — a short closed list plus an optional note —
 * and either opens the same meeting again for catch-up or goes on.
 *
 * One Firestore document per learner × meeting, `catchup_records/{docId}`,
 * docId = catchUpDocId(meeting, learner) — the same spelling as the meeting's
 * session document, so the reset's per-learner/per-meeting deletion reads it
 * the same way. The teacher writes only new rounds (reason, note, who, when);
 * the server (functions/src/catchUpRounds.ts) fills opened_at, closed_at,
 * closed_by and active_minutes. Learners can neither read nor write it
 * (firestore.rules). Zero PII: learner numbers only; the note passes the PII
 * check (validateCatchUpNote) on the client and sanitizeReasonNote's scrubber
 * on the server.
 *
 * Mirrored in functions/src/catchUp.ts; functions/src/__tests__/catchUpParity.test.ts
 * fails the moment the two lists differ.
 */
import { validateChatInputForPII } from '@/core/security/PiiFilter';

export const CATCHUP_COLLECTION = 'catchup_records';

/** The closed list, in the order the dialog shows it. Stored keys never change. */
export const CATCHUP_REASON_KEYS = [
  'slow_pace',
  'partial_absence',
  'technical_fault',
  'content_difficulty',
  'other',
] as const;
export type CatchUpReasonKey = typeof CATCHUP_REASON_KEYS[number];

/** What the teacher reads. The owner's wording (2.10.2026), verbatim. */
export const CATCHUP_REASON_HE: Record<CatchUpReasonKey, string> = {
  slow_pace: 'עבד בקצב איטי',
  partial_absence: 'נעדר בחלק מהשיעור',
  technical_fault: 'תקלה טכנית',
  content_difficulty: 'התקשה בתוכן',
  other: 'אחר',
};

export function isCatchUpReasonKey(v: unknown): v is CatchUpReasonKey {
  return typeof v === 'string' && (CATCHUP_REASON_KEYS as readonly string[]).includes(v);
}

export function catchUpReasonHe(v: unknown): string | null {
  return isCatchUpReasonKey(v) ? CATCHUP_REASON_HE[v] : null;
}

/** The note is short prose, never a document. Same cap on the server. */
export const CATCHUP_NOTE_MAX_LENGTH = 300;

/**
 * The note as it may be stored: trimmed, capped, null when blank — or a
 * refusal (the same PII check as the reset note in ResetConfirmationModal).
 */
export function validateCatchUpNote(raw: string | null | undefined): { ok: true; note: string | null } | { ok: false; errorHe: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, note: null };
  const check = validateChatInputForPII(trimmed);
  if (!check.valid) {
    return { ok: false, errorHe: check.errorHe || 'ההערה מכילה פרטים מזהים. יש להשתמש במספר התלמיד (1–12) בלבד.' };
  }
  return { ok: true, note: trimmed.slice(0, CATCHUP_NOTE_MAX_LENGTH) };
}

/** `session_03_student_4` — the meeting's session-document spelling. */
export function catchUpDocId(meeting: number, studentNumber: number): string {
  return `session_${String(meeting).padStart(2, '0')}_student_${studentNumber}`;
}

/** The teacher's choice in the dialog. */
export type CatchUpAction = 'reopen' | 'continue';

/** How a catch-up round ended (server). */
export type CatchUpClosedBy = 'teacher' | 'switch' | 'auto_45min' | 'teacher_disconnect_grace' | 'other';

/**
 * One entry of the dialog for one learner. A 'reopen' entry is a catch-up
 * round: the server opens it when the meeting opens again and closes it, with
 * the learner's active minutes, when the meeting closes. A 'continue' entry
 * only documents why the learner did not finish.
 */
export interface CatchUpRound {
  action: CatchUpAction;
  reason: CatchUpReasonKey;
  note: string | null;
  /** Where the learner stood when the reason was recorded (teacher's label, e.g. "תרגיל 4 מתוך 7"). No PII. */
  stopped_at: string | null;
  /** The teacher's auth uid (never a name), as the reset audit entry records its teacher. */
  recorded_by: string;
  /** Server-clock ms (serverNow()) when the dialog was confirmed. */
  recorded_at: number;
  /** Server-only. Null until the meeting opens again ('reopen'); always null for 'continue'. */
  opened_at: number | null;
  /** Server-only. */
  closed_at: number | null;
  /** Server-only. */
  closed_by: CatchUpClosedBy | null;
  /**
   * Server-only: the minutes in [opened_at, closed_at] in which the server
   * received at least one telemetry event of this learner in this meeting
   * (distinct whole minutes of telemetry_logs createTime). Null until closed.
   */
  active_minutes: number | null;
}

/** catchup_records/{catchUpDocId(meeting, n)} */
export interface CatchUpRecord {
  student_id: number;
  session_number: number;
  class_id: string;
  /** Keyed by round id (catchUpRoundId); one key per dialog confirmation. */
  rounds: Record<string, CatchUpRound>;
}

/** One id for all the learners of one dialog confirmation. */
export function catchUpRoundId(recordedAt: number): string {
  return `r_${Math.floor(recordedAt)}`;
}

/** What one learner's dialog row yields. */
export interface CatchUpReasonEntry {
  studentNumber: number;
  reason: CatchUpReasonKey;
  note: string | null;
  stoppedAtHe: string | null;
}

/** A learner who started a meeting and did not finish it, as the dashboard lists them. */
export interface UnfinishedLearner {
  studentNumber: number;
  /** "תרגיל 4 מתוך 7", "לוח הרפלקציה", … (core/catchUpUnfinished.ts whereStoppedHe). */
  stoppedAtHe: string;
}

export interface CatchUpSummary {
  /** 'reopen' rounds the server has opened. */
  rounds: number;
  /** Sum of active_minutes over closed rounds. */
  minutes: number;
  /** A round is open now (the meeting is open for catch-up). */
  hasOpenRound: boolean;
  /** Every recorded reason, oldest first (both actions). */
  reasons: CatchUpReasonKey[];
  /** Every non-empty note, oldest first. */
  notes: string[];
}

function roundsOldestFirst(record: Partial<CatchUpRecord> | null | undefined): CatchUpRound[] {
  const rounds = record?.rounds && typeof record.rounds === 'object' ? Object.values(record.rounds) : [];
  return rounds
    .filter((r): r is CatchUpRound => Boolean(r) && isCatchUpReasonKey((r as CatchUpRound).reason))
    .sort((a, b) => (Number(a.recorded_at) || 0) - (Number(b.recorded_at) || 0));
}

export function summarizeCatchUpRecord(record: Partial<CatchUpRecord> | null | undefined): CatchUpSummary | null {
  const rounds = roundsOldestFirst(record);
  if (rounds.length === 0) return null;
  const opened = rounds.filter((r) => r.action === 'reopen' && typeof r.opened_at === 'number');
  return {
    rounds: opened.length,
    minutes: opened.reduce((sum, r) => sum + (typeof r.active_minutes === 'number' ? r.active_minutes : 0), 0),
    hasOpenRound: opened.some((r) => r.closed_at === null || r.closed_at === undefined),
    reasons: rounds.map((r) => r.reason),
    notes: rounds.map((r) => (typeof r.note === 'string' ? r.note.trim() : '')).filter(Boolean),
  };
}

function minutesHe(n: number): string {
  return n === 1 ? 'דקה אחת' : `${n} דקות`;
}

/**
 * The teacher's one line for a learner's meeting (personal report, learner
 * journey): "קיבל זמן השלמה: X דקות · סיבה: …", or, without a catch-up round,
 * "לא סיים את המפגש · סיבה: …". Null when nothing was recorded.
 */
export function catchUpSummaryHe(summary: CatchUpSummary | null): string | null {
  if (!summary) return null;
  const reasons = Array.from(new Set(summary.reasons)).map((r) => CATCHUP_REASON_HE[r]).join(', ');
  const head = summary.rounds === 0
    ? 'לא סיים את המפגש'
    : summary.hasOpenRound
      ? 'מקבל עכשיו זמן השלמה'
      : `קיבל זמן השלמה: ${minutesHe(summary.minutes)}`;
  const note = summary.notes.length > 0 ? ` · הערה: ${summary.notes.join(' | ')}` : '';
  return `${head} · סיבה: ${reasons}${note}`;
}
