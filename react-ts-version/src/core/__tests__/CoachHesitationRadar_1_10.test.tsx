// @vitest-environment jsdom
/**
 * The hesitation stage of the coaching card — owner's decisions of 1.10.2026:
 *  - D2: a read-aloud press, work in the addition grid, and typing or sending
 *    in the chat are activity: they restart the 45-second count. A click
 *    anywhere else still is not (Module 10 §ב).
 *  - D3: while the child's call to the teacher is open, no hesitation card.
 *  - D7: with the enhanced profile, the addition grid opens only in an
 *    addition exercise — not in station 3's representations, not in a
 *    subtraction.
 * And HESITATION_DETECTED names the column the card is about (the focused
 * box, else the first unsolved column) — it used to be the units whenever no
 * box was focused.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/ThrottledRtdbWriter');
  return { ...actual, throttledRtdbUpdate: () => Promise.resolve() };
});
const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return { ...actual, emitTelemetry: (e: any) => { emitted.push(e); return Promise.resolve(); } };
});
vi.mock('@/core/hesitationCalibration', () => ({
  getHesitationThresholdSeconds: () => 45,
  useHesitationThresholdSeconds: () => 45,
}));

import {
  useCognitiveHesitationRadar,
  isLearnerActivityEvent,
  READ_ALOUD_SELECTOR,
  ADDITION_GRID_SELECTOR,
  TEACHER_CHAT_SELECTOR,
} from '@/application/useCognitiveHesitationRadar';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS } from '@/core/placeValue';

const ws = () => useWorkspaceStore.getState();
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const task = (meeting: 3 | 4 | 5, id: string): SessionTask => {
  const t = (getSessionTasks(meeting, 'green_path') ?? []).find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};

function load(meeting: number, t: SessionTask, extra: Record<string, unknown> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user3', student_id: 3 } } as any);
  useWorkspaceStore.setState({
    sessionNumber: meeting, dynamicTasks: [t], standardTaskIdx: 0, flowStatus: 'task', awaitingNext: false,
    helpState: 'closed', currentState: 'PROBLEM_ACTIVE', ...extra,
  } as any);
  emitted.length = 0;
}

/** The radar as the page mounts it: at 45 seconds it asks for the card (StudentWorkspacePage). */
const mountRadar = () =>
  renderHook(() => useCognitiveHesitationRadar({ isActive: true, onHesitationDetected: () => ws().setKeyboardSocratic() }));

