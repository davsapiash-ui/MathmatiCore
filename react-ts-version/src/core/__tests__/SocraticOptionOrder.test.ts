/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/**
 * Owner's decision, 28.9.2026 ("מאשר לערבב את סדר התשובות"; register,
 * deviation 2): the correct option of the coaching card is no longer always
 * the first one — a child could learn to press the first answer, which
 * distorts G of the persistence index and the mediation measure.
 *
 * The order is deterministic, so research data stays comparable: the same for
 * every learner and every render, one rule for static and AI cards, and the
 * option's id and isCorrect — what SOCRATIC_OPTION_SELECTED records — do not
 * change.
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

import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { orderSocraticChoices, withShownOptionOrder } from '@/infrastructure/services/socraticOptionOrder';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { SocraticSidePanel } from '@/features/workspace/overlays/HelpOverlays';
import { tts } from '@/infrastructure/services/TTSService';

const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const SOME = { units: 3, tens: 2, hundreds: 1, thousands: 0 };

const tasks: SessionTask[] = [];
for (const meeting of [3, 4, 5, 6, 7, 8] as const) {
  for (const path of ['green_path', 'remediation_path'] as const) {
    tasks.push(...getSessionTasks(meeting, path));
    if (meeting <= 7) for (const b of ['reinforcement', 'challenge'] as const) tasks.push(...getSessionBranchTasks(meeting, b, path));
  }
}

/** Every distinct static card meetings 3–8 serve, as authored (correct first). */
const cards: { taskId: string; card: SocraticHintResponse }[] = [];
{
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const counts of [EMPTY, SOME]) {
      const card = SocraticEngine.getSynchronousTaskHint(task, counts);
      const key = `${task.id}|${card.questionHe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push({ taskId: task.id, card });
    }
  }
}

const correctPosition = (choices: { isCorrect?: boolean }[]) => choices.findIndex((c) => c.isCorrect === true);
const signature = (choices: { id: string; textHe: string; isCorrect?: boolean }[]) =>
  choices.map((c) => `${c.id}:${c.isCorrect}:${c.textHe}`).sort();

describe('the order of the options (owner, 28.9.2026)', () => {
  it('the static cards of meetings 3–8 are authored with the correct option first — the cue being removed', () => {
    expect(cards.length).toBeGreaterThan(50);
    expect(cards.every(({ card }) => correctPosition(card.choices) === 0)).toBe(true);
  });

  it('across the meeting 3–8 cards the correct option lands in every position, and is not always first', () => {
    const counts = [0, 0, 0];
    for (const { taskId, card } of cards) {
      const shown = withShownOptionOrder(card, taskId).choices;
      expect(shown).toHaveLength(3);
      counts[correctPosition(shown)]++;
    }
    expect(counts.every((n) => n > 0)).toBe(true);
    // No position dominates: each gets at least a fifth of the cards.
    for (const n of counts) expect(n).toBeGreaterThan(cards.length / 5);
  });

  it('keeps every option as it was: the same ids, texts, feedback and exactly one isCorrect', () => {
    for (const { taskId, card } of cards) {
      const shown = withShownOptionOrder(card, taskId).choices;
      expect(signature(shown)).toEqual(signature(card.choices));
      for (const c of shown) expect(c).toEqual(card.choices.find((o) => o.id === c.id));
      expect(shown.filter((c) => c.isCorrect === true)).toHaveLength(1);
    }
  });

  it('is a function of the exercise and the question only: the same on every call, whatever order the card arrived in', () => {
    for (const { taskId, card } of cards) {
      const a = orderSocraticChoices(card.choices, taskId, card.questionHe);
      const b = orderSocraticChoices([...card.choices].reverse(), taskId, card.questionHe);
      const c = orderSocraticChoices(a, taskId, card.questionHe);
      expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
      expect(c.map((x) => x.id)).toEqual(a.map((x) => x.id));
    }
  });

  it('an AI card is ordered by the same rule, after it is built', () => {
    const ai: SocraticHintResponse = {
      questionHe: 'מה בודקים לפני שממירים?',
      error_category: 'procedural',
      choices: [
        { id: 'opt_1', textHe: 'א', isCorrect: true, feedbackHe: 'נכון' },
        { id: 'opt_2', textHe: 'ב', isCorrect: false },
        { id: 'opt_3', textHe: 'ג', isCorrect: false },
      ],
      correctChoiceId: 'opt_1',
    };
    const positions = new Set<number>();
    for (const { taskId } of cards) {
      const shown = withShownOptionOrder(ai, taskId);
      expect(shown.correctChoiceId).toBe('opt_1');
      expect(shown.error_category).toBe('procedural');
      expect(shown.choices.find((c) => c.id === 'opt_1')?.isCorrect).toBe(true);
      positions.add(correctPosition(shown.choices));
    }
    expect(positions).toEqual(new Set([0, 1, 2]));
  });

  it('a card that leaves isCorrect implicit keeps its correct option: correctChoiceId, else the first as received', () => {
    const implicit = [{ id: 'opt_1', textHe: 'א' }, { id: 'opt_2', textHe: 'ב' }, { id: 'opt_3', textHe: 'ג' }];
    for (const { taskId } of cards.slice(0, 20)) {
      expect(orderSocraticChoices(implicit, taskId, 'q').find((c) => c.isCorrect)?.id).toBe('opt_1');
      expect(orderSocraticChoices(implicit, taskId, 'q', 'opt_2').find((c) => c.isCorrect)?.id).toBe('opt_2');
    }
  });
});

// ── The card as the child sees it ──────────────────────────────────────────

function openCardAs(studentNumber: number, meeting: 4 | 6, taskIdx: number) {
  useWorkspaceStore.getState().resetWorkspace();
  useAuthStore.setState({ user: { uid: `student_user${studentNumber}`, student_id: studentNumber, role: 'student' } } as any);
  useWorkspaceStore.getState().initSession(meeting, false, taskIdx);
  const s = useWorkspaceStore.getState();
  const task = getActiveTasks(s)[s.standardTaskIdx];
  // The card exactly as the store holds it (authored order, correct first).
  const card = SocraticEngine.getSynchronousTaskHint(task, s.counts);
  useWorkspaceStore.setState({ helpState: 'socratic', aiSocraticHint: card, socraticPenaltyLockoutUntil: 0 } as any);
  return { task, card };
}

const shownOptionTexts = (card: SocraticHintResponse) => {
  const texts = new Set(card.choices.map((c) => c.textHe));
  return screen.getAllByRole('button').map((b) => b.textContent ?? '').filter((t) => texts.has(t));
};

describe('the card panel shows the order, reads it aloud and records the same option', () => {
  beforeEach(() => {
    cleanup();
    emitted.length = 0;
  });

  it('two renders and two learners see the same order; the correct option is not first on every card', () => {
    const firstIsCorrect: boolean[] = [];
    for (const [meeting, idx] of [[4, 0], [4, 1], [4, 2], [6, 0], [6, 1], [6, 2]] as const) {
      const { card } = openCardAs(1, meeting, idx);
      const r1 = render(React.createElement(SocraticSidePanel, null));
      const orderA = shownOptionTexts(card);
      r1.unmount();
      const r2 = render(React.createElement(SocraticSidePanel, null));
      const orderB = shownOptionTexts(card);
      r2.unmount();
      openCardAs(7, meeting, idx);
      const r3 = render(React.createElement(SocraticSidePanel, null));
      const orderC = shownOptionTexts(card);
      r3.unmount();

      expect(orderA).toHaveLength(3);
      expect(orderB).toEqual(orderA);
      expect(orderC).toEqual(orderA);
      firstIsCorrect.push(orderA[0] === card.choices.find((c) => c.isCorrect)?.textHe);
    }
    expect(firstIsCorrect.every(Boolean)).toBe(false);
  });

  it('the read-aloud text lists the options in the shown order', () => {
    const { task, card } = openCardAs(1, 4, 1);
    render(React.createElement(SocraticSidePanel, null));
    const shown = shownOptionTexts(card);
    const expected = withShownOptionOrder(card, task.id).choices.map((c) => c.textHe);
    expect(shown).toEqual(expected);
    const speak = vi.spyOn(tts, 'speak').mockImplementation(() => 1);
    fireEvent.click(screen.getByLabelText('הקראה בקול'));
    expect(speak).toHaveBeenCalledTimes(1);
    const spoken = String(speak.mock.calls[0][0]);
    const at = expected.map((t) => spoken.indexOf(t));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    speak.mockRestore();
  });

  it('SOCRATIC_OPTION_SELECTED records the option id and is_correct of the option pressed, wherever it stands', () => {
    for (const [meeting, idx] of [[4, 0], [6, 1]] as const) {
      const { card } = openCardAs(1, meeting, idx);
      const r = render(React.createElement(SocraticSidePanel, null));
      const correct = card.choices.find((c) => c.isCorrect)!;
      const wrong = card.choices.find((c) => !c.isCorrect)!;
      fireEvent.click(screen.getByText(correct.textHe));
      r.unmount();
      openCardAs(1, meeting, idx);
      const r2 = render(React.createElement(SocraticSidePanel, null));
      fireEvent.click(screen.getByText(wrong.textHe));
      r2.unmount();

      const picks = emitted.filter((e) => e.event_type === 'SOCRATIC_OPTION_SELECTED').slice(-2);
      expect(picks.map((e) => e.details)).toEqual([
        { option_id: correct.id, is_correct: true },
        { option_id: wrong.id, is_correct: false },
      ]);
    }
  });
});
