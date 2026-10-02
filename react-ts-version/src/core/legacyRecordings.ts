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

/** Whether any learner record in a users/students tree still holds recordings. */
export function hasLegacyRecordings(studentsTree: unknown): boolean {
  if (!studentsTree || typeof studentsTree !== 'object') return false;
  return Object.values(studentsTree as Record<string, unknown>).some((record) => {
    if (!record || typeof record !== 'object') return false;
    return LEGACY_RECORDING_FIELDS.some((field) => {
      const v = (record as Record<string, unknown>)[field];
      return Boolean(v) && typeof v === 'object' && Object.keys(v as object).length > 0;
    });
  });
}
