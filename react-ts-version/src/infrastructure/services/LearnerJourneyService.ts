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
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { database, firestore, functions, authReady } from '@/infrastructure/firebase';
import type { TelemetryEventType } from '@/types/telemetry';
import { getSessionTasks } from '@/data/sessionTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';

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
}

export const SESSION_NAMES_HE: Record<number, string> = {
  1: 'ארגז החול',
  2: 'תחנה שתיים: אבחון',
  3: 'ערך המקום ופירוק',
  4: 'חיבור עם הקבצה',
  5: 'חיסור עם פריטה',
  6: 'האפס והמרה כפולה',
  7: 'חקר ואינטגרציה',
  8: 'מפגש חוקר מסכם',
};

const COLUMN_NAMES_HE = ['יחידות', 'עשרות', 'מאות', 'אלפים'];

/** "session_3_student_user4" → 3; anything else → null. */
export function sessionNumberFromSessionId(sessionId: string | undefined | null): number | null {
  if (!sessionId) return null;
  const m = /^session_(\d+)/.exec(sessionId);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 8 ? n : null;
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
        if (!m || typeof m.startTime !== 'number') continue;
        meta.push({
          start: m.startTime,
          end: typeof m.endTime === 'number' ? m.endTime : m.startTime,
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
        if (Array.isArray(parsed)) events.push(...parsed);
      } catch {
        // A corrupt chunk is skipped; the rest of the recording still plays.
      }
    }
  }
  events.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  return events;
}

