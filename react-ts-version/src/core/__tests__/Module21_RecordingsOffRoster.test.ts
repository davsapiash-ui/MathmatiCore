import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Module 21 — the recordings left the learner record (teacher-dashboard audit,
 * 2.10.2026, "M-recordings-download").
 *
 * The recorder wrote a chunk every 2 s under users/students/{uid}/telemetry_sessions.
 * The radar, the dashboard, the store and class management each listen to the
 * whole users/students tree, so every dashboard open downloaded every recording
 * of every learner from every meeting (about 880KB per learner after 4
 * minutes) and re-read the roster with each chunk. The recorder now writes to
 * recordings/{uid}; recordings made before stay readable where they are until
 * the teacher moves them.
 */

const listeners = new Map<string, { cb: (snap: any) => void; err?: (e: unknown) => void }>();
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  push: () => ({ key: 'k' }),
  get: vi.fn(),
  onValue: (r: { path: string }, cb: (snap: any) => void, err?: (e: unknown) => void) => {
    listeners.set(r.path, { cb, err });
    return () => listeners.delete(r.path);
  },
}));
vi.mock('@/infrastructure/firebase', () => ({
  database: {}, firestore: {}, functions: {}, auth: {}, authReady: Promise.resolve(true),
}));

const snap = (v: unknown) => ({ exists: () => v !== null && v !== undefined, val: () => v });
const chunk = (t: number) => ({ data: JSON.stringify([{ type: 3, timestamp: t, data: {} }]) });
const meta = (t: number, ex = 's4_g_t1') => ({ startTime: t, endTime: t, sessionNumber: 4, exercise_id: ex });

describe('the recorder writes outside the roster the teacher listens to', () => {
  it('recordings and budgets live under recordings/{uid}', async () => {
    const recorder = await import('@/features/workspace/screenRecorder');
    expect(recorder.recordingsRootOf('student_user3')).toBe('recordings/student_user3');
    expect(recorder.recordingBudgetPath('student_user3', 4)).toBe('recordings/student_user3/recorded_bytes/meeting_4');
    const src = readFileSync(resolve(__dirname, '../../features/workspace/screenRecorder.ts'), 'utf-8');
    expect(src).toContain('const recordingPath = `${recordingsRootOf(uid)}/telemetry_sessions/${recordingId}`;');
    expect(src).not.toMatch(/`users\/students\/\$\{uid\}\/(telemetry_sessions|recorded_bytes)/);
  });

  it('a recording chunk left on a device with no owner is still owned by its learner', async () => {
    const { inferOwner } = await import('@/infrastructure/services/IndexedDBQueue');
    expect(inferOwner({ refPath: 'recordings/student_user7/telemetry_sessions/s/chunks', payload: {} } as any)).toBe('student:7');
  });
});

describe('the replay reads both places (old recordings stay visible)', () => {
  beforeEach(() => listeners.clear());

  it('merges a recording found in both: every chunk and metadata entry, truncated if either says so', async () => {
    const { mergeRecordingNodes, parseRecordingSessions } = await import('@/infrastructure/services/LearnerJourneyService');
    const legacy = {
      session_1: { chunks: { a: chunk(1) }, metadata: { a: meta(1) }, recording_truncated: true },
      session_0: { chunks: { z: chunk(0) }, metadata: { z: meta(0) } },
    };
    const current = { session_1: { chunks: { b: chunk(2) }, metadata: { b: meta(2) } }, session_2: { chunks: { c: chunk(3) }, metadata: { c: meta(3) } } };
    const merged = mergeRecordingNodes(legacy, current)!;
    expect(Object.keys(merged).sort()).toEqual(['session_0', 'session_1', 'session_2']);
    expect(Object.keys(merged.session_1.chunks).sort()).toEqual(['a', 'b']);
    expect(Object.keys(merged.session_1.metadata).sort()).toEqual(['a', 'b']);
    expect(merged.session_1.recording_truncated).toBe(true);
    const sessions = parseRecordingSessions(merged);
    expect(sessions.map((s) => [s.id, s.chunkCount])).toEqual([['session_0', 1], ['session_1', 2], ['session_2', 1]]);
    expect(mergeRecordingNodes(null, current)).toBe(current);
    expect(mergeRecordingNodes(legacy, null)).toBe(legacy);
    expect(mergeRecordingNodes(null, undefined)).toBeNull();
  });

  it('subscribes to the new node and the old one, and reports only once both have answered', async () => {
    const { subscribeLearnerRecordings } = await import('@/infrastructure/services/LearnerJourneyService');
    const onChange = vi.fn();
    const off = subscribeLearnerRecordings(5, onChange);
    await Promise.resolve();
    await Promise.resolve();
    expect([...listeners.keys()].sort()).toEqual([
      'recordings/student_user5/telemetry_sessions',
      'users/students/student_user5/telemetry_sessions',
    ]);
    listeners.get('recordings/student_user5/telemetry_sessions')!.cb(snap({ session_9: { chunks: { b: chunk(9) }, metadata: { b: meta(9) } } }));
    expect(onChange).not.toHaveBeenCalled();
    listeners.get('users/students/student_user5/telemetry_sessions')!.cb(snap({ session_1: { chunks: { a: chunk(1) }, metadata: { a: meta(1) } } }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((s: { id: string }) => s.id)).toEqual(['session_1', 'session_9']);
    off();
    expect(listeners.size).toBe(0);
  });
});

describe('the teacher is offered the move only while old recordings exist', () => {
  it('detects recordings or budgets left on any learner record', async () => {
    const { hasLegacyRecordings } = await import('@/core/legacyRecordings');
    expect(hasLegacyRecordings(null)).toBe(false);
    expect(hasLegacyRecordings({ student_user1: { isOnline: true, latestTelemetrySessionId: 'session_1' } })).toBe(false);
    expect(hasLegacyRecordings({ student_user1: { telemetry_sessions: {} } })).toBe(false);
    expect(hasLegacyRecordings({ student_user1: {}, student_user8: { telemetry_sessions: { session_1: { chunks: {} } } } })).toBe(true);
    expect(hasLegacyRecordings({ '8': { recorded_bytes: { meeting_1: { chunks: { a: 3 } } } } })).toBe(true);
  });

  it('the radar header shows the button from the roster it already listens to', () => {
    const heat = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'), 'utf-8');
    expect(heat).toContain('setLegacyRecordings(hasLegacyRecordings(pendingData));');
    expect(heat).toContain('<LegacyRecordingsButton visible={legacyRecordings} />');
    const button = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/LegacyRecordingsButton.tsx'), 'utf-8');
    expect(button).toContain("httpsCallable(functions, 'moveLegacyRecordings'");
    expect(button).toContain('if (!visible) return null;');
  });
});

describe('the rules give the recordings node the access the learner record gave them', () => {
  const rules = JSON.parse(readFileSync(resolve(__dirname, '../../../../database.rules.json'), 'utf-8')).rules;
  it('teacher reads all; a learner reads and writes only their own; nothing else may be stored there', () => {
    const node = rules.recordings;
    expect(node['.read']).toContain("auth.token.teacher == true");
    expect(node['.write']).toBeUndefined();
    expect(node.$studentId['.write']).toContain("$studentId == 'student_user' + auth.token.student_id");
    expect(node.$studentId['.write']).not.toContain('admin');
    expect(node.$studentId.$other['.validate']).toBe(false);
  });
});
