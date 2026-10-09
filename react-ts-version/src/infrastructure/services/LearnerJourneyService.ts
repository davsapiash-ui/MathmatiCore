/**
 * Learner journey: everything a teacher needs to review one learner's work
 * across the eight meetings, read from the two places the learner actually
 * writes to — nothing derived, nothing invented.
 *
 *  - Screen recordings (PRD Module 21): Realtime Database
 *    users/students/{uid}/telemetry_sessions/{recordingId}/{chunks,metadata,recording_truncated}
 *    One recording per login; each chunk's metadata carries sessionNumber,
 *    exercise_id and the chunk's start/end timestamps.
 *  - Typed telemetry events (PRD Module 5, Appendix A §3): Firestore
 *    telemetry_logs/{idempotency_key}, one document per learner action, with
 *    session_id ("session_{N}_student_…"), exercise_id, column_index and
 *    client_timestamp.
 *
 * Both sides stamp the learner's own clock (Date.now()), so a table row and a
 * moment in the recording can be matched by timestamp.
 */
import { ref, onValue } from 'firebase/database';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { database, firestore, functions, authReady } from '@/infrastructure/firebase';
import type { TelemetryEventType } from '@/types/telemetry';
import { getSessionTasks } from '@/data/sessionTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { CHOICE_PATH_LABEL_HE, choiceTask, exercisePathType } from '@/core/choiceExercises';
import { meetingShortLabelHe } from '@/core/stationNames';
import { ERROR_CATEGORY_HE, TRIGGER_REASON_HE, resetReasonHe } from '@/core/routeLabels';
import { CATCHUP_COLLECTION, catchUpDocId, catchUpSummaryHe, summarizeCatchUpRecord, type CatchUpRecord } from '@/core/catchUp';
import { RESEARCH_MEASURES_HE, persistenceTextHe, selfCorrectionTextHe, type ResearchMeasureKey } from '@/core/researchMeasures';

export interface RecordingChapter {
  exerciseId: string;
  start: number;
  end: number;
}

export interface RecordingSession {
  /** RTDB key, e.g. session_1757000000000 */
  id: string;
  /** Meeting number the chunks were stamped with; null when metadata is missing. */
  sessionNumber: number | null;
  start: number;
  end: number;
  chunkCount: number;
  truncated: boolean;
  chapters: RecordingChapter[];
  /** Raw chunk payloads, parsed lazily by parseRecordingEvents. */
  rawChunks: unknown[];
}

export interface JourneyEvent {
  id: string;
  timestamp: number;
  sessionNumber: number | null;
  sessionId: string;
  exerciseId: string;
  eventType: TelemetryEventType | string;
  columnIndex?: number;
  details: Record<string, unknown>;
  /** When the event was written to Firestore (synced_at; the tablet's clock). Absent on older events. */
  writtenAt?: number;
  /** PRD Module 5 §ב: the device's per-sign-in counter; orders events with the same time. Absent on older events. */
  sequenceNumber?: number;
}

/** PRD Module 5 §ב: events by client_timestamp ascending, ties by sequence_number (an event without one first). */
export function compareJourneyEvents(a: Pick<JourneyEvent, 'timestamp' | 'sequenceNumber'>, b: Pick<JourneyEvent, 'timestamp' | 'sequenceNumber'>): number {
  return a.timestamp - b.timestamp || (a.sequenceNumber ?? -1) - (b.sequenceNumber ?? -1);
}

const COLUMN_NAMES_HE = ['יחידות', 'עשרות', 'מאות', 'אלפים'];

/** "session_3_student_user4" → 3; anything else → null. */
export function sessionNumberFromSessionId(sessionId: string | undefined | null): number | null {
  if (!sessionId) return null;
  const m = /^session_(\d+)/.exec(sessionId);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 8 ? n : null;
}

const isPlainObject = (v: unknown): v is Record<string, any> => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/**
 * One telemetry_sessions node out of the two places recordings live: the
 * learner's own recordings node (recordings/{uid}, where the recorder writes)
 * and the learner record (users/students/{uid}), where versions before it
 * wrote and where nothing has been moved yet (moveLegacyRecordings). A
 * recording found in both — an opening that began on the old version and went
 * on after the update — keeps every chunk and metadata entry of both; it is
 * truncated when either says so.
 */
export function mergeRecordingNodes(
  legacy: Record<string, any> | null | undefined,
  current: Record<string, any> | null | undefined,
): Record<string, any> | null {
  const a = isPlainObject(legacy) ? legacy : null;
  const b = isPlainObject(current) ? current : null;
  if (!a) return b;
  if (!b) return a;
  const out: Record<string, any> = { ...a };
  for (const [id, rec] of Object.entries(b)) {
    const old = out[id];
    if (!isPlainObject(old) || !isPlainObject(rec)) {
      out[id] = rec ?? old;
      continue;
    }
    const merged: Record<string, any> = { ...old };
    for (const [k, v] of Object.entries(rec)) {
      if (k === 'recording_truncated') merged[k] = old[k] === true || v === true;
      else if (isPlainObject(old[k]) && isPlainObject(v)) merged[k] = { ...old[k], ...v };
      else merged[k] = v ?? old[k];
    }
    out[id] = merged;
  }
  return out;
}

/**
 * Turns the learner's telemetry_sessions node into one RecordingSession per
 * recording, with chapters merged from adjacent chunks of the same exercise.
 */
