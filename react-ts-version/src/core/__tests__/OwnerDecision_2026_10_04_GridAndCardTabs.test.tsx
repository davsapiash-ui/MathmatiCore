/**
 * @vitest-environment jsdom
 */
/**
 * Owner's decision, 4.10.2026 — the addition grid and the coaching card
 * (enhanced profile, meetings 3–7): one mechanism, two named tabs, each in
 * its own place.
 *
 *  1. The grid and the card are never shown together. The grid's place is its
 *     slot beside the board; the card's place is its column at the edge of
 *     the screen. The one that is not shown is a tab in its own place.
 *  2. Card open: the grid is its amber "לוח החיבור" tab beside the card —
 *     whether it was open when the card arrived or closed earlier.
 *  3. No "לוח החיבור" button under the card.
 *  4. The amber tab: the grid is shown, the card folds into "כרטיס החניכה".
 *  5. That tab: the card is back as it was. The grid's X closes the grid, and
 *     the card is shown again.
 *  6. 30 seconds under an open card: the grid is offered (its tab), not
 *     opened; it opens when the card closes on an exercise still worked on.
 *  7. A new card, or the card's own closing, while folded: the fold is over.
 *  8. The chat's "כרטיס החניכה" tab: one press closes the chat and shows the card.
 *  9. No telemetry for a fold, nothing new saved.
 * 10. No read-aloud button inside a folded card; focus follows a swap.
 *
 * The real StudentWorkspacePage with the real coaching card, chat, grid,
 * stores and hesitation radar; only the screens around them are stubs.
 * (מסמך 03 §1.3 ה'; register 18; PRD Modules 10 and 12.)
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const cls = vi.hoisted(() => ({
  session: { active: true, status: 'active', sessionNumber: 4 as number | null, startedAt: 1, isLoaded: true },
}));
const emitted = vi.hoisted(() => [] as any[]);
const saved = vi.hoisted(() => [] as any[]);

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
  throttledRtdbUpdate: (path: string, value: unknown) => { saved.push({ path, value }); return Promise.resolve(); },
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
import { useWorkspaceStore, isAdditionExercise, selectStandardTask, SOCRATIC_CORRECT_AUTO_CLOSE_MS } from '@/application/useWorkspaceStore';
import { useStore } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { useAdditionGridOverCard } from '@/application/useAdditionGridOverCard';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { CARD_TAB_HE, CARD_TAB_LABEL_HE } from '@/features/workspace/overlays/StudentChatOverlay';

const STUDENT = 'student_user5';
const ws = () => useWorkspaceStore.getState();
const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const main = () => document.querySelector('main')!;
const gridEl = () => screen.queryByTestId('adaptive-addition-grid');
/** A closed grid, or a closed card's column, fades out under AnimatePresence: still in the DOM on its way out, no longer the learner's. */
const gridLeaving = () => !ws().isAdditionHelperOpen;
const cardLeaving = () => ws().helpState !== 'socratic';
/** The grid is on the screen: mounted, not on its way out, and not waiting as its tab. */
const gridShown = () => { const g = gridEl(); return g !== null && !gridLeaving() && g.getAttribute('data-hidden') === null; };
const gridTab = () => screen.queryByTestId('addition-grid-tab');
const cardEl = () => screen.queryByTestId('socratic-card');
/** The card is on the screen: mounted, its column not on its way out, and not folded into its tab. */
const cardShown = () => { const c = cardEl(); return c !== null && !cardLeaving() && c.getAttribute('data-folded') === null; };
const cardTabs = () => screen.queryAllByTestId('socratic-card-tab').filter((t) => !(cardLeaving() && t.closest('[data-testid="socratic-side-panel"]')));
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
  await tick();
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
/** The system opened the grid (30 seconds), as it does without a card. */
const systemOpensGrid = () => act(() => { ws().openAdditionHelper(); });
const toggleChat = () => act(() => { document.dispatchEvent(new CustomEvent('toggle-chat')); });
const wrongOption = () => ws().aiSocraticHint!.choices.find((c) => !c.isCorrect)!;
const rightOption = () => ws().aiSocraticHint!.choices.find((c) => c.isCorrect)!;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no scrollIntoView (the chat scrolls to its last message)
  Element.prototype.scrollIntoView = () => {};
  emitted.length = 0;
  saved.length = 0;
  cls.session = { ...cls.session, sessionNumber: 4 };
  useAuthStore.setState({ user: { uid: STUDENT, student_id: 5 } as any, role: 'student', isAuthenticated: true });
  useWorkspaceStore.getState().resetWorkspace();
  useWorkspaceStore.setState({ sessionNumber: 3, flowStatus: 'task' } as any);
  useStore.setState({ students: {} as any, firebaseLoaded: false });
  useStudentChatOpen.setState({ open: false });
  useAdditionGridOverCard.setState({ cardKey: null });
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  vi.spyOn(SocraticEngine, 'prefetchSessionHints').mockImplementation(() => undefined as any);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('rules 1–3: the card open, the grid is its amber tab, in the grid\'s own place', () => {
  it('the grid was open when the card arrived: the card is shown, the grid waits as its tab beside the card, still open in the store', async () => {
    await openMeeting4();
    systemOpensGrid();
    expect(gridShown()).toBe(true);
    expect(gridTab()).toBeNull();
    fireEvent.click(within(gridEl()!).getByText('7', { selector: 'tbody td:first-child' }));

    await openCard();
    expect(cardShown()).toBe(true);
    expect(gridShown()).toBe(false);
    expect(ws().isAdditionHelperOpen).toBe(true);
    const tab = gridTab()!;
    expect(tab.textContent).toBe('לוח החיבור');
    expect(tab.getAttribute('aria-label')).toBe('הצגה חוזרת של לוח החיבור');
    expect(tab.getAttribute('title')).toBe('החזרת לוח החיבור למסך');
    // in the row, after the card's column — the grid's place beside the board, in
    // the representations zone (PRD 7 §א), not the card's
    expect(main().contains(tab)).toBe(true);
    expect(column().contains(tab)).toBe(false);
    expect(tab.compareDocumentPosition(column()) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // rule 3: nothing of the grid inside the card's column
    expect(within(column()).queryByText('לוח החיבור')).toBeNull();
    expect(within(column()).queryByRole('button', { name: /לוח החיבור/ })).toBeNull();
    expect(cardTabs()).toHaveLength(0);
  });

  it('the learner had closed the grid earlier: the amber tab stays while the card is open', async () => {
    await openMeeting4();
    systemOpensGrid();
    fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridTab()).not.toBeNull();

    await openCard();
    expect(cardShown()).toBe(true);
    expect(gridTab()).not.toBeNull();
    expect(gridShown()).toBe(false);
  });

  it('a grid the system never offered has no tab, with or without the card', async () => {
    await openMeeting4();
    expect(gridTab()).toBeNull();
    await openCard();
    expect(gridTab()).toBeNull();
    expect(gridEl()).toBeNull();
  });
});

