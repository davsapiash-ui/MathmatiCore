/**
 * PRD Module 23א §ג (and Module 21): "מקטעי הקלטה שמגיעים לשרת אחרי איפוס מוחלט
 * של לומד או אחרי איפוס מערכת, ממכשיר שהיה לא מקוון בזמן האיפוס, אינם יוצרים
 * מחדש את ההקלטה שנמחקה: הם נשמרים כקובץ נפרד בשם 'הקלטה שהגיעה אחרי האיפוס',
 * המקושר לרישום של אותו איפוס (סעיף ד)".
 *
 * How it works:
 *
 * 1. Marker. A full learner reset or a system reset writes, before it deletes
 *    anything, a server-only marker per affected learner:
 *    late_recording_markers/learner_N = {
 *      recordings: { <recording id>: { reset_id, class_id, performed_at } },
 *      latest: { reset_id, class_id, performed_at },
 *      acknowledged_at: <absent until the learner's device took up the restart>
 *    }
 *    The recording ids are the ones in the reset's backup, plus the recording
 *    of the class meeting open at the time (session_{startedAt}), which an
 *    offline device keeps writing into.
 *
 * 2. "Late" means the device had not yet learned of the reset: a write into one
 *    of those recordings while the restart is unacknowledged, or one whose push
 *    key was minted before the acknowledgement. The acknowledgement is the
 *    learner's screen clearing the restart command (forceReload) on its record
 *    (onLateRecordingAck). A learner with no record at reset time has no screen
 *    to restart; the reset time itself is the acknowledgement.
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
 *    the file was written and linked.
 */
import { onValueCreated, onValueDeleted } from "firebase-functions/v2/database";
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
  acknowledged_at?: number;
}

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

/**
 * The reset a write missed, or null when the write is not late. A write into
 * one of the reset's recordings (or a budget write of that learner) is late
 * while the learner's device has not acknowledged the restart, or when it was
 * minted (push key) before the acknowledgement. A write with no push-key time
 * is late only while unacknowledged.
 */
export function lateResetFor(marker: LateMarker | null, what: RecordingWrite, recordingId: string, writeTime: number | null): LateReset | null {
  if (!marker || typeof marker !== "object") return null;
  const ack = typeof marker.acknowledged_at === "number" ? marker.acknowledged_at : null;
  const beforeAck = ack === null || (writeTime !== null && writeTime < ack);
  if (!beforeAck) return null;
  if (what === "bytes" || what === "budget_truncated") return validReset(marker.latest);
  return validReset(marker.recordings?.[recordingId]);
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
 * update, written before anything is deleted. Merges into earlier resets'
 * recordings, and re-arms the acknowledgement.
 */
export function lateRecordingMarkerUpdates(input: {
  resetId: string;
  classId: string;
  performedAt: number;
  learners: readonly number[];
  rtdbBackup: Record<string, unknown>;
  classStartedAt: number | null;
}): Record<string, unknown> {
  const reset: LateReset = { reset_id: input.resetId, class_id: input.classId, performed_at: input.performedAt };
  const updates: Record<string, unknown> = {};
  for (const n of input.learners) {
    const base = `${LATE_MARKERS_ROOT}/learner_${n}`;
    const ids = recordingIdsInBackup(input.rtdbBackup, n);
    if (typeof input.classStartedAt === "number" && input.classStartedAt > 0) ids.push(`session_${input.classStartedAt}`);
    for (const id of new Set(ids)) updates[`${base}/recordings/${id}`] = reset;
    updates[`${base}/latest`] = reset;
    updates[`${base}/acknowledged_at`] = hadLearnerRecord(input.rtdbBackup, n) ? null : input.performedAt;
  }
  return updates;
}

/**
 * The learner's screen cleared the restart command (forceReload) — the device
 * has learned of the reset. Null when there is nothing to acknowledge, or when
 * the flag is set again right now (a reset's own delete-and-restart).
 */
export function acknowledgementUpdate(learner: number, marker: LateMarker | null, forceReloadNow: unknown, eventTime: number): Record<string, unknown> | null {
  const latest = validReset(marker?.latest);
  if (!latest || typeof marker?.acknowledged_at === "number") return null;
  if (forceReloadNow === true || eventTime < latest.performed_at) return null;
  return { [`${LATE_MARKERS_ROOT}/learner_${learner}/acknowledged_at`]: eventTime };
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
  /** One atomic multi-path update at the database root. */
  update: (updates: Record<string, unknown>) => Promise<void>;
  /** The server's time placeholder (admin.database.ServerValue.TIMESTAMP). */
  serverTime: unknown;
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
  const reset = lateResetFor(marker, what, w.group, w.key !== null ? pushKeyTime(w.key) : null);
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
    [`${LATE_PENDING_ROOT}/${reset.reset_id}`]: { class_id: reset.class_id, performed_at: reset.performed_at, last_moved_at: deps.serverTime },
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
  /** Drops the reset's pending mark, unless a chunk was moved in since `lastMovedAt`. */
  dropPending: (resetId: string, lastMovedAt: unknown) => Promise<void>;
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
    if (allDone) await deps.dropPending(resetId, p?.last_moved_at).catch(() => {});
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
        .update({ late_recording_files: admin.firestore.FieldValue.arrayUnion(url) });
    },
    dropPending: async (resetId, lastMovedAt) => {
      await rtdb.ref(`${LATE_PENDING_ROOT}/${resetId}`).transaction((cur) =>
        cur && cur.last_moved_at === lastMovedAt ? null : cur
      );
    },
  };
}

function firebaseQuarantineDeps(): QuarantineDeps {
  const rtdb = admin.database();
  return {
    readMarker: async (learner) => (await rtdb.ref(`${LATE_MARKERS_ROOT}/learner_${learner}`).get()).val(),
    update: async (updates) => { await rtdb.ref().update(updates); },
    serverTime: admin.database.ServerValue.TIMESTAMP,
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
}, async (event) => {
  const { learnerKey, field, group, kind, chunkKey } = event.params as Record<string, string>;
  await onRecordingWrite({ learnerKey, field, group, kind, key: chunkKey }, event.data.val());
});

/** A recording's recording_truncated flag, or a meeting budget's truncated flag. */
export const onLateRecordingFlag = onValueCreated({
  ref: "/recordings/{learnerKey}/{field}/{group}/{leaf}",
  region: "us-central1",
}, async (event) => {
  const { learnerKey, field, group, leaf } = event.params as Record<string, string>;
  if (!classifyRecordingLeaf(field, group, leaf)) return;
  await onRecordingWrite({ learnerKey, field, group, kind: leaf, key: null }, event.data.val());
});

/** The learner's screen cleared the restart command: its device now knows of the reset. */
export const onLateRecordingAck = onValueDeleted({
  ref: "/users/students/{learnerKey}/forceReload",
  region: "us-central1",
}, async (event) => {
  const learner = learnerOfKey((event.params as Record<string, string>).learnerKey);
  if (learner === null || event.data.val() !== true) return;
  const rtdb = admin.database();
  const marker = (await rtdb.ref(`${LATE_MARKERS_ROOT}/learner_${learner}`).get()).val();
  if (!marker) return;
  const now = (await rtdb.ref(`users/students/${(event.params as Record<string, string>).learnerKey}/forceReload`).get()).val();
  const updates = acknowledgementUpdate(learner, marker, now, Date.parse(event.time) || Date.now());
  if (updates) await rtdb.ref().update(updates);
});
