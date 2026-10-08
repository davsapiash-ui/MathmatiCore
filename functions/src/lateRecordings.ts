/**
 * PRD Module 23א §ג: "מקטעי הקלטה שמגיעים לשרת אחרי איפוס מוחלט של לומד או
 * אחרי איפוס מערכת, ממכשיר שהיה לא מקוון בזמן האיפוס, אינם יוצרים מחדש את
 * ההקלטה שנמחקה: הם נשמרים כקובץ נפרד בשם 'הקלטה שהגיעה אחרי האיפוס',
 * המקושר לרישום של אותו איפוס (סעיף ד)".
 *
 * The learner's device writes each recording chunk straight to
 * recordings/{learner}/… (screenRecorder.ts), and an offline device writes its
 * queue when it reconnects. A chunk is "late" when it was recorded on the
 * device (its push key carries the device's clock) before a completed full
 * learner reset or system reset that covers the learner, and reached the
 * server after it. Such a chunk, and its metadata, are moved into one file per
 * reset × learner × recording in Cloud Storage, next to that reset's backup
 * (backups/{class_id}/{reset_id}/), and the reset's audit entry lists the file
 * (late_recording_files). Its byte count is removed from the meeting's budget.
 * A chunk recorded after the reset is a new recording and is left alone.
 */
import { onValueCreated } from "firebase-functions/v2/database";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { isCompletedReset } from "./resetAudit";
import { LATE_RECORDING_LABEL, learnerNumber2, israelDateTime } from "./driveNames";

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

/**
 * The reset a chunk recorded at `chunkTime` missed: the earliest completed
 * full learner reset or system reset covering the learner that was performed
 * after the chunk was recorded and before it arrived (`arrivedAt`). Null when
 * the chunk is not late.
 */
export function resetMissedByChunk(
  entries: ReadonlyArray<Record<string, unknown>>,
  learner: number,
  chunkTime: number,
  arrivedAt: number
): LateReset | null {
  let best: LateReset | null = null;
  for (const e of entries) {
    if (!isCompletedReset(e)) continue;
    const full = e.reset_level === "system" || (e.reset_level === "single_student" && e.reset_scope === "full_student");
    if (!full) continue;
    const affected = Array.isArray(e.affected_student_ids) ? e.affected_student_ids.map(Number) : [];
    if (!affected.includes(learner)) continue;
    const at = Number(e.performed_at);
    if (!Number.isFinite(at) || !(chunkTime < at && at <= arrivedAt)) continue;
    if (!best || at < best.performed_at) {
      best = { reset_id: String(e.reset_id ?? ""), class_id: String(e.class_id ?? ""), performed_at: at };
    }
  }
  return best && best.reset_id && best.class_id ? best : null;
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
}

/** The file with one more chunk or metadata entry in it. Never drops what was there. */
export function withLateEntry(
  existing: LateRecordingFile | null,
  base: Omit<LateRecordingFile, "format" | "label" | "chunks" | "metadata">,
  kind: "chunks" | "metadata",
  key: string,
  value: unknown
): LateRecordingFile {
  const file: LateRecordingFile = existing ?? { format: "mathmaticore-late-recording/1", label: LATE_RECORDING_LABEL, ...base, chunks: {}, metadata: {} };
  return { ...file, [kind]: { ...file[kind], [key]: value } };
}

/**
 * What a write under recordings/ is: a chunk or its metadata of a recording
 * (telemetry_sessions/{rec}/chunks|metadata/{key}), or a chunk's byte count in
 * the meeting's budget (recorded_bytes/meeting_N/chunks/{key}).
 */
export function classifyRecordingWrite(field: string, group: string, kind: string): "chunk" | "metadata" | "bytes" | null {
  if (field === "telemetry_sessions" && kind === "chunks") return "chunk";
  if (field === "telemetry_sessions" && kind === "metadata") return "metadata";
  if (field === "recorded_bytes" && kind === "chunks" && /^meeting_[1-8]$/.test(group)) return "bytes";
  return null;
}

export const onLateRecordingChunk = onValueCreated({
  ref: "/recordings/{learnerKey}/{field}/{group}/{kind}/{chunkKey}",
  region: "us-central1",
}, async (event) => {
  const { learnerKey, field, group, kind, chunkKey } = event.params as Record<string, string>;
  const what = classifyRecordingWrite(field, group, kind);
  const learner = learnerOfKey(learnerKey);
  const chunkTime = pushKeyTime(chunkKey);
  if (!what || learner === null || chunkTime === null) return;
  const arrivedAt = Date.parse(event.time) || Date.now();

  const snap = await admin.firestore().collection("reset_audit_log").where("affected_student_ids", "array-contains", learner).get();
  const reset = resetMissedByChunk(snap.docs.map((d) => d.data()), learner, chunkTime, arrivedAt);
  if (!reset) return;

  const nodePath = `recordings/${learnerKey}/${field}/${group}/${kind}/${chunkKey}`;
  if (what !== "bytes") {
    const value = event.data.val();
    const file = admin.storage().bucket().file(lateRecordingStoragePath(reset, learner, group));
    // One file per reset × learner × recording; chunks arrive concurrently, so
    // each write is conditional on the generation it read.
    for (let attempt = 0; attempt < 8; attempt++) {
      let existing: LateRecordingFile | null = null;
      let generation = 0;
      try {
        const [meta] = await file.getMetadata();
        generation = Number(meta.generation) || 0;
        existing = JSON.parse((await file.download())[0].toString("utf-8"));
      } catch (err: any) {
        if (err?.code !== 404) throw err;
      }
      const next = withLateEntry(existing, { reset_id: reset.reset_id, class_id: reset.class_id, student_id: learner, recording_id: group }, what === "chunk" ? "chunks" : "metadata", chunkKey, value);
      try {
        await file.save(Buffer.from(JSON.stringify(next), "utf-8"), {
          contentType: "application/json",
          preconditionOpts: { ifGenerationMatch: generation },
          metadata: { metadata: { reset_id: reset.reset_id, label: LATE_RECORDING_LABEL } },
        });
        break;
      } catch (err: any) {
        if (err?.code !== 412 || attempt === 7) throw err;
      }
    }
    const url = `gs://${admin.storage().bucket().name}/${file.name}`;
    await admin.firestore().collection("reset_audit_log").doc(reset.reset_id)
      .update({ late_recording_files: admin.firestore.FieldValue.arrayUnion(url) })
      .catch((err) => logger.warn(`Late recording: the reset entry ${reset.reset_id} could not be linked: ${err?.message || err}`));
  }
  // Saved (or a byte count): it must not recreate the deleted recording.
  await admin.database().ref(nodePath).remove();
  logger.info(`Late recording ${what} ${chunkKey} of learner ${learner} moved out of ${nodePath} (reset ${reset.reset_id}).`);
});
