/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * 7.10.2026, owner: the measurement counts what the child saw. Every static
 * card a child sees says why the engine's card is not the one shown, and every
 * card says how long the hourglass turned — so the research data and the admin
 * console agree with the screen, not with the server's own count.
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
import { SocraticEngine, fallbackReasonOfError, ruleCode, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';

const ws = () => useWorkspaceStore.getState();
const cardsShown = () => emitted.filter((e) => e.event_type === 'SOCRATIC_CARD_SHOWN');

const AI_CARD: SocraticHintResponse = {
  pedagogical_intent: 'procedural',
  error_category: 'procedural',
  source: 'gemini',
  modelId: 'gemini-3.8-flash',
  questionHe: 'נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?',
  choices: [
    { id: 'opt_1', textHe: 'בונים בבית המספרים את מה שההנחיה מבקשת', isCorrect: true, feedbackHe: 'נכון מאוד!' },
    { id: 'opt_2', textHe: 'כותבים מספר בשורת התוצאה', isCorrect: false, feedbackHe: 'רמז: מה ההנחיה מבקשת?' },
    { id: 'opt_3', textHe: 'מנחשים את התשובה', isCorrect: false, feedbackHe: 'רמז: מה אפשר לבנות?' },
  ],
  correctChoiceId: 'opt_1',
} as SocraticHintResponse;

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('every card says how it reached the child (7.10.2026)', () => {
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
  });

  const openAndShow = async (wait: number) => {
    const view = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await tick(wait);
    return view;
  };

  it('the engine\'s card: no fallback reason, and the hourglass time', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise((r) => setTimeout(() => r(AI_CARD), 1_200)));
    const { unmount } = await openAndShow(1_200);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('ai');
    expect(d.card_fallback_reason).toBeUndefined();
    expect(d.card_fallback_detail).toBeUndefined();
    expect(d.card_wait_ms).toBeGreaterThanOrEqual(1_200);
    expect(d.card_wait_ms).toBeLessThan(2_000);
    unmount();
  });

  it('no answer within 8 s: the static card, "timeout"', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise(() => undefined));
    const { unmount } = await openAndShow(8_000);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('static');
    expect(d.card_fallback_reason).toBe('timeout');
    expect(d.card_wait_ms).toBeGreaterThanOrEqual(8_000);
    unmount();
  });

  it('the engine\'s own static card: its reason and code go into the event', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(async () => ({ ...AI_CARD, source: 'static', error_category: null, fallbackReason: 'rule_rejected', fallbackDetail: 'hidden_number_leaked' }) as SocraticHintResponse);
    const { unmount } = await openAndShow(10);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('static');
    expect(d.card_fallback_reason).toBe('rule_rejected');
    expect(d.card_fallback_detail).toBe('hidden_number_leaked');
    unmount();
  });

  it('a failure on the learner side: "error"', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise((_, rej) => setTimeout(() => rej(new Error('down')), 300)));
    const { unmount } = await openAndShow(300);
    expect(cardsShown()[0].details.card_fallback_reason).toBe('error');
    unmount();
  });

  it('no network: "offline", and the engine is not asked', async () => {
    const spy = vi.spyOn(SocraticEngine, 'getSocraticHint');
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { unmount } = await openAndShow(10);
    expect(spy).not.toHaveBeenCalled();
    expect(cardsShown()[0].details.card_fallback_reason).toBe('offline');
    online.mockRestore();
    unmount();
  });

  it('the board changed under the hourglass: the engine\'s answer is replaced, "board_changed"', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise((r) => setTimeout(() => r(AI_CARD), 1_000)));
    const view = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await tick(300);
    act(() => { useWorkspaceStore.setState((s) => ({ counts: { ...s.counts, units: s.counts.units + 1 } })); });
    await tick(700);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('static');
    expect(d.card_fallback_reason).toBe('board_changed');
    view.unmount();
  });
});

describe('the engine call says why it gave no card', () => {
  const task = { id: 's4_g_t1', type: 'vertical_addition', numberA: 1245, numberB: 328 };
  const anchor = { questionHe: 'שאלה?', choices: [{ id: 'opt_1', textHe: 'א', isCorrect: true }, { id: 'opt_2', textHe: 'ב' }, { id: 'opt_3', textHe: 'ג' }] } as SocraticHintResponse;
  const ask = async (proxy: () => Promise<{ data: any }>, currentTask: any = task) => {
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(proxy);
    const why: Array<[string, string | undefined]> = [];
    const card = await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask, targetNode: 'n', activeColumnName: 'יחידות', counts: { units: 13, tens: 6, hundreds: 5, thousands: 1 },
      qMatrixAnchor: anchor, monitoring: { studentId: 3, sessionNumber: 4 }, onFallback: (r, d) => why.push([r, d]),
    });
    return { card, why };
  };
  afterEach(() => { vi.restoreAllMocks(); });

  it('the server\'s error code: server_failed with the code; its deadline: timeout; unreachable: offline', async () => {
    expect((await ask(async () => { throw Object.assign(new Error('x'), { code: 'functions/resource-exhausted' }); })).why).toEqual([['server_failed', 'resource-exhausted']]);
    expect((await ask(async () => { throw Object.assign(new Error('x'), { code: 'functions/deadline-exceeded' }); })).why).toEqual([['timeout', 'deadline-exceeded']]);
    expect((await ask(async () => { throw Object.assign(new Error('x'), { code: 'functions/unavailable' }); })).why).toEqual([['offline', 'unavailable']]);
  });

  it('an incomplete card: schema_rejected', async () => {
    const r = await ask(async () => ({ data: { guiding_question: '', options: [] } }));
    expect(r.card).toBeNull();
    expect(r.why[0][0]).toBe('schema_rejected');
  });

  it('the sandbox is never coached: not_coached, and the server is not asked', async () => {
    const r = await ask(async () => { throw new Error('must not be called'); }, { id: 's1_sandbox_controlled', type: 'session1_intro' });
    expect(r.why).toEqual([['not_coached', undefined]]);
    expect(SocraticEngine.callGeminiProxy).not.toHaveBeenCalled();
  });

  it('the codes are short and carry no free text', () => {
    expect(ruleCode('hidden number leaked')).toBe('hidden_number_leaked');
    // At most 40 characters: the research export keeps the code only if it fits.
    expect(ruleCode("marks the instruction's representation wrong")).toBe('marks_the_instruction_s_representation_w');
    expect(fallbackReasonOfError(new Error('Gemini Socratic Proxy timeout'))).toEqual({ reason: 'timeout', detail: undefined });
    expect(fallbackReasonOfError(new Error('anything'))).toEqual({ reason: 'error' });
  });
});