describe('rules 4–5, 9–10: the two tabs swap the grid and the card', () => {
  it('the amber tab shows the grid as it was and folds the card; the card\'s tab brings the card back as it was; no event, nothing saved', async () => {
    await openMeeting4();
    systemOpensGrid();
    const grid = gridEl()!;
    fireEvent.click(within(grid).getByText('7', { selector: 'tbody td:first-child' }));
    await openCard();
    // a wrong answer: the chosen option, its hint and the 15-second lock
    const wrong = wrongOption();
    fireEvent.click(within(cardEl()!).getByText(wrong.textHe));
    expect(ws().isSocraticCardLocked).toBe(true);
    const lockUntil = ws().socraticPenaltyLockoutUntil;
    expect(within(cardEl()!).getAllByTestId('speech').length).toBeGreaterThan(0);
    const eventsBefore = emitted.length;
    const savedBefore = saved.length;
    const cardsBefore = ws().socraticCardHistory.cards.length;

    fireEvent.click(gridTab()!);
    // the grid: the same element, shown, its chosen row kept, and focused
    expect(gridEl()).toBe(grid);
    expect(gridShown()).toBe(true);
    expect(within(grid).getByText('7', { selector: 'tbody td:first-child' }).className).toContain('bg-amber-500');
    expect(gridTab()).toBeNull();
    expect(document.activeElement).toBe(grid);
    // the card: folded — mounted, out of sight, inert, no read-aloud button — and its tab in its own column
    const card = cardEl()!;
    expect(cardShown()).toBe(false);
    expect(card.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(card.hasAttribute('inert')).toBe(true);
    expect(within(card).queryAllByTestId('speech')).toHaveLength(0);
    expect(cardTabs()).toHaveLength(1);
    const tab = cardTabs()[0];
    expect(tab.textContent).toContain(CARD_TAB_HE);
    expect(tab.getAttribute('aria-label')).toBe(CARD_TAB_LABEL_HE);
    expect(column().contains(tab)).toBe(true);
    expect(ws().helpState).toBe('socratic');
    // Escape does not close a folded card
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ws().helpState).toBe('socratic');

    // the lock runs on under the fold
    await tick(3_000);
    expect(ws().socraticPenaltyLockoutUntil).toBe(lockUntil);

    fireEvent.click(tab);
    expect(cardShown()).toBe(true);
    expect(cardEl()).toBe(card);
    expect(card.hasAttribute('inert')).toBe(false);
    expect(within(card).getByText(wrong.textHe).closest('button')!.className).toContain('border-rose-500');
    expect(within(card).getByTestId('socratic-lock-indicator')).toBeTruthy();
    expect(within(card).getAllByTestId('speech').length).toBeGreaterThan(0);
    expect(document.activeElement).toBe(card);
    expect(cardTabs()).toHaveLength(0);
    // the grid folds back into its tab, still open, its row kept
    expect(gridShown()).toBe(false);
    expect(gridEl()).toBe(grid);
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(gridTab()).not.toBeNull();
    expect(within(grid).getByText('7', { selector: 'tbody td:first-child' }).className).toContain('bg-amber-500');

    // rule 9: two swaps wrote no event, no new card, no help request, and saved nothing
    expect(emitted.length).toBe(eventsBefore);
    expect(saved.length).toBe(savedBefore);
    expect(ws().socraticCardHistory.cards.length).toBe(cardsBefore);
    expect(ws().helpRequested).toBe(false);
  });

  it('the amber tab of a CLOSED grid, pressed while the card is open: the grid opens (one learner\'s opening) and the card folds', async () => {
    await openMeeting4();
    systemOpensGrid();
    fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
    await tick(1_000);
    await openCard();
    emitted.length = 0;

    fireEvent.click(gridTab()!);
    expect(gridShown()).toBe(true);
    expect(cardShown()).toBe(false);
    expect(cardTabs()).toHaveLength(1);
    expect(gridEvents()).toEqual(['opened:learner']);
  });

  it('the grid\'s X while the card is folded: the grid closes to its tab, as X always does, and the card is shown again', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    fireEvent.click(gridTab()!);
    emitted.length = 0;

    fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridEvents()).toEqual(['closed:learner']);
    expect(cardShown()).toBe(true);
    expect(document.activeElement).toBe(cardEl());
    expect(cardTabs()).toHaveLength(0);
    expect(gridTab()).not.toBeNull();
    expect(ws().helpState).toBe('socratic');
  });
});

