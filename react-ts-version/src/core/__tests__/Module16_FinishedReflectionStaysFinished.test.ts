import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * 8.10 of the spec-vs-software audit (28.9.2026), checked on the screen:
 * after "סיום" on meeting 8's reflection board the learner was sent to the
 * lobby; the teacher still had meeting 8 open, so the lobby sent them straight
 * back into it, the saved state still said "on the board", and the board
 * started again at step 1. The next "סיום" was refused by the rules (one save
 * per learner) and showed "לא הצלחנו לשמור הפעם".
 *
 * What the spec gives: PRD Module 16 §ג, "כפתור סיום מפגש סופי" — the board
 * ends with a final finish button. Module 14 §ג gives the quiet waiting screen
 * ("ממתין במסך סיום שקט"), written for a learner who finishes the compulsory
 * tasks early. The rest is the implementer's reading, not a written
 * requirement: the finished board leads to that quiet end screen, in place,
 * and stays there after a reload or a new sign-in; the saved reflection is
 * never written again.
 *
 * Module 17: the reflection goes to the server by one path, the offline queue
 * (queueSRLReflection). Once the queue holds it, it is safe and the learner
 * can finish; the queue removes it only on the server's Ack. The document is
 * exactly the research record of Module 16 §ב.
 */

const firestoreMock = vi.hoisted(() => ({
  setDoc: vi.fn(),
  getDocFromServer: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    setDoc: firestoreMock.setDoc,
    getDocFromServer: firestoreMock.getDocFromServer,
  };
});

const databaseMock = vi.hoisted(() => ({ update: vi.fn(() => Promise.resolve()) }));

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return { ...actual, update: databaseMock.update };
});

// The real queueSRLReflection, watched: every call is recorded, then passed on.
const queueWatch = vi.hoisted(() => ({ queueSRLReflection: vi.fn() }));

vi.mock('@/infrastructure/services/IndexedDBQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/IndexedDBQueue')>();
  return {
    ...actual,
    queueSRLReflection: (docId: string, reflection: Record<string, unknown>) => {
      queueWatch.queueSRLReflection(docId, reflection);
      return actual.queueSRLReflection(docId, reflection);
    },
  };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { submitSRLReflection, hasSavedSRLReflection, SRL_SERVER_CHECK_BUDGET_MS } from '../srlReflection';
import { indexedDBQueue, type QueuedAction } from '@/infrastructure/services/IndexedDBQueue';

const STUDENT = 'student_user12';
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

function startMeeting(n: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) {
  useAuthStore.setState({ user: { uid: STUDENT, name: 'user12' } as any, role: 'student', isAuthenticated: true });
  useStore.setState({ students: { [STUDENT]: { pedagogicalPath: 'green_path' } } as any });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.getState().initSession(n, false);
}

const RESULT = { effortLevel: 'MEDIUM' as const, strategies: ['undo'], persistenceIndex: 100, undoCount: 0, errorCount: 0, guessCount: 0 };

describe('8.10 — the finished reflection board leads to the quiet end screen', () => {
  it('finishing the board ends meeting 8', () => {
    startMeeting(8);
    useWorkspaceStore.getState().finishMeetingEarly();
    expect(useWorkspaceStore.getState().flowStatus).toBe('reflection');
    useWorkspaceStore.getState().finishReflection();
    expect(useWorkspaceStore.getState().flowStatus).toBe('sessionDone');
  });

  it('it touches nothing outside meeting 8 or before the board', () => {
    startMeeting(8);
    useWorkspaceStore.getState().finishReflection();
    expect(useWorkspaceStore.getState().flowStatus).toBe('task');
    startMeeting(3);
    useWorkspaceStore.getState().finishReflection();
    expect(useWorkspaceStore.getState().flowStatus).toBe('task');
  });

  it('a reload or a new sign-in restores the end screen, not the board', () => {
    startMeeting(8);
    useWorkspaceStore.getState().finishMeetingEarly();
    useWorkspaceStore.getState().finishReflection();
    const saved = { sessionNumber: 8, flowStatus: useWorkspaceStore.getState().flowStatus, standardTaskIdx: 6, openingScreenSeen: true };
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(saved as any);
    expect(useWorkspaceStore.getState().flowStatus).toBe('sessionDone');
  });

  it('the board no longer sends the learner to the lobby; it ends the meeting in place', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const block = page.slice(page.indexOf('<Session8ReflectionScreen'), page.indexOf("endScreen === 'sessionDone' && sessionNumber === 2"));
    expect(block).toContain('useWorkspaceStore.getState().finishReflection();');
    expect(block).not.toContain("navigate('/hub')");
  });

  it('a save that failed does not end the meeting: the board stays, the reflection is not lost', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    const block = page.slice(page.indexOf('<Session8ReflectionScreen'), page.indexOf("endScreen === 'sessionDone' && sessionNumber === 2"));
    const failed = block.slice(block.indexOf('if (!outcome.ok) {'), block.indexOf('finishReflection();'));
    expect(failed).toContain('return false;');
  });

  it('a learner whose reflection is already saved is not shown the board again', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toMatch(/sessionNumber !== 8 \|\| flowStatus !== 'reflection'\) return;[\s\S]{0,200}hasSavedSRLReflection\(currentStudentUid\(\)\)[\s\S]{0,120}finishReflection\(\)/);
  });

  it('meeting 8’s end screen does not promise a next station and does not praise twice', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain('const afterReflection = sessionNumber === 8;');
    expect(page).toContain('{withClosingSentence || afterReflection ? (');
    // Meetings 1–7 keep #125's line; meeting 8, the last station, has none.
    expect(page).toMatch(/\{!afterReflection && \(\s*<p className="text-xs text-ws-soft">כשהמורה תפתח את התחנה הבאה, נמשיך יחד\.<\/p>\s*\)\}/);
    expect(page.match(/כשהמורה תפתח את התחנה הבאה, נמשיך יחד\./g)).toHaveLength(1);
  });
});

