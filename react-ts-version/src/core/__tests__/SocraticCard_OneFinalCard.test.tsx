/**
 * @vitest-environment jsdom
 */
import { continueAfterSuccess } from '@/tests/successHold';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

/**
 * X19 and X22 — the owner's decision (28.9.2026):
 * "לעשות כמו באפיון. עד שהבינה עונה (לכל היותר 8 שניות) יופיע בכרטיס שעון
 * חול, ואחר כך יופיע כרטיס אחד שלא מתחלף. יישמר סוג הטעות שהבינה זיהתה, או
 * 'ריק' אם הוצג כרטיס קבוע."
 *
 * PRD Module 13: static hints are served instantly upon API timeout or
 * network failure; error_category is persisted into SOCRATIC_CARD_SHOWN. The
 * register: the static card's category is null when the engine did not answer.
 *
 * So: an hourglass (no text) while the engine is asked; then exactly one card
 * that never changes; exactly one SOCRATIC_CARD_SHOWN, when that card appears,
 * with the engine's category or null.
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

import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticEngine, SOCRATIC_PROXY_TIMEOUT_MS, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { SESSION1_TASKS } from '@/data/sessionTasks';

const ws = () => useWorkspaceStore.getState();
const at = (id: string) => SESSION1_TASKS.findIndex((t) => t.id === id);
const cardsShown = () => emitted.filter((e) => e.event_type === 'SOCRATIC_CARD_SHOWN');

const AI_CARD: SocraticHintResponse = {
  pedagogical_intent: 'procedural',
  error_category: 'procedural',
  questionHe: 'שאלה מהמנוע לבדיקה',
  choices: [
    { id: 'opt_1', textHe: 'אפשרות א של המנוע', isCorrect: true },
    { id: 'opt_2', textHe: 'אפשרות ב של המנוע', isCorrect: false },
    { id: 'opt_3', textHe: 'אפשרות ג של המנוע', isCorrect: false },
  ],
  correctChoiceId: 'opt_1',
};

/** The engine answers `hint` after `ms`, or fails. */
function engineAnswers(ms: number, hint: SocraticHintResponse | Error) {
  return vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(
    () => new Promise((resolve, reject) => {
      setTimeout(() => (hint instanceof Error ? reject(hint) : resolve(hint)), ms);
    })
  );
}

function staticQuestion(): string {
  const s = ws();
  return SocraticEngine.getSynchronousTaskHint(getActiveTasks(s)[s.standardTaskIdx], s.counts).questionHe;
}