function control(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}
const click = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const typeIn = (el: Element) => el.dispatchEvent(new Event('input', { bubbles: true }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('D2 — read-aloud, the addition grid and the chat are activity', () => {
  beforeEach(() => load(4, task(4, 's4_g_t1')));

  it('a read-aloud press at second 40 restarts the count: no card at 45, a card 45 seconds after the press', () => {
    const host = control('<button aria-label="הקראה בקול"><svg></svg></button>');
    mountRadar();
    vi.advanceTimersByTime(40_000);
    click(host.querySelector('svg')!);
    vi.advanceTimersByTime(10_000);
    expect(ws().helpState).toBe('closed');
    vi.advanceTimersByTime(35_000);
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('hesitation_45s');
  });

  it('a click in the addition grid, and typing or a button in the chat, restart it too', () => {
    const grid = control('<div data-testid="adaptive-addition-grid"><button>7</button></div>');
    const chat = control('<div role="dialog" aria-label="הודעות עם המורה"><input aria-label="הודעה למורה"/><button>שליחה</button></div>');
    mountRadar();
    vi.advanceTimersByTime(40_000);
    click(grid.querySelector('button')!);
    vi.advanceTimersByTime(40_000);
    typeIn(chat.querySelector('input')!);
    vi.advanceTimersByTime(40_000);
    click(chat.querySelector('button')!);
    vi.advanceTimersByTime(40_000);
    expect(ws().helpState).toBe('closed');
    vi.advanceTimersByTime(5_000);
    expect(ws().helpState).toBe('socratic');
  });

  it('a click anywhere else is no activity (Module 10 §ב)', () => {
    const other = control('<button aria-label="ממשיכים">ממשיכים</button><p>טקסט</p>');
    mountRadar();
    vi.advanceTimersByTime(40_000);
    click(other.querySelector('p')!);
    click(other.querySelector('button')!);
    vi.advanceTimersByTime(5_000);
    expect(ws().helpState).toBe('socratic');
  });

  it('the controls are found by the names they render with', () => {
    expect(src('presentation/design-system/UdlSpeechButton.tsx')).toContain('aria-label="הקראה בקול"');
    expect(src('features/workspace/board/AdaptiveAdditionGrid.tsx')).toContain('data-testid="adaptive-addition-grid"');
    const chat = src('features/workspace/overlays/StudentChatOverlay.tsx');
    expect(chat).toContain('role="dialog"');
    expect(chat).toContain('aria-label="הודעות עם המורה"');
    expect(READ_ALOUD_SELECTOR).toBe('button[aria-label="הקראה בקול"]');
    expect(ADDITION_GRID_SELECTOR).toBe('[data-testid="adaptive-addition-grid"]');
    expect(TEACHER_CHAT_SELECTOR).toBe('[role="dialog"][aria-label="הודעות עם המורה"]');
    // A key press in the chat is no activity by itself — the typing is.
    const chatHost = control('<div role="dialog" aria-label="הודעות עם המורה"><input/><button aria-label="סגירת חלון הצ\'אט">✕</button></div>');
    expect(isLearnerActivityEvent({ type: 'keydown', target: chatHost.querySelector('input') })).toBe(false);
    // Closing the chat or the grid is no work either.
    expect(isLearnerActivityEvent({ type: 'click', target: chatHost.querySelector('button') })).toBe(false);
    const gridHost = control('<div data-testid="adaptive-addition-grid"><button aria-label="סגירת לוח החיבור">✕</button></div>');
    expect(isLearnerActivityEvent({ type: 'click', target: gridHost.querySelector('button') })).toBe(false);
    expect(src('features/workspace/board/AdaptiveAdditionGrid.tsx')).toContain('aria-label={`סגירת ${ADDITION_GRID_HE}`}');
    expect(src('features/workspace/overlays/StudentChatOverlay.tsx')).toContain('aria-label="סגירת חלון הצ\'אט"');
  });
});

describe('D3 — the call to the teacher is open: no hesitation card', () => {
  it('45 seconds pass with the call open: no card', () => {
    load(4, task(4, 's4_g_t1'), { hasRequestedBasicHelp: true });
    mountRadar();
    vi.advanceTimersByTime(46_000);
    expect(ws().helpState).toBe('closed');
  });

  it('the call taken back: the next pause brings the card', () => {
    load(4, task(4, 's4_g_t1'));
    mountRadar();
    vi.advanceTimersByTime(46_000);
    expect(ws().helpState).toBe('socratic');
  });
});

describe('HESITATION_DETECTED names the card\'s column', () => {
  it('no box focused: the first unsolved column (1,245 + 328 with the units written: the tens)', () => {
    load(4, task(4, 's4_g_t1'), { counts: { ...EMPTY_COUNTS, thousands: 1, hundreds: 5, tens: 7, units: 3 } });
    ws().setAnswerDigit('units', '3');
    emitted.length = 0;
    mountRadar();
    vi.advanceTimersByTime(45_000);
    const ev = emitted.find((e) => e.event_type === 'HESITATION_DETECTED');
    expect(ev?.column_index).toBe(1);
    expect(ws().socraticCardPlace).toBe('tens');
  });

  it('a focused box: that box', () => {
    load(4, task(4, 's4_g_t1'));
    ws().setFocusedPlace('hundreds');
    mountRadar();
    vi.advanceTimersByTime(45_000);
    expect(emitted.find((e) => e.event_type === 'HESITATION_DETECTED')?.column_index).toBe(2);
  });
});

describe('D7 — the addition grid opens only in an addition exercise', () => {
  const enhanced = { activeSupportProfileId: 'enhanced_cognitive_support' };

  it('station 4, addition: it opens at 30 seconds', () => {
    load(4, task(4, 's4_g_t1'), enhanced);
    mountRadar();
    vi.advanceTimersByTime(30_000);
    expect(ws().isAdditionHelperOpen).toBe(true);
  });

  /**
   * Counts the radar's calls to the store's openAdditionHelper, which still
   * runs. The store logs one ADAPTIVE_GRID_TOGGLED {opened} per call that
   * opens the grid (useWorkspaceStore.openAdditionHelper), so the number of
   * calls is the number of "opened" events. (The store holds the real
   * emitTelemetry in this file — the mock above reaches the hook only.)
   */
  const spyOnGridOpen = () => {
    const real = ws().openAdditionHelper;
    const calls = vi.fn((...args: Parameters<typeof real>) => real(...args));
    useWorkspaceStore.setState({ openAdditionHelper: calls } as any);
    return calls;
  };

  it('station 4, addition, the coaching card open: 30 seconds change nothing and log nothing', () => {
    // While the card is open the grid is not shown (StudentWorkspacePage), so
    // it must not be "opened" behind it: no state, no ADAPTIVE_GRID_TOGGLED.
    load(4, task(4, 's4_g_t1'), { ...enhanced, helpState: 'socratic' });
    mountRadar();
    const opens = spyOnGridOpen();
    vi.advanceTimersByTime(31_000);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(ws().additionHelperOffered).toBe(false);
    expect(opens).not.toHaveBeenCalled();
  });

  it('…deferred, not dropped: when the card closes, the grid opens, with exactly one "opened" event', async () => {
    const { act } = await import('@testing-library/react');
    load(4, task(4, 's4_g_t1'), { ...enhanced, helpState: 'socratic' });
    mountRadar();
    const opens = spyOnGridOpen();
    vi.advanceTimersByTime(31_000);
    expect(ws().isAdditionHelperOpen).toBe(false);
    act(() => { useWorkspaceStore.setState({ helpState: 'closed' } as any); });
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(ws().additionHelperOffered).toBe(true);
    expect(opens).toHaveBeenCalledTimes(1);
    // the card opening and closing again does not open or log a second time
    act(() => { useWorkspaceStore.setState({ helpState: 'socratic' } as any); });
    act(() => { useWorkspaceStore.setState({ helpState: 'closed' } as any); });
    expect(opens).toHaveBeenCalledTimes(1);
  });

  it('…and not at all if a cognitive action came in between', async () => {
    const { act } = await import('@testing-library/react');
    load(4, task(4, 's4_g_t1'), { ...enhanced, helpState: 'socratic' });
    mountRadar();
    const opens = spyOnGridOpen();
    vi.advanceTimersByTime(31_000);
    // the learner places a block while the card is open: the count restarts
    act(() => { useWorkspaceStore.setState({ counts: { units: 1, tens: 0, hundreds: 0, thousands: 0 } } as any); });
    act(() => { useWorkspaceStore.setState({ helpState: 'closed' } as any); });
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(opens).not.toHaveBeenCalled();
  });

  it('a card closed before 30 seconds defers nothing: the grid opens at 30 seconds as usual', async () => {
    const { act } = await import('@testing-library/react');
    load(4, task(4, 's4_g_t1'), { ...enhanced, helpState: 'socratic' });
    mountRadar();
    const opens = spyOnGridOpen();
    vi.advanceTimersByTime(10_000);
    act(() => { useWorkspaceStore.setState({ helpState: 'closed' } as any); });
    expect(ws().isAdditionHelperOpen).toBe(false);
    vi.advanceTimersByTime(21_000);
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(opens).toHaveBeenCalledTimes(1);
  });

  it('station 5, subtraction: it does not', () => {
    load(5, task(5, 's5_g_t1'), enhanced);
    mountRadar();
    vi.advanceTimersByTime(31_000);
    expect(ws().isAdditionHelperOpen).toBe(false);
  });

  it('station 3, a representation: it does not', () => {
    load(3, task(3, 's3_g_t1'), enhanced);
    mountRadar();
    vi.advanceTimersByTime(31_000);
    expect(ws().isAdditionHelperOpen).toBe(false);
  });

  it('the page shows the grid and its return tab only in an addition exercise', () => {
    const page = src('features/workspace/StudentWorkspacePage.tsx');
    expect(page).toContain('const isAdditionOnScreen = useWorkspaceStore((s) => isAdditionExercise(selectStandardTask(s)));');
    expect(page).toContain('&& isAdditionOnScreen;');
  });
});
