/**
 * PRD Module 23א §ג (and Module 21): "מקטעי הקלטה שמגיעים לשרת אחרי איפוס מוחלט
 * של לומד או אחרי איפוס מערכת, ממכשיר שהיה לא מקוון בזמן האיפוס, אינם יוצרים
 * מחדש את ההקלטה שנמחקה: הם נשמרים כקובץ נפרד בשם 'הקלטה שהגיעה אחרי האיפוס',
 * המקושר לרישום של אותו איפוס (סעיף ד)".
 *
 * How it works:
 *
 * 1. Marker. A full learner reset or a system reset writes, before it even
 *    collects the backup, a server-only marker per affected learner:
 *    late_recording_markers/learner_N = {
 *      recordings: { <recording id>: { reset_id, class_id, performed_at } },
 *      latest: { reset_id, class_id, performed_at },
 *      meetings: { meeting_N: true },   // the meeting open at reset time
 *      acknowledged_at: <absent until the learner's device took up the restart>
 *    }
 *    First with the recording of the meeting open now (session_{startedAt}),
 *    which online and offline devices keep writing into; once the backup is
 *    collected, with every recording id in it. Written that early, chunks that
 *    arrive while the backup is being written are quarantined, not deleted
 *    unbacked. An aborted reset restores the marker it found.
 *
 * 2. "Late" means the device had not yet learned of the reset. The learner's
 *    screen, when it takes up the restart (clears forceReload), writes
 *    users/students/student_userN/reset_acknowledged_at (server time) in the
 *    same update. A write into one of the reset's recordings is late while
 *    there is no such acknowledgement, or when its push key was minted before
 *    it; so is any recording write minted before the reset itself. A learner
 *    with no record at reset time has no screen to restart; the reset time is
 *    the acknowledgement.
 *
 * 3. Quarantine. A late chunk, metadata entry or recording_truncated flag is
 *    moved in ONE atomic multi-path RTDB update into the server-only
 *    late_recordings/{reset_id}/learner_N/{rec}/… and removed from recordings/
 *    in the same update. No Storage write per chunk, no contention, no Firestore
 *    read. A late byte count or budget truncation flag is only removed.
 *    The trigger reads one small RTDB marker per write and nothing else.
 *
 * 4. File. Once a day (copyStorageBackupsToDrive) the quarantine is assembled
 *    into one JSON file per reset × learner × recording, next to the reset's
 *    backup in Cloud Storage, and the reset's audit entry lists it
 *    (late_recording_files). The quarantined entries are cleared only after
 *    the file was written and linked. The same run then copies the file to the
 *    Drive folder "3 גיבויים" and swaps the link for the Drive one, keeping
 *    the Storage copy (backupDriveCopy.ts, owner decision 9.10.2026).
 */
import { onValueCreated } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { LATE_RECORDING_LABEL, learnerNumber2, israelDateTime } from "./driveNames";

export const LATE_MARKERS_ROOT = "late_recording_markers";
export const LATE_QUARANTINE_ROOT = "late_recordings";
export const LATE_PENDING_ROOT = "late_recordings_pending";

const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

/** The device time a Firebase push key was minted at (its first 8 characters); null for any other key. */
export function pushKeyTime(key: string): number | null {
  if (typeof key !== "string" || key.length < 8) return null;
  let t = 0;
  for (let i = 0; i < 8; i++) {
    const v = PUSH_CHARS.indexOf(key.charAt(i));
    if (v < 0) return null;
    t = t * 64 + v;
  }
  // A plausible time only (2020 onwards, not past 2100).
  return t > 1_577_836_800_000 && t < 4_102_444_800_000 ? t : null;
}

/** The learner number of a recordings/{key}: student_user4, student_4, user4 or 4. */
export function learnerOfKey(key: string): number | null {
  const m = /^(?:student_user|student_|user)?(\d{1,2})$/.exec(String(key));
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export interface LateReset {
  reset_id: string;
  class_id: string;
  performed_at: number;
}

export interface LateMarker {
  recordings?: Record<string, LateReset>;
  latest?: LateReset;
  /** meeting_N keys of the meeting open at reset time (byte counts and budget flags). */
  meetings?: Record<string, unknown>;
  acknowledged_at?: number;
}

/** The learner record field the screen writes when it takes up a reset (client: RESET_ACK_FIELD). */
export const RESET_ACK_FIELD = "reset_acknowledged_at";

function validReset(r: unknown): LateReset | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const at = Number(o.performed_at);
  if (typeof o.reset_id !== "string" || !o.reset_id || typeof o.class_id !== "string" || !o.class_id || !Number.isFinite(at)) return null;
  return { reset_id: o.reset_id, class_id: o.class_id, performed_at: at };
}

