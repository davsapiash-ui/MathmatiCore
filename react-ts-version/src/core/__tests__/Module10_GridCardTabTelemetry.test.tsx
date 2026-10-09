/**
 * @vitest-environment jsdom
 */
/**
 * PRD Module 10 (§א, §ב and its Strict Developer Instructions) — the adaptive
 * addition grid, the coaching card, the grid's "לוח חיבור" tab and the
 * ADAPTIVE_GRID_TOGGLED log, on the real StudentWorkspacePage with the real
 * coaching card, chat, grid, stores and hesitation radar; only the screens
 * around them are stubs.
 *
 *  1. "כשכרטיס החניכה נפתח, הלוח מתקפל אוטומטית": the card's opening closes
 *     the grid; its tab takes its place. Nothing else closes it but the X.
 *  2. The tab exists only after the grid was opened once in the meeting at
 *     the 30-second stage — never for a grid that came due under an open card
 *     and was never shown.
 *  3. A press on the tab brings the grid back. The PRD names no fold of the
 *     card: the card stays as it is.
 *  4. The tab's place is the grid's place: "הפינה השמאלית התחתונה של מרחב
 *     העבודה" — the left end of the representations zone's RTL row, at its
 *     bottom.
 *  5. Every open and close the learner sees is logged once as
 *     ADAPTIVE_GRID_TOGGLED {action, source} (Appendix A §3).
 *
 * (Not saved with the snapshot: ProfileBankHelpGrid_28_9.test.ts, X60.)
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const cls = vi.hoisted(() => ({
  session: { active: true, status: 'active', sessionNumber: 4 as number | null, startedAt: 1, isLoaded: true },
}));
const emitted = vi.hoisted(() => [] as any[]);

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path?: string) => ({ path }),
  onValue: () => () => {},
  update: () => Promise.resolve(),
  set: () => Promise.resolve(),
  get: () => Promise.resolve({ exists: () => false, val: () => null }),
  push: () => ({ key: 'k' }),
  onDisconnect: () => ({ set: () => Promise.resolve(), cancel: () => Promise.resolve() }),
  serverTimestamp: () => 0,
  runTransaction: () => Promise.resolve(),
}));
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  auth: { currentUser: null },
  authReady: Promise.resolve(false), // no screen recording in this test
  fetchServerClockOffset: async () => 0,
  serverNow: () => Date.now(),
}));
vi.mock('@/infrastructure/services/FirebaseSyncService', () => ({
  firebaseSyncService: {
    getLocalSessionProgress: () => null,
    clearLocalSessionProgress: () => {},
    syncHighestCompletedMeeting: () => Promise.resolve(),
    syncQMatrix: () => Promise.resolve(),
    mayWriteWorkspaceToRecord: () => true,
  },
  emitTelemetry: (e: any) => { emitted.push(e); return Promise.resolve(); },
  resolveLearningPath: () => null,
}));
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/services/ThrottledRtdbWriter')>()),
  throttledRtdbUpdate: () => Promise.resolve(),
}));
vi.mock('@/core/hesitationCalibration', () => ({
  getHesitationThresholdSeconds: () => 45,
  useHesitationThresholdSeconds: () => 45,
}));
vi.mock('@/application/useActiveClassSession', () => ({ useActiveClassSession: () => cls.session }));
vi.mock('rrweb', () => ({ record: () => () => {} }));
vi.mock('@/presentation/components/student/Meeting2WaitingScreen', () => ({ Meeting2WaitingScreen: () => null }));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <button type="button" data-testid="speech" data-text={text} />,
}));
vi.mock('@/features/workspace/tasks/TaskCard', () => ({ TaskCard: () => <div data-testid="task-card" /> }));
vi.mock('@/features/workspace/WorkspaceTopbar', () => ({ WorkspaceTopbar: () => null }));
vi.mock('@/features/workspace/board/PlaceValueBoard', () => ({ PlaceValueBoard: () => null }));
vi.mock('@/features/workspace/board/DienesBlock', () => ({ DienesBlock: () => null }));
vi.mock('@/features/workspace/overlays/FeedbackToast', () => ({ FeedbackToast: () => null }));
vi.mock('@/features/workspace/ClosingSentence', () => ({ ClosingSentence: () => null }));
vi.mock('@/features/workspace/StationOpening', () => ({ StationOpening: () => null }));
vi.mock('@/features/workspace/overlays/ReinforcementOrChallengeScreen', () => ({ ReinforcementOrChallengeScreen: () => null }));
vi.mock('@/presentation/components/student/Session8ReflectionScreen', () => ({ Session8ReflectionScreen: () => null, REFLECTION_TEXT_HE: {} }));
vi.mock('@/presentation/components/student/ProjectorWaitingScreen', () => ({ ProjectorWaitingScreen: () => null }));
vi.mock('@/presentation/components/student/SessionPausedOverlay', () => ({ SessionPausedOverlay: () => null }));
vi.mock('@/presentation/components/student/SessionClosedOverlay', () => ({ SessionClosedOverlay: () => null }));

import { StudentWorkspacePage } from '@/features/workspace/StudentWorkspacePage';
import { useWorkspaceStore, isAdditionExercise, selectStandardTask, getActiveTasks } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { CARD_TAB_HE } from '@/features/workspace/overlays/StudentChatOverlay';

// Each test renders the whole workspace page; the first also loads it. On a
// busy machine that runs past the 5-second default (Battery3 does the same).
vi.setConfig({ testTimeout: 30_000 });

const STUDENT = 'student_user5';
const ws = () => useWorkspaceStore.getState();
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const gridEl = () => screen.queryByTestId('adaptive-addition-grid');
/** A closed grid fades out under AnimatePresence: still in the DOM on its way out, no longer the learner's. */
const gridLeaving = () => !ws().isAdditionHelperOpen;
const cardLeaving = () => ws().helpState !== 'socratic';
/** The grid is on the screen: mounted and not on its way out. */
const gridShown = () => gridEl() !== null && !gridLeaving();
const gridTab = () => screen.queryByTestId('addition-grid-tab');
const cardEl = () => screen.queryByTestId('socratic-card');
/** The card is on the screen: mounted, its column not on its way out, and not folded under the chat. */
const cardShown = () => { const c = cardEl(); return c !== null && !cardLeaving() && c.getAttribute('data-folded') === null; };
const cardTabs = () => screen.queryAllByTestId('socratic-card-tab');
const column = () => screen.getByTestId('socratic-side-panel');
const chat = () => screen.queryByRole('dialog', { name: 'הודעות עם המורה' });
const gridEvents = () => emitted.filter((e) => e.event_type === 'ADAPTIVE_GRID_TOGGLED').map((e) => `${e.details.action}:${e.details.source}`);