describe('rule 6: thirty seconds of hesitation under an open card', () => {
  /** A cognitive action, so the radar's count starts now (on the test's clock). */
  const act1 = () => act(() => { useWorkspaceStore.setState({ counts: { ...ws().counts, units: ws().counts.units + 1 } } as any); });

  it('the grid is offered, not opened: its tab appears beside the card ("הצגת לוח החיבור"), no grid, no "opened" event', async () => {
    await openMeeting4();
    await openCard();
    act1();
    emitted.length = 0;
    expect(gridTab()).toBeNull();

    await tick(31_000);
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridEl()).toBeNull();
    expect(cardShown()).toBe(true);
    const tab = gridTab()!;
    expect(tab.textContent).toBe('לוח החיבור');
    // never shown yet: nothing "returns"
    expect(tab.getAttribute('aria-label')).toBe('הצגת לוח החיבור');
    expect(tab.getAttribute('title')).toBe('הצגת לוח החיבור');
    expect(gridEvents()).toEqual([]);
  });

  it('the card then closes on the exercise still worked on: the grid opens once, with one "opened" event; its tab speaks of a return from then on', async () => {
    await openMeeting4();
    await openCard();
    act1();
    await tick(31_000);
    emitted.length = 0;

    fireEvent.click(within(cardEl()!).getByRole('button', { name: 'הבנתי, סגירת החלונית' }));
    await tick();
    expect(ws().helpState).toBe('closed');
    expect(ws().isAdditionHelperOpen).toBe(true);
    expect(gridShown()).toBe(true);
    expect(gridEvents()).toEqual(['opened:hesitation_30s']);

    fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
    expect(gridTab()!.getAttribute('aria-label')).toBe('הצגה חוזרת של לוח החיבור');
    expect(gridTab()!.getAttribute('title')).toBe('החזרת לוח החיבור למסך');
  });

  it('the learner presses the offered tab under the card: the grid opens once (learner), and nothing more opens when the card closes', async () => {
    await openMeeting4();
    await openCard();
    act1();
    await tick(31_000);
    emitted.length = 0;

    fireEvent.click(gridTab()!);
    expect(gridShown()).toBe(true);
    expect(cardShown()).toBe(false);
    expect(gridEvents()).toEqual(['opened:learner']);

    act(() => { ws().closeHelp(); });
    await tick();
    expect(gridShown()).toBe(true);
    expect(gridEvents()).toEqual(['opened:learner']);
  });

  it('the learner opens the grid from the offered tab, closes it with its X, then closes the card: the grid stays closed, and no further event', async () => {
    await openMeeting4();
    await openCard();
    act1();
    await tick(31_000);
    emitted.length = 0;

    fireEvent.click(gridTab()!);
    fireEvent.click(within(gridEl()!).getByRole('button', { name: 'סגירת לוח החיבור' }));
    expect(cardShown()).toBe(true);
    fireEvent.click(within(cardEl()!).getByRole('button', { name: 'הבנתי, סגירת החלונית' }));
    await tick(1_000);
    expect(ws().helpState).toBe('closed');
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridShown()).toBe(false);
    expect(gridTab()).not.toBeNull();
    expect(gridEvents()).toEqual(['opened:learner', 'closed:learner']);
  });

  it('the card closes because the last compulsory exercise was solved (the real "check"): no grid opens, and no event', async () => {
    await openMeeting4();
    // the exercise on the screen is the only one of the set, so also the last (1,245 + 328)
    act(() => { useWorkspaceStore.setState({ dynamicTasks: [selectStandardTask(ws())!], standardTaskIdx: 0 } as any); });
    expect(selectStandardTask(ws())!.id).toBe('s4_g_t1');
    await openCard();
    // the learner finishes the work under the card, then sits 30 seconds
    act(() => {
      useWorkspaceStore.setState({
        counts: { thousands: 1, hundreds: 5, tens: 7, units: 3 },
        answerDigits: { units: '3', tens: '7', hundreds: '5', thousands: '1' },
        carryDigits: { tens: '1' },
      } as any);
    });
    expect(ws().helpState).toBe('socratic');
    await tick(31_000);
    expect(gridTab()).not.toBeNull();
    emitted.length = 0;

    act(() => { ws().proceed(); });
    await tick();
    // the right answer: proceedStandard → advanceStandard → dropCoachingCard
    expect(ws().awaitingNext || ws().flowStatus !== 'task').toBe(true);
    expect(ws().helpState).toBe('closed');
    expect(ws().isAdditionHelperOpen).toBe(false);
    expect(gridShown()).toBe(false);
    expect(gridEvents()).toEqual([]);
  });
});