/**
 * What a write under recordings/ is. Depth 5 (`leafKey` set): a chunk or its
 * metadata of a recording (telemetry_sessions/{rec}/chunks|metadata/{key}), or
 * a chunk's byte count (recorded_bytes/meeting_N/chunks/{key}). Depth 4: a
 * recording's recording_truncated flag, or a meeting budget's truncated flag.
 */
export type RecordingWrite = "chunk" | "metadata" | "bytes" | "recording_truncated" | "budget_truncated";

export function classifyRecordingWrite(field: string, group: string, kind: string): "chunk" | "metadata" | "bytes" | null {
  if (field === "telemetry_sessions" && kind === "chunks") return "chunk";
  if (field === "telemetry_sessions" && kind === "metadata") return "metadata";
  if (field === "recorded_bytes" && kind === "chunks" && /^meeting_[1-8]$/.test(group)) return "bytes";
  return null;
}

export function classifyRecordingLeaf(field: string, group: string, leaf: string): "recording_truncated" | "budget_truncated" | null {
  if (field === "telemetry_sessions" && leaf === "recording_truncated") return "recording_truncated";
  if (field === "recorded_bytes" && leaf === "truncated" && /^meeting_[1-8]$/.test(group)) return "budget_truncated";
  return null;
}

/** When the device acknowledged the reset: the marker's stamp, else the record's, if it is not older than the reset. */
export function acknowledgementOf(marker: LateMarker | null, deviceAck: unknown): number | null {
  if (typeof marker?.acknowledged_at === "number") return marker.acknowledged_at;
  const latest = validReset(marker?.latest);
  return latest && typeof deviceAck === "number" && deviceAck >= latest.performed_at ? deviceAck : null;
}

/**
 * The reset a write missed, or null when the write is not late. A write into
 * one of the reset's recordings is late while the device has not acknowledged
 * the reset, or when it was minted (push key) before the acknowledgement; a
 * write into any recording minted before the reset itself is late too. A byte
 * count or budget flag counts only for the meeting open at reset time (any
 * meeting when none was open). A write with no push-key time is late only
 * while unacknowledged.
 */
export function lateResetFor(marker: LateMarker | null, what: RecordingWrite, group: string, writeTime: number | null, ack: number | null = acknowledgementOf(marker, null)): LateReset | null {
  if (!marker || typeof marker !== "object") return null;
  const latest = validReset(marker.latest);
  const beforeAck = ack === null || (writeTime !== null && writeTime < ack);
  if (what === "bytes" || what === "budget_truncated") {
    const meetings = marker.meetings && typeof marker.meetings === "object" ? Object.keys(marker.meetings) : [];
    if (meetings.length > 0 && !meetings.includes(group)) return null;
    return beforeAck ? latest : null;
  }
  const reset = validReset(marker.recordings?.[group]);
  if (reset && beforeAck) return reset;
  // Recorded before the reset, in a recording the server never had (the device
  // was offline from its start): it belongs to what the reset deleted.
  if (latest && writeTime !== null && writeTime < latest.performed_at) return latest;
  return null;
}

/** Recording ids of one learner in a reset's backup snapshot (recordings/{alias} or the whole recordings root). */
function recordingIdsInBackup(rtdbBackup: Record<string, unknown>, learner: number): string[] {
  const ids = new Set<string>();
  const addFrom = (node: unknown) => {
    const sessions = node && typeof node === "object" ? (node as Record<string, unknown>).telemetry_sessions : null;
    if (sessions && typeof sessions === "object") Object.keys(sessions).forEach((k) => ids.add(k));
  };
  for (const [path, value] of Object.entries(rtdbBackup)) {
    if (path === "recordings" && value && typeof value === "object") {
      for (const [key, node] of Object.entries(value as Record<string, unknown>)) {
        if (learnerOfKey(key) === learner) addFrom(node);
      }
    } else {
      const m = /^recordings\/([^/]+)$/.exec(path);
      if (m && learnerOfKey(m[1]) === learner) addFrom(value);
    }
  }
  return [...ids];
}

/** Whether the learner's canonical record (the one a screen listens on) was in the backup. */
function hadLearnerRecord(rtdbBackup: Record<string, unknown>, learner: number): boolean {
  const key = `student_user${learner}`;
  const all = rtdbBackup["users/students"];
  if (all && typeof all === "object" && (all as Record<string, unknown>)[key] != null) return true;
  return rtdbBackup[`users/students/${key}`] != null;
}

