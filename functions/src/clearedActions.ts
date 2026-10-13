import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { requireTeacherForIndividualData } from "./callerIdentity";
import { sessionNumberFromId } from "./meetingMetrics";

/**
 * PRD 23א §ב.2 and §ג (owner, 12.10.2026): a single-learner reset may also
 * "לנקות גם את רשימת הפעולות". The learner's actions — of the meeting that was
 * reset, or all of them in a full learner reset — are then deleted after the
 * backup and exist only there. The backup is always also written to Cloud
 * Storage, and beside it this file of the cleared actions, so the system can
 * read them back: a read-only table and a report from the backup, never a
 * restore into the system.
 *
 * Events of the cleared meeting created on a device before the reset and
 * reaching the server after it (an offline queue, a re-sent event whose
 * acknowledgement was lost) never return to the actions list: they are moved
 * to "פעולות שהגיעו אחרי האיפוס", next to the cleared actions file.
 */

export const CLEARED_ACTIONS_FORMAT = "mathmaticore-cleared-actions/1";

/** Server-only (no rule opens it): the cleared resets of one learner, read by the telemetry trigger. */
export const CLEARED_ACTIONS_MARKERS = "cleared_actions_markers";

export function clearedActionsPath(classId: string, resetId: string): string {
  return `backups/${classId}/${resetId}/cleared_actions.json`;
}

/** "פעולות שהגיעו אחרי האיפוס": one small file per late event, under the reset's backup folder. */
export function lateActionsPrefix(classId: string, resetId: string): string {
  return `backups/${classId}/${resetId}/late_actions/`;
}

export interface StoredAction {
  id: string;
  data: Record<string, unknown>;
}

export interface ClearedActionsFile {
  format: typeof CLEARED_ACTIONS_FORMAT;
  reset_id: string;
  class_id: string;
  student_id: number;
  /** The meeting whose actions were cleared; null when all of them were (a full learner reset). */
  session_number: number | null;
  performed_at: number;
  actions: StoredAction[];
}

export interface ClearedActionsMarker {
  reset_id: string;
  class_id: string;
  performed_at: number;
  session_number: number | null;
}

function learnerNumberOf(data: Record<string, unknown> | null | undefined): number | null {
  const raw = parseInt(String(data?.student_id ?? "").replace(/\D/g, ""), 10);
  return Number.isInteger(raw) && raw >= 1 && raw <= 12 ? raw : null;
}

/** Whether a telemetry document is one the reset clears: the learner's, and of the meeting (any meeting when null). */
export function isClearedByReset(data: Record<string, unknown> | null | undefined, studentNum: number, sessionNumber: number | null): boolean {
  if (learnerNumberOf(data) !== studentNum) return false;
  if (sessionNumber === null) return true;
  return sessionNumberFromId(String(data?.session_id ?? "")) === sessionNumber;
}

/** The backup's telemetry documents that the reset clears (the deletion deletes exactly these). */
export function clearedActionsOfBackup(
  docs: Array<{ id: string; data: unknown }> | undefined,
  studentNum: number,
  sessionNumber: number | null
): StoredAction[] {
  return (docs ?? [])
    .filter((d) => d && typeof d.id === "string" && isClearedByReset(d.data as Record<string, unknown>, studentNum, sessionNumber))
    .map((d) => ({ id: d.id, data: (d.data ?? {}) as Record<string, unknown> }));
}

/**
 * The marker a late event falls under: created on the device before that
 * reset, in the meeting it cleared (any meeting for a full reset). An event
 * with no device time is kept: nothing says it came before the reset.
 */
export function markerCovering(
  data: Record<string, unknown> | null | undefined,
  markers: ClearedActionsMarker[]
): ClearedActionsMarker | null {
  const t = data?.client_timestamp;
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  const meeting = sessionNumberFromId(String(data?.session_id ?? ""));
  for (const m of markers) {
    if (!m || typeof m.performed_at !== "number" || t >= m.performed_at) continue;
    if (m.session_number === null || m.session_number === meeting) return m;
  }
  return null;
}

/** Firestore values made plain JSON (a Timestamp as ISO text), as the reset backup stores them. */
export function plainAction(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof admin.firestore.Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plainAction);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = plainAction(v);
    return out;
  }
  return value;
}