/** Module 16 §ב, as isValidSRLReflectionDoc (firestore.rules) allows it: these ten fields, nothing else. */
const STORED_FIELDS = [
  'student_id', 'session_id', 'session_number', 'effort_level', 'selected_strategies',
  'persistence_index', 'undo_count', 'error_count', 'guess_count', 'submitted_at',
];

const STORED = {
  student_id: 12,
  session_id: 'session_08_student_12',
  session_number: 8,
  effort_level: 'MEDIUM',
  selected_strategies: ['UNDO_BUTTON'],
  persistence_index: 100,
  undo_count: 0,
  error_count: 0,
  guess_count: 0,
};

/** Firestore writes made to the reflection collection (telemetry from other tests may flush meanwhile). */
const reflectionWrites = () =>
  firestoreMock.setDoc.mock.calls.filter(([target]) => String((target as { path?: string } | undefined)?.path).startsWith('srl_reflections/'));

describe('Module 16/17 — the reflection is saved by one path, the offline queue', () => {
  beforeEach(async () => {
    // Nothing queued by the store tests above is flushed into these.
    await indexedDBQueue.clearAll();
    firestoreMock.setDoc.mockReset();
    firestoreMock.getDocFromServer.mockReset();
    databaseMock.update.mockClear();
    queueWatch.queueSRLReflection.mockReset();
    vi.spyOn(indexedDBQueue, 'getAll').mockResolvedValue([]);
    // The REFLECTION_SUBMITTED event goes to the same queue; here it is not stored.
    vi.spyOn(indexedDBQueue, 'enqueue').mockResolvedValue();
  });
  afterEach(() => {
    databaseMock.update.mockImplementation(() => Promise.resolve());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('the save goes through queueSRLReflection: the learner’s document, exactly the Module 16 fields, nothing written directly', async () => {
    const enqueue = vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: true });

    expect(queueWatch.queueSRLReflection).toHaveBeenCalledTimes(1);
    const [docId, record] = queueWatch.queueSRLReflection.mock.calls[0];
    expect(docId).toBe('session_08_student_12');
    expect(record).toEqual({ ...STORED, submitted_at: expect.any(Number) });
    expect(Object.keys(record).sort()).toEqual([...STORED_FIELDS].sort());

    // queueSRLReflection hands the queue that same object, untouched; the
    // idempotency key lives on the queue item, not in the document.
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('srl_reflections', 'session_08_student_12', record, 'srl_reflection_session_08_student_12');
    expect(enqueue.mock.calls[0][2]).toBe(record);

    // One path: no direct write, and the outcome is never read off the server.
    expect(reflectionWrites()).toEqual([]);
    expect(firestoreMock.getDocFromServer).not.toHaveBeenCalled();
  });

  it('queued is safe: the learner can finish while the network hangs', async () => {
    vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    const never = () => new Promise<never>(() => {});
    firestoreMock.setDoc.mockImplementation(never);
    firestoreMock.getDocFromServer.mockImplementation(never);
    // The RTDB live mirror resolves only when the server takes it; it is not awaited.
    databaseMock.update.mockImplementation(never);
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: true });
    expect(databaseMock.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reflection_completed: true }));
  });

  it('only a reflection the queue could not store is a failure: the board stays', async () => {
    vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockRejectedValue(new Error('no storage'));
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: false, reason: 'write_failed' });
    // Nothing reports it saved: no live mirror, no event, no second route.
    expect(databaseMock.update).not.toHaveBeenCalled();
    expect(indexedDBQueue.enqueue).not.toHaveBeenCalled();
    expect(reflectionWrites()).toEqual([]);
  });

  it('an identity that is not a pilot learner queues nothing', async () => {
    const enqueue = vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    await expect(submitSRLReflection('teacher', RESULT)).resolves.toEqual({ ok: false, reason: 'unknown_student' });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('reads the learner’s own document from the server, and any failure reads as "not saved"', async () => {
    firestoreMock.getDocFromServer.mockResolvedValueOnce({ exists: () => true });
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(true);
    expect(firestoreMock.getDocFromServer.mock.calls[0][0]).toEqual({ path: 'srl_reflections/session_08_student_12' });
    firestoreMock.getDocFromServer.mockResolvedValueOnce({ exists: () => false });
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(false);
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(false);
    await expect(hasSavedSRLReflection('teacher')).resolves.toBe(false);
  });

  it('a server read that hangs counts as "not saved" once its budget runs out', async () => {
    vi.useFakeTimers();
    firestoreMock.getDocFromServer.mockReturnValueOnce(new Promise<never>(() => {}));
    const pending = hasSavedSRLReflection(STUDENT);
    await vi.advanceTimersByTimeAsync(SRL_SERVER_CHECK_BUDGET_MS);
    await expect(pending).resolves.toBe(false);
  });

  it('a reflection waiting in the offline queue counts as saved, so a reload does not show the board again', async () => {
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    // The item as queueSRLReflection stores it.
    vi.spyOn(indexedDBQueue, 'getAll').mockResolvedValue([
      { firestoreDoc: { collection: 'srl_reflections', docId: 'session_08_student_12' }, payload: {}, timestamp: 1, idempotency_key: 'srl_reflection_session_08_student_12' } as QueuedAction,
    ]);
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(true);
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    await expect(hasSavedSRLReflection('student_user3')).resolves.toBe(false);
  });
});