/**
 * The marker writes of a full learner reset or a system reset, one multi-path
 * update. Merges into earlier resets' recordings, and re-arms the
 * acknowledgement. Called twice: before the backup is collected
 * (rtdbBackup null: the open meeting's recording only, everyone unacknowledged)
 * and once the backup is collected (its recording ids, and learners with no
 * record acknowledged at once).
 */
export function lateRecordingMarkerUpdates(input: {
  resetId: string;
  classId: string;
  performedAt: number;
  learners: readonly number[];
  rtdbBackup: Record<string, unknown> | null;
  classStartedAt: number | null;
  meeting?: number | null;
}): Record<string, unknown> {
  const reset: LateReset = { reset_id: input.resetId, class_id: input.classId, performed_at: input.performedAt };
  const updates: Record<string, unknown> = {};
  for (const n of input.learners) {
    const base = `${LATE_MARKERS_ROOT}/learner_${n}`;
    const ids = input.rtdbBackup ? recordingIdsInBackup(input.rtdbBackup, n) : [];
    if (typeof input.classStartedAt === "number" && input.classStartedAt > 0) ids.push(`session_${input.classStartedAt}`);
    for (const id of new Set(ids)) updates[`${base}/recordings/${id}`] = reset;
    updates[`${base}/latest`] = reset;
    updates[`${base}/meetings`] = typeof input.meeting === "number" && input.meeting >= 1 && input.meeting <= 8 ? { [`meeting_${input.meeting}`]: true } : null;
    updates[`${base}/acknowledged_at`] = input.rtdbBackup && !hadLearnerRecord(input.rtdbBackup, n) ? input.performedAt : null;
  }
  return updates;
}

/**
 * The update that restores the markers as they were before `updates` (an
 * aborted reset): every path written goes back to its earlier value, or away.
 */
export function lateRecordingMarkerRevert(before: Record<string, unknown> | null, updates: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const prefix = `${LATE_MARKERS_ROOT}/`;
  for (const path of Object.keys(updates)) {
    if (!path.startsWith(prefix)) continue;
    const value = path.slice(prefix.length).split("/").reduce<unknown>(
      (node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined),
      before ?? {}
    );
    out[path] = value === undefined ? null : value;
  }
  return out;
}

export interface LateWrite {
  learnerKey: string;
  field: string;
  group: string;
  /** chunks | metadata (depth 5), or the leaf name (depth 4). */
  kind: string;
  /** The chunk's key at depth 5; null for a depth-4 flag. */
  key: string | null;
}

export interface QuarantineDeps {
  readMarker: (learner: number) => Promise<LateMarker | null>;
  /** users/students/student_userN/reset_acknowledged_at; read only while the marker is unacknowledged. */
  readDeviceAck: (learner: number) => Promise<unknown>;
  /** One atomic multi-path update at the database root. */
  update: (updates: Record<string, unknown>) => Promise<void>;
  /** A counter of moves into the reset's pending mark (admin.database.ServerValue.increment(1)). */
  moveCount: unknown;
}

/**
 * Moves a late write out of recordings/ in one atomic update. Returns what
 * happened: 'moved' into the quarantine, 'removed' (a byte count or budget
 * flag), or null when the write is not late.
 */
export async function quarantineIfLate(w: LateWrite, value: unknown, deps: QuarantineDeps): Promise<"moved" | "removed" | null> {
  const what: RecordingWrite | null = w.key !== null
    ? classifyRecordingWrite(w.field, w.group, w.kind)
    : classifyRecordingLeaf(w.field, w.group, w.kind);
  const learner = learnerOfKey(w.learnerKey);
  if (!what || learner === null) return null;
  const marker = await deps.readMarker(learner);
  if (!marker) return null;
  let ack = acknowledgementOf(marker, null);
  if (ack === null && validReset(marker.latest)) {
    ack = acknowledgementOf(marker, await deps.readDeviceAck(learner));
    // Kept on the marker, so the next write needs no second read.
    if (ack !== null) await deps.update({ [`${LATE_MARKERS_ROOT}/learner_${learner}/acknowledged_at`]: ack });
  }
  const reset = lateResetFor(marker, what, w.group, w.key !== null ? pushKeyTime(w.key) : null, ack);
  if (!reset) return null;

  const nodePath = `recordings/${w.learnerKey}/${w.field}/${w.group}/${w.kind}${w.key !== null ? `/${w.key}` : ""}`;
  if (what === "bytes" || what === "budget_truncated") {
    await deps.update({ [nodePath]: null });
    return "removed";
  }
  const q = `${LATE_QUARANTINE_ROOT}/${reset.reset_id}/learner_${learner}/${w.group}`;
  const target = what === "recording_truncated" ? `${q}/recording_truncated` : `${q}/${w.kind}/${w.key}`;
  await deps.update({
    [target]: value,
    [`${LATE_PENDING_ROOT}/${reset.reset_id}/class_id`]: reset.class_id,
    [`${LATE_PENDING_ROOT}/${reset.reset_id}/performed_at`]: reset.performed_at,
    [`${LATE_PENDING_ROOT}/${reset.reset_id}/moves`]: deps.moveCount,
    [nodePath]: null,
  });
  return "moved";
}