/** The part of a Storage bucket these helpers use (admin.storage().bucket()). */
export interface ActionsBucket {
  file(path: string): {
    save(data: string | Buffer, options?: Record<string, unknown>): Promise<unknown>;
    download(): Promise<[Buffer]>;
  };
  getFiles(options: { prefix: string }): Promise<[Array<{ name: string; download(): Promise<[Buffer]> }>]>;
}

export async function writeClearedActionsFile(bucket: ActionsBucket, file: ClearedActionsFile): Promise<string> {
  const path = clearedActionsPath(file.class_id, file.reset_id);
  await bucket.file(path).save(JSON.stringify(file), { contentType: "application/json" });
  return path;
}

/** Adds the reset to the learner's marker document; the telemetry trigger reads it on every new event. */
export async function addClearedActionsMarker(db: admin.firestore.Firestore, studentNum: number, marker: ClearedActionsMarker): Promise<void> {
  await db.collection(CLEARED_ACTIONS_MARKERS).doc(`student_${studentNum}`).set(
    { resets: admin.firestore.FieldValue.arrayUnion(marker) },
    { merge: true }
  );
}

export async function removeClearedActionsMarker(db: admin.firestore.Firestore, studentNum: number, marker: ClearedActionsMarker): Promise<void> {
  await db.collection(CLEARED_ACTIONS_MARKERS).doc(`student_${studentNum}`).set(
    { resets: admin.firestore.FieldValue.arrayRemove(marker) },
    { merge: true }
  );
}

/** Copies one late event into "פעולות שהגיעו אחרי האיפוס" of its reset, then deletes it from the actions list. */
export async function moveLateAction(
  db: admin.firestore.Firestore,
  bucket: ActionsBucket,
  marker: ClearedActionsMarker,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  await bucket.file(`${lateActionsPrefix(marker.class_id, marker.reset_id)}${id}.json`).save(
    JSON.stringify({ id, data: plainAction(data) }),
    { contentType: "application/json" }
  );
  await db.collection("telemetry_logs").doc(id).delete();
}

/**
 * The telemetry trigger's check (sessionTrigger.ts onMeetingTelemetryArrived):
 * one read of the learner's marker document. True when the event was moved.
 */
export async function quarantineLateClearedAction(
  db: admin.firestore.Firestore,
  bucket: ActionsBucket,
  id: string,
  data: Record<string, unknown> | null | undefined
): Promise<boolean> {
  const n = learnerNumberOf(data);
  if (n === null || !data) return false;
  const snap = await db.collection(CLEARED_ACTIONS_MARKERS).doc(`student_${n}`).get();
  if (!snap.exists) return false;
  const markers = Array.isArray(snap.data()?.resets) ? (snap.data()!.resets as ClearedActionsMarker[]) : [];
  const marker = markerCovering(data, markers);
  if (!marker) return false;
  await moveLateAction(db, bucket, marker, id, data);
  return true;
}

/**
 * Events of the cleared meeting that reached the server while the backup was
 * being collected and written: created before the reset, not in the backup.
 * Moved like a late event. Returns how many.
 */
export async function sweepLateClearedActions(
  db: admin.firestore.Firestore,
  bucket: ActionsBucket,
  marker: ClearedActionsMarker,
  studentNum: number,
  studentValues: Array<string | number>,
  backedUp: ReadonlySet<string>
): Promise<number> {
  const snap = await db.collection("telemetry_logs").where("student_id", "in", studentValues).get();
  let moved = 0;
  for (const d of snap.docs) {
    if (backedUp.has(d.id)) continue;
    const data = d.data() as Record<string, unknown>;
    if (!isClearedByReset(data, studentNum, marker.session_number)) continue;
    if (markerCovering(data, [marker]) === null) continue;
    await moveLateAction(db, bucket, marker, d.id, data);
    moved += 1;
  }
  return moved;
}

/** The fields of an action the read-only table and the report use; nothing else leaves the backup. */
const ACTION_FIELDS = ["client_timestamp", "session_id", "student_id", "exercise_id", "event_type", "column_index", "details", "sequence_number"] as const;

export function pickActionFields(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ACTION_FIELDS) if (data[k] !== undefined) out[k] = data[k];
  return out;
}

