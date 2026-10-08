/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';

/**
 * Register row 17 (25.9.2026): the owner decided two things from document 03
 * are built in code.
 *
 * 1. The grouping / decomposition animation (מסמך 03 §3.3–3.5): ten blocks
 *    merge into one that travels left; one block breaks into ten that travel
 *    right. PRD Module 8 §א: click and drag-right decomposition run the
 *    identical animation. The animation is view-only — the counts, the undo
 *    stack and the telemetry change exactly as before, instantly.
 *
 * 2. The Socratic card in a side panel (מסמך 03 "כרכיב צדדי עדין השומר על
 *    נראות מלאה של התרגיל", "בחלונית צדדית"; מסמך 04 §א "חלונית צדדית נשלפת
 *    מצד המסך"). It used to float over the top centre of the screen.
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
import { useAuthStore } from '@/application/useAuthStore';
import { useRegroupAnimationStore, REGROUP_ANIMATION_MS } from '@/application/useRegroupAnimationStore';
import { groupBlocksManually, splitBlockClick, type PlaceCounts } from '@/core/placeValue';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';
import { HelpOverlays, SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../', rel), 'utf-8').replace(/\r\n/g, '\n');
const ws = () => useWorkspaceStore.getState();
const anim = () => useRegroupAnimationStore.getState().current;

function startMeeting(n: 1 | 3, counts: Partial<PlaceCounts> = {}) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  ws().initSession(n, false, n === 1 ? 2 : 0);
  useWorkspaceStore.setState({
    counts: { units: 0, tens: 0, hundreds: 0, thousands: 0, ...counts },
    undoStack: [],
    isBoardLocked: false,
  });
  useRegroupAnimationStore.setState({ current: null });
}

describe('Grouping / decomposition animation is view-only (מסמך 03 §3.3–3.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLocalStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['units', 'tens'],
    ['tens', 'hundreds'],
    ['hundreds', 'thousands'],
  ] as const)('grouping %s → %s: counts and undo are exactly the pure model\'s, and the merge is announced', (from, to) => {
    const before: PlaceCounts = { units: 3, tens: 4, hundreds: 5, thousands: 1, [from]: 12 } as PlaceCounts;
    startMeeting(3, before);
    const expected = groupBlocksManually(before, from)!.counts;

    ws().groupColumnClick(from);

    expect(ws().counts).toEqual(expected);
    expect(ws().undoStack).toHaveLength(1);
    expect(ws().undoStack[0].counts).toEqual(before);
    expect(ws().hasGrouped).toBe(true);
    expect(anim()).toMatchObject({ kind: 'group', from, to, toCount: expected[to] });

    // The animation ends by itself and leaves the board untouched.
    vi.advanceTimersByTime(REGROUP_ANIMATION_MS + 100);
    expect(anim()).toBeNull();
    expect(ws().counts).toEqual(expected);

    // Undo is unaffected: one step back restores the board before the merge.
    ws().undo();
    expect(ws().counts).toEqual(before);
  });

  it.each([
    ['tens', 'units'],
    ['hundreds', 'tens'],
    ['thousands', 'hundreds'],
  ] as const)('decomposing %s → %s by click: counts are the pure model\'s, and the break-apart is announced', (from, to) => {
    const before: PlaceCounts = { units: 2, tens: 3, hundreds: 4, thousands: 1 };
    startMeeting(3, before);
    const expected = splitBlockClick(before, from)!.counts;

    ws().splitBlockClick(from);

    expect(ws().counts).toEqual(expected);
    expect(ws().undoStack).toHaveLength(1);
    expect(ws().hasUngrouped).toBe(true);
    expect(anim()).toMatchObject({ kind: 'split', from, to, toCount: expected[to] });
    vi.advanceTimersByTime(REGROUP_ANIMATION_MS + 100);
    expect(anim()).toBeNull();
    expect(ws().counts).toEqual(expected);
  });

  it('PRD Module 8 §א: dragging a block right runs the identical animation and gives the identical board as clicking it', () => {
    const before: PlaceCounts = { units: 4, tens: 2, hundreds: 0, thousands: 0 };

    startMeeting(3, before);
    ws().splitBlockClick('tens');
    const byClick = { counts: ws().counts, anim: { ...anim()!, id: 0 } };

    startMeeting(3, before);
    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    const byDrag = { counts: ws().counts, anim: { ...anim()!, id: 0 } };

    expect(byDrag).toEqual(byClick);
  });

  it('a plain add or a rejected move announces nothing', () => {
    startMeeting(3, { units: 3 });
    ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    expect(anim()).toBeNull();
    ws().groupColumnClick('units'); // only 4 units: rejected
    expect(anim()).toBeNull();
    expect(ws().counts.units).toBe(4);
  });
});

describe('The board draws the move without hiding the truth for long', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockLocalStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const renderBoard = () =>
    render(React.createElement(DndContext, null, React.createElement(PlaceValueBoard, null)));

  it('grouping: the new ten stays invisible until the ghost lands, then appears; input is never blocked', () => {
    startMeeting(3, { units: 12 });
    const { container, unmount } = renderBoard();

    const groupButton = screen.getByRole('button', { name: /קבצו 10 לעשרת/ });
    act(() => { fireEvent.click(groupButton); });

    expect(ws().counts.units).toBe(2);
    expect(ws().counts.tens).toBe(1);

    const layer = screen.getByTestId('regroup-animation-layer');
    expect(layer.getAttribute('data-kind')).toBe('group');
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(layer.className).toContain('pointer-events-none');

    const arriving = container.querySelectorAll('#column-tens [data-arriving="true"]');
    expect(arriving).toHaveLength(1);
    expect((arriving[0] as HTMLElement).style.visibility).toBe('hidden');
    // Nothing in the units column is hidden.
    expect(container.querySelectorAll('#column-units [data-arriving="true"]')).toHaveLength(0);

    // The board still takes input mid-animation.
    act(() => {
      ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    });
    expect(ws().counts.units).toBe(3);

    act(() => { vi.advanceTimersByTime(REGROUP_ANIMATION_MS + 100); });
    expect(screen.queryByTestId('regroup-animation-layer')).toBeNull();
    expect(container.querySelectorAll('[data-arriving="true"]')).toHaveLength(0);
    unmount();
  });

  it('decomposition: ten new units stay invisible until the ghosts land', () => {
    startMeeting(3, { tens: 2 });
    const { container, unmount } = renderBoard();

    const tensBlock = container.querySelector('#column-tens-0') as HTMLElement;
    act(() => { fireEvent.click(tensBlock); });

    expect(ws().counts).toMatchObject({ tens: 1, units: 10 });
    expect(screen.getByTestId('regroup-animation-layer').getAttribute('data-kind')).toBe('split');
    expect(container.querySelectorAll('#column-units [data-arriving="true"]')).toHaveLength(10);

    act(() => { vi.advanceTimersByTime(REGROUP_ANIMATION_MS + 100); });
    expect(container.querySelectorAll('[data-arriving="true"]')).toHaveLength(0);
    unmount();
  });

  it('an undo in the middle of the animation shows the real board at once', () => {
    startMeeting(3, { units: 12 });
    const { container, unmount } = renderBoard();
    act(() => { ws().groupColumnClick('units'); });
    expect(container.querySelectorAll('[data-arriving="true"]')).toHaveLength(1);

    act(() => { ws().undo(); });
    expect(ws().counts).toMatchObject({ units: 12, tens: 0 });
    expect(container.querySelectorAll('[data-arriving="true"]')).toHaveLength(0);
    expect(screen.queryByTestId('regroup-animation-layer')).toBeNull();
    unmount();
  });
});

/**
 * The card opens under an hourglass until the engine answers or fails, then
 * shows one card that stays (owner, 28.9.2026; X22). Here the engine is not
 * reachable, so the static card settles as soon as the call fails.
 */
