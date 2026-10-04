/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

/**
 * Owner, 30.9.2026: after the right choice the coaching card no longer closes
 * by itself after 1.2 seconds — too fast to read its feedback, which may now
 * ask a question ("נכון מאוד! איזה מספר בניתם לפני הפריטה?").
 * Owner, 1.10.2026 (D1): it keeps the feedback for 4 seconds and then closes
 * by itself — an answered card left open blocked every later card of the
 * exercise. "הבנתי" still closes it at once; every other way to close it is
 * unchanged.
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
  return {
    ...actual,
    emitTelemetry: vi.fn(async (e: any) => { emitted.push(e); }),
  };
});

const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => (key in mockStorage ? mockStorage[key] : null)),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });

import { useWorkspaceStore, SOCRATIC_CORRECT_AUTO_CLOSE_MS } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';

const ws = () => useWorkspaceStore.getState();
const picks = () => emitted.filter((e) => e.event_type === 'SOCRATIC_OPTION_SELECTED');

describe('the coaching card after the right choice (owner, 30.9.2026; 1.10.2026, D1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitted.length = 0;
    mockLocalStorage.clear();
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    ws().initSession(1, false, 2);
    // The static card, at once (as on a timeout or without a network).
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('keeps its feedback, takes no second answer, and closes by itself after 4 seconds', async () => {
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const card = ws().aiSocraticHint!;
    const correct = card.choices.find((c) => c.isCorrect)!;
    const wrong = card.choices.find((c) => !c.isCorrect)!;

    fireEvent.click(screen.getByText(correct.textHe));
    await act(async () => { await vi.advanceTimersByTimeAsync(SOCRATIC_CORRECT_AUTO_CLOSE_MS - 500); });
    expect(ws().helpState).toBe('socratic');
    expect(screen.getByText(correct.feedbackHe!, { exact: false })).toBeTruthy();
    expect(screen.queryByText('בחרו תשובה:')).toBeNull();

    // The answer is given: the other options take no press — no lock, no second event.
    const wrongButton = screen.getByText(wrong.textHe).closest('button')!;
    expect(wrongButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(wrongButton);
    expect(ws().isSocraticCardLocked).toBe(false);
    expect(picks()).toHaveLength(1);
    expect(picks()[0].details.is_correct).toBe(true);
    // The next card's request knows this one was answered right.
    expect(ws().socraticCardHistory.cards.at(-1)?.answeredCorrect).toBe(true);

    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(ws().helpState).toBe('closed');
    expect(ws().currentState).not.toBe('SOCRATIC_ACTIVE');
    unmount();
  });

  it('"הבנתי" still closes it at once', async () => {
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const correct = ws().aiSocraticHint!.choices.find((c) => c.isCorrect)!;
    fireEvent.click(screen.getByText(correct.textHe));
    fireEvent.click(screen.getByText('הבנתי, סגירת החלונית'));
    expect(ws().helpState).toBe('closed');
    unmount();
  });

  it('a wrong choice does not close the card by itself', async () => {
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const wrong = ws().aiSocraticHint!.choices.find((c) => !c.isCorrect)!;
    fireEvent.click(screen.getByText(wrong.textHe));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticCardHistory.cards.at(-1)?.answeredCorrect).toBe(false);
    unmount();
  });

  it('a wrong choice still locks the options for 15 seconds, and the close button still closes', async () => {
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const wrong = ws().aiSocraticHint!.choices.find((c) => !c.isCorrect)!;
    fireEvent.click(screen.getByText(wrong.textHe));
    expect(ws().isSocraticCardLocked).toBe(true);
    expect(ws().helpState).toBe('socratic');
    fireEvent.click(screen.getByText('סגירה'));
    expect(ws().helpState).toBe('closed');
    unmount();
  });
});