describe('rule 7: the card closes, or a new card arrives, while the card is folded under the grid', () => {
  it('the card closes itself after a right answer: its tab goes, and the grid stays as the learner left it', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    fireEvent.click(within(cardEl()!).getByText(rightOption().textHe));
    fireEvent.click(gridTab()!);
    expect(cardTabs()).toHaveLength(1);

    await tick(SOCRATIC_CORRECT_AUTO_CLOSE_MS + 100);
    expect(ws().helpState).toBe('closed');
    await tick(1_000);
    expect(cardTabs()).toHaveLength(0);
    expect(gridShown()).toBe(true);
    expect(ws().isAdditionHelperOpen).toBe(true);
  });

  it('a new card is shown unfolded, and the grid folds into its amber tab', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    fireEvent.click(gridTab()!);
    expect(cardShown()).toBe(false);

    act(() => { ws().closeHelp(); });
    await tick(1_000);
    expect(gridShown()).toBe(true);
    const focusedBefore = document.activeElement;

    await openCard();
    expect(cardShown()).toBe(true);
    expect(cardTabs()).toHaveLength(0);
    expect(gridShown()).toBe(false);
    expect(gridTab()).not.toBeNull();
    // it did not take the keyboard's focus from what the learner was doing
    expect(document.activeElement).toBe(focusedBefore);
  });
});

