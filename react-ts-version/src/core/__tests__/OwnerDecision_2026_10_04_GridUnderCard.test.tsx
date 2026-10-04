/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';

/**
 * Owner decision, 4.10.2026: while the coaching card is open and the learner's
 * addition grid is open but hidden behind it, a "לוח החיבור" button under the
 * card shows that the grid is only minimised. Pressing it shows the grid and
 * folds the card into a tab; the tab (or closing the grid) brings the card
 * back exactly as it was. No telemetry, not a help event.
 * (The page side — what the grid does — is in WorkspaceWaitsForApprovedPath.test.tsx.)
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
const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async (e: any) => { emitted.push(e); }) };
});
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: ({ text }: { text: string }) => <button type="button" data-testid="speech" data-text={text} />,
}));

import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStudentChatOpen } from '@/application/useStudentChatOpen';
import { useAdditionGridOverCard } from '@/application/useAdditionGridOverCard';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';
import { CARD_TAB_HE, CARD_TAB_LABEL_HE } from '@/features/workspace/overlays/StudentChatOverlay';
import { ADDITION_GRID_HE } from '@/features/workspace/board/AdaptiveAdditionGrid';
import { GRID_RETURN_NAME_HE } from '@/features/workspace/board/additionGridReturn';

const ws = () => useWorkspaceStore.getState();
const underCard = () => screen.queryByTestId('addition-grid-under-card');
const cardTab = () => screen.queryByTestId('socratic-card-tab');

beforeEach(() => {
  vi.useFakeTimers();
  emitted.length = 0;
  ws().resetWorkspace();
  useStudentChatOpen.setState({ open: false });
  useAdditionGridOverCard.setState({ waiting: false, over: false });
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  ws().initSession(1, false, 2);
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function openCard() {
  const view = render(<SocraticSidePanel />);
  act(() => { ws().openSocraticCard('hesitation_45s'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return view;
}

describe('the "לוח החיבור" button under the coaching card', () => {
  it('one name for the grid everywhere', () => {
    expect(GRID_RETURN_NAME_HE).toBe(ADDITION_GRID_HE);
  });

  it('no grid waiting (every learner without the enhanced profile): no button', async () => {
    await openCard();
    expect(underCard()).toBeNull();
    expect(cardTab()).toBeNull();
  });

  it('the grid waits behind the card: the button is under the card, with the return tab\'s name', async () => {
    const { container } = await openCard();
    act(() => { useAdditionGridOverCard.setState({ waiting: true }); });
    const button = underCard()!;
    expect(button.textContent).toContain('לוח החיבור');
    expect(button.getAttribute('aria-label')).toBe('הצגה חוזרת של לוח החיבור');
    expect(button.className).toContain('min-h-11');
    // under the card, in the card's own column
    const card = container.querySelector('[data-testid="socratic-card"]')!;
    expect(card.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId('socratic-side-panel').contains(button)).toBe(true);
  });

  it('pressing it folds the card into a tab; the tab brings the card back exactly as it was; nothing is logged', async () => {
    const { container } = await openCard();
    act(() => { useAdditionGridOverCard.setState({ waiting: true }); });
    const wrong = ws().aiSocraticHint!.choices.find((c) => !c.isCorrect)!;
    fireEvent.click(screen.getByText(wrong.textHe));
    expect(ws().isSocraticCardLocked).toBe(true);
    const lockUntil = ws().socraticPenaltyLockoutUntil;
    const eventsBefore = emitted.length;
    const historyBefore = ws().socraticCardHistory.cards.length;
    const helpBefore = { state: ws().helpState, requested: (ws() as any).helpRequested };

    fireEvent.click(underCard()!);
    expect(useAdditionGridOverCard.getState().over).toBe(true);
    const aside = container.querySelector('[data-testid="socratic-card"]')!;
    // folded: still mounted, out of sight, and the column is only as wide as the tab
    expect(aside.getAttribute('data-folded')).toBe('true');
    expect(aside.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(screen.getByTestId('socratic-side-panel').className).toContain('w-16');
    expect(underCard()).toBeNull();
    const tab = cardTab()!;
    expect(tab.textContent).toContain(CARD_TAB_HE);
    expect(tab.getAttribute('aria-label')).toBe(CARD_TAB_LABEL_HE);
    // Escape does not close a folded card
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(ws().helpState).toBe('socratic');

    // the lock runs on while folded; no event, no new card, no help request
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(ws().socraticPenaltyLockoutUntil).toBe(lockUntil);
    expect(emitted.length).toBe(eventsBefore);
    expect(ws().socraticCardHistory.cards.length).toBe(historyBefore);
    expect({ state: ws().helpState, requested: (ws() as any).helpRequested }).toEqual(helpBefore);

    fireEvent.click(tab);
    expect(useAdditionGridOverCard.getState().over).toBe(false);
    expect(cardTab()).toBeNull();
    expect(aside.getAttribute('data-folded')).toBeNull();
    expect(aside.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(screen.getByText(wrong.textHe).closest('button')!.className).toContain('border-rose-500');
    expect(screen.getByTestId('socratic-lock-indicator')).toBeTruthy();
    expect(underCard()).not.toBeNull();
    expect(emitted.length).toBe(eventsBefore);
  });

  it('the grid closed while the card is folded (the page clears the wait): the card is back, no button', async () => {
    const { container } = await openCard();
    act(() => { useAdditionGridOverCard.setState({ waiting: true, over: true }); });
    expect(cardTab()).not.toBeNull();
    act(() => { useAdditionGridOverCard.setState({ waiting: false, over: false }); });
    expect(cardTab()).toBeNull();
    expect(underCard()).toBeNull();
    expect(container.querySelector('[data-testid="socratic-card"]')!.getAttribute('data-folded')).toBeNull();
  });
});