const pending = () => screen.queryByTestId('socratic-card-pending');
const question = () => screen.queryByRole('heading', { level: 2 })?.textContent ?? null;

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('the coaching card: an hourglass, then one card that stays (X19, X22)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    emitted.length = 0;
    mockLocalStorage.clear();
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    ws().initSession(1, false, 2);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('the engine answers at 2 s: hourglass (no text, no event), then the engine\'s card and one event with its category', async () => {
    engineAnswers(2_000, AI_CARD);
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });

    // The hourglass: no question, no options, no read-aloud, no event.
    expect(pending()).not.toBeNull();
    const card = screen.getByTestId('socratic-card');
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(question()).toBeNull();
    expect(within(card).queryByRole('button', { name: 'הקראה בקול' })).toBeNull();
    expect(card.textContent?.replace(/[✕⏳\s]/g, '')).toBe('');
    expect(cardsShown()).toHaveLength(0);

    await tick(1_999);
    expect(pending()).not.toBeNull();
    expect(cardsShown()).toHaveLength(0);

    await tick(1);
    expect(pending()).toBeNull();
    expect(question()).toContain(AI_CARD.questionHe);
    expect(cardsShown()).toHaveLength(1);
    expect(cardsShown()[0].details).toMatchObject({ trigger_reason: 'hesitation_45s', error_category: 'procedural' });

    // It stays: nothing replaces it and nothing is emitted again.
    await tick(SOCRATIC_PROXY_TIMEOUT_MS * 2);
    expect(question()).toContain(AI_CARD.questionHe);
    expect(cardsShown()).toHaveLength(1);
    unmount();
  });

  it('the engine times out at 8 s: the static card and one event with null; the late reply is ignored', async () => {
    engineAnswers(SOCRATIC_PROXY_TIMEOUT_MS + 3_000, AI_CARD);
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    const expected = staticQuestion();

    await tick(SOCRATIC_PROXY_TIMEOUT_MS - 1);
    expect(pending()).not.toBeNull();
    expect(cardsShown()).toHaveLength(0);

    await tick(1);
    expect(pending()).toBeNull();
    expect(question()).toContain(expected);
    expect(ws().aiSocraticHint?.error_category).toBeNull();
    expect(cardsShown()).toHaveLength(1);
    expect(cardsShown()[0].details.error_category).toBeNull();

    // The engine's reply arrives 3 s later: the card does not change.
    await tick(5_000);
    expect(question()).toContain(expected);
    expect(question()).not.toContain(AI_CARD.questionHe);
    expect(cardsShown()).toHaveLength(1);
    unmount();
  });

  it('a network failure: the static card at once, with null', async () => {
    engineAnswers(0, new Error('network'));
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    const expected = staticQuestion();
    await tick(0);
    expect(pending()).toBeNull();
    expect(question()).toContain(expected);
    expect(cardsShown()).toHaveLength(1);
    expect(cardsShown()[0].details.error_category).toBeNull();
    unmount();
  });

  it('offline: the static card at once, without asking the engine, with null', async () => {
    const spy = engineAnswers(1_000, AI_CARD);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    expect(pending()).toBeNull();
    expect(question()).toContain(staticQuestion());
    expect(spy).not.toHaveBeenCalled();
    expect(cardsShown()).toHaveLength(1);
    expect(cardsShown()[0].details.error_category).toBeNull();
    unmount();
  });

  it('the exercise changes during the hourglass: no card and no event, then or later', async () => {
    engineAnswers(3_000, AI_CARD);
    ws().initSession(1, false, at('s1_r_group26')); // 26 cubes
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().setKeyboardSocratic(); });
    expect(pending()).not.toBeNull();

    act(() => {
      // Two groupings of the units, the child's own (audit A2-F06).
      ws().groupColumnClick('units');
      ws().groupColumnClick('units');
      useWorkspaceStore.setState({ answerDigits: { tens: '2', units: '6' } });
      ws().proceed();
      // Solved, then "ממשיכים" (owner, 7.10.2026).
      continueAfterSuccess();
    });
    await tick(5_000);
    expect(getActiveTasks(ws())[ws().standardTaskIdx].id).not.toBe('s1_r_group26');
    await tick(SOCRATIC_PROXY_TIMEOUT_MS * 2);
    expect(ws().helpState).toBe('closed');
    expect(ws().aiSocraticHint).toBeNull();
    expect(ws().socraticPending).toBe(false);
    // (The panel may still be fading out under framer-motion; it never got a card.)
    expect(question()).toBeNull();
    expect(cardsShown()).toHaveLength(0);
    unmount();
  });

  it('the child closes the card during the hourglass: no card and no event later', async () => {
    engineAnswers(3_000, AI_CARD);
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'סגירת חלונית העזרה' })); });
    expect(ws().helpState).toBe('closed');
    await tick(SOCRATIC_PROXY_TIMEOUT_MS * 2);
    expect(ws().helpState).toBe('closed');
    expect(ws().aiSocraticHint).toBeNull();
    expect(cardsShown()).toHaveLength(0);
    unmount();
  });

  it('repeated triggers do not stack: one request, one card, one event', async () => {
    const spy = engineAnswers(2_000, AI_CARD);
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => {
      ws().openSocraticCard('hesitation_45s');
      ws().openSocraticCard('hesitation_45s');
      ws().openSocraticCard('conversion_not_performed');
    });
    expect(spy).toHaveBeenCalledTimes(1);
    await tick(2_000);
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await tick(SOCRATIC_PROXY_TIMEOUT_MS * 2);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(question()).toContain(AI_CARD.questionHe);
    expect(cardsShown()).toHaveLength(1);
    unmount();
  });

  it('meeting 2 opens no card, not even an hourglass', () => {
    const spy = engineAnswers(1_000, AI_CARD);
    ws().initSession(2, false);
    ws().openSocraticCard('hesitation_45s');
    expect(ws().helpState).not.toBe('socratic');
    expect(ws().socraticPending).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
