/**
 * Measure 5 (PRD Module 23): the teacher's mediation journal, recorded live.
 *
 * Owner decision 11.10.2026: the researcher-teacher records what he did about
 * each mediation event DURING the lesson, in two taps, instead of adding three
 * columns to the "תיווך המורה" export afterwards (Module 24 §ב). The record
 * is joined to its export row by `event_ref`, which is exactly the row's
 * identity in functions/src/teacherMediationRows.ts:
 *   - a telemetry event (help call, hesitation, card, chat help call): the
 *     telemetry_logs document id — the export row's ref_id;
 *   - a learner chat message: `chat:<RTDB push id>` (the export row keeps its
 *     ref_id blank; the server joins on the same key).
 * A physical approach without an event is its own record, event_ref null.
 *
 * Zero-PII (Module 3): the record holds a learner number 1–12, closed values
 * and times only. The one-word note is not collected (always null): the client
 * PII filter cannot recognise a bare first name, and the export file carries
 * no free text (Module 24 §ב).
 */

export const MEDIATION_LOG_COLLECTION = 'teacher_mediation_log';

/** The pilot's one class (Module 25 §ב.1), as in CatchUpService. */
export const MEDIATION_CLASS_ID = 'class_1';

/** Event kinds, spelled as the export's event_kind. */
export type MediationEventKind =
  | 'help_called'
  | 'chat_help_called'
  | 'radar_hesitation'
  | 'radar_card_open'
  | 'chat_learner_message';

/** telemetry event_type → export event_kind (same map as RADAR_KINDS on the server, minus the withdrawal). */
export const MEDIATION_TELEMETRY_KINDS: Record<string, MediationEventKind> = {
  HELP_REQUESTED: 'help_called',
  CHAT_HELP_REQUESTED: 'chat_help_called',
  HESITATION_DETECTED: 'radar_hesitation',
  SOCRATIC_CARD_SHOWN: 'radar_card_open',
};

export const MEDIATION_KIND_HE: Record<MediationEventKind, string> = {
  help_called: 'קריאה לעזרה',
  chat_help_called: 'קריאה לעזרה בצ׳אט',
  radar_hesitation: 'היסוס',
  radar_card_open: 'כרטיס החניכה נפתח',
  chat_learner_message: 'הודעה בצ׳אט',
};

export type MediationAction = 'wrote' | 'approached' | 'wrote_and_approached' | 'none';
export const MEDIATION_ACTIONS: readonly MediationAction[] = ['wrote', 'approached', 'wrote_and_approached', 'none'];

/** The owner's wording (11.10.2026), verbatim. */
export const MEDIATION_ACTION_HE: Record<MediationAction, string> = {
  wrote: 'כתבתי',
  approached: 'ניגשתי',
  wrote_and_approached: 'כתבתי וניגשתי',
  none: 'לא פעלתי',
};

export const MEDIATION_HE = {
  sectionTitle: 'תיעוד התיווך',
  whatDidIDo: 'מה עשיתי',
  dataLed: 'הנתונים הובילו אותי לכך?',
  yes: 'כן',
  no: 'לא',
  selfApproach: 'ניגשתי בלי קריאה',
  selfApproachKind: 'ניגשתי בלי קריאה',
  pendingCounter: (n: number) => `לתיעוד: ${n}`,
  noOpenEvents: 'אין אירועים שממתינים לתיעוד.',
  noMeeting: 'אין מפגש פתוח. אפשר לתעד רק בזמן מפגש.',
  recorded: 'תועד',
  olderOpen: 'אירועים קודמים שלא תועדו',
  recordedList: 'אירועים שתועדו',
  saveFailed: 'התיעוד לא נשמר. נסו שוב.',
  pendingListTitle: 'אירועים שלא תועדו במפגש',
  closeUnrecorded: (n: number) => (n === 1 ? 'יש אירוע אחד שלא תועד' : `יש ${n} אירועים שלא תועדו`),
  back: 'חזרה',
  learner: (n: number) => `תלמיד ${n}`,
} as const;

export interface MediationEvent {
  /** The join key (see the file comment). */
  ref: string;
  studentNumber: number;
  kind: MediationEventKind;
  /** ms since epoch (the export's event_time_iso). */
  at: number;
}

export interface MediationRecord {
  id: string;
  class_id: string;
  student_id: number;
  session_number: number;
  event_ref: string | null;
  event_time_iso: string;
  action: MediationAction;
  data_led: boolean;
  note: null;
  recorded_at: number;
  recorded_by: string;
}

const learnerNumber = (v: unknown): number | null => {
  const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};