export function parseRecordingSessions(node: Record<string, any> | null | undefined): RecordingSession[] {
  if (!node || typeof node !== 'object') return [];
  const out: RecordingSession[] = [];
  for (const [id, raw] of Object.entries(node)) {
    if (!raw || typeof raw !== 'object') continue;
    const sess = raw as any;
    const rawChunks = sess.chunks && typeof sess.chunks === 'object' ? Object.values(sess.chunks) : [];
    const meta: { start: number; end: number; exerciseId: string; sessionNumber: number | null }[] = [];
    if (sess.metadata && typeof sess.metadata === 'object') {
      for (const m of Object.values(sess.metadata) as any[]) {
        // A chapter needs a real start; an end before the start (or none) is the start.
        if (!m || typeof m.startTime !== 'number' || !Number.isFinite(m.startTime) || m.startTime <= 0) continue;
        meta.push({
          start: m.startTime,
          end: typeof m.endTime === 'number' && Number.isFinite(m.endTime) && m.endTime >= m.startTime ? m.endTime : m.startTime,
          exerciseId: m.exercise_id ? String(m.exercise_id) : 'unknown',
          sessionNumber: typeof m.sessionNumber === 'number' ? m.sessionNumber : null,
        });
      }
    }
    meta.sort((a, b) => a.start - b.start);
    const chapters: RecordingChapter[] = [];
    for (const c of meta) {
      const last = chapters[chapters.length - 1];
      if (last && last.exerciseId === c.exerciseId) {
        last.end = Math.max(last.end, c.end);
      } else {
        chapters.push({ exerciseId: c.exerciseId, start: c.start, end: c.end });
      }
    }
    const sessionNumber = meta.find((m) => m.sessionNumber !== null)?.sessionNumber ?? null;
    const idTs = /^session_(\d{10,})$/.exec(id);
    const start = meta.length > 0 ? meta[0].start : (idTs ? parseInt(idTs[1], 10) : 0);
    const end = meta.length > 0 ? meta[meta.length - 1].end : start;
    out.push({
      id,
      sessionNumber,
      start,
      end,
      chunkCount: rawChunks.length,
      truncated: sess.recording_truncated === true,
      chapters,
      rawChunks,
    });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/**
 * The chapter of the selected exercise that bounds playback (Module 21 §ב):
 * the one the teacher jumped into — the chapter holding the seek time, else
 * the one nearest to it — and the first one when she has not jumped yet. An
 * exercise the learner came back to (meeting 2's correction round) has more
 * than one chapter.
 */
export function chapterForSeek(
  chapters: RecordingChapter[],
  exerciseId: string | null,
  seekTime: number | undefined,
): RecordingChapter | null {
  if (!exerciseId) return null;
  const own = chapters.filter((c) => c.exerciseId === exerciseId);
  if (own.length === 0) return null;
  if (typeof seekTime !== 'number') return own[0];
  const distance = (c: RecordingChapter) => (seekTime < c.start ? c.start - seekTime : seekTime > c.end ? seekTime - c.end : 0);
  return own.reduce((best, c) => (distance(c) < distance(best) ? c : best));
}

/**
 * Chunks are stored as JSON strings of rrweb event arrays; a chunk that had to
 * be re-sent through the offline queue is stored as { data: "<json>" }.
 */
export function parseRecordingEvents(sessions: RecordingSession[]): any[] {
  const events: any[] = [];
  for (const s of sessions) {
    for (const c of s.rawChunks) {
      try {
        const rawStr = typeof c === 'string' ? c : (c && typeof c === 'object' && typeof (c as any).data === 'string' ? (c as any).data : null);
        if (!rawStr) continue;
        const parsed = JSON.parse(rawStr);
        if (!Array.isArray(parsed)) continue;
        // An entry that is not an event, or has no time of its own, used to be
        // sorted to time 0 and stretched the recording back to 1970.
        for (const e of parsed) {
          if (e && typeof e === 'object' && typeof e.timestamp === 'number' && Number.isFinite(e.timestamp) && e.timestamp > 0) events.push(e);
        }
      } catch {
        // A corrupt chunk is skipped; the rest of the recording still plays.
      }
    }
  }
  events.sort((a, b) => a.timestamp - b.timestamp);
  return events;
}

/** A reset that restarted one meeting of the learner (the server's rule, functions/src/meetingMetrics.ts resetsOfMeeting). */
export interface MeetingResetMark {
  /** performed_at: the server's time of the reset. */
  at: number;
  reasonHe: string | null;
  scope: 'system' | 'full_student' | 'active_session';
  /**
   * PRD 23א §ג: the backup went to Cloud Storage and the daily job has not yet
   * copied it to the Drive folder "3 גיבויים". Present only when true.
   */
  backupNotInDrive?: true;
}

/**
 * PRD 23א §ד: "רק איפוס שה-deletion_status שלו 'completed' נחשב איפוס בדוחות
 * ובייצוא" — the server's rule (functions/src/resetAudit.ts isCompletedReset).
 * An entry written before deletion_status existed counts by its backup status.
 */
export function isCompletedReset(e: Record<string, any> | null | undefined): boolean {
  if (!e || (e.reset_level !== 'single_student' && e.reset_level !== 'system')) return false;
  if (e.deletion_status === undefined || e.deletion_status === null) return e.backup_status === 'success';
  return e.deletion_status === 'completed';
}

/** PRD 23א §ג: the entry's backup is still only in Cloud Storage. */
export function backupNotYetInDrive(e: Record<string, any> | null | undefined): boolean {
  return Boolean(e) && e!.backup_channel === 'storage' && (e!.backup_drive_copied_at === undefined || e!.backup_drive_copied_at === null);
}

/**
 * The resets of the reset log that restarted meeting `sessionNumber` for this
 * learner, oldest first: carried out (backup written), covering the learner,
 * and of the whole system, the whole learner, or this meeting.
 */
export function resetsOfMeeting(entries: Record<string, any>[], studentNum: number, sessionNumber: number): MeetingResetMark[] {
  const out: MeetingResetMark[] = [];
  for (const e of entries) {
    if (!isCompletedReset(e)) continue;
    if (!Array.isArray(e.affected_student_ids) || !e.affected_student_ids.includes(studentNum)) continue;
    const scope: MeetingResetMark['scope'] | null =
      e.reset_level === 'system'
        ? 'system'
        : e.reset_level === 'single_student' && e.reset_scope === 'full_student'
          ? 'full_student'
          : e.reset_level === 'single_student' && e.reset_scope === 'active_session' && Number(e.session_number) === sessionNumber
            ? 'active_session'
            : null;
    const at = Number(e.performed_at);
    if (scope === null || !Number.isFinite(at)) continue;
    out.push({ at, reasonHe: resetReasonHe(e.reset_reason), scope, ...(backupNotYetInDrive(e) ? { backupNotInDrive: true as const } : {}) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The reset log entries that name this learner (firestore.rules: the teacher reads reset_audit_log). */
export async function fetchLearnerResets(studentNum: number): Promise<Record<string, any>[]> {
  await authReady;
  // firestore.rules (PRD 23א §ו): the class teacher reads her class's entries only, so the query names the class.
  const snap = await getDocs(query(collection(firestore, 'reset_audit_log'), where('class_id', '==', 'class_1'), where('affected_student_ids', 'array-contains', studentNum)));
  const out: Record<string, any>[] = [];
  snap.forEach((d) => { out.push(d.data() as Record<string, any>); });
  return out;
}

/**
 * Catch-up time (owner, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש
 * נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך"): the teacher's one line for this
 * learner's meeting — the minutes of catch-up time and the reasons recorded —
 * or null when nothing was recorded for it.
 */
export function catchUpLineHe(record: Partial<CatchUpRecord> | null | undefined): string | null {
  return catchUpSummaryHe(summarizeCatchUpRecord(record));
}

/**
 * The learner's catch-up line per meeting, read straight from
 * catchup_records/{catchUpDocId(N, learner)}. A meeting with no record — or one
 * that cannot be read — has no line; the journey never fails because of it.
 */
export async function fetchLearnerCatchUpLines(studentNum: number): Promise<Map<number, string>> {
  await authReady;
  const meetings = [1, 2, 3, 4, 5, 6, 7, 8];
  const snaps = await Promise.all(meetings.map((n) =>
    getDoc(doc(firestore, CATCHUP_COLLECTION, catchUpDocId(n, studentNum))).catch(() => null)));
  const out = new Map<number, string>();
  snaps.forEach((snap, i) => {
    if (!snap || !snap.exists()) return;
    const line = catchUpLineHe(snap.data() as Partial<CatchUpRecord>);
    if (line) out.set(meetings[i], line);
  });
  return out;
}

/** A row of the decision table before the date rows: an event, or where the meeting was reset. */
export type RunRow =
  | { kind: 'event'; event: JourneyEvent }
  | { kind: 'reset'; reset: MeetingResetMark };

export type DecisionRow = RunRow | { kind: 'day'; at: number };

const dayKey = (ts: number): string => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

/**
 * A meeting the learner worked on over more than one day (opened twice, or
 * done again after a reset): the rows carry only the hour, so the two days read
 * as one. A date row is put where each day begins. A meeting done within one
 * day gets none.
 */
export function withDaySeparators(rows: RunRow[]): DecisionRow[] {
  const days = new Set(rows.flatMap((r) => (r.kind === 'event' ? [dayKey(r.event.timestamp)] : [])));
  if (days.size < 2) return rows;
  const out: DecisionRow[] = [];
  let last: string | null = null;
  for (const r of rows) {
    if (r.kind === 'event') {
      const key = dayKey(r.event.timestamp);
      if (key !== last) { out.push({ kind: 'day', at: r.event.timestamp }); last = key; }
    }
    out.push(r);
  }
  return out;
}

/** The date row's text: "יום העבודה: 02/10/2026". */
export function daySeparatorHe(at: number): string {
  return `יום העבודה: ${formatDate(at)}`;
}

/**
 * "ex_N_01" is the id the learner's client writes when no exercise is open:
 * entering the meeting (SESSION_START), or a call for help before the first
 * exercise loaded (HelpOverlays, useWorkspaceStore). It is no exercise.
 */
export const isNoExerciseId = (id: string): boolean => /^ex_\d+_01$/.test(id);

/**
 * The exercises of a meeting in the order the learner met them: from the
 * events, then from the recording's chapters. The no-exercise id "ex_N_01"
 * used to be the first chip and moved every exercise number up by one.
 */
export function meetingExerciseIds(events: JourneyEvent[], chapters: RecordingChapter[]): string[] {
  const ids: string[] = [];
  for (const id of [...events.map((e) => e.exerciseId), ...chapters.map((c) => c.exerciseId)]) {
    if (id && !isNoExerciseId(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** The compulsory exercises numbered 1, 2, 3… in order; a choice exercise has no number (it is marked in its title). */
export function compulsoryNumbers(exerciseIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const id of exerciseIds) if (exercisePathType(id) === 'compulsory') map.set(id, map.size + 1);
  return map;
}

/**
 * The chapter an exercise chip jumps to. A meeting that was reset holds the
 * recording of the earlier run too; the chip used to jump to the first chapter
 * of all, which is the run the reports no longer count. It jumps to the first
 * chapter of the exercise in the current run, and to the first of all only when
 * the current run has none.
 */
export function chapterForChip(chapters: RecordingChapter[], exerciseId: string, lastResetAt: number | null): RecordingChapter | undefined {
  const own = chapters.filter((c) => c.exerciseId === exerciseId).sort((a, b) => a.start - b.start);
  if (lastResetAt !== null) {
    const current = own.find((c) => c.start >= lastResetAt);
    if (current) return current;
  }
  return own[0];
}

/** The latest meeting that has an action or a recording; null when none has. */
export function latestMeetingWithData(meetingsWithEvents: Iterable<number>, meetingsWithRecordings: Iterable<number>): number | null {
  const all = [...meetingsWithEvents, ...meetingsWithRecordings].filter((n) => n >= 1 && n <= 8);
  return all.length > 0 ? Math.max(...all) : null;
}

/**
 * Where the decision table must scroll so the highlighted row is in view under
 * its sticky header; null when the row is already fully visible.
 */
export function scrollTopToShowRow(box: { scrollTop: number; height: number; headerHeight: number }, row: { top: number; height: number }): number | null {
  const visibleTop = box.scrollTop + box.headerHeight;
  const visibleBottom = box.scrollTop + box.height;
  if (row.top >= visibleTop && row.top + row.height <= visibleBottom) return null;
  // The row a third of the way down: the rows that led to it stay in sight.
  return Math.max(0, Math.round(row.top - box.headerHeight - (box.height - box.headerHeight) / 3));
}

/**
 * The decision table with a separator row where the meeting was reset, so a
 * meeting done twice does not read as one run (audit learner_view: the two
 * runs ran together, unmarked). A reset with no event of the list before it
 * cut nothing here and is left out. The reset time is the server's and the
 * events carry the tablet's clock, so the row sits at the closest point the two
 * clocks allow; the score itself is cut on the server by the server's time.
 */
export function withResetSeparators(events: JourneyEvent[], resets: MeetingResetMark[]): RunRow[] {
  const rows: RunRow[] = [];
  const pending = [...resets].sort((a, b) => a.at - b.at);
  for (const event of events) {
    while (pending.length > 0 && pending[0].at < event.timestamp) {
      const reset = pending.shift()!;
      if (rows.some((r) => r.kind === 'event')) rows.push({ kind: 'reset', reset });
    }
    rows.push({ kind: 'event', event });
  }
  for (const reset of pending) if (rows.some((r) => r.kind === 'event')) rows.push({ kind: 'reset', reset });
  return rows;
}

/**
 * What was reset, in the reports' words (functions/src/preResetRecord.ts
 * resetWhatHe): one wording for the same event on every screen.
 */
export function resetWhatHe(scope: MeetingResetMark['scope']): string {
  return scope === 'active_session'
    ? 'המפגש אופס'
    : scope === 'full_student'
      ? 'כל העבודה של התלמיד אופסה'
      : 'המערכת אופסה';
}

/** The separator's text: "איפוס · 2.10.2026 14:05 · המפגש אופס. הסיבה: …". */
export function resetSeparatorHe(r: MeetingResetMark): string {
  return `איפוס · ${formatDate(r.at)} ${formatClock(r.at)} · ${resetWhatHe(r.scope)}.${r.reasonHe ? ` הסיבה: ${r.reasonHe}.` : ''} הדוח של המפגש נבנה רק מהעבודה שמכאן והלאה.${r.backupNotInDrive ? ` ${BACKUP_NOT_IN_DRIVE_HE}` : ''}`;
}

/** PRD 23א §ג: the dashboard marks a reset whose backup has not reached Drive yet. */
export const BACKUP_NOT_IN_DRIVE_HE = 'הגיבוי של האיפוס הזה שמור ב-Cloud Storage ועוד לא הגיע לתיקיית "3 גיבויים" בדרייב; הוא יועתק לשם אוטומטית פעם ביום.';

/**
 * The answers of the server's rule (meetingMetrics ANSWER_EVENT_TYPES): a
 * digit, a card choice, a completed exercise, a reflection. Opening the screen
 * after a reset (SESSION_START, PROBLEM_LOAD) is not working on the meeting.
 */
export const ANSWER_EVENT_TYPES: ReadonlySet<string> = new Set(['DIGIT_ENTERED', 'SOCRATIC_OPTION_SELECTED', 'PROBLEM_COMPLETE', 'REFLECTION_SUBMITTED']);

/**
 * Whether the learner answered anything in the meeting after the reset at `at`.
 *
 * The server cuts a meeting by each event's write time, not by when the child
 * acted: an answer buffered offline before the reset and written after it
 * counts as the new run. The web SDK does not expose a document's server write
 * time, so the closest basis on this side is `synced_at`, stamped as the event
 * is written to Firestore (the tablet's clock); the action time is used only
 * for an event written without it.
 */
export function answeredSince(events: JourneyEvent[], at: number): boolean {
  return events.some((e) => (e.writtenAt ?? e.timestamp) > at && ANSWER_EVENT_TYPES.has(String(e.eventType)));
}

export function groupEventsBySession(events: JourneyEvent[]): Map<number, JourneyEvent[]> {
  const map = new Map<number, JourneyEvent[]>();
  for (const e of events) {
    if (e.sessionNumber === null) continue;
    const list = map.get(e.sessionNumber) ?? [];
    list.push(e);
    map.set(e.sessionNumber, list);
  }
  for (const list of map.values()) list.sort(compareJourneyEvents);
  return map;
}

const EVENT_LABELS_HE: Record<string, string> = {
  SESSION_START: 'כניסה למפגש',
  PROBLEM_LOAD: 'טעינת תרגיל',
  BLOCK_DRAG_COMPLETE: 'גרירת לבנה',
  REGROUPING_TRIGGERED: 'התחלת המרה',
  REGROUPING_SUCCESS: 'השלמת המרה',
  DIGIT_ENTERED: 'הקלדת ספרה',
  DIGIT_DELETED: 'מחיקת ספרה',
  UNDO_EXECUTED: 'ביטול פעולה',
  HESITATION_DETECTED: 'היסוס',
  SOCRATIC_CARD_SHOWN: 'כרטיס חניכה נפתח',
  SOCRATIC_OPTION_SELECTED: 'תשובה בכרטיס החניכה',
  PROBLEM_COMPLETE: 'סיום תרגיל',
  REFLECTION_SUBMITTED: 'רפלקציה',
  ADAPTIVE_GRID_TOGGLED: 'לוח החיבור',
  KEYBOARD_LOCK_BLOCKED: 'הקלדה לפני המרה (מקלדת נעולה)',
  HELP_REQUESTED: 'קריאה שקטה למורה',
  HELP_WITHDRAWN: 'ביטול הקריאה למורה',
  CHAT_HELP_REQUESTED: 'בקשת עזרה מהצ׳אט',
  BOARD_CLEARED: 'ניקוי בית המספרים',
  PLACE_CUES_SHOWN: 'פיגום בשורת התוצאה',
  BRANCH_SELECTED: 'בחירת נתיב',
};

export interface EventDescription {
  label: string;
  detail: string;
  /** Module 21: "חיוויי בקרה עצמית" — deletions and undos. */
  selfRegulation: boolean;
  /** Something the teacher should look at: hesitation, coaching card, wrong digit. */
  attention: boolean;
}

function blockName(value: unknown): string {
  switch (value) {
    case 1: return 'יחידה';
    case 10: return 'עשרת';
    case 100: return 'מאה';
    case 1000: return 'אלף';
    default: return 'לבנה';
  }
}

/** PRD Module 16 §ג: "מאמץ קל, בינוני, רב". The stored values stay LOW / MEDIUM / HIGH. */
export const EFFORT_HE: Readonly<Record<string, string>> = { LOW: 'קל', MEDIUM: 'בינוני', HIGH: 'רב' };

/** Plain-Hebrew description of one telemetry event, from its own details only. */
export function describeEvent(e: JourneyEvent): EventDescription {
  const d = e.details || {};
  const col = typeof e.columnIndex === 'number' ? COLUMN_NAMES_HE[e.columnIndex] : undefined;
  let label = EVENT_LABELS_HE[e.eventType] ?? String(e.eventType);
  let detail = '';
  let selfRegulation = false;
  let attention = false;
  switch (e.eventType) {
    case 'BRANCH_SELECTED':
      // PRD Module 14 §ג: the learner's own button words; never "מסלול".
      detail = d.branch === 'challenge' ? 'נבחר: אתגר' : d.branch === 'reinforcement' ? 'נבחר: חיזוק וחזרה על החומר' : '';
      break;
    case 'PLACE_CUES_SHOWN':
      // Register deviation 28: a digit was written in another column's box.
      detail = d.profile === 'enhanced' ? 'ספרה בתיבה של טור אחר: הופיעו כותרות הטורים' : 'ספרה בתיבה של טור אחר: הופיעו צבעי הטורים וכותרותיהם';
      attention = true;
      break;
    case 'BOARD_CLEARED':
      // Meeting 1 step 5 records a press on an already empty board too.
      detail = Number(d.blocks_removed) > 0
        ? `${d.blocks_removed} לבני הדינס ירדו מבית המספרים בבת אחת`
        : 'לחיצה על פח האשפה כשבית המספרים כבר היה ריק';
      break;
    case 'SESSION_START':
      detail = typeof d.session_number === 'number' ? meetingShortLabelHe(d.session_number) : '';
      break;
    case 'PROBLEM_LOAD':
      detail = d.path_type === 'challenge' ? 'נתיב אתגר' : d.path_type === 'consolidation' ? 'נתיב ביסוס' : 'תרגיל חובה';
      break;
    case 'ADAPTIVE_GRID_TOGGLED':
      // Register deviation 19: opened by the 30-second stage or brought back by the learner; closed by the learner.
      detail = d.action === 'closed'
        ? 'הלומד סגר את הלוח'
        : d.action === 'opened'
          ? (d.source === 'hesitation_30s' ? 'נפתח אחרי 30 שניות של היסוס' : d.source === 'learner' ? 'הלומד החזיר את הלוח' : 'נפתח')
          : '';
      break;
    case 'BLOCK_DRAG_COMPLETE':
      // A block from the toolbox has no source column, whether it was dragged
      // or tapped (the two are recorded alike): it was added, not necessarily dragged.
      if (d.source_column_index === null) label = 'הוספת לבנה';
      // שני שדות הטור שווים רק בהשלכה לפח (מודול 8): גרירה לאותו טור שקטה.
      detail = typeof d.source_column_index === 'number' && d.source_column_index === e.columnIndex
        ? `${blockName(d.block_value)} הושלכה לפח האשפה${col ? ` מטור ה${col}` : ''}`
        : `${blockName(d.block_value)}${col ? ` אל טור ה${col}` : ''}`;
      break;
    case 'REGROUPING_TRIGGERED':
    case 'REGROUPING_SUCCESS':
      detail = `${d.regrouping_type === 'composition' ? 'הקבצה' : 'פריטה'}${col ? ` בטור ה${col}` : ''}`;
      // The client sends TRIGGERED and SUCCESS at the same instant, so every
      // conversion read '(0 שנ׳)' — a time nobody measured. Shown only when
      // there is one.
      if (typeof d.duration_ms === 'number' && d.duration_ms > 0) detail += ` (${Math.round(d.duration_ms / 1000)} שנ׳)`;
      break;
    case 'DIGIT_ENTERED': {
      const correct = d.is_correct;
      detail = `${d.digit_value ?? '?'}${col ? ` בטור ה${col}` : ''}`;
      if (correct === true) detail += ' — נכון';
      else if (correct === false) { detail += ' — שגוי'; attention = true; }
      break;
    }
    case 'DIGIT_DELETED':
      detail = `${d.deleted_digit_value ?? ''}${col ? ` מטור ה${col}` : ''}`.trim();
      selfRegulation = true;
      break;
    case 'UNDO_EXECUTED':
      detail = d.reverted_event_type ? `ביטל: ${EVENT_LABELS_HE[String(d.reverted_event_type)] ?? d.reverted_event_type}` : '';
      selfRegulation = true;
      break;
    case 'HESITATION_DETECTED':
      detail = typeof d.hesitation_seconds === 'number' ? `${d.hesitation_seconds} שניות ללא פעולה${col ? ` בטור ה${col}` : ''}` : '';
      attention = true;
      break;
    case 'SOCRATIC_CARD_SHOWN': {
      // One wording with the reports (core/routeLabels.ts, copied to the server).
      const reason: Record<string, string> = TRIGGER_REASON_HE;
      const cat: Record<string, string> = ERROR_CATEGORY_HE;
      detail = reason[String(d.trigger_reason)] ?? String(d.trigger_reason ?? '');
      if (d.error_category) detail += ` · ${cat[String(d.error_category)] ?? d.error_category}`;
      attention = true;
      break;
    }
    case 'SOCRATIC_OPTION_SELECTED':
      detail = d.is_correct === true ? 'תשובה נכונה' : 'תשובה שגויה';
      attention = d.is_correct !== true;
      break;
    case 'PROBLEM_COMPLETE':
      detail = `${typeof d.total_duration_ms === 'number' ? `${Math.round(d.total_duration_ms / 1000)} שנ׳` : ''}${typeof d.error_count === 'number' ? ` · ${d.error_count} שגיאות` : ''}${typeof d.undo_count === 'number' ? ` · ${d.undo_count} ביטולים` : ''}`.replace(/^ · /, '');
      break;
    case 'REFLECTION_SUBMITTED':
      detail = `שלב ${d.reflection_step ?? ''}${d.effort_score ? ` · מאמץ ${EFFORT_HE[String(d.effort_score)] ?? 'לא ידוע'}` : ''}${typeof d.persistence_index === 'number' ? ` · תיקון עצמי ${d.persistence_index}%` : ''}`;
      break;
    default:
      detail = '';
  }
  return { label, detail, selfRegulation, attention };
}

/** Human title for an exercise id inside a meeting, from the session banks. */
export function exerciseTitle(sessionNumber: number | null, exerciseId: string): string {
  if (!exerciseId) return '';
  // מסמך 03: a choice exercise is marked as one. These banks are not in
  // getSessionTasks, so the teacher used to see the bare id.
  const choice = choiceTask(exerciseId);
  if (choice) {
    const type = exercisePathType(exerciseId);
    return type === 'compulsory' ? choice.titleHe : `${CHOICE_PATH_LABEL_HE[type]}: ${choice.titleHe}`;
  }
  if (sessionNumber === 2) {
    const t = DIAGNOSTIC_TASKS.find((x) => x.id === exerciseId);
    if (t) return t.titleHe;
  } else if (sessionNumber && sessionNumber !== 2) {
    const meeting = sessionNumber as 1 | 3 | 4 | 5 | 6 | 7 | 8;
    for (const path of ['green_path', 'remediation_path'] as const) {
      try {
        const t = getSessionTasks(meeting, path).find((x) => x.id === exerciseId);
        if (t) return t.titleHe;
      } catch {
        /* a bank that does not exist for this meeting */
      }
    }
  }
  // An id no bank knows ("ex_4_01"): a Hebrew label, never the id
  // (coordinator, 2.10.2026; the server's exerciseLabelHe, same wording).
  // The number in the id identifies it; it is not the exercise's place in the meeting.
  const unknown = /^(?:ex|s)_?(\d+)_(.*)$/.exec(exerciseId);
  if (unknown) {
    const index = /(\d+)$/.exec(unknown[2]);
    return index ? `תרגיל במפגש ${unknown[1]}, מס׳ זיהוי ${Number(index[1])}` : `תרגיל במפגש ${unknown[1]}`;
  }
  return 'תרגיל';
}

/**
 * Live subscription to the learner's recordings, in both places they live
 * (see mergeRecordingNodes). Nothing is reported until both have answered, so
 * the list never flashes a half. Returns the unsubscribe.
 */
export function subscribeLearnerRecordings(
  studentNum: number,
  onChange: (sessions: RecordingSession[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  const offs: Array<() => void> = [];
  let cancelled = false;
  const UNSET = Symbol('unset');
  let legacy: Record<string, any> | null | typeof UNSET = UNSET;
  let current: Record<string, any> | null | typeof UNSET = UNSET;
  const emit = () => {
    if (legacy === UNSET || current === UNSET) return;
    onChange(parseRecordingSessions(mergeRecordingNodes(legacy, current)));
  };
  authReady.then(() => {
    if (cancelled) return;
    offs.push(onValue(
      ref(database, `recordings/student_user${studentNum}/telemetry_sessions`),
      (snap) => { current = snap.exists() ? snap.val() : null; emit(); },
      (err) => onError?.(err),
    ));
    offs.push(onValue(
      ref(database, `users/students/student_user${studentNum}/telemetry_sessions`),
      (snap) => { legacy = snap.exists() ? snap.val() : null; emit(); },
      (err) => onError?.(err),
    ));
  });
  return () => {
    cancelled = true;
    offs.forEach((off) => off());
  };
}

/** The meetings whose recording budget is flagged as cut (the server's truncatedRecordingMeetings, functions/src/meetingMetrics.ts). */
export function truncatedMeetingsOf(budgets: Record<string, any> | null | undefined): number[] {
  if (!isPlainObject(budgets)) return [];
  const out: number[] = [];
  for (const [key, budget] of Object.entries(budgets)) {
    const m = /^meeting_(\d)$/.exec(key);
    if (m && isPlainObject(budget) && budget.truncated === true) out.push(Number(m[1]));
  }
  return out.sort((a, b) => a - b);
}

/**
 * Module 21: the 50MB cap is kept per meeting, and the recorder flags it on
 * the meeting's budget (recorded_bytes/meeting_N/truncated) even when the
 * recording that hit the cap has no flag of its own — a refresh, then a first
 * chunk over the cap. Live, from both places the budget lives; a place that
 * cannot be read adds nothing.
 */
export function subscribeLearnerTruncatedMeetings(studentNum: number, onChange: (meetings: number[]) => void): () => void {
  const offs: Array<() => void> = [];
  let cancelled = false;
  let legacy: number[] = [];
  let current: number[] = [];
  const emit = () => onChange([...new Set([...legacy, ...current])].sort((a, b) => a - b));
  authReady.then(() => {
    if (cancelled) return;
    offs.push(onValue(
      ref(database, `recordings/student_user${studentNum}/recorded_bytes`),
      (snap) => { current = truncatedMeetingsOf(snap.exists() ? snap.val() : null); emit(); },
      () => {},
    ));
    offs.push(onValue(
      ref(database, `users/students/student_user${studentNum}/recorded_bytes`),
      (snap) => { legacy = truncatedMeetingsOf(snap.exists() ? snap.val() : null); emit(); },
      () => {},
    ));
  });
  return () => {
    cancelled = true;
    offs.forEach((off) => off());
  };
}

/** What the teacher reads when the learner's actions cannot be read; the SDK's own English text goes to the console. */
export const EVENTS_READ_ERROR_HE = 'לא ניתן לקרוא כרגע את הפעולות המתועדות של התלמיד. בדקו את החיבור לרשת ולחצו "רענון". אם זה חוזר, התנתקו והתחברו מחדש כמורה.';

/** One telemetry_logs document as a table row's event; null for a document with no time or no type. */
export function journeyEventFromDoc(id: string, d: Record<string, any> | null | undefined): JourneyEvent | null {
  if (!d || typeof d.client_timestamp !== 'number' || !d.event_type) return null;
  return {
    id,
    timestamp: d.client_timestamp,
    sessionNumber: sessionNumberFromSessionId(d.session_id),
    sessionId: String(d.session_id ?? ''),
    exerciseId: String(d.exercise_id ?? ''),
    eventType: String(d.event_type),
    ...(typeof d.column_index === 'number' ? { columnIndex: d.column_index } : {}),
    details: d.details && typeof d.details === 'object' ? d.details : {},
    ...(typeof d.synced_at === 'number' ? { writtenAt: d.synced_at } : {}),
    ...(typeof d.sequence_number === 'number' && Number.isFinite(d.sequence_number) ? { sequenceNumber: d.sequence_number } : {}),
  };
}

/**
 * Live subscription to the learner's telemetry events, oldest first. The table
 * used to be one read: with the learner at work the player grew and the table
 * stood still until "רענון". After the first answer only the new documents are
 * read. Returns the unsubscribe.
 */
export function subscribeLearnerEvents(
  studentNum: number,
  onChange: (events: JourneyEvent[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  authReady.then(() => {
    if (cancelled) return;
    off = onSnapshot(
      query(collection(firestore, 'telemetry_logs'), where('student_id', '==', studentNum)),
      (snap) => {
        const events: JourneyEvent[] = [];
        snap.forEach((docSnap) => {
          const e = journeyEventFromDoc(docSnap.id, docSnap.data() as Record<string, any>);
          if (e) events.push(e);
        });
        events.sort(compareJourneyEvents);
        onChange(events);
      },
      (err) => onError?.(err),
    );
  }).catch((err) => onError?.(err));
  return () => {
    cancelled = true;
    off?.();
  };
}

/** All typed telemetry events of one learner, oldest first. */
/**
 * מטמון קצר-טווח לפי מספר תלמיד.
 *
 * הקריאה כאן מושכת את כל אירועי הטלמטריה של הלומד — נספח א׳ §3 נועל את
 * סכמת האירוע, ואין בה שדה מספר-מפגש שאפשר לסנן לפיו בשרת, ולכן הסינון
 * למפגש נעשה בדפדפן. בלי מטמון, כל מעבר בין תלמידים ברשימה משך שוב את כל
 * ההיסטוריה של אותו ילד מ-Firestore. המטמון לא משנה שום נתון — הוא רק
 * מונע קריאה חוזרת של אותם מסמכים בדיוק בתוך אותה ישיבת עבודה של המורה.
 */
const EVENTS_CACHE_TTL_MS = 60_000;
const learnerEventsCache = new Map<number, { at: number; events: JourneyEvent[] }>();

/** מנקה את המטמון — לאחר איפוס נתונים, או כשהמורה מבקשת רענון מפורש. */
export function invalidateLearnerEventsCache(studentNum?: number): void {
  if (studentNum === undefined) learnerEventsCache.clear();
  else learnerEventsCache.delete(studentNum);
}

export async function fetchLearnerEvents(
  studentNum: number,
  options: { forceRefresh?: boolean } = {}
): Promise<JourneyEvent[]> {
  const cached = learnerEventsCache.get(studentNum);
  if (!options.forceRefresh && cached && Date.now() - cached.at < EVENTS_CACHE_TTL_MS) {
    return cached.events;
  }

  await authReady;
  const snap = await getDocs(query(collection(firestore, 'telemetry_logs'), where('student_id', '==', studentNum)));
  const events: JourneyEvent[] = [];
  snap.forEach((docSnap) => {
    const e = journeyEventFromDoc(docSnap.id, docSnap.data() as Record<string, any>);
    if (e) events.push(e);
  });
  events.sort(compareJourneyEvents);
  learnerEventsCache.set(studentNum, { at: Date.now(), events });
  return events;
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Module 23 — the AI report for one meeting ──────────────────────────────
//
// Owner decision (2026-09-04, register item 4): the teacher can ask for the
// pedagogical report of ANY meeting of a learner, from this page. The server
// (generatePedagogicalReportPDF) builds it from that meeting's own telemetry:
// layer 1 (score, working group) by the PRD percentage rule, layer 2 (knowledge
// gaps, teaching recommendations) by the AI engine, plus the exercise narrative.

/** PRD 23 §ב: measure 1 has this one name in every report and on every screen. */
export const FIRST_ATTEMPT_SCORE_LABEL_HE = 'ציון ניסיון ראשון (מדד 1)';
/** PRD 14 §ב0 / 23 §ב: the score before the learner completed the meeting in catch-up time. */
export const PREVIOUS_SCORE_LABEL_HE = 'הציון הקודם (לפני ההשלמה)';

/** PRD Module 23 §ד: the only text shown while a report is not ready. */
export const REPORT_PROCESSING_TEXT = 'הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים';
/**
 * PRD Module 23 §ד names one text for a report that is not ready yet. Both
 * report panels showed it for every failure — a "not-found" with the server's
 * own Hebrew explanation ("אין פעולות מתועדות למפגש…") came out as "try again
 * in a few moments", and the teacher tried again, and again. A refusal is
 * final and says why; only a transient failure is "processing".
 */
/** The server's sentence when the reset log cannot be read (functions/src/preResetRecord.ts; a test keeps them equal). */
export const RESET_LOG_UNAVAILABLE_HE = 'לא ניתן לקרוא כרגע את יומן האיפוסים, ולכן הדוח לא הופק. נסו שוב בעוד כמה דקות.';

export function describeReportError(err: unknown): { final: boolean; message: string } {
  const code = String((err as { code?: string } | null)?.code ?? '').replace(/^functions\//, '');
  const raw = err instanceof Error ? err.message : String(err ?? '');
  // The reset log could not be read (functions/src/preResetRecord.ts): transient,
  // and it says why. Any other "unavailable" keeps the PRD's processing text.
  if (code === 'unavailable' && raw === RESET_LOG_UNAVAILABLE_HE) return { final: false, message: raw };
  const finalCodes = new Set(['not-found', 'invalid-argument', 'permission-denied', 'failed-precondition', 'unauthenticated']);
  if (finalCodes.has(code)) {
    const hebrew = /[\u05D0-\u05EA]/.test(raw);
    return {
      final: true,
      message: hebrew
        ? raw
        : code === 'permission-denied' || code === 'unauthenticated'
          ? 'אין לך הרשאה להפיק את הדוח הזה.'
          : 'לא ניתן להפיק דוח למפגש הזה.',
    };
  }
  return { final: false, message: REPORT_PROCESSING_TEXT };
}

/** PRD Module 23 §ב: the only text shown when the AI layer is unavailable. */
export const AI_FALLBACK_TEXT = 'הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.';

/**
 * The six interface actions meeting 1 checks, in the server's order
 * (functions/src/meetingMetrics.ts TOOLS / TOOL_LABEL_HE).
 */
export const TOOL_LABELS_HE: ReadonlyArray<[string, string]> = [
  ['drag', 'גרירת לבני הדינס לבית המספרים'],
  ['decompose', 'פירוק לבנה (פריטה)'],
  ['compose', 'הקבצה בכפתור "קבצו 10"'],
  ['type', 'הקלדת ספרות'],
  ['undo', 'ביטול פעולה'],
  ['trash', 'פח האשפה'],
];

const OUTCOME_LABELS_HE: Record<string, string> = {
  first_try: 'ניסיון ראשון',
  after_correction: 'אחרי תיקון',
  incomplete: 'לא הושלם',
};

/** Meeting 1 (Module 14 §ב) is a sandbox and refresh: no score, no working group. */
export interface SandboxReportPart {
  tools: { label: string; count: number }[];
  toolsNotUsed: string[];
  refresh: { title: string; outcomeHe: string }[];
  /** A meeting-1 report produced before it had these sections; the teacher regenerates it. */
  outdated: boolean;
}

export interface MeetingReport {
  reportId: string;
  sessionId: string;
  sessionNumber: number;
  /** null when the meeting is not scored (meeting 1) — never shown as 0%. */
  scorePercent: number | null;
  /**
   * PRD 14 §ב0 / 23 §ב: the score before the learner's latest completion of
   * the meeting (catch-up time), shown beside the new one. null when none.
   */
  previousScorePercent: number | null;
  /** Set for meeting 1: the report shows tools and refresh outcomes instead of a score and a group. */
  sandbox: SandboxReportPart | null;
  /** Where the score came from: the meeting's session document, or the PRD first-attempt rule over its telemetry. */
  scoreSource: string;
  routingLabelHe: string;
  recommendationDetailsHe: string;
  /** The compulsory exercises only. */
  exerciseNarratives: string[];
  /** מסמך 03: the choice exercises, marked, apart from the compulsory ones. */
  choiceExerciseNarratives: string[];
  knowledgeGaps: string[];
  teachingRecommendations: string[];
  aiAnalysisAvailable: boolean;
  telemetryEventCount: number;
  generatedAt: number | null;
  /**
   * PRD 7.3, Module 23 §ב "מדדי המחקר": shown in the learner report. One ready
   * line per measure; empty for a report produced before the measures existed.
   */
  researchMeasures: ResearchMeasureLine[];
  /** Set when the server produced the report but could NOT render or store its PDF (Module 23 §ה). */
  pdfFailureMessage: string | null;
  /**
   * Owner, 2.10.2026: where the learner went wrong before the meeting's last
   * reset — the resets, then one line per exercise, as the server wrote them.
   * Documentation only: the score and the group above count the new run. Null
   * when the meeting was not reset (and on reports stored before this existed).
   */
  preReset: { lines: string[] } | null;
  /** The copy of the PDF in the shared Drive folder; null when it was not saved there (the copy is best-effort). */
  driveUrl: string | null;
  /**
   * A meeting-1 report stored from before meeting 1 stopped being scored: its
   * stored PDF still prints a score (PRD Module 14: meeting 1 is not scored).
   * The file is not offered; the teacher regenerates the report.
   */
  storedPdfOutdated: boolean;
}

/** Shown in place of "פתחו PDF" for such a report. */
export const OUTDATED_MEETING1_PDF_HE = 'הדוח הזה הופק לפני שמפגש 1 הפסיק לקבל ציון, והקובץ השמור שלו עדיין מציג ציון. לחצו "הפיקו מחדש" כדי לקבל דוח וקובץ מעודכנים.';
/** The learner report's Drive line when no copy was saved (the class panel's wording). */
export const DRIVE_COPY_MISSING_HE = 'העותק בדרייב לא נשמר (הדוח עצמו שמור במערכת)';
/** A PDF tab the browser refused to open. */
export const PDF_BLOCKED_HE = 'הדפדפן חסם את פתיחת הקובץ. אשרו לאתר הזה לפתוח חלונות קופצים, ולחצו שוב על "פתחו PDF".';

/** The heading and the note of the report's "לפני האיפוס" part (functions/src/preResetRecord.ts). */
export const PRE_RESET_HEADING_HE = 'לפני האיפוס';
export const PRE_RESET_NOTE_HE =
  'תיעוד בלבד: הטעויות שלפני האיפוס לא נכנסות לציון ולא משנות את קבוצת העבודה. כל שאר חלקי הדוח מחושבים רק מהעבודה שאחרי האיפוס.';

const ratioLine = (v: unknown, a: string, b: string, unit = ''): string => {
  if (!v || typeof v !== 'object') return 'לא נמדד';
  const o = v as Record<string, unknown>;
  if (typeof o.percent !== 'number') return unit ? 'לא נדרש תיווך (0 כרטיסים)' : 'לא נמדד';
  return `${Number(o[b]) || 0} מתוך ${Number(o[a]) || 0}${unit} (${o.percent}%)`;
};

/** One research measure in the learner report: its name, its values, and one sentence on what it says. */
export interface ResearchMeasureLine {
  label: string;
  value: string;
  explanation: string;
}

function researchMeasureLines(m: unknown): ResearchMeasureLine[] {
  if (!m || typeof m !== 'object') return [];
  const r = m as Record<string, any>;
  // Owner, 30.9.2026: measure 2 in two parts. The stored key `persistence` is 2ב;
  // `persistence_without_help` (2א) is absent on reports stored before it existed.
  const values: Record<ResearchMeasureKey, string> = {
    persistence: persistenceTextHe(r.persistence_without_help),
    self_correction: selfCorrectionTextHe(r.persistence),
    flexibility: `${ratioLine(r.flexibility, 'completed', 'first_try')} · מצטבר (מפגשים 3 ו-7): ${ratioLine(r.flexibility_cumulative, 'completed', 'first_try')}`,
    mediation: `${r.mediation ? ratioLine(r.mediation, 'cards', 'effective', ' כרטיסים') : 'לא נמדד'} · מצטבר (כל המפגשים): ${r.mediation_cumulative ? ratioLine(r.mediation_cumulative, 'cards', 'effective', ' כרטיסים') : 'לא נמדד'}`,
  };
  return RESEARCH_MEASURES_HE.map((x) => ({ label: x.label, value: values[x.key], explanation: x.explanation }));
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * The narrative of the compulsory exercises, and of the choice exercises apart
 * (מסמך 03). A report stored before the server split them numbered the choice
 * exercises on after the compulsory ones ("בתרגיל השמיני (s4_g_reinforce_1)");
 * those paragraphs are moved by the exercise id they name.
 */
function splitNarratives(d: Record<string, any>): { exerciseNarratives: string[]; choiceExerciseNarratives: string[] } {
  const compulsory: string[] = [];
  const choice: string[] = strList(d.choice_exercise_narratives);
  for (const n of strList(d.exercise_narratives)) {
    const id = /\(([^()\s]+)\)/.exec(n)?.[1] ?? '';
    const type = exercisePathType(id);
    if (type === 'compulsory') compulsory.push(n);
    else choice.push(`${CHOICE_PATH_LABEL_HE[type]}: ${n}`);
  }
  return { exerciseNarratives: compulsory, choiceExerciseNarratives: choice };
}

function sandboxPartOf(d: Record<string, any>): SandboxReportPart {
  const used = d.tool_mastery?.used && typeof d.tool_mastery.used === 'object' ? d.tool_mastery.used : null;
  const titles = d.exercise_titles && typeof d.exercise_titles === 'object' ? d.exercise_titles : {};
  const outcomes = d.exercise_outcomes && typeof d.exercise_outcomes === 'object' ? d.exercise_outcomes : {};
  return {
    tools: used ? TOOL_LABELS_HE.map(([key, label]) => ({ label, count: Number(used[key]) || 0 })) : [],
    toolsNotUsed: used ? TOOL_LABELS_HE.filter(([key]) => !(Number(used[key]) > 0)).map(([, label]) => label) : [],
    refresh: Object.entries(outcomes as Record<string, string>).map(([id, o]) => ({
      title: typeof titles[id] === 'string' ? titles[id] : id,
      outcomeHe: OUTCOME_LABELS_HE[o] ?? o,
    })),
    outdated: used === null,
  };
}

/**
 * `justGenerated`: the server produced this report (and its PDF) in this very
 * request, so its file is the new one whatever the document says. The report
 * carries no link: PRD 23 §ב, the links are "בתוקף לשעה אחת מרגע יצירתם, כמו
 * הקישור לדוח הלומד", and fetchMeetingReportUrl asks for one on each opening.
 */
export function reportFromData(
  d: Record<string, any>,
  sessionId: string,
  justGenerated: boolean | null = null,
  pdfFailureMessage: string | null = null,
  driveUrl: string | null = null,
): MeetingReport {
  const sessionNumber = Number(d.session_number) || 0;
  // Meeting 1 is never scored — also on a report stored before this was enforced.
  const sandbox = d.meeting_kind === 'sandbox_refresh' || sessionNumber === 1;
  return {
    driveUrl: driveUrl ?? (typeof d.drive_file_url === 'string' && d.drive_file_url ? d.drive_file_url : null),
    // A PDF the server has just made is a fresh one, whatever the document still says.
    storedPdfOutdated: sandbox && justGenerated !== true && (d.meeting_kind !== 'sandbox_refresh' || typeof d.score_percent === 'number'),
    reportId: String(d.report_id ?? `rep_${sessionId}`),
    sessionId: String(d.session_id ?? sessionId),
    sessionNumber,
    scorePercent: sandbox || typeof d.score_percent !== 'number' ? null : d.score_percent,
    previousScorePercent: sandbox || typeof d.previous_score_percent !== 'number' ? null : d.previous_score_percent,
    sandbox: sandbox ? sandboxPartOf(d) : null,
    scoreSource: String(d.score_source ?? ''),
    routingLabelHe: String(d.routing_label_he ?? ''),
    recommendationDetailsHe: String(d.recommendation_details_he ?? ''),
    ...splitNarratives(d),
    knowledgeGaps: strList(d.knowledge_gaps),
    teachingRecommendations: strList(d.teaching_recommendations),
    aiAnalysisAvailable: d.ai_analysis_available === true,
    telemetryEventCount: Number(d.telemetry_event_count) || 0,
    generatedAt: typeof d.generated_at === 'number' ? d.generated_at : null,
    researchMeasures: researchMeasureLines(d.research_measures),
    pdfFailureMessage,
    preReset: strList(d.pre_reset?.lines_he).length > 0 ? { lines: strList(d.pre_reset.lines_he) } : null,
  };
}

/** PRD 23 §ב: the mark of a report produced before the meeting's last reset. */
export const REPORT_BEFORE_RESET_LABEL_HE = 'לפני האיפוס';

/** Newest first; a report with no time (none is stored without one) last. */
export function newestReportsFirst(reports: MeetingReport[]): MeetingReport[] {
  return [...reports].sort((a, b) => (b.generatedAt ?? -Infinity) - (a.generatedAt ?? -Infinity));
}

/**
 * PRD 23 §ב: "דוח שהופק לפני האיפוס נשמר ומסומן 'לפני האיפוס'; דוח שמופק אחרי
 * האיפוס הוא קובץ חדש ואינו מחליף אותו". Read against the reset log at display
 * time, since the reset may come after the report: produced before the last
 * completed reset of this meeting (resetsOfMeeting, PRD 23א §ד).
 */
export function isReportBeforeReset(report: Pick<MeetingReport, 'generatedAt'>, resets: Pick<MeetingResetMark, 'at'>[]): boolean {
  if (report.generatedAt === null || resets.length === 0) return false;
  const last = Math.max(...resets.map((r) => r.at));
  return report.generatedAt < last;
}

/**
 * Every report produced for this meeting, newest first. PRD 23 §ב: "הפקה
 * חוזרת יוצרת קובץ חדש ואינה דורסת את הקודם" — one document per generation
 * (reports/rep_{sessionId}_{generatedAt}), and the single document a meeting
 * had before that (reports/rep_{sessionId}) is read with them.
 */
export async function fetchMeetingReports(sessionId: string): Promise<MeetingReport[]> {
  await authReady;
  // firestore.rules (reports, list): the query names the class, as the teacher's own reads do.
  const snap = await getDocs(query(collection(firestore, 'reports'), where('class_id', '==', 'class_1'), where('session_id', '==', sessionId)));
  const out: MeetingReport[] = [];
  snap.forEach((d) => { out.push(reportFromData({ report_id: d.id, ...(d.data() as Record<string, any>) }, sessionId)); });
  return newestReportsFirst(out);
}

/** Asks the server to build (or rebuild) the report for one meeting. Takes up to ~20 seconds. */
export async function generateMeetingReport(params: { studentNum: number; sessionNumber: number; sessionId: string }): Promise<MeetingReport> {
  const call = httpsCallable(functions, 'generatePedagogicalReportPDF', { timeout: 120_000 });
  const res = await call({
    sessionId: params.sessionId,
    classId: 'class_1',
    sessionNumber: params.sessionNumber,
    studentId: params.studentNum,
  });
  const data = (res.data ?? {}) as Record<string, any>;
  if (!data.report) throw new Error('השרת לא החזיר דוח');
  // The server answers DEGRADED_JSON_ONLY when the report was built but its PDF
  // could not be rendered or stored. That status used to be ignored: the report
  // appeared on screen, and "פתח PDF" then opened the PDF of an EARLIER run (stale
  // numbers) or failed with an unrelated message.
  // PRD 7.3 Module 23 §ה fixes the text for a PDF the server failed to render:
  // "הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים" (register, deviation 4).
  // The server returns no link (PRD 23 §ב, one-hour links only): the PDF
  // failed when the server says so, not when no link came back.
  const pdfFailed = data.status === 'DEGRADED_JSON_ONLY' || data.pdf_stored === false;
  return reportFromData(
    typeof data.reportId === 'string' && data.reportId ? { ...data.report, report_id: data.reportId } : data.report,
    params.sessionId,
    !pdfFailed,
    pdfFailed ? REPORT_PROCESSING_TEXT : null,
    typeof data.driveMirrorUrl === 'string' && data.driveMirrorUrl ? data.driveMirrorUrl : null,
  );
}

/**
 * A fresh one-hour link to the stored PDF of one report of a meeting (PRD 23
 * §ב: "בתוקף לשעה אחת מרגע יצירתם"), asked for on every opening.
 */
export async function fetchMeetingReportUrl(sessionId: string, reportId: string): Promise<string> {
  const call = httpsCallable(functions, 'getPedagogicalReportDownloadUrl');
  const res = await call({ sessionId, reportId });
  const url = (res.data as Record<string, any> | undefined)?.downloadUrl;
  if (typeof url !== 'string' || !url) throw new Error('לא התקבל קישור לקובץ');
  return url;
}