export function groupEventsBySession(events: JourneyEvent[]): Map<number, JourneyEvent[]> {
  const map = new Map<number, JourneyEvent[]>();
  for (const e of events) {
    if (e.sessionNumber === null) continue;
    const list = map.get(e.sessionNumber) ?? [];
    list.push(e);
    map.set(e.sessionNumber, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.timestamp - b.timestamp);
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

/** Plain-Hebrew description of one telemetry event, from its own details only. */
export function describeEvent(e: JourneyEvent): EventDescription {
  const d = e.details || {};
  const col = typeof e.columnIndex === 'number' ? COLUMN_NAMES_HE[e.columnIndex] : undefined;
  const label = EVENT_LABELS_HE[e.eventType] ?? String(e.eventType);
  let detail = '';
  let selfRegulation = false;
  let attention = false;
  switch (e.eventType) {
    case 'SESSION_START':
      detail = typeof d.session_number === 'number' ? `מפגש ${d.session_number}` : '';
      break;
    case 'PROBLEM_LOAD':
      detail = d.path_type === 'challenge' ? 'נתיב אתגר' : d.path_type === 'consolidation' ? 'נתיב ביסוס' : 'תרגיל חובה';
      break;
    case 'BLOCK_DRAG_COMPLETE':
      detail = `${blockName(d.block_value)}${col ? ` אל טור ה${col}` : ''}`;
      break;
    case 'REGROUPING_TRIGGERED':
    case 'REGROUPING_SUCCESS':
      detail = `${d.regrouping_type === 'composition' ? 'הקבצה' : 'פריטה'}${col ? ` בטור ה${col}` : ''}`;
      if (typeof d.duration_ms === 'number') detail += ` (${Math.round(d.duration_ms / 1000)} שנ׳)`;
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
      const reason: Record<string, string> = {
        hesitation_45s: 'היסוס 45 שניות',
        consecutive_errors_4: 'ארבע מחיקות רצופות',
        consecutive_undos_3: 'שלושה ביטולים רצופים',
        conversion_not_performed: 'לא בוצעה המרה נדרשת',
      };
      const cat: Record<string, string> = { calculation: 'חישוב', procedural: 'רכיב', conceptual: 'מושגי' };
      detail = reason[String(d.trigger_reason)] ?? String(d.trigger_reason ?? '');
      if (d.error_category) detail += ` · סיווג: ${cat[String(d.error_category)] ?? d.error_category}`;
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
      detail = `שלב ${d.reflection_step ?? ''}${d.effort_score ? ` · מאמץ ${String(d.effort_score)}` : ''}${typeof d.persistence_index === 'number' ? ` · התמדה ${d.persistence_index}%` : ''}`;
      break;
    default:
      detail = '';
  }
  return { label, detail, selfRegulation, attention };
}

/** Human title for an exercise id inside a meeting, from the session banks. */
export function exerciseTitle(sessionNumber: number | null, exerciseId: string): string {
  if (!exerciseId) return '';
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
  return exerciseId;
}

/** Live subscription to the learner's recordings. Returns the unsubscribe. */
export function subscribeLearnerRecordings(
  studentNum: number,
  onChange: (sessions: RecordingSession[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  let off: (() => void) | null = null;
  let cancelled = false;
  authReady.then(() => {
    if (cancelled) return;
    off = onValue(
      ref(database, `users/students/student_user${studentNum}/telemetry_sessions`),
      (snap) => onChange(parseRecordingSessions(snap.exists() ? snap.val() : null)),
      (err) => onError?.(err),
    );
  });
  return () => {
    cancelled = true;
    if (off) off();
  };
}

/** All typed telemetry events of one learner, oldest first. */
export async function fetchLearnerEvents(studentNum: number): Promise<JourneyEvent[]> {
  await authReady;
  const snap = await getDocs(query(collection(firestore, 'telemetry_logs'), where('student_id', '==', studentNum)));
  const events: JourneyEvent[] = [];
  snap.forEach((docSnap) => {
    const d = docSnap.data() as any;
    if (!d || typeof d.client_timestamp !== 'number' || !d.event_type) return;
    events.push({
      id: docSnap.id,
      timestamp: d.client_timestamp,
      sessionNumber: sessionNumberFromSessionId(d.session_id),
      sessionId: String(d.session_id ?? ''),
      exerciseId: String(d.exercise_id ?? ''),
      eventType: String(d.event_type),
      ...(typeof d.column_index === 'number' ? { columnIndex: d.column_index } : {}),
      details: d.details && typeof d.details === 'object' ? d.details : {},
    });
  });
  events.sort((a, b) => a.timestamp - b.timestamp);
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
// Owner decision (2026-09-04, register item 7): the teacher can ask for the
// pedagogical report of ANY meeting of a learner, from this page. The server
// (generatePedagogicalReportPDF) builds it from that meeting's own telemetry:
// layer 1 (score, working group) by the PRD percentage rule, layer 2 (knowledge
// gaps, teaching recommendations) by the AI engine, plus the exercise narrative.

/** PRD Module 23 §ד: the only text shown while a report is not ready. */
export const REPORT_PROCESSING_TEXT = 'הדוח בעיבוד כעת, אנא נסו שוב בעוד מספר רגעים';
/** PRD Module 23 §ב: the only text shown when the AI layer is unavailable. */
export const AI_FALLBACK_TEXT = 'הניתוח הפדגוגי המפורט אינו זמין כעת. ההמלצות שלהלן מבוססות על מדדי הביצוע.';

export interface MeetingReport {
  reportId: string;
  sessionId: string;
  sessionNumber: number;
  scorePercent: number;
  /** Where the score came from: the meeting's session document, or the PRD first-attempt rule over its telemetry. */
  scoreSource: string;
  routingLabelHe: string;
  recommendationDetailsHe: string;
  exerciseNarratives: string[];
  knowledgeGaps: string[];
  teachingRecommendations: string[];
  aiAnalysisAvailable: boolean;
  telemetryEventCount: number;
  generatedAt: number | null;
  /** Direct PDF link when the server just produced it; otherwise fetched on demand. */
  downloadUrl: string | null;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function reportFromData(d: Record<string, any>, sessionId: string, downloadUrl: string | null): MeetingReport {
  return {
    reportId: String(d.report_id ?? `rep_${sessionId}`),
    sessionId: String(d.session_id ?? sessionId),
    sessionNumber: Number(d.session_number) || 0,
    scorePercent: Number(d.score_percent) || 0,
    scoreSource: String(d.score_source ?? ''),
    routingLabelHe: String(d.routing_label_he ?? ''),
    recommendationDetailsHe: String(d.recommendation_details_he ?? ''),
    exerciseNarratives: strList(d.exercise_narratives),
    knowledgeGaps: strList(d.knowledge_gaps),
    teachingRecommendations: strList(d.teaching_recommendations),
    aiAnalysisAvailable: d.ai_analysis_available === true,
    telemetryEventCount: Number(d.telemetry_event_count) || 0,
    generatedAt: typeof d.generated_at === 'number' ? d.generated_at : null,
    downloadUrl,
  };
}

/** The report already produced for this meeting, if any (Firestore reports/rep_{sessionId}). */
export async function fetchMeetingReport(sessionId: string): Promise<MeetingReport | null> {
  await authReady;
  const snap = await getDoc(doc(firestore, 'reports', `rep_${sessionId}`));
  if (!snap.exists()) return null;
  return reportFromData(snap.data() as Record<string, any>, sessionId, null);
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
  return reportFromData(data.report, params.sessionId, typeof data.downloadUrl === 'string' ? data.downloadUrl : null);
}

/** A fresh one-hour link to the stored PDF of a meeting's report. */
export async function fetchMeetingReportUrl(sessionId: string): Promise<string> {
  const call = httpsCallable(functions, 'getPedagogicalReportDownloadUrl');
  const res = await call({ sessionId });
  const url = (res.data as Record<string, any> | undefined)?.downloadUrl;
  if (typeof url !== 'string' || !url) throw new Error('לא התקבל קישור לקובץ');
  return url;
}