async function openMeeting4(profile: string | null = 'enhanced_cognitive_support') {
  act(() => {
    useStore.setState({
      students: { [STUDENT]: { highestCompletedMeeting: 3, teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'green_path' } } as any,
      firebaseLoaded: true,
    });
  });
  render(
    <MemoryRouter initialEntries={['/workspace?meeting=4']}>
      <StudentWorkspacePage />
    </MemoryRouter>
  );
  // The page starts the meeting once its learner record and class session are read.
  for (let i = 0; i < 20 && ws().sessionNumber !== 4; i++) await tick(50);
  // PRD 14 §ב: the station opens on its opening screen; "מתחילים" leads to the task.
  act(() => { ws().markOpeningScreenSeen(); });
  act(() => { useWorkspaceStore.setState({ activeSupportProfileId: profile } as any); });
  expect(ws().sessionNumber).toBe(4);
  expect(ws().flowStatus).toBe('task');
  expect(isAdditionExercise(selectStandardTask(ws()))).toBe(true);
  emitted.length = 0;
}

/** A coaching card, settled on its static text (the engine is offline here). */
async function openCard() {
  act(() => { ws().openSocraticCard('hesitation_45s'); });
  await tick();
  expect(ws().helpState).toBe('socratic');
  expect(ws().socraticPending).toBe(false);
}
/** The system opened the grid (the 30-second stage). */
const systemOpensGrid = () => act(() => { ws().openAdditionHelper(); });
const toggleChat = () => act(() => { document.dispatchEvent(new CustomEvent('toggle-chat')); });
/** The index of an exercise of the meeting that is not an addition (s4_g_t7, a small change). */
const nonAdditionIdx = () => getActiveTasks(ws()).findIndex((t) => !isAdditionExercise(t));
/** The learner's own X on the grid, once its 2-second fade-in lets it take clicks. */
async function closeGridWithX() {
  await tick(2500);
  fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
  await tick(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no scrollIntoView (the chat scrolls to its last message)
  Element.prototype.scrollIntoView = () => {};
  emitted.length = 0;
  cls.session = { ...cls.session, sessionNumber: 4 };
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ sessionNumber: 3, flowStatus: 'task' } as any);
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  useStudentChatOpen.setState({ open: false });
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  vi.spyOn(SocraticEngine, 'prefetchSessionHints').mockImplementation(() => undefined as any);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PRD 10 §א: the coaching card\'s opening folds the grid', () => {
  it('the grid open, the card opens: the grid closes and leaves the screen, and its tab stands in its place', async () => {
    await openMeeting4();
    systemOpensGrid();
    expect(gridShown()).toBe(true);
    expect(gridTab()).toBeNull();

    await openCard();
    expect(cardShown()).toBe(true);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridShown()).toBe(false);
    await tick(1000);
    expect(gridEl()).toBeNull();
    const tab = gridTab()!;
    expect(tab).not.toBeNull();
    expect(tab.textContent).toBe('לוח החיבור');
    expect(tab.getAttribute('aria-label')).toBe('הצגה חוזרת של לוח החיבור');
    // the card is not folded, and there is no card tab
    expect(cardTabs()).toHaveLength(0);
    expect(column().className).not.toContain('w-16');
  });

  it('the card closing does not bring the grid back: only the tab does', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    act(() => { ws().closeHelp(); });
    await tick(1000);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridShown()).toBe(false);
    expect(gridTab()).not.toBeNull();
  });

  it('a card that does not open (the 15-second lock) folds nothing', async () => {
    await openMeeting4();
    systemOpensGrid();
    act(() => { ws().lockSocraticCard(30_000); });
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    expect(ws().helpState).toBe('closed');
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(gridShown()).toBe(true);
  });
});