/** "הקלטה שהגיעה אחרי האיפוס - תלמיד 04 - <recording> - 08.10.2026 14-30.json" (Israel time of the reset). */
export function lateRecordingFileNameOf(learner: number, recordingId: string, resetAt: number): string {
  return `${LATE_RECORDING_LABEL} - תלמיד ${learnerNumber2(learner)} - ${recordingId} - ${israelDateTime(resetAt)}.json`;
}

export function lateRecordingStoragePath(reset: LateReset, learner: number, recordingId: string): string {
  return `backups/${reset.class_id}/${reset.reset_id}/${lateRecordingFileNameOf(learner, recordingId, reset.performed_at)}`;
}

export interface LateRecordingFile {
  format: "mathmaticore-late-recording/1";
  label: typeof LATE_RECORDING_LABEL;
  reset_id: string;
  class_id: string;
  student_id: number;
  recording_id: string;
  chunks: Record<string, unknown>;
  metadata: Record<string, unknown>;
  recording_truncated?: boolean;
}

/** The quarantined part of one recording: late_recordings/{reset}/learner_N/{rec}. */
export interface QuarantinedRecording {
  chunks?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  recording_truncated?: unknown;
}

/** The file with the quarantined entries added. Never drops what was there. */
export function mergeLateFile(
  existing: LateRecordingFile | null,
  base: Omit<LateRecordingFile, "format" | "label" | "chunks" | "metadata" | "recording_truncated">,
  q: QuarantinedRecording
): LateRecordingFile {
  const file: LateRecordingFile = existing ?? { format: "mathmaticore-late-recording/1", label: LATE_RECORDING_LABEL, ...base, chunks: {}, metadata: {} };
  const merged: LateRecordingFile = {
    ...file,
    chunks: { ...file.chunks, ...(q.chunks || {}) },
    metadata: { ...file.metadata, ...(q.metadata || {}) },
  };
  if (file.recording_truncated === true || q.recording_truncated === true) merged.recording_truncated = true;
  return merged;
}

/** The quarantine paths a written file covers, set to null (only those: newer ones stay). */
export function quarantineClearUpdates(resetId: string, learner: number, recordingId: string, q: QuarantinedRecording): Record<string, null> {
  const base = `${LATE_QUARANTINE_ROOT}/${resetId}/learner_${learner}/${recordingId}`;
  const out: Record<string, null> = {};
  for (const kind of ["chunks", "metadata"] as const) {
    for (const key of Object.keys(q[kind] || {})) out[`${base}/${kind}/${key}`] = null;
  }
  if (q.recording_truncated !== undefined && q.recording_truncated !== null) out[`${base}/recording_truncated`] = null;
  return out;
}

export interface AssembleDeps {
  read: (path: string) => Promise<unknown>;
  update: (updates: Record<string, unknown>) => Promise<void>;
  readFile: (storagePath: string) => Promise<LateRecordingFile | null>;
  /** Writes the file and returns its gs:// url. */
  writeFile: (storagePath: string, file: LateRecordingFile) => Promise<string>;
  /** Adds the file to the reset's audit entry (late_recording_files). */
  link: (resetId: string, url: string) => Promise<void>;
  /** Drops the reset's pending mark, unless a chunk was moved in since it was read (its move count changed). */
  dropPending: (resetId: string, moves: unknown) => Promise<void>;
}

/**
 * The daily step: one file per reset × learner × recording out of the
 * quarantine. The quarantined entries are cleared only after the file was
 * written and linked; a failure leaves them for the next run.
 */
