import { describe, it, expect } from 'vitest';
import {
  computeFirstAttemptScore,
  lastResetOfMeeting,
  readLastResetOfMeeting,
  readMeetingTelemetry,
} from '../meetingMetrics';

/**
 * The meeting's score counts the run since the meeting was last restarted.
 *
 * Owner, live, 28.9.2026 (learner 8): "עשיתי הכל מושלם למה אני צריך מסלול
 * צמצום פערי קדם". A reset keeps the telemetry (register deviation 20), and
 * the score read every event the learner ever sent in meeting 2: a wrong digit
 * before the reset removed that task from "נכון בניסיון ראשון" for good, and a
 * perfect replay scored 29% — remediation_path. PRD 23א §ב.2: a reset
 * "מחזיר לתחילת המפגש".
 */
const T_RESET = 1_700_000_100_000;

const reset = (over: Record<string, unknown>) => ({
  reset_level: 'single_student',
  reset_scope: 'active_session',
  session_number: 2,
  affected_student_ids: [8],
  backup_status: 'success',
  performed_at: T_RESET,
  ...over,
});

describe('which resets restart meeting 2 for learner 8', () => {
  it('this meeting, the whole learner, the class restart of this meeting and a system reset do', () => {
    expect(lastResetOfMeeting([reset({})], 8, 2)).toBe(T_RESET);
    expect(lastResetOfMeeting([reset({ reset_scope: 'full_student', session_number: null })], 8, 2)).toBe(T_RESET);
    expect(lastResetOfMeeting([reset({ reset_target: 'class', affected_student_ids: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })], 8, 2)).toBe(T_RESET);
    expect(lastResetOfMeeting([reset({ reset_level: 'system', reset_scope: undefined, session_number: undefined })], 8, 2)).toBe(T_RESET);
  });

  it('another meeting, another learner, an alerts reset or a failed reset do not', () => {
    expect(lastResetOfMeeting([reset({ session_number: 3 })], 8, 2)).toBeNull();
    expect(lastResetOfMeeting([reset({ affected_student_ids: [7] })], 8, 2)).toBeNull();
    expect(lastResetOfMeeting([reset({ reset_level: 'alerts', reset_scope: undefined })], 8, 2)).toBeNull();
    expect(lastResetOfMeeting([reset({ backup_status: 'failed' })], 8, 2)).toBeNull();
    expect(lastResetOfMeeting([], 8, 2)).toBeNull();
  });

  it('the latest one counts', () => {
    expect(lastResetOfMeeting([reset({}), reset({ performed_at: T_RESET + 5 }), reset({ performed_at: T_RESET - 5 })], 8, 2)).toBe(T_RESET + 5);
  });
});

/** A minimal Firestore: one collection per name, each doc with its server write time. */
function fakeDb(collections: Record<string, Array<{ data: Record<string, any>; writtenAt?: number }>>) {
  return {
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        get: async () => ({
          docs: (collections[name] ?? [])
            .filter(({ data }) => (op === 'array-contains' ? (data[field] ?? []).includes(value) : data[field] === value))
            .map(({ data, writtenAt }) => ({
              data: () => data,
              createTime: writtenAt === undefined ? undefined : { toMillis: () => writtenAt },
            })),
        }),
      }),
    }),
  } as any;
}

const TASKS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
const event = (exercise_id: string, event_type: string, at: number, details: Record<string, unknown> = {}) => ({
  data: { student_id: 8, session_id: 'session_2_student_student_user8', exercise_id, event_type, client_timestamp: at, details },
  writtenAt: at,
});

describe('learner 8: a first run with mistakes, a reset, then a perfect run', () => {
  const firstRun = TASKS.slice(0, 5).map((id, i) => event(id, 'DIGIT_ENTERED', T_RESET - 60_000 + i, { is_correct: false }));
  const perfectRun = TASKS.map((id, i) => event(id, 'PROBLEM_COMPLETE', T_RESET + 60_000 + i));
  const db = fakeDb({
    telemetry_logs: [...firstRun, ...perfectRun],
    reset_audit_log: [{ data: reset({}) }],
  });

  it('before: every event counted — 29%, the perfect run sent to remediation', async () => {
    const all = await readMeetingTelemetry(db, 8, 2);
    const score = computeFirstAttemptScore(all, 7, new Set(TASKS));
    expect(score.scorePercent).toBe(29);
  });

  it('now: only the run since the reset — 100%, green', async () => {
    const writtenAfterMs = await readLastResetOfMeeting(db, 8, 2);
    expect(writtenAfterMs).toBe(T_RESET);
    const run = await readMeetingTelemetry(db, 8, 2, { writtenAfterMs });
    expect(run).toHaveLength(7);
    const score = computeFirstAttemptScore(run, 7, new Set(TASKS));
    expect(score.scorePercent).toBe(100);
  });

  it('with no reset, the whole meeting is read as before', async () => {
    const noReset = fakeDb({ telemetry_logs: [...firstRun, ...perfectRun], reset_audit_log: [] });
    expect(await readLastResetOfMeeting(noReset, 8, 2)).toBeNull();
    expect(await readMeetingTelemetry(noReset, 8, 2, { writtenAfterMs: null })).toHaveLength(12);
  });
});
