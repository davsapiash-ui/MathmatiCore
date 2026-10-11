/**
 * The sixth research file, "תיווך המורה" (PRD Module 24 §ב; measure 5 in Module 23).
 *
 * Measure 5, the effect of the analytics on the teacher's mediation, is measured
 * in the researcher's journal and is not computed by the system. This file gives
 * the researcher the SYSTEM side of that journal, with times, so the two can be
 * lined up: what the radar showed, when the teacher wrote, when she approved, when
 * she changed a learner's support, when she opened a catch-up round.
 *
 * Only values that are already stored. Every cell is a number, a time or a value
 * from a closed list: no chat text, no note, no teacher identity (a teacher uid
 * is a person; the learners are anonymous 1-12). The last three columns are the
 * teacher's own live record of each event (teacher_mediation_log, owner
 * 11.10.2026), in the journal's closed words.
 */

export interface MediationInput {
  /** telemetry_logs documents of the class (all meetings; a scoped export is filtered at the end). */
  telemetry: Array<{ id: string; data: Record<string, any> }>;
  /** RTDB chat_messages node: { student_userN: { pushId: message } }. */
  chat: Record<string, any> | null | undefined;
  /** Firestore sessions documents. */
  sessionDocs: Array<{ id: string; data: Record<string, any> }>;
  /** RTDB users/students node (the canonical record is student_userN). */
  students: Record<string, any> | null | undefined;
  /** Firestore catchup_records documents. */
  catchUp: Array<{ id: string; data: Record<string, any> }>;
  /**
   * Firestore teacher_mediation_log documents of the class (measure 5, owner
   * 11.10.2026): what the teacher recorded live about each event. Optional so
   * an older caller still builds the file without the teacher's columns filled.
   */
  teacherLog?: Array<{ id: string; data: Record<string, any> }>;
}

export const MEDIATION_COLUMNS = [
  "event_time_iso",
  "student_id",
  "session_number",
  "session_number_basis",
  "event_kind",
  "event_source",
  "ref_id",
  "detail_code",
  "detail_number",
  // Measure 5, recorded live by the teacher (owner, 11.10.2026), appended last.
  "teacher_action",
  "data_led",
  "teacher_note",
] as const;

export type MediationRow = Record<(typeof MEDIATION_COLUMNS)[number], string | number>;

const RADAR_KINDS: Record<string, string> = {
  HESITATION_DETECTED: "radar_hesitation",
  SOCRATIC_CARD_SHOWN: "radar_card_open",
  HELP_REQUESTED: "help_called",
  HELP_WITHDRAWN: "help_withdrawn",
  CHAT_HELP_REQUESTED: "chat_help_called",
};

const learnerNumber = (v: unknown): number | null => {
  const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
};
const meetingNumber = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 8 ? n : null;
};
const meetingFromId = (id: string): number | null => {
  const m = /session_0?(\d)/.exec(id);
  return m ? meetingNumber(m[1]) : null;
};
const learnerFromId = (id: string): number | null => {
  const m = /student_(?:student_user|user)?(\d{1,2})(?!\d)/.exec(id);
  return m ? learnerNumber(m[1]) : null;
};
const isoOf = (ms: unknown): string => (typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : "");
const closedCode = (v: unknown): string => (typeof v === "string" && /^[a-z0-9_]{1,40}$/.test(v) ? v : "");
const finiteOrBlank = (v: unknown): number | "" => (typeof v === "number" && Number.isFinite(v) ? v : "");

/** The teacher's action, in the words of the researcher's journal (PRD Module 23, measure 5). */
const TEACHER_ACTION_HE: Record<string, string> = {
  wrote: "כתבה",
  approached: "ניגשה",
  wrote_and_approached: "כתבה וניגשה",
  none: "לא פעלה",
};

/** The join key of a learner chat message: the same as the client's chatEventRef (core/teacherMediation.ts). */
export const chatMediationRef = (pushId: string): string => "chat:" + pushId;

/**
 * A help call from the chat is logged twice: the CHAT_HELP_REQUESTED event and
 * the learner's chat message. The teacher records it once, on the help call;
 * a learner message within this window of a chat help call of the same learner
 * is that call. The same rule and window as the client's mergeMediationEvents
 * (react-ts-version core/teacherMediation.ts CHAT_HELP_PAIR_MS).
 */
export const CHAT_HELP_PAIR_MS = 10_000;

/** A stored teacher_mediation_log record, or null when it is not one. Closed values only. */
function teacherRecordOf(data: Record<string, any>): { ref: string | null; action: string; dataLed: string; at: number; n: number; meeting: number; timeMs: number } | null {
  const n = learnerNumber(data.student_id);
  const meeting = meetingNumber(data.session_number);
  const action = TEACHER_ACTION_HE[String(data.action)];
  if (n === null || meeting === null || !action || typeof data.data_led !== "boolean") return null;
  const timeMs = typeof data.event_time_iso === "string" ? Date.parse(data.event_time_iso) : NaN;
  return {
    ref: typeof data.event_ref === "string" && data.event_ref ? data.event_ref : null,
    action,
    dataLed: data.data_led ? "כן" : "לא",
    at: typeof data.recorded_at === "number" ? data.recorded_at : 0,
    n,
    meeting,
    timeMs,
  };
}