function parseStoredActions(raw: Buffer): StoredAction[] {
  const parsed = JSON.parse(raw.toString("utf-8"));
  if (Array.isArray(parsed?.actions)) return parsed.actions as StoredAction[];
  if (parsed && typeof parsed.id === "string") return [parsed as StoredAction];
  return [];
}

/**
 * The cleared actions of one reset, with those that arrived after it, once
 * each, oldest first; only the meeting asked for when one is named.
 */
export async function loadClearedActions(
  bucket: ActionsBucket,
  entry: Record<string, any>,
  sessionNumber: number | null = null
): Promise<StoredAction[]> {
  const classId = String(entry.class_id);
  const resetId = String(entry.reset_id);
  const path = typeof entry.cleared_actions_path === "string" ? entry.cleared_actions_path : clearedActionsPath(classId, resetId);
  const [main] = await bucket.file(path).download();
  const byId = new Map<string, StoredAction>();
  for (const a of parseStoredActions(main)) if (a && typeof a.id === "string") byId.set(a.id, a);
  const [late] = await bucket.getFiles({ prefix: lateActionsPrefix(classId, resetId) });
  for (const f of late) {
    try {
      const [raw] = await f.download();
      for (const a of parseStoredActions(raw)) if (a && typeof a.id === "string" && !byId.has(a.id)) byId.set(a.id, a);
    } catch (err) {
      logger.warn(`Late action file ${f.name} could not be read:`, err);
    }
  }
  const all = Array.from(byId.values()).filter((a) =>
    sessionNumber === null || sessionNumberFromId(String(a.data?.session_id ?? "")) === sessionNumber
  );
  const time = (a: StoredAction) => (typeof a.data?.client_timestamp === "number" ? (a.data.client_timestamp as number) : 0);
  const seq = (a: StoredAction) => (typeof a.data?.sequence_number === "number" ? (a.data.sequence_number as number) : 0);
  return all.sort((a, b) => time(a) - time(b) || seq(a) - seq(b));
}

export const RESET_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * The reset log entry of a reset that cleared actions, checked for the caller:
 * the class teacher only (PRD 23א §ו), never the admin.
 */
export async function clearedResetEntryFor(
  db: admin.firestore.Firestore,
  token: Record<string, unknown>,
  resetId: unknown
): Promise<Record<string, any>> {
  requireTeacherForIndividualData(token);
  if (typeof resetId !== "string" || !RESET_ID_PATTERN.test(resetId)) {
    throw new HttpsError("invalid-argument", "מזהה האיפוס אינו תקין.");
  }
  const snap = await db.collection("reset_audit_log").doc(resetId).get();
  const entry = snap.exists ? (snap.data() || {}) : null;
  if (!entry || entry.actions_cleared !== true) {
    throw new HttpsError("not-found", "באיפוס הזה לא נמחקה רשימת הפעולות, ולכן אין פעולות להציג מהגיבוי.");
  }
  const callerClass = token.class_id;
  if (callerClass && callerClass !== entry.class_id) {
    throw new HttpsError("permission-denied", "האיפוס הזה שייך לכיתה אחרת.");
  }
  return entry;
}

/** "הצגת הפעולות מהגיבוי": the cleared actions of one reset, read-only. */
export const getClearedActionsFromBackup = onCall({ memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be authenticated.");
  const db = admin.firestore();
  const entry = await clearedResetEntryFor(db, request.auth.token as Record<string, unknown>, request.data?.resetId);
  const requested = Number(request.data?.sessionNumber);
  const sessionNumber = Number.isInteger(requested) && requested >= 1 && requested <= 8 ? requested : null;
  let actions: StoredAction[];
  try {
    actions = await loadClearedActions(admin.storage().bucket() as unknown as ActionsBucket, entry, sessionNumber);
  } catch (err) {
    logger.error(`Cleared actions of ${entry.reset_id} could not be read:`, err);
    throw new HttpsError("unavailable", "לא ניתן להציג כרגע את הפעולות מהגיבוי. נסו שוב בעוד רגע.");
  }
  return {
    resetId: entry.reset_id,
    studentId: Array.isArray(entry.affected_student_ids) ? entry.affected_student_ids[0] ?? null : null,
    sessionNumber: typeof entry.session_number === "number" ? entry.session_number : null,
    performedAt: typeof entry.performed_at === "number" ? entry.performed_at : null,
    actions: actions.map((a) => ({ id: a.id, ...pickActionFields(a.data) })),
  };
});
