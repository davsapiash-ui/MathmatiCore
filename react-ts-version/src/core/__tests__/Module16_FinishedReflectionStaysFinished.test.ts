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
 * Module 17: a reflection write that fails is buffered in the offline queue,
 * never discarded, and it is the same document either way (Module 16 §ב).
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

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return { ...actual, update: vi.fn(() => Promise.resolve()) };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { submitSRLReflection, hasSavedSRLReflection, SRL_DIRECT_WRITE_BUDGET_MS } from '../srlReflection';
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

  it('meeting 8’s end screen does not promise a next meeting and does not praise twice', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain('const afterReflection = sessionNumber === 8;');
    expect(page).toContain('{withClosingSentence || afterReflection ? (');
    // Only the structure: the rest of the sentence is another PR's wording (#125).
    expect(page).toMatch(/\{!afterReflection && \(\s*<p className="text-xs text-ws-soft">כשהמורה תפתח את/);
  });
});

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

describe('8.10 — the saved reflection is never overwritten, and never lost', () => {
  beforeEach(() => {
    firestoreMock.setDoc.mockReset();
    firestoreMock.getDocFromServer.mockReset();
    vi.spyOn(indexedDBQueue, 'getAll').mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a second save refused by the rules counts as saved, not as a failure', async () => {
    const enqueue = vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    firestoreMock.setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    firestoreMock.getDocFromServer.mockResolvedValueOnce({ exists: () => true });
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: true, alreadySaved: true });
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a refused save with nothing saved goes to the offline queue: the same document, create-only', async () => {
    const enqueue = vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('unavailable'));
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: true, queued: true });
    const direct = firestoreMock.setDoc.mock.calls[0][1];
    const [collection, docId, queued, key, options] = enqueue.mock.calls[0];
    expect([collection, docId, key, options]).toEqual(['srl_reflections', 'session_08_student_12', 'srl_session_08_student_12', { createOnly: true }]);
    // Module 16 §ב: exactly the stored fields, identical on both routes.
    expect(queued).toBe(direct);
    expect(queued).toEqual({ ...STORED, submitted_at: expect.any(Number) });
  });

  it('a write that hangs (offline) is queued after the budget, so the learner can finish', async () => {
    vi.useFakeTimers();
    const enqueue = vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockResolvedValue();
    firestoreMock.setDoc.mockReturnValueOnce(new Promise(() => {}));
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    const pending = submitSRLReflection(STUDENT, RESULT);
    await vi.advanceTimersByTimeAsync(SRL_DIRECT_WRITE_BUDGET_MS);
    await expect(pending).resolves.toEqual({ ok: true, queued: true });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('only when it cannot be queued either is it reported as a failure', async () => {
    vi.spyOn(indexedDBQueue, 'enqueueFirestoreDoc').mockRejectedValue(new Error('no storage'));
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('denied'));
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('denied'));
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: false, reason: 'write_failed' });
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

  it('a reflection waiting in the offline queue counts as saved, so a reload does not show the board again', async () => {
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(indexedDBQueue, 'getAll').mockResolvedValue([
      { firestoreDoc: { collection: 'srl_reflections', docId: 'session_08_student_12', createOnly: true }, payload: {}, timestamp: 1 } as QueuedAction,
    ]);
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(true);
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    await expect(hasSavedSRLReflection('student_user3')).resolves.toBe(false);
  });
});

describe('Module 17 — the queue delivers a create-only document whole, once', () => {
  const item = (): QueuedAction => ({
    firestoreDoc: { collection: 'srl_reflections', docId: 'session_08_student_12', createOnly: true },
    payload: { ...STORED, submitted_at: 1 },
    timestamp: 1,
  });
  const deliver = (i: QueuedAction) => (indexedDBQueue as unknown as { deliver(i: QueuedAction): Promise<boolean> }).deliver(i);

  beforeEach(() => {
    firestoreMock.setDoc.mockReset();
    firestoreMock.getDocFromServer.mockReset();
  });

  it('writes the stored payload as is, without merge', async () => {
    firestoreMock.setDoc.mockResolvedValueOnce(undefined);
    await expect(deliver(item())).resolves.toBe(true);
    expect(firestoreMock.setDoc.mock.calls[0][1]).toEqual({ ...STORED, submitted_at: 1 });
    expect(firestoreMock.setDoc.mock.calls[0]).toHaveLength(2);
  });

  it('a refusal because the document is already on the server is the Ack', async () => {
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('permission-denied'));
    firestoreMock.getDocFromServer.mockResolvedValueOnce({ exists: () => true });
    await expect(deliver(item())).resolves.toBe(true);
  });

  it('any other failure keeps the item in the queue', async () => {
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('unavailable'));
    firestoreMock.getDocFromServer.mockRejectedValueOnce(new Error('offline'));
    await expect(deliver(item())).rejects.toThrow('unavailable');
  });
});