export function buildTeacherMediationRows(input: MediationInput, scopedSession: number | null): MediationRow[] {
  // _pair: the chat help call a learner message belongs to (CHAT_HELP_PAIR_MS), whose record covers it.
  const rows: Array<MediationRow & { _ms: number; _join: string; _pair?: string }> = [];

  // The window each learner worked in each meeting, from the telemetry, to place
  // an event that carries no meeting (a chat message, a profile change) when the
  // time falls inside exactly one of them. It is an approximation, and says so.
  const window = new Map<number, Map<number, { from: number; to: number }>>();
  for (const { data } of input.telemetry) {
    const n = learnerNumber(data.student_id);
    const m = meetingNumber(String(data.session_id ?? "").match(/session_(\d)/)?.[1]);
    const t = data.client_timestamp;
    if (n === null || m === null || typeof t !== "number" || !Number.isFinite(t)) continue;
    const per = window.get(n) ?? new Map<number, { from: number; to: number }>();
    const w = per.get(m);
    per.set(m, w ? { from: Math.min(w.from, t), to: Math.max(w.to, t) } : { from: t, to: t });
    window.set(n, per);
  }
  const meetingAt = (n: number, ms: number): number | null => {
    const hits = [...(window.get(n)?.entries() ?? [])].filter(([, w]) => ms >= w.from && ms <= w.to).map(([m]) => m);
    return hits.length === 1 ? hits[0] : null;
  };

  const push = (
    ms: unknown,
    n: number | null,
    stored: number | null,
    kind: string,
    source: string,
    refId: string,
    code: string,
    num: number | "",
    joinKey: string = refId,
  ) => {
    if (n === null || typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return;
    const derived = stored === null ? meetingAt(n, ms) : null;
    const meeting = stored ?? derived;
    rows.push({
      _ms: ms,
      event_time_iso: isoOf(ms),
      student_id: n,
      session_number: meeting ?? "",
      session_number_basis: stored !== null ? "stored" : derived !== null ? "telemetry_window" : "",
      event_kind: kind,
      event_source: source,
      ref_id: refId,
      detail_code: code,
      detail_number: num,
      teacher_action: "",
      data_led: "",
      teacher_note: "",
      _join: joinKey,
    });
  };

  // 1. What the radar showed, from the telemetry (the same events as the actions file; ref_id is its log_id).
  for (const { id, data } of input.telemetry) {
    const kind = RADAR_KINDS[String(data.event_type)];
    if (!kind) continue;
    const d = data.details && typeof data.details === "object" ? data.details : {};
    const meeting = meetingNumber(String(data.session_id ?? "").match(/session_(\d)/)?.[1]);
    let code = "";
    let num: number | "" = "";
    if (kind === "radar_hesitation") num = finiteOrBlank(d.hesitation_seconds);
    else if (kind === "radar_card_open") {
      code = closedCode(d.card_situation);
      num = finiteOrBlank(d.card_level);
    } else if (kind === "help_called" || kind === "help_withdrawn") num = finiteOrBlank(d.help_count);
    else if (kind === "chat_help_called") code = d.kind === "call" || d.kind === "ready_message" ? d.kind : "";
    push(data.client_timestamp, learnerNumber(data.student_id), meeting, kind, "telemetry", id, code, num);
  }

  // The chat help calls, per learner, for the pairing below (CHAT_HELP_PAIR_MS).
  const chatHelpCalls: Array<{ id: string; n: number; at: number }> = [];
  for (const { id, data } of input.telemetry) {
    if (String(data.event_type) !== "CHAT_HELP_REQUESTED") continue;
    const n = learnerNumber(data.student_id);
    const at = data.client_timestamp;
    if (n !== null && typeof at === "number" && Number.isFinite(at) && at > 0) chatHelpCalls.push({ id, n, at });
  }
  const pairedHelpCall = (n: number, at: unknown): string | undefined => {
    if (typeof at !== "number" || !Number.isFinite(at)) return undefined;
    let best: { id: string; d: number } | undefined;
    for (const h of chatHelpCalls) {
      const d = Math.abs(h.at - at);
      if (h.n === n && d <= CHAT_HELP_PAIR_MS && (!best || d < best.d)) best = { id: h.id, d };
    }
    return best?.id;
  };

  // 2. Chat: who wrote, when, how long. The text is never exported (no server filter, names pass).
  // Whether the teacher read a message is not claimed: detail_code stays blank
  // for every chat row (the stored flag does not say she read it).
  for (const [room, messages] of Object.entries(input.chat ?? {})) {
    const n = learnerNumber(room);
    if (n === null || !messages || typeof messages !== "object") continue;
    for (const [pushId, raw] of Object.entries(messages as Record<string, any>)) {
      if (!raw || typeof raw !== "object") continue;
      const fromLearner = /^student_user\d+$/.test(String(raw.senderId ?? ""));
      const length = typeof raw.text === "string" ? raw.text.length : "";
      const before = rows.length;
      push(
        raw.timestamp,
        n,
        null,
        fromLearner ? "chat_learner_message" : "chat_teacher_message",
        "chat",
        "",
        "",
        length,
        // ref_id stays blank for chat; the teacher's record joins on the push id.
        chatMediationRef(pushId),
      );
      // A learner message that is a chat help call takes the help call's record (the client lists it once, on the call).
      if (fromLearner && rows.length > before) rows[rows.length - 1]._pair = pairedHelpCall(n, raw.timestamp);
    }
  }

  // 3. Gate approval (meeting 2). Only the last approval is stored.
  for (const { id, data } of input.sessionDocs) {
    if (data.teacher_gate_approved !== true) continue;
    const n = learnerNumber(data.student_id) ?? learnerFromId(String(data.session_id ?? id)) ?? learnerFromId(id);
    const m = meetingNumber(data.session_number) ?? meetingFromId(String(data.session_id ?? id)) ?? meetingFromId(id) ?? 2;
    push(data.gate_approved_at, n, m, "gate_approved", "gate", "", closedCode(data.teacher_selected_path), "");
  }

  // 4. Support profile assigned. Only the latest change is stored; the version says how many there were.
  for (const [key, raw] of Object.entries(input.students ?? {})) {
    if (!/^student_user\d+$/.test(key) || !raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, any>;
    push(
      rec.support_profile_updated_at,
      learnerNumber(key),
      null,
      "support_profile_set",
      "support_profile",
      "",
      rec.support_profile_id === null || rec.support_profile_id === undefined ? "none" : closedCode(rec.support_profile_id),
      finiteOrBlank(rec.support_profile_version),
    );
  }

  // 5. Catch-up rounds: recorded, opened, closed (the note and the teacher id stay out).
  for (const { id, data } of input.catchUp) {
    const n = learnerNumber(data.student_id) ?? learnerFromId(id);
    const m = meetingNumber(data.session_number) ?? meetingFromId(id);
    const rounds = data.rounds && typeof data.rounds === "object" ? (data.rounds as Record<string, any>) : {};
    for (const [roundKey, r] of Object.entries(rounds)) {
      if (!r || typeof r !== "object") continue;
      const ref = `${id}#${roundKey}`;
      push(r.recorded_at, n, m, "catchup_recorded", "catchup", ref, `${closedCode(r.reason)}/${closedCode(r.action)}`, "");
      push(r.opened_at, n, m, "catchup_opened", "catchup", ref, "", "");
      push(r.closed_at, n, m, "catchup_closed", "catchup", ref, closedCode(r.closed_by), finiteOrBlank(r.active_minutes));
    }
  }

  // 6. Measure 5: the teacher's live records (owner, 11.10.2026). An event's
  // record fills its row's last three columns (the latest record of that
  // event); a physical approach without an event is a row of its own. The note
  // is not collected (Module 3: a name cannot be recognised), so teacher_note
  // stays blank for the researcher to fill by hand.
  const latest = new Map<string, NonNullable<ReturnType<typeof teacherRecordOf>>>();
  for (const { id, data } of input.teacherLog ?? []) {
    const r = teacherRecordOf(data);
    if (!r) continue;
    if (r.ref === null) {
      const before = rows.length;
      push(r.timeMs, r.n, r.meeting, "teacher_approach_self", "teacher_log", id, "", "", "");
      if (rows.length > before) {
        rows[rows.length - 1].teacher_action = r.action;
        rows[rows.length - 1].data_led = r.dataLed;
      }
      continue;
    }
    const prev = latest.get(r.ref);
    if (!prev || r.at >= prev.at) latest.set(r.ref, r);
  }
  for (const row of rows) {
    // Its own record first; a learner message paired with a chat help call then takes the call's.
    const own = row._join ? latest.get(row._join) : undefined;
    const r = own && own.n === row.student_id ? own : row._pair ? latest.get(row._pair) : undefined;
    if (!r || r.n !== row.student_id) continue;
    row.teacher_action = r.action;
    row.data_led = r.dataLed;
  }

  return rows
    .filter((r) => scopedSession === null || r.session_number === scopedSession)
    .sort(
      (a, b) =>
        (a.student_id as number) - (b.student_id as number) ||
        a._ms - b._ms ||
        String(a.event_kind).localeCompare(String(b.event_kind)),
    )
    .map(({ _ms, _join, _pair, ...row }) => row);
}
