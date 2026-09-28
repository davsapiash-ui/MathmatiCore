import { describe, it, expect, vi, beforeEach } from 'vitest';
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
 * PRD Module 16 §ג: "כפתור סיום מפגש סופי". Module 14 §ג: a learner who is
 * done "ממתין במסך סיום שקט". So: the finished board leads to the quiet end
 * screen, in place, and stays there after a reload or a new sign-in; the
 * saved reflection is never written again.
 */

const firestoreMock = vi.hoisted(() => ({
  setDoc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    setDoc: firestoreMock.setDoc,
    getDoc: firestoreMock.getDoc,
  };
});

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  return { ...actual, update: vi.fn(() => Promise.resolve()) };
});

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { submitSRLReflection, hasSavedSRLReflection } from '../srlReflection';

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
    expect(page).toMatch(/\{!afterReflection && \(\s*<p className="text-xs text-ws-soft">כשהמורה תפתח את המפגש הבא, נמשיך יחד\.<\/p>/);
  });
});

describe('8.10 — the saved reflection is never overwritten', () => {
  beforeEach(() => {
    firestoreMock.setDoc.mockReset();
    firestoreMock.getDoc.mockReset();
  });

  it('a second save refused by the rules counts as saved, not as a failure', async () => {
    firestoreMock.setDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    firestoreMock.getDoc.mockResolvedValueOnce({ exists: () => true });
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: true, alreadySaved: true });
    expect(firestoreMock.setDoc).toHaveBeenCalledTimes(1);
  });

  it('a refused save with nothing saved is still reported as a failure', async () => {
    firestoreMock.setDoc.mockRejectedValueOnce(new Error('denied'));
    firestoreMock.getDoc.mockRejectedValueOnce(new Error('denied'));
    await expect(submitSRLReflection(STUDENT, RESULT)).resolves.toEqual({ ok: false, reason: 'write_failed' });
  });

  it('reads the learner’s own document, and any failure reads as "not saved"', async () => {
    firestoreMock.getDoc.mockResolvedValueOnce({ exists: () => true });
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(true);
    expect(firestoreMock.getDoc.mock.calls[0][0]).toEqual({ path: 'srl_reflections/session_08_student_12' });
    firestoreMock.getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(false);
    firestoreMock.getDoc.mockRejectedValueOnce(new Error('permission-denied'));
    await expect(hasSavedSRLReflection(STUDENT)).resolves.toBe(false);
    await expect(hasSavedSRLReflection('teacher')).resolves.toBe(false);
  });
});