async function openSettledCard() {
  ws().openSocraticCard('hesitation_45s');
  await act(async () => {
    await vi.waitFor(() => expect(ws().socraticPending).toBe(false));
  });
  expect(ws().aiSocraticHint).not.toBeNull();
}

describe('The Socratic card is a side panel beside the work (מסמך 03 / 04 §א)', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    startMeeting(1);
  });

  it('PRD 12 §ב: the workspace renders the drawer inside the task zone (40%), and the board keeps its 60% of the row (PRD 7 §א)', () => {
    const page = read('features/workspace/StudentWorkspacePage.tsx');
    const main = page.slice(page.indexOf('<main '), page.indexOf('</main>'));
    const zone = main.slice(main.indexOf('data-testid="task-zone"'), main.indexOf('</section>'));
    expect(zone).toContain('<TaskCard />');
    expect(zone).toContain('<SocraticSidePanel inTaskZone />');
    expect(main).toContain("style={{ flex: '2 1 0%' }}");
    // The board comes after the task zone (RTL: on the visual left) and takes no share from the drawer.
    expect(main.indexOf('<PlaceValueBoard')).toBeGreaterThan(main.indexOf('</section>'));
    expect(main).not.toContain('shareRow');
    const board = read('features/workspace/board/PlaceValueBoard.tsx');
    expect(board).toContain("export const BOARD_ZONE_FLEX = '3 1 0%';");
    expect(board).toContain("flex: fullWidth ? '1 1 100%' : BOARD_ZONE_FLEX,");
  });

  it('a board too narrow for the full tray gets the compact tray, which may wrap, so the trash is never cut off', () => {
    const board = read('features/workspace/board/PlaceValueBoard.tsx');
    expect(board).toContain('setNarrow(entry.contentRect.width < TRAY_FULL_WIDTH_PX)');
    expect(board).toContain('compact={narrow}');
    startMeeting(3);
    const { unmount } = render(React.createElement(DndContext, null, React.createElement(PlaceValueBoard, {})));
    const tray = screen.getByRole('toolbar', { name: /ארגז כלים/ });
    expect(within(tray).getByLabelText(/פח אשפה/)).toBeDefined();
    unmount();
  });

  it('the floating overlay no longer carries the card', () => {
    ws().openSocraticCard('hesitation_45s');
    const { unmount } = render(React.createElement(HelpOverlays, null));
    expect(screen.queryByTestId('socratic-card')).toBeNull();
    unmount();
  });

  it('keeps the card\'s behaviour: read-aloud, close, and the 30-second lock on the answer buttons only', async () => {
    await openSettledCard();
    const { unmount } = render(React.createElement(SocraticSidePanel, null));

    const panel = screen.getByTestId('socratic-side-panel');
    expect(panel.className).not.toMatch(/\b(fixed|absolute)\b/);
    const card = within(panel).getByRole('region', { name: 'כרטיס החניכה' });
    expect(within(card).getByRole('button', { name: 'הקראה בקול' })).toBeDefined();

    act(() => { ws().triggerSocraticPenaltyLockout('רמז'); });
    act(() => { fireEvent.click(within(card).getByRole('button', { name: 'סגירת חלונית העזרה' })); });
    expect(ws().helpState).toBe('closed');
    expect(ws().isBoardLocked).toBe(false);
    unmount();
  });

  it('answer buttons are disabled during the lock while the close button is not', async () => {
    await openSettledCard();
    act(() => { ws().triggerSocraticPenaltyLockout('רמז'); });
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    const card = screen.getByTestId('socratic-card');
    const buttons = within(card).getAllByRole('button') as HTMLButtonElement[];
    const answers = buttons.filter((b) => b.className.includes('text-right'));
    expect(answers.length).toBe(3);
    for (const b of answers) expect(b.disabled).toBe(true);
    const closeNow = buttons.find((b) => b.textContent?.trim() === 'סגירה');
    expect(closeNow?.disabled).toBe(false);
    unmount();
  });

  // PRD Module 12 §ב: "נעילה שקטה ... (pointer-events: none בתוספת אינדיקטור
  // שעון חול עדין)". Audit row 1.14 (28.9.2026): the card counted the seconds
  // down on a bold line and on the close button. Now: an hourglass and one
  // sentence, and no number anywhere on the card while it is locked.
  it('the lock is silent: an hourglass and one sentence, no seconds', async () => {
    await openSettledCard();
    act(() => { ws().triggerSocraticPenaltyLockout('רמז: בדקו שוב.'); });
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    const indicator = screen.getByTestId('socratic-lock-indicator');
    expect(indicator.textContent).toBe('⏳רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.');
    const card = screen.getByTestId('socratic-card');
    const buttons = within(card).getAllByRole('button') as HTMLButtonElement[];
    // The wide button under the options (the ✕ in the corner has only an aria-label).
    const close = buttons.find((b) => b.className.includes('w-full'))!;
    expect(close.textContent).toBe('סגירה');
    expect(indicator.textContent + close.textContent).not.toMatch(/\d|שניות|ש'/);
    unmount();
  });

  // Screen fit (owner, 28.9.2026: no scroll at any size): after a wrong
  // choice the hint and the lock line share one box, so the close button
  // stays in a 585px-high window.
  it('after a wrong choice the hint and the silent lock are one box', async () => {
    await openSettledCard();
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    const card = screen.getByTestId('socratic-card');
    const answers = (within(card).getAllByRole('button') as HTMLButtonElement[]).filter((b) => b.className.includes('text-right'));
    // A wrong option, found by its text: the correct one is not always first (owner, 28.9.2026).
    const wrongTexts = new Set((ws().aiSocraticHint?.choices ?? []).filter((c) => c.isCorrect === false).map((c) => c.textHe));
    const wrong = answers.find((b) => wrongTexts.has(b.textContent ?? ''))!;
    expect(wrong).toBeDefined();
    act(() => { fireEvent.click(wrong); });
    const indicator = screen.getByTestId('socratic-lock-indicator');
    expect(indicator.textContent).toBe('⏳רגע לחשיבה. אפשר לבחור תשובה שוב עוד מעט.');
    const box = indicator.parentElement!;
    expect(box.getAttribute('role')).toBe('status');
    expect(box.textContent).toMatch(/^💡 \S.*⏳רגע לחשיבה/);
    expect(within(card).getAllByRole('status')).toHaveLength(1);
    // PRD Module 7 §א: the hint is an instruction, so it has its own read-aloud
    // button, which says the lock sentence too (audit 4.10.2026, A7-003).
    expect(within(box).getByRole('button', { name: 'הקראה בקול' })).toBeDefined();
    // Every answer is a 44px touch target (UX audit 4.10.2026, UX-006).
    for (const b of answers) expect(b.className).toMatch(/\bmin-h-11\b/);
    unmount();
  });

  it('the lock alone also has its read-aloud button (A7-003)', async () => {
    await openSettledCard();
    act(() => { ws().triggerSocraticPenaltyLockout('רמז'); });
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    const indicator = screen.getByTestId('socratic-lock-indicator');
    expect(within(indicator).getByRole('button', { name: 'הקראה בקול' })).toBeDefined();
    unmount();
  });

  it('Escape closes the panel and no focus trap is installed', () => {
    ws().openSocraticCard('hesitation_45s');
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    const src = read('features/workspace/overlays/HelpOverlays.tsx');
    expect(src).toContain("{ trapFocus: false, autoFocus: false }");
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(ws().helpState).toBe('closed');
    unmount();
  });
});