describe('PRD 10 §א: the tab only after the 30-second stage has shown the grid', () => {
  it('no tab before the grid was ever shown, with or without the card; the learner cannot open it either', async () => {
    await openMeeting4();
    expect(gridTab()).toBeNull();
    await openCard();
    expect(gridTab()).toBeNull();
    act(() => { ws().openAdditionHelper('learner'); });
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridEvents()).toEqual([]);
  });

  it('30 seconds of hesitation under an open card: no grid, no tab, no event; the grid opens when the card closes, and has its tab once closed', async () => {
    await openMeeting4();
    await openCard();
    // a cognitive action restarts the count, so the 30 seconds run under the card
    act(() => { useWorkspaceStore.setState({ counts: { ...ws().counts, units: ws().counts.units + 1 } } as any); });
    await tick(31_000);
    expect(ws().helpState).toBe('socratic');
    expect(gridEl()).toBeNull();
    expect(gridTab()).toBeNull();
    expect(gridEvents()).toEqual([]);

    act(() => { ws().closeHelp(); });
    expect(gridShown()).toBe(true);
    expect(gridTab()).toBeNull();
    expect(gridEvents()).toEqual(['opened:hesitation_30s']);

    await closeGridWithX();
    expect(gridTab()).not.toBeNull();
    expect(gridEvents()).toEqual(['opened:hesitation_30s', 'closed:hesitation_30s']);
  });
});

describe('PRD 10 §א: the tab brings the grid back; the card stays as it is', () => {
  it('pressed while the card is open: the grid opens (the learner\'s opening), the card stays shown, no card tab', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    emitted.length = 0;
    fireEvent.click(gridTab()!);
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(ws().additionHelperSource).toBe('learner');
    expect(gridShown()).toBe(true);
    expect(gridTab()).toBeNull();
    expect(cardShown()).toBe(true);
    expect(cardTabs()).toHaveLength(0);
    expect(gridEvents()).toEqual(['opened:learner']);
    // the grid in the representations zone, the card in the task zone: neither covers the other
    expect(screen.getByTestId('representations-zone').contains(gridEl())).toBe(true);
    expect(screen.getByTestId('task-zone').contains(cardEl())).toBe(true);
  });

  it('pressed with no card: the grid opens; its X closes it, and the tab is back', async () => {
    await openMeeting4();
    systemOpensGrid();
    await closeGridWithX();
    emitted.length = 0;
    fireEvent.click(gridTab()!);
    expect(gridShown()).toBe(true);
    await closeGridWithX();
    expect(gridTab()).not.toBeNull();
    expect(gridEvents()).toEqual(['opened:learner', 'closed:learner']);
  });
});

describe('PRD 10 §א: the grid and its tab at the bottom-left corner of the workspace', () => {
  it('both are the last item of the representations zone\'s RTL row (its left end), aligned to its bottom', async () => {
    await openMeeting4();
    const zone = screen.getByTestId('representations-zone');
    systemOpensGrid();
    expect(zone.lastElementChild).toBe(gridEl());
    expect(gridEl()!.className).toMatch(/(^|\s)self-end(\s|$)/);
    await closeGridWithX();
    const slot = screen.getByTestId('addition-grid-tab-slot');
    expect(zone.lastElementChild).toBe(slot);
    expect(slot.className).toMatch(/(^|\s)self-end(\s|$)/);
    expect(slot.className).not.toMatch(/(?<![-\w])(fixed|absolute)(?![-\w])/);
  });
});

