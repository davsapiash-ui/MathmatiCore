import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Two live regressions from meeting 1, exercise 3 ("בניית מספרים עגולים"):
 *
 * 1. The coaching card opened and, from that moment on — before it was even
 *    visible, and after it had gone — blocks could no longer be dragged into
 *    the number house. PRD Module 12: the card is a non-modal side aid; the
 *    board, undo and keyboard stay fully live while it is open, and nothing
 *    about it may outlive it.
 *
 * 2. Signing out and back in restarted meeting 1 from exercise 1 instead of
 *    resuming the exercise the learner was on. PRD Module 17: progress is
 *    kept per meeting and restored on return.
 */

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => (key in mockStorage ? mockStorage[key] : null)),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    location: { hostname: 'test' },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf-8').replace(/\r\n/g, '\n');

function startMeeting1AtExercise3() {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  useWorkspaceStore.getState().initSession(1, false, 2);
}

describe('Module 12: the coaching card never blocks the number house', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    startMeeting1AtExercise3();
  });

  it('opening the card leaves an open keyboard open, and the board accepts drops while it is open', () => {
    expect(useWorkspaceStore.getState().keyboardState).toBe('UNLOCKED');
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    const s = useWorkspaceStore.getState();
    expect(s.helpState).toBe('socratic');
    expect(s.keyboardState).toBe('UNLOCKED');
    expect(s.isBoardLocked).toBe(false);

    s.applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    expect(useWorkspaceStore.getState().counts.hundreds).toBe(1);
    // The standard learner's answer row is not locked by the card either.
    expect(useWorkspaceStore.getState().isColumnInputLocked('tens', 400, 20, false)).toBe(false);
  });

  it('after the card is closed, drags into the number house work exactly as before', () => {
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    useWorkspaceStore.getState().closeHelp();
    const s = useWorkspaceStore.getState();
    expect(s.helpState).toBe('closed');
    expect(s.currentState).toBe('PROBLEM_ACTIVE');
    expect(s.keyboardState).toBe('UNLOCKED');

    s.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    s.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'board' as any, place: 'tens' } as any });
    expect(useWorkspaceStore.getState().counts.tens).toBe(2);
  });

  it('a Module 9 LOCKED keyboard becomes SOCRATIC_ONLY with the card and returns to LOCKED without a correct answer', () => {
    useWorkspaceStore.setState({ keyboardState: 'LOCKED' } as any);
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    expect(useWorkspaceStore.getState().keyboardState).toBe('SOCRATIC_ONLY');
    useWorkspaceStore.getState().closeHelp();
    expect(useWorkspaceStore.getState().keyboardState).toBe('LOCKED');
  });

  it('a session saved mid-card does not resume in SOCRATIC_ONLY with no card to answer', () => {
    useWorkspaceStore.getState().restoreSession({
      sessionNumber: 1,
      standardTaskIdx: 2,
      flowStatus: 'task',
      keyboardState: 'SOCRATIC_ONLY',
    });
    const s = useWorkspaceStore.getState();
    expect(s.helpState).toBe('closed');
    expect(s.keyboardState).toBe('LOCKED');
    expect(s.standardTaskIdx).toBe(2);
  });

  it('drag telemetry survives a student record that carries no traceData', () => {
    useStore.setState({
      students: {
        student_user1: { studentId: 'student_user1', classId: 'class_1', name: 'תלמיד 1' } as any,
      },
    } as any);
    expect(() =>
      useStore.getState().logSemanticEvent('student_user1', {
        action: 'drag_started',
        element: 'palette_block',
        context: 'User picked up a block',
        state_snapshot: '',
      } as any)
    ).not.toThrow();
    const trace = useStore.getState().students.student_user1.traceData?.semantic_trace;
    expect(Array.isArray(trace)).toBe(true);
    expect(trace).toHaveLength(1);
  });

  it('the workspace page never lets telemetry abort a drag (source pin)', () => {
    const src = read('features/workspace/StudentWorkspacePage.tsx');
    const start = src.indexOf('const handleDragStart = ');
    const body = src.slice(start, src.indexOf('const handleDragEnd = ', start));
    expect(body).toContain('try {');
    expect(body).toContain('logSemanticEvent');
    expect(body).toContain('} catch (err) {');
  });

  it('every help overlay releases the pointer as soon as it starts leaving (source pin)', () => {
    const src = read('features/workspace/overlays/HelpOverlays.tsx');
    const exits = src.match(/exit=\{\{[^}]*\}\}/g) || [];
    expect(exits.length).toBeGreaterThanOrEqual(4);
    for (const exit of exits) {
      expect(exit).toContain("pointerEvents: 'none'");
    }
  });
});

describe('Module 17: signing out keeps the meeting where the learner left it', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    useWorkspaceStore.getState().resetWorkspace();
  });

  it('logout tears the sync down before the workspace is reset, so the blank state is never written over saved progress', () => {
    // A signed-in learner: the auth subscription starts the workspace → RTDB sync.
    useAuthStore.getState().setUser({ student_id: 1, role: 'student' } as any, 'student');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    (firebaseSyncService as any).isInitialLoad = false;

    useWorkspaceStore.getState().initSession(1, false, 2);
    useWorkspaceStore.setState({ standardTaskIdx: 2 } as any);
    const uid = useAuthStore.getState().user?.uid as string;
    expect(uid).toBeTruthy();
    const saved = firebaseSyncService.getLocalSessionProgress(uid);
    expect(saved?.standardTaskIdx).toBe(2);

    const localSave = vi.spyOn(firebaseSyncService, 'saveSessionProgressLocally');
    localSave.mockClear();

    unifiedLogout();

    // resetWorkspace ran (blank workspace) …
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(0);
    // … but the sync was already gone, so nothing pushed that blank state.
    expect(localSave).not.toHaveBeenCalled();
    expect(firebaseSyncService.getLocalSessionProgress(uid)?.standardTaskIdx).toBe(2);
    localSave.mockRestore();
  });

  it('the auth store is cleared before the workspace is reset (source pin)', () => {
    const src = read('application/useAuthStore.ts');
    const fn = src.slice(src.indexOf('export function unifiedLogout()'));
    const authCleared = fn.indexOf('useAuthStore.setState((state) =>');
    const workspaceReset = fn.indexOf('resetWorkspace?.()');
    expect(authCleared).toBeGreaterThan(-1);
    expect(workspaceReset).toBeGreaterThan(-1);
    expect(authCleared).toBeLessThan(workspaceReset);
  });

  it('the workspace waits for the learner record before starting a meeting from scratch (source pin)', () => {
    const src = read('features/workspace/StudentWorkspacePage.tsx');
    expect(src).toContain('FIREBASE_RESTORE_GRACE_MS');
    const start = src.indexOf('if (firebaseLoaded) {\n      runInit();');
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('return () => {', start));
    // The only immediate init path without a record is the cached restore.
    expect(block).toContain('restoreSession(cached)');
    expect(block).not.toContain('// Fast init fallback');
    expect(block).toContain('setTimeout(');
  });
});
