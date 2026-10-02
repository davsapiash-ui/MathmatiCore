/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';

/**
 * 2.10.2026: every card a child sees is saved with its text, so the pilot's
 * real cards can be read and the engine tuned. SOCRATIC_CARD_SHOWN carries
 * the guiding question and the three options in id order — the engine's card
 * and the static one alike. The card is generated text, not the learner's;
 * the research export keeps it, the teacher's timeline still describes the
 * event by its trigger, and the event stays far under the 50KB chunk.
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
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';
import { socraticCardTextDetails, socraticOptionKey } from '@/infrastructure/services/socraticCardText';
import { describeEvent } from '@/infrastructure/services/LearnerJourneyService';
import { MAX_PAYLOAD_BYTES } from '@/infrastructure/services/FirebaseSyncService';
import { researchDetailsColumns } from '../../../../functions/src/researchTelemetryRow';

const ws = () => useWorkspaceStore.getState();
const cardsShown = () => emitted.filter((e) => e.event_type === 'SOCRATIC_CARD_SHOWN');

// The engine's card, its options not in id order.
const AI_CARD: SocraticHintResponse = {
  pedagogical_intent: 'procedural',
  error_category: 'procedural',
  source: 'gemini',
  modelId: 'gemini-3.8-flash',
  questionHe: 'נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?',
  choices: [
    { id: 'opt_2', textHe: 'כותבים מספר בשורת התוצאה', isCorrect: false, feedbackHe: 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?' },
    { id: 'opt_1', textHe: 'בונים בבית המספרים את מה שההנחיה מבקשת', isCorrect: true, feedbackHe: 'נכון מאוד! בנו את מה שההנחיה מבקשת.' },
    { id: 'opt_3', textHe: 'מנחשים את התשובה', isCorrect: false, feedbackHe: 'רמז: מה אפשר לבנות במקום לנחש?' },
  ],
  correctChoiceId: 'opt_1',
} as SocraticHintResponse;

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('SOCRATIC_CARD_SHOWN carries the card\'s text (2.10.2026)', () => {
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

  it('the engine\'s card: the question and the options in id order', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise((r) => setTimeout(() => r(AI_CARD), 1_000)));
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await tick(1_000);
    expect(cardsShown()).toHaveLength(1);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('ai');
    expect(d.card_question_he).toBe(AI_CARD.questionHe);
    expect(d.card_options_he).toEqual(['בונים בבית המספרים את מה שההנחיה מבקשת', 'כותבים מספר בשורת התוצאה', 'מנחשים את התשובה']);
    unmount();
  });

  it('the static card (the engine failed): its own text, three options', async () => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockImplementation(() => new Promise((_, rej) => setTimeout(() => rej(new Error('down')), 500)));
    const { unmount } = render(React.createElement(SocraticSidePanel, null));
    act(() => { ws().openSocraticCard('hesitation_45s'); });
    await tick(500);
    expect(cardsShown()).toHaveLength(1);
    const d = cardsShown()[0].details;
    expect(d.card_source).toBe('static');
    const s = ws();
    const shown = s.aiSocraticHint!;
    expect(d.card_question_he).toBe(shown.questionHe);
    expect(d.card_options_he).toHaveLength(3);
    expect(d.card_options_he.every((t: string) => t.length > 0)).toBe(true);
    expect(getActiveTasks(s)[s.standardTaskIdx]).toBeTruthy();
    unmount();
  });

  it('the export keeps the text; the timeline still reads the trigger; the event stays far under 50KB', () => {
    const details = { trigger_reason: 'hesitation_45s', error_category: 'procedural', card_source: 'ai', model_id: 'gemini-3.8-flash', card_situation: 'board_empty_build_first', card_level: 1, ...socraticCardTextDetails(AI_CARD) };
    const cols = researchDetailsColumns('SOCRATIC_CARD_SHOWN', details);
    expect(cols.card_question_he).toBe(AI_CARD.questionHe);
    expect(cols.card_options_he).toBe('בונים בבית המספרים את מה שההנחיה מבקשת | כותבים מספר בשורת התוצאה | מנחשים את התשובה');
    const row = describeEvent({ id: 'e', timestamp: 0, sessionNumber: 1, sessionId: 'session_1_student_1', exerciseId: 's1_t8', eventType: 'SOCRATIC_CARD_SHOWN', columnIndex: 0, details });
    expect(row.detail).not.toContain(AI_CARD.questionHe);
    expect(row.detail.length).toBeGreaterThan(0);
    const longest = socraticCardTextDetails({ questionHe: 'א'.repeat(5000), choices: [1, 2, 3].map((i) => ({ id: `opt_${i}`, textHe: 'ב'.repeat(5000) })) });
    expect(new TextEncoder().encode(JSON.stringify({ details: { ...details, ...longest } })).length).toBeLessThan(MAX_PAYLOAD_BYTES / 10);
  });

  it('ids map as the option event maps them; a missing option stays empty', () => {
    expect(['opt_1', 'opt_2', 'opt_3', 'A', 'B', 'C', '1', '2', '3'].map(socraticOptionKey)).toEqual(['opt_1', 'opt_2', 'opt_3', 'opt_1', 'opt_2', 'opt_3', 'opt_1', 'opt_2', 'opt_3']);
    expect(socraticCardTextDetails({ questionHe: '  שאלה\n  קצרה? ', choices: [{ id: 'B', textHe: 'ב' }] })).toEqual({ card_question_he: 'שאלה קצרה?', card_options_he: ['', 'ב', ''] });
  });
});