describe('PRD 10 §ב: every open and close the learner sees is one ADAPTIVE_GRID_TOGGLED (Appendix A §3)', () => {
  it('the payload: action and source only, no column, on the exercise on the screen', async () => {
    await openMeeting4();
    systemOpensGrid();
    const ev = emitted.find((e) => e.event_type === 'ADAPTIVE_GRID_TOGGLED')!;
    expect(ev.details).toEqual({ action: 'opened', source: 'hesitation_30s' });
    expect(ev).not.toHaveProperty('column_index');
    expect(ev.exercise_id).toBe(selectStandardTask(ws())!.id);
    expect(ev.session_id).toBe(`session_4_student_${STUDENT}`);
  });

  it('the card folding the grid is a close, with the source of the opening it ends', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    expect(gridEvents()).toEqual(['opened:hesitation_30s', 'closed:hesitation_30s']);
    fireEvent.click(gridTab()!);
    act(() => { ws().closeHelp(); });
    await openCard();
    expect(gridEvents()).toEqual(['opened:hesitation_30s', 'closed:hesitation_30s', 'opened:learner', 'closed:learner']);
  });

  it('an exercise that is not an addition takes the screen: the grid leaves it (closed, on the exercise it was on); the next addition brings the open grid back (opened)', async () => {
    await openMeeting4();
    const idx = nonAdditionIdx();
    expect(idx).toBeGreaterThan(0);
    const additionId = selectStandardTask(ws())!.id;
    systemOpensGrid();
    act(() => { useWorkspaceStore.setState({ standardTaskIdx: idx } as any); });
    await tick(1000);
    expect(gridEl()).toBeNull();
    // still open — only the learner's X or the card closes it — but neither shown nor tabbed here (D7)
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(gridTab()).toBeNull();
    const closed = emitted.filter((e) => e.event_type === 'ADAPTIVE_GRID_TOGGLED')[1];
    expect(closed.details).toEqual({ action: 'closed', source: 'hesitation_30s' });
    expect(closed.exercise_id).toBe(additionId);

    act(() => { useWorkspaceStore.setState({ standardTaskIdx: 0 } as any); });
    expect(gridShown()).toBe(true);
    expect(gridEvents()).toEqual(['opened:hesitation_30s', 'closed:hesitation_30s', 'opened:hesitation_30s']);
  });

  it('no event for what the learner does not see: a second open, closing a closed grid, the card closing', async () => {
    await openMeeting4();
    systemOpensGrid();
    systemOpensGrid();
    act(() => { ws().openAdditionHelper('learner'); });
    expect(gridEvents()).toEqual(['opened:hesitation_30s']);
    await openCard();
    act(() => { ws().closeAdditionHelper(); });
    act(() => { ws().closeHelp(); });
    expect(gridEvents()).toEqual(['opened:hesitation_30s', 'closed:hesitation_30s']);
  });
});

describe('the chat over the card (owner, 4.10.2026, A7-002) — unchanged', () => {
  it('the chat\'s "כרטיס החניכה" tab closes the chat and shows the card in one press; no grid tab in the chat', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    toggleChat();
    const panel = chat()!;
    expect(panel).not.toBeNull();
    expect(cardShown()).toBe(false);
    expect(within(cardEl()!).queryAllByTestId('speech')).toHaveLength(0);
    expect(cardTabs()).toHaveLength(1);
    expect(panel.contains(cardTabs()[0])).toBe(true);
    expect(within(panel).queryByText('לוח החיבור')).toBeNull();

    fireEvent.click(cardTabs()[0]);
    expect(chat()).toBeNull();
    expect(cardShown()).toBe(true);
    expect(cardTabs()).toHaveLength(0);
  });
});

describe('the card says its own name', () => {
  it('"כרטיס החניכה" at the top of the card, the bulb hidden from a screen reader, the region\'s label as it was', async () => {
    await openMeeting4();
    await openCard();
    const title = within(cardEl()!).getByTestId('socratic-card-title');
    expect(title.textContent).toBe(`💡${CARD_TAB_HE}`);
    expect(title.querySelector('[aria-hidden="true"]')!.textContent).toBe('💡');
    expect(cardEl()!.getAttribute('aria-label')).toBe('כרטיס החניכה');
  });
});

describe('every other learner: none of this exists', () => {
  it('no enhanced profile: the card opens with no grid and no tab — also after 30 seconds — and no event', async () => {
    await openMeeting4(null);
    await openCard();
    act(() => { useWorkspaceStore.setState({ counts: { ...ws().counts, units: ws().counts.units + 1 } } as any); });
    await tick(31_000);
    act(() => { ws().closeHelp(); });
    await tick(31_000);
    expect(gridEl()).toBeNull();
    expect(gridTab()).toBeNull();
    expect(ws().additionHelperShownOnce).toBe(false);
    expect(gridEvents()).toEqual([]);
  });
});
