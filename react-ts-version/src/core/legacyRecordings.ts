/**
 * Module 21: screen recordings of earlier versions, still on the learner record.
 *
 * The recorder now writes to recordings/{uid} (features/workspace/screenRecorder.ts),
 * outside the users/students tree every teacher screen listens to. Recordings
 * made before that still sit at users/students/{id}/telemetry_sessions and
 * …/recorded_bytes, and reach the teacher's computer on every dashboard open
 * until the teacher moves them (the moveLegacyRecordings callable).
 */

/** The two fields earlier versions wrote on the learner record. */
export const LEGACY_RECORDING_FIELDS = ['telemetry_sessions', 'recorded_bytes'] as const;

/**
 * A users/students key that names learner 1–12 under any of its aliases
 * (student_user8, student_8, user8, 8). The SAME rule as the move's
 * learnerNumberOfKey (functions/src/moveLegacyRecordings.ts): the button is
 * offered only for what a press can move — a key the move skips (a teacher's
 * record, learner 13) would keep it on screen for ever.
 */
export const LEARNER_RECORD_KEY = /^(?:student_user|student_|user)?(\d{1,2})$/;

export function isLearnerRecordKey(key: string): boolean {
  const m = LEARNER_RECORD_KEY.exec(key);
  if (!m) return false;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 12;
}

/** Whether any learner record in a users/students tree still holds recordings. */
export function hasLegacyRecordings(studentsTree: unknown): boolean {
  if (!studentsTree || typeof studentsTree !== 'object') return false;
  return Object.entries(studentsTree as Record<string, unknown>).some(([key, record]) => {
    if (!isLearnerRecordKey(key) || !record || typeof record !== 'object') return false;
    return LEGACY_RECORDING_FIELDS.some((field) => {
      const v = (record as Record<string, unknown>)[field];
      return Boolean(v) && typeof v === 'object' && Object.keys(v as object).length > 0;
    });
  });
}