/** The meeting number in a telemetry session_id, as the export reads it. */
export function meetingOfSessionId(sessionId: unknown): number | null {
  const m = /session_(\d)/.exec(String(sessionId ?? ''));
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
}

/** A telemetry_logs document as a mediation event of `meeting`, or null. */
export function mediationEventFromTelemetry(id: string, d: Record<string, unknown> | null | undefined, meeting: number): MediationEvent | null {
  if (!d) return null;
  const kind = MEDIATION_TELEMETRY_KINDS[String(d.event_type)];
  if (!kind) return null;
  const at = d.client_timestamp;
  const n = learnerNumber(d.student_id);
  if (n === null || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  if (meetingOfSessionId(d.session_id) !== meeting) return null;
  return { ref: id, studentNumber: n, kind, at };
}

/** The chat join key of a message (functions/src/teacherMediationRows.ts uses the same). */
export const chatEventRef = (messageId: string): string => `chat:${messageId}`;

/** A chat message written by a learner, as a mediation event, or null. */
export function mediationEventFromChat(msg: { id?: unknown; senderId?: unknown; timestamp?: unknown } | null | undefined): MediationEvent | null {
  if (!msg) return null;
  const m = /^student_user(\d{1,2})$/.exec(String(msg.senderId ?? ''));
  const n = m ? learnerNumber(m[1]) : null;
  const id = typeof msg.id === 'string' && msg.id && !msg.id.startsWith('local_') ? msg.id : null;
  const at = msg.timestamp;
  if (n === null || !id || typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return null;
  return { ref: chatEventRef(id), studentNumber: n, kind: 'chat_learner_message', at };
}

/**
 * A help call from the chat ("קראו למורה", "אפשר עזרה בתרגיל?") is logged
 * twice: the CHAT_HELP_REQUESTED event and the chat message itself. The teacher
 * records it once, on the help call; the message within this window of it is
 * not listed apart.
 */
export const CHAT_HELP_PAIR_MS = 10_000;

/** Telemetry + chat events of the run, deduplicated and oldest first. */
export function mergeMediationEvents(telemetry: MediationEvent[], chat: MediationEvent[]): MediationEvent[] {
  const helps = telemetry.filter((e) => e.kind === 'chat_help_called');
  const chatKept = chat.filter((c) => !helps.some((h) => h.studentNumber === c.studentNumber && Math.abs(h.at - c.at) <= CHAT_HELP_PAIR_MS));
  const byRef = new Map<string, MediationEvent>();
  for (const e of [...telemetry, ...chatKept]) byRef.set(e.ref, e);
  return [...byRef.values()].sort((a, b) => a.at - b.at || a.ref.localeCompare(b.ref));
}

/** The latest record of each event_ref. */
export function recordsByRef(records: MediationRecord[]): Map<string, MediationRecord> {
  const out = new Map<string, MediationRecord>();
  for (const r of records) {
    if (!r.event_ref) continue;
    const prev = out.get(r.event_ref);
    if (!prev || r.recorded_at >= prev.recorded_at) out.set(r.event_ref, r);
  }
  return out;
}

/** Events with no record yet, oldest first. */
export function openMediationEvents(events: MediationEvent[], records: MediationRecord[]): MediationEvent[] {
  const done = recordsByRef(records);
  return events.filter((e) => !done.has(e.ref));
}

/** Open events per learner number. */
export function openCountByLearner(open: MediationEvent[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const e of open) out[e.studentNumber] = (out[e.studentNumber] ?? 0) + 1;
  return out;
}

/** HH:MM on the teacher's clock. */
export function clockHe(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "<kind>, HH:MM" — the drawer's line. */
export function eventLineHe(e: { kind: MediationEventKind; at: number }): string {
  return `${MEDIATION_KIND_HE[e.kind]}, ${clockHe(e.at)}`;
}

/** "תלמיד N · <kind> · HH:MM" — the bubble's line. */
export function bubbleLineHe(e: MediationEvent): string {
  return `${MEDIATION_HE.learner(e.studentNumber)} · ${MEDIATION_KIND_HE[e.kind]} · ${clockHe(e.at)}`;
}

/** The deterministic document id of an event's record, so a second tap edits rather than duplicates. */
export function mediationRecordDocId(eventRef: string): string {
  return `ev_${eventRef.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 300)}`;
}

/** Telemetry stamped on the learner's device may run a little before the server's start stamp. */
export const RUN_START_SLACK_MS = 2 * 60 * 1000;

// ── The side action queue (owner, 11.10.2026) ────────────────────────────────
// An action queue beats an overview: one item per learner, oldest help call
// first, then unread chat, then (meeting 2) the gate, then a folded list of the
// other unrecorded events (hesitation, card, chat already read).

export interface QueueLearner {
  studentNumber: number;
  /** The radar's live flag (users/students/*.helpRequested). */
  helpRequested: boolean;
}

export interface QueueChatMessage {
  id?: string;
  senderId?: string;
  timestamp?: number;
  read?: boolean;
}

export interface QueueItem {
  studentNumber: number;
  kind: 'help' | 'chat';
  /** The time the item is ordered by: the oldest open help call, or the oldest unread message. */
  since: number;
  helpRequested: boolean;
  /** Every open help and chat event of the learner: one decision records them all. */
  events: MediationEvent[];
  unreadCount: number;
}

export interface ActionQueue {
  items: QueueItem[];
  /** Open events that belong to no item (hesitation, card, chat already read). */
  toRecord: MediationEvent[];
}

const HELP_KINDS: ReadonlySet<MediationEventKind> = new Set(['help_called', 'chat_help_called']);

const learnerOfSender = (senderId: unknown): number | null => {
  const m = /^student_user(\d{1,2})$/.exec(String(senderId ?? ''));
  return m ? learnerNumber(m[1]) : null;
};

/**
 * Builds the queue. `keepOpen` is a learner whose item the teacher expanded:
 * reading the thread marks it read, and the item must not vanish under her.
 */
export function buildActionQueue(input: {
  learners: QueueLearner[];
  openEvents: MediationEvent[];
  chatMessages: QueueChatMessage[];
  keepOpen?: number | null;
}): ActionQueue {
  const unreadBy = new Map<number, number[]>();
  for (const m of input.chatMessages) {
    const n = learnerOfSender(m.senderId);
    if (n === null || m.read !== false || typeof m.timestamp !== 'number') continue;
    unreadBy.set(n, [...(unreadBy.get(n) ?? []), m.timestamp]);
  }
  const flagged = new Set(input.learners.filter((l) => l.helpRequested).map((l) => l.studentNumber));
  const numbers = new Set<number>([...flagged, ...unreadBy.keys()]);
  for (const e of input.openEvents) if (HELP_KINDS.has(e.kind)) numbers.add(e.studentNumber);
  if (input.keepOpen) numbers.add(input.keepOpen);

  const items: QueueItem[] = [];
  const covered = new Set<string>();
  for (const n of numbers) {
    const mine = input.openEvents.filter((e) => e.studentNumber === n);
    const helps = mine.filter((e) => HELP_KINDS.has(e.kind));
    const chats = mine.filter((e) => e.kind === 'chat_learner_message');
    const unread = unreadBy.get(n) ?? [];
    const isHelp = flagged.has(n) || helps.length > 0;
    if (!isHelp && unread.length === 0 && n !== input.keepOpen) continue;
    const events = [...helps, ...chats].sort((a, b) => a.at - b.at);
    events.forEach((e) => covered.add(e.ref));
    items.push({
      studentNumber: n,
      kind: isHelp ? 'help' : 'chat',
      since: isHelp
        ? (helps.length > 0 ? Math.min(...helps.map((e) => e.at)) : Number.MAX_SAFE_INTEGER)
        : (unread.length > 0 ? Math.min(...unread) : Number.MAX_SAFE_INTEGER),
      helpRequested: flagged.has(n),
      events,
      unreadCount: unread.length,
    });
  }
  items.sort((a, b) => (a.kind === b.kind ? a.since - b.since || a.studentNumber - b.studentNumber : a.kind === 'help' ? -1 : 1));
  return { items, toRecord: input.openEvents.filter((e) => !covered.has(e.ref)) };
}

export const QUEUE_HE = {
  title: 'תור פעולות',
  empty: 'אין קריאות או הודעות שממתינות.',
  helpItem: 'קרא למורה',
  chatItem: (n: number) => (n === 1 ? 'הודעה אחת שלא נקראה' : `${n} הודעות שלא נקראו`),
  gateItem: 'ממתין לאישור מסלול',
  gateOpen: 'לאישור המסלול',
  toRecordList: (n: number) => `לתיעוד (${n})`,
  pickLearner: 'איזה תלמיד?',
  openThread: 'פתיחת השיחה',
  closeThread: 'סגירת השיחה',
  newHelpToast: (n: number) => `תלמיד ${n} קרא למורה`,
  newChatToast: (n: number) => `הודעה חדשה מתלמיד ${n}`,
  toQueue: 'לתור הפעולות',
} as const;
