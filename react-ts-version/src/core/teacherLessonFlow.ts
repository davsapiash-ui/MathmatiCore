/**
 * The teacher's lesson flow, round two (owner decision 11.10.2026): what the
 * radar tile adds (finished, task N/7, the wait since a help call, the time a
 * card is open), the closing checklist, the deadline notice, the prepare-step
 * line and the after-close summary. Reading only — every value comes from data
 * the learner record or the mediation log already holds; nothing here writes.
 *
 * Teacher screens address the teacher in the plural (core/teacherGender.ts), so
 * no string here depends on the teacher-gender setting.
 */
import { isMeetingFinished, savedSnapshotOfMeeting } from '@/core/meetingCompletion';
import { resolveRadarColor, type RadarColor } from '@/core/radarColor';
import { isHeartbeatFresh } from '@/core/presence';
import { TEACHER_GATE_HE } from '@/core/routeLabels';
import type { MediationEvent } from '@/core/teacherMediation';

type LearnerRecord = Record<string, unknown> | null | undefined;

/** The compulsory tasks of a meeting (PRD Module 14 §ב). */
export const COMPULSORY_TASKS = 7;

export const TILE_HE = {
  finished: 'סיים',
  reflection: 'ברפלקציה',
  task: (n: number) => `משימה ${n}/${COMPULSORY_TASKS}`,
  waiting: (clock: string) => `מחכה ${clock}`,
  cardOpen: (clock: string) => `כרטיס פתוח ${clock}`,
} as const;

export type TileProgress =
  | { kind: 'finished' }
  | { kind: 'reflection' }
  | { kind: 'task'; taskNumber: number };

const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/**
 * Where the learner is in the open meeting, for the tile: "סיים" once the seven
 * compulsory tasks are done (core/meetingCompletion.ts — meeting 8 only after the
 * reflection is sent), "ברפלקציה" while on meeting 8's reflection board, and
 * "משימה N/7" while working on a compulsory task (meetings 2–8). Null when the
 * record has no copy of this meeting (not started), or for meeting 1's steps.
 */
export function tileProgressOf(record: LearnerRecord, meeting: number | null): TileProgress | null {
  if (!record || meeting === null || !Number.isInteger(meeting) || meeting < 1 || meeting > 8) return null;
  if (isMeetingFinished(record, meeting)) return { kind: 'finished' };
  const snap = savedSnapshotOfMeeting(record, meeting);
  if (!snap) return null;
  if (meeting === 8 && snap.flowStatus === 'reflection') return { kind: 'reflection' };
  if (snap.flowStatus !== 'task' || meeting === 1) return null;
  if (meeting === 2) {
    const q = (snap.qflow ?? {}) as { phase?: unknown; taskIdx?: unknown };
    if (q.phase === 'correction') return null;
    const idx = whole(q.taskIdx) ?? 0;
    return { kind: 'task', taskNumber: Math.min(idx, COMPULSORY_TASKS - 1) + 1 };
  }
  const idx = whole(snap.standardTaskIdx) ?? 0;
  return { kind: 'task', taskNumber: Math.min(idx, COMPULSORY_TASKS - 1) + 1 };
}

export function tileProgressHe(p: TileProgress): string {
  return p.kind === 'finished' ? TILE_HE.finished : p.kind === 'reflection' ? TILE_HE.reflection : TILE_HE.task(p.taskNumber);
}