export async function assembleLateRecordings(deps: AssembleDeps): Promise<{ written: string[]; failed: string[] }> {
  const written: string[] = [];
  const failed: string[] = [];
  const pending = ((await deps.read(LATE_PENDING_ROOT)) || {}) as Record<string, Record<string, unknown>>;
  for (const [resetId, p] of Object.entries(pending)) {
    const reset = validReset({ reset_id: resetId, class_id: p?.class_id, performed_at: p?.performed_at });
    if (!reset) continue;
    let allDone = true;
    for (let n = 1; n <= 12; n++) {
      const learnerNode = (await deps.read(`${LATE_QUARANTINE_ROOT}/${resetId}/learner_${n}`)) as Record<string, QuarantinedRecording> | null;
      if (!learnerNode || typeof learnerNode !== "object") continue;
      for (const [rec, q] of Object.entries(learnerNode)) {
        const path = lateRecordingStoragePath(reset, n, rec);
        try {
          const existing = await deps.readFile(path);
          const file = mergeLateFile(existing, { reset_id: resetId, class_id: reset.class_id, student_id: n, recording_id: rec }, q || {});
          const url = await deps.writeFile(path, file);
          await deps.link(resetId, url);
          await deps.update(quarantineClearUpdates(resetId, n, rec, q || {}));
          written.push(path);
        } catch (err: any) {
          allDone = false;
          failed.push(path);
          logger.warn(`Late recording ${path} is still in the quarantine: ${err?.message || err}`);
        }
      }
    }
    if (allDone) await deps.dropPending(resetId, p?.moves).catch(() => {});
  }
  return { written, failed };
}

/** The Firebase side of assembleLateRecordings. */
export function firebaseAssembleDeps(): AssembleDeps {
  const rtdb = admin.database();
  const bucket = admin.storage().bucket();
  return {
    read: async (path) => (await rtdb.ref(path).get()).val(),
    update: async (updates) => { await rtdb.ref().update(updates); },
    readFile: async (path) => {
      try {
        return JSON.parse((await bucket.file(path).download())[0].toString("utf-8"));
      } catch (err: any) {
        if (err?.code === 404) return null;
        throw err;
      }
    },
    writeFile: async (path, file) => {
      await bucket.file(path).save(Buffer.from(JSON.stringify(file), "utf-8"), {
        contentType: "application/json",
        metadata: { metadata: { reset_id: file.reset_id, label: LATE_RECORDING_LABEL } },
      });
      return `gs://${bucket.name}/${path}`;
    },
    link: async (resetId, url) => {
      await admin.firestore().collection("reset_audit_log").doc(resetId)
        .update({
          late_recording_files: admin.firestore.FieldValue.arrayUnion(url),
          // The daily copy to "3 גיבויים" picks the entry up (backupDriveCopy.ts).
          late_recording_drive_pending: true,
        });
    },
    dropPending: async (resetId, moves) => {
      await rtdb.ref(`${LATE_PENDING_ROOT}/${resetId}`).transaction((cur) =>
        cur && cur.moves === moves ? null : cur
      );
    },
  };
}

function firebaseQuarantineDeps(): QuarantineDeps {
  const rtdb = admin.database();
  return {
    readMarker: async (learner) => (await rtdb.ref(`${LATE_MARKERS_ROOT}/learner_${learner}`).get()).val(),
    readDeviceAck: async (learner) => (await rtdb.ref(`users/students/student_user${learner}/${RESET_ACK_FIELD}`).get()).val(),
    update: async (updates) => { await rtdb.ref().update(updates); },
    moveCount: admin.database.ServerValue.increment(1),
  };
}

async function onRecordingWrite(w: LateWrite, value: unknown): Promise<void> {
  const done = await quarantineIfLate(w, value, firebaseQuarantineDeps());
  if (done) logger.info(`Late recording write ${w.field}/${w.group}/${w.kind}${w.key ? `/${w.key}` : ""} of ${w.learnerKey} ${done} (Module 23א §ג).`);
}

/** A chunk, its metadata, or a byte count. */
export const onLateRecordingChunk = onValueCreated({
  ref: "/recordings/{learnerKey}/{field}/{group}/{kind}/{chunkKey}",
  region: "us-central1",
  // A failed run would leave a late chunk recreating the deleted recording;
  // the move is idempotent, so a retry is safe.
  retry: true,
}, async (event) => {
  const { learnerKey, field, group, kind, chunkKey } = event.params as Record<string, string>;
  await onRecordingWrite({ learnerKey, field, group, kind, key: chunkKey }, event.data.val());
});

/** A recording's recording_truncated flag, or a meeting budget's truncated flag. */
export const onLateRecordingFlag = onValueCreated({
  ref: "/recordings/{learnerKey}/{field}/{group}/{leaf}",
  region: "us-central1",
  retry: true,
}, async (event) => {
  const { learnerKey, field, group, leaf } = event.params as Record<string, string>;
  if (!classifyRecordingLeaf(field, group, leaf)) return;
  await onRecordingWrite({ learnerKey, field, group, kind: leaf, key: null }, event.data.val());
});