describe('rule 7, the exercise started again', () => {
  it('the same exercise begun anew (its card count starts again): its first card is shown unfolded', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    fireEvent.click(gridTab()!);
    expect(cardShown()).toBe(false);

    await tick(1_000);
    act(() => { ws().initSession(4, false, 0); ws().markOpeningScreenSeen(); });
    act(() => { useWorkspaceStore.setState({ activeSupportProfileId: 'enhanced_cognitive_support' } as any); });
    systemOpensGrid();
    await openCard();
    expect(cardShown()).toBe(true);
    expect(gridShown()).toBe(false);
    expect(gridTab()).not.toBeNull();
  });
});

describe('rule 8: the chat over the card', () => {
  it('the chat\'s "כרטיס החניכה" tab closes the chat and shows the card in one press, also when the card was folded for the grid; no grid tab in the chat', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    fireEvent.click(gridTab()!);
    toggleChat();
    const panel = chat()!;
    expect(panel).not.toBeNull();
    // one "כרטיס החניכה" tab: the chat's own
    expect(cardTabs()).toHaveLength(1);
    expect(panel.contains(cardTabs()[0])).toBe(true);
    expect(within(panel).queryByText('לוח החיבור')).toBeNull();

    fireEvent.click(cardTabs()[0]);
    expect(chat()).toBeNull();
    expect(cardShown()).toBe(true);
    expect(cardTabs()).toHaveLength(0);
    expect(gridShown()).toBe(false);
    expect(gridTab()).not.toBeNull();
  });

  it('the chat over an open card (no grid shown): the chat\'s tab still brings the card back in one press', async () => {
    await openMeeting4();
    systemOpensGrid();
    await openCard();
    toggleChat();
    expect(cardShown()).toBe(false);
    expect(within(cardEl()!).queryAllByTestId('speech')).toHaveLength(0);
    fireEvent.click(within(chat()!).getByTestId('socratic-card-tab'));
    expect(chat()).toBeNull();
    expect(cardShown()).toBe(true);
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
  it('no enhanced profile: the card opens with no grid, no amber tab and no card tab — also after 30 seconds', async () => {
    await openMeeting4(null);
    await openCard();
    act(() => { useWorkspaceStore.setState({ counts: { ...ws().counts, units: ws().counts.units + 1 } } as any); });
    await tick(31_000);
    expect(cardShown()).toBe(true);
    expect(gridEl()).toBeNull();
    expect(gridTab()).toBeNull();
    expect(cardTabs()).toHaveLength(0);
    expect(ws().additionHelperOffered).toBe(false);
    expect(gridEvents()).toEqual([]);
    expect(column().className).not.toContain('w-16');
  });
});