/** "M:SS" for an elapsed time; never negative. */
export function elapsedClockHe(ms: number): string {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** How far back a stored stamp may lie before the moment the dashboard saw the state and still be trusted. */
const STAMP_TRUST_WINDOW_MS = 30 * 60 * 1000;
/** A tablet clock a little ahead of the server is not "in the future". */
const STAMP_AHEAD_SLACK_MS = 5_000;

/**
 * Since when a state (a help call, an open card) has been on, for the tile's
 * clock. `stamp` is the time the learner's client wrote with it (a help call's
 * lastHelpTimestamp — the tablet's clock); `firstSeen` is when this dashboard
 * first saw the state on (the server clock). The stamp is used when it is
 * plausible: not after the first sighting, and not long before it. Otherwise
 * the first sighting — a little late, never wrong in the other direction.
 */
export function stateSinceOf(stamp: unknown, firstSeen: number): number {
  if (typeof stamp === 'number' && Number.isFinite(stamp)) {
    if (stamp <= firstSeen + STAMP_AHEAD_SLACK_MS && firstSeen - stamp <= STAMP_TRUST_WINDOW_MS) return Math.min(stamp, firstSeen);
  }
  return firstSeen;
}

// ── Strings of the lesson flow ───────────────────────────────────────────────

export const LESSON_FLOW_HE = {
  /** Module 14 §ב1: the notice says exactly this, now as a banner the teacher closes. */
  deadline: (minutes: number) => `עברו ${minutes} דקות`,
  deadlineDismiss: 'הבנתי',
  /** No meeting open, stations 3–7: the demonstration comes first (owner, 11.10.2026). */
  prepare: (meeting: number) => `מפגש ${meeting}: קודם מדגימים במקרן, ואחרי ההדגמה מפעילים את המפגש.`,

  checklistTitle: (meeting: number) => `לפני שסוגרים את מפגש ${meeting}`,
  checklistLead: 'בדקו את הרשימה וסגרו. אף שלב כאן לא חוסם את הסגירה, חוץ מבחירת סיבה לכל תלמיד שלא סיים.',
  stepHelp: 'קריאות לעזרה פתוחות',
  stepHelpNone: 'אין קריאות פתוחות.',
  stepHelpList: (ns: number[]) => `קוראים לעזרה עכשיו: ${ns.map((n) => `תלמיד ${n}`).join(', ')}`,
  clearAllHelp: 'סמנו את כל הקריאות כטופלו',
  clearAllHelpFailed: 'סימון הקריאות כטופלו נדחה בשרת. נסו שוב.',
  stepProjector: 'המקרן',
  stepProjectorOn: 'מסכי התלמידים עדיין נעולים להדגמה. סגרו את חלון המקרן כדי לשחרר אותם.',
  stepProjectorOff: 'מסכי התלמידים אינם נעולים.',
  toProjector: 'מעבר לחלון המקרן',
  stepUnfinished: 'תלמידים שלא סיימו',
  stepUnfinishedReflection: 'לא שלחו רפלקציה',
  stepUnfinishedNone: 'כל מי שהתחיל את המפגש סיים אותו.',
  /** Meeting 2 with nobody unfinished: what the close does (PRD 14 §ב1, owner decision 29.9.2026). */
  meeting2Close: `סגירת מפגש 2 משלימה את האבחון לכל מי שהתחיל אותו, והתלמידים עוברים ל"${TEACHER_GATE_HE}".`,
  stepMediation: 'אירועים שלא תועדו',
  closeNow: 'סגירת המפגש',
  closeWithReasons: 'כדי לסגור, בחרו סיבה לכל תלמיד בשלב 3.',
  cancel: 'ביטול',

  summaryTitle: (meeting: number) => `סיכום מפגש ${meeting}`,
  summaryLead: 'למורה בלבד, בלי שמות. לא מוצג במקרן.',
  summaryColours: 'צבעי הרדאר ברגע הסגירה',
  summaryFinished: (done: number) => `סיימו: ${done} מתוך 12`,
  summaryLetters: 'סיווגי הטעות במפגש',
  summaryHelpCalls: (n: number) => (n === 0 ? 'לא היו קריאות לעזרה' : n === 1 ? 'קריאה אחת לעזרה' : `${n} קריאות לעזרה`),
  summaryClose: 'סגירת הסיכום',
} as const;

// ── The after-close summary ──────────────────────────────────────────────────

export interface MeetingSummary {
  meeting: number;
  colours: Record<RadarColor, number>;
  finished: number;
  letters: { calculation: number; procedural: number; conceptual: number };
  helpCalls: number;
}

/** The learner records 1–12 under any alias, canonical first. */
function recordOf(records: Record<string, LearnerRecord>, n: number): Record<string, unknown> | null {
  return (records[`student_user${n}`] || records[`student_${n}`] || records[`user${n}`] || records[String(n)] || null) as Record<string, unknown> | null;
}

/**
 * The summary of `meeting` at the moment it closes, from the records the
 * dashboard already holds: each learner's radar colour by the radar's own rule
 * (core/radarColor.ts, the meeting still open), how many finished it, the
 * ח/ר/מ classifications of the meeting (errorCategoryDistribution/session_N,
 * summed) and the help calls of the run (the mediation log's events).
 */
export function buildMeetingSummary(input: {
  records: Record<string, LearnerRecord>;
  meeting: number;
  events: MediationEvent[];
  serverNow: number;
  hesitationThresholdSeconds: number;
}): MeetingSummary {
  const colours: Record<RadarColor, number> = { BLUE: 0, RED: 0, GREY: 0, YELLOW: 0, GREEN: 0 };
  const letters = { calculation: 0, procedural: 0, conceptual: 0 };
  let finished = 0;
  for (let n = 1; n <= 12; n++) {
    const r = recordOf(input.records, n);
    const ws = (r?.workspaceState ?? {}) as Record<string, unknown>;
    const isOnline = Boolean(r && r.isOnline === true && r.onlineStatus !== 'offline' && isHeartbeatFresh(r.lastPing, input.serverNow));
    const hesitating = (r?.hesitating ?? {}) as { hesitating?: unknown };
    const waitingAtGate = Boolean(r && (r.completedMeeting2 === true || Number(r.highestCompletedMeeting) >= 2) && r.teacher_gate_approved !== true);
    colours[resolveRadarColor({
      helpRequested: Boolean(r && (r.helpRequested === true || r.handRaised === true)),
      socraticActive: isOnline && (ws.helpState === 'socratic' || r?.isSocraticActive === true),
      isOnline,
      hesitationSeconds: isOnline && hesitating.hesitating === true ? input.hesitationThresholdSeconds : 0,
      hesitationThresholdSeconds: input.hesitationThresholdSeconds,
      sessionStarted: !(waitingAtGate && input.meeting >= 3),
    })]++;
    if (r && isMeetingFinished(r, input.meeting)) finished++;
    const dist = ((r?.errorCategoryDistribution ?? {}) as Record<string, Record<string, unknown> | undefined>)[`session_${input.meeting}`] ?? {};
    letters.calculation += Number(dist.calculation) || 0;
    letters.procedural += Number(dist.procedural) || 0;
    letters.conceptual += Number(dist.conceptual) || 0;
  }
  const helpCalls = input.events.filter((e) => e.kind === 'help_called' || e.kind === 'chat_help_called').length;
  return { meeting: input.meeting, colours, finished, letters, helpCalls };
}
