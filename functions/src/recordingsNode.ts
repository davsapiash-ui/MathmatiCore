/**
 * Module 21: where a learner's screen recordings live, and how the readers see
 * them in one piece.
 *
 *   recordings/{student_userN}/telemetry_sessions/session_{startedAt}/{chunks,metadata,recording_truncated}
 *   recordings/{student_userN}/recorded_bytes/meeting_{N}/{chunks,truncated}
 *
 * The learner's client used to write both under the learner record,
 * users/students/{id}/telemetry_sessions and …/recorded_bytes. Every teacher
 * screen listens to the whole users/students tree, so the teacher's computer
 * downloaded every recording of every learner from every meeting, and
 * re-read the roster with each chunk (one every 2 s per learner). The recorder
 * now writes here (react-ts-version/src/features/workspace/screenRecorder.ts).
 *
 * What was recorded before stays at the old place until the teacher moves it
 * (moveLegacyRecordings.ts). Until then every reader merges the two places:
 * withRecordings() puts the recordings node back on each learner record, so
 * the code that reads node.telemetry_sessions and node.recorded_bytes is
 * unchanged.
 */

export const RECORDINGS_ROOT = "recordings";

/** The two children a learner has under recordings/{id}, by the names they had on the learner record. */
export const RECORDING_FIELDS = ["telemetry_sessions", "recorded_bytes"] as const;
export type RecordingField = typeof RECORDING_FIELDS[number];

/** A flag that is true when either copy says so. */
const OR_FLAGS = new Set(["recording_truncated", "truncated"]);

const isPlainObject = (v: unknown): v is Record<string, any> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);

/**
 * One telemetry_sessions (or recorded_bytes) node out of the old place and the
 * new one. A recording (or meeting budget) found in both — an opening that
 * began on the old version and went on after the update — keeps every chunk,
 * every metadata entry and every chunk size of both.
 */
export function mergeRecordingField(legacy: unknown, current: unknown): Record<string, any> | null {
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
      if (OR_FLAGS.has(k)) merged[k] = old[k] === true || v === true;
      else if (isPlainObject(old[k]) && isPlainObject(v)) merged[k] = { ...old[k], ...v };
      else merged[k] = v ?? old[k];
    }
    out[id] = merged;
  }
  return out;
}

/**
 * The users/students tree with each learner's recordings node merged back
 * onto the learner record (see the file comment). The input is not changed.
 * A learner who has recordings but no record gets a record holding only them.
 */
export function withRecordings(
  studentsNode: Record<string, any> | null | undefined,
  recordingsNode: Record<string, any> | null | undefined
): Record<string, any> {
  const out: Record<string, any> = { ...(isPlainObject(studentsNode) ? studentsNode : {}) };
  if (!isPlainObject(recordingsNode)) return out;
  for (const [key, rec] of Object.entries(recordingsNode)) {
    if (!isPlainObject(rec)) continue;
    const record: Record<string, any> = isPlainObject(out[key]) ? { ...out[key] } : {};
    for (const field of RECORDING_FIELDS) {
      const merged = mergeRecordingField(record[field], rec[field]);
      if (merged) record[field] = merged;
    }
    out[key] = record;
  }
  return out;
}
