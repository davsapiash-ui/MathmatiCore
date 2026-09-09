/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

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
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
  Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });
}
(globalThis as any).localStorage = mockLocalStorage;
(globalThis as any).sessionStorage = mockLocalStorage;

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore, unifiedLogout } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { HelpOverlays } from '@/features/workspace/overlays/HelpOverlays';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';

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

  it('strictly isolates Socratic lifecycle from board locks: isBoardLocked stays false across open, lock, and close', () => {
    startMeeting1AtExercise3();
    const store = useWorkspaceStore.getState();
    expect(store.isBoardLocked).toBe(false);

    // 1. Open card
    store.openSocraticCard('hesitation_45s');
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    // 2. Trigger penalty lockout
    store.triggerSocraticPenaltyLockout('Test distractor hint');
    expect(useWorkspaceStore.getState().isSocraticCardLocked).toBe(true);
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    // 3. Explicit card lock/unlock
    store.lockSocraticCard(10000);
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    store.unlockSocraticCard();
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    store.clearSocraticPenaltyLockout();
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    // 4. Close help
    store.closeHelp();
    expect(useWorkspaceStore.getState().helpState).toBe('closed');
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    // 5. Board drop continues to work uninhibited
    useWorkspaceStore.getState().applyDrop({
      source: 'palette',
      sourcePlace: 'tens',
      target: { kind: 'column', place: 'tens' },
    });
    expect(useWorkspaceStore.getState().counts.tens).toBe(1);
  });

  it('renders interactive component tree: outer wrapper has pointer-events-none, card has pointer-events-auto, and board receives pointer/drag events unimpeded', () => {
    startMeeting1AtExercise3();
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    expect(useWorkspaceStore.getState().helpState).toBe('socratic');
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    const onBoardPointerDown = vi.fn();
    const onBoardPointerMove = vi.fn();
    const onBoardPointerUp = vi.fn();
    const onBoardClick = vi.fn();
    const onBlockDragStart = vi.fn();

    const { container, unmount } = render(
      React.createElement(
        'div',
        { id: 'workspace-viewport', style: { position: 'relative', width: '1200px', height: '800px' } },
        // Simulated board column container underneath the overlay
        React.createElement(
          'section',
          {
            'data-testid': 'place-value-board',
            'aria-label': 'טבלת ערך המקום',
            onPointerDown: onBoardPointerDown,
            onPointerMove: onBoardPointerMove,
            onPointerUp: onBoardPointerUp,
            onClick: onBoardClick,
            style: { position: 'absolute', inset: 0, zIndex: 1 },
          },
          React.createElement(
            'div',
            {
              'data-testid': 'place-column-units',
              id: 'column-units',
              style: { width: '200px', height: '300px' },
            },
            React.createElement(
              'div',
              {
                'data-testid': 'dienes-block-unit',
                draggable: true,
                onDragStart: onBlockDragStart,
              },
              'בלוק יחידה'
            )
          )
        ),
        // Socratic overlay
        React.createElement(HelpOverlays, null)
      )
    );

    // Assert Socratic overlay wrapper architecture
    const wrapper = screen.getByTestId('socratic-overlay-wrapper');
    expect(wrapper).toBeDefined();
    // a. Outer fullscreen/fixed wrapper MUST have pointer-events-none
    expect(wrapper.className).toContain('pointer-events-none');
    expect(wrapper.className).toContain('fixed');
    expect(wrapper.className).toContain('inset-0');
    // Docked floating near top-center
    expect(wrapper.className).toContain('justify-center');
    expect(wrapper.className).toContain('items-start');

    // b. Inner card container MUST have pointer-events-auto
    const card = screen.getByTestId('socratic-card');
    expect(card).toBeDefined();
    expect(card.className).toContain('pointer-events-auto');

    // c. Strictly NO invisible backdrop, scrim, or modal overlay element
    expect(container.querySelector('.bg-ws-ink\\/50.backdrop-blur-sm')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'חונך דיגיטלי' })).toBeNull();

    // d. Simulate pointer / drag interactions on the board beneath the Socratic card
    const columnElement = screen.getByTestId('place-column-units');
    const blockElement = screen.getByTestId('dienes-block-unit');

    fireEvent.pointerDown(columnElement, { clientX: 150, clientY: 200, bubbles: true });
    expect(onBoardPointerDown).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(columnElement, { clientX: 160, clientY: 210, bubbles: true });
    expect(onBoardPointerMove).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(columnElement, { clientX: 160, clientY: 210, bubbles: true });
    expect(onBoardPointerUp).toHaveBeenCalledTimes(1);

    fireEvent.click(columnElement, { bubbles: true });
    expect(onBoardClick).toHaveBeenCalledTimes(1);

    fireEvent.dragStart(blockElement, { bubbles: true });
    expect(onBlockDragStart).toHaveBeenCalledTimes(1);

    // Board drops function unblocked while card is open
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);
    act(() => {
      useWorkspaceStore.getState().applyDrop({
        source: 'palette',
        sourcePlace: 'units',
        target: { kind: 'column', place: 'units' },
      });
    });
    expect(useWorkspaceStore.getState().counts.units).toBe(1);

    // Card's own buttons remain interactive
    const closeBtn = screen.getByRole('button', { name: 'סגור חלונית עזרה' });
    expect(closeBtn).toBeDefined();
    act(() => {
      fireEvent.click(closeBtn);
    });

    expect(useWorkspaceStore.getState().helpState).toBe('closed');
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    unmount();
  });

  it('renders live PlaceValueBoard and HelpOverlays together: block palette drag and column drops work without interception', () => {
    startMeeting1AtExercise3();
    useWorkspaceStore.getState().openSocraticCard('hesitation_45s');
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    const onDropSpy = vi.fn();
    const { unmount } = render(
      React.createElement(
        DndContext,
        { onDragEnd: onDropSpy },
        React.createElement(
          'div',
          { style: { position: 'relative' } },
          React.createElement(PlaceValueBoard, null),
          React.createElement(HelpOverlays, null)
        )
      )
    );

    // Verify PlaceValueBoard elements are rendered
    const board = screen.getByLabelText('טבלת ערך המקום');
    expect(board).toBeDefined();

    // Verify Socratic wrapper has pointer-events-none and card has pointer-events-auto
    const wrapper = screen.getByTestId('socratic-overlay-wrapper');
    expect(wrapper.className).toContain('pointer-events-none');
    const card = screen.getByTestId('socratic-card');
    expect(card.className).toContain('pointer-events-auto');

    // Verify isBoardLocked is false so block palette is interactive
    expect(useWorkspaceStore.getState().isBoardLocked).toBe(false);

    // Verify dropping a block into PlaceValueBoard updates counts
    act(() => {
      useWorkspaceStore.getState().applyDrop({
        source: 'palette',
        sourcePlace: 'tens',
        target: { kind: 'column', place: 'tens' },
      });
    });
    expect(useWorkspaceStore.getState().counts.tens).toBe(1);

    unmount();
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
