import { describe, it, expect, vi } from 'vitest';

/**
 * A static card is the exemplar the engine is told to imitate (owner,
 * 1.10.2026: "the static cards are the base and the boundaries"). Every
 * static card the client can produce — every bank, board state, trigger and
 * level, and the 107 situations of the coverage table, through the store's
 * context — is sent through the server's own request builder and response
 * validator (functions/src/socraticContract.ts, read from source, unedited):
 * a card the server would refuse from the engine is a contradiction.
 *
 * The cards it refuses today are the owner's (left as they are, listed for
 * him — integration report, 2.10.2026): three approved hints of 30.9 that ask
 * two questions (C1, C5, C7), and station 1's 368 card ("כמה שוות 6 לבני
 * עשרת?"). Any other refusal fails here.
 */

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { staticCardContextFor, cardFocusPlace, emptyColumnConversions, placeToColumnIndex, type SocraticTriggerReason } from '@/application/useWorkspaceStore';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';
import { validateSocraticRequest, deriveSocraticFacts, validateSocraticResponse } from '../../../../functions/src/socraticContract';
import { CARD_SITUATIONS } from './fixtures/staticCardSituations_2_10';
import { socraticStyleSpec } from '../../../../functions/src/socraticLanguage';

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) bank.push(...getSessionBranchTasks(m, b, p));
  }
}
const byId = (id: string) => bank.find((x) => x.id === id)!;
type Counts = Record<Place, number>;
const C = (th: number, h: number, t: number, u: number): Counts => ({ thousands: th, hundreds: h, tens: t, units: u });
const digitsOf = (n: number) => C(Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10);
const meetingOf = (id: string) => Number(/^s(\d)_/.exec(id)?.[1] ?? 0);

function stateOf(s: any, task: any, kinds: string[]) {
  const conv = emptyColumnConversions();
  for (const p of s.composed ?? []) conv.composed[p as Place] = true;
  for (const p of s.decomposed ?? []) conv.decomposed[p as Place] = true;
  if (s.times) conv.times = s.times;
  const history = s.history ?? (s.blocksRemoved && task.initialCounts ? [{ ...EMPTY_COUNTS, ...task.initialCounts }]
    : s.blocksRemoved && typeof task.numberA === 'number' ? [digitsOf(task.numberA)] : []);
  return {
    sessionNumber: meetingOf(task.id), isASD: false, placeCuesShown: s.placeCuesShown === true,
    socraticCardKinds: { taskId: task.id, kinds }, conversionsByColumn: conv, hasGrouped: s.hasGrouped === true, hasUngrouped: s.hasUngrouped === true,
    counts: s.counts, answerDigits: s.answer ?? {}, carryDigits: s.circles ?? {}, operandDigits: { a: s.operand?.a ?? {}, b: s.operand?.b ?? {} },
    boardOpen: s.boardHidden !== true, hasDeletedBlock: s.blocksRemoved === true,
    undoStack: history.map((counts: Counts) => ({ counts, actionType: 'BLOCK_DRAG_COMPLETE' })),
    focusedPlace: s.focusedPlace ?? null, socraticTriggerReason: null, socraticCardPlace: null, previousSocraticCard: null,
  } as any;
}

/** The refusals of today: the owner's texts, left as they are (situation, the validator's reason). */
const OWNER_ITEMS = [
  'digit_column :: secret number leaked as block counts',
  'number_after_break :: form: a wrong option\'s feedback must be ONE question',
  'check_enough_to_subtract :: form: a wrong option\'s feedback must be ONE question',
  'number_after_grouping :: form: a wrong option\'s feedback must be ONE question',
];

describe('every static card the client produces, through the server\'s validator', () => {
  it('the server refuses none of them but the owner\'s open items', async () => {
    const cases: { task: any; s: any; trigger: SocraticTriggerReason; focus?: Place }[] = [];
    for (const s of CARD_SITUATIONS) cases.push({ task: byId(s.task), s, trigger: s.trigger, focus: s.focus });
    for (const task of bank) {
      if (task.type === 'session1_intro') continue;
      const states: Counts[] = [C(0, 0, 0, 0), C(0, 1, 2, 3), C(0, 0, 1, 12), C(0, 0, 14, 3), C(0, 12, 0, 0)];
      if (typeof task.numberA === 'number') states.push(digitsOf(task.numberA));
      if (typeof task.numberA === 'number' && typeof task.numberB === 'number') {
        states.push(digitsOf(task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB));
        states.push(digitsOf(task.numberA + (task.isSubtraction ? 10 : 0)));
      }
      if (task.requiredCounts) states.push({ ...C(0, 0, 0, 0), ...task.requiredCounts });
      for (const counts of states) {
        for (const trigger of ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'] as SocraticTriggerReason[]) {
          if (trigger === 'consecutive_undos_3' && meetingOf(task.id) !== 8) continue;
          cases.push({ task, s: { counts }, trigger });
        }
      }
    }
    let captured: any = null;
    const proxy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(async (payload: any) => { captured = payload; throw new Error('captured'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const refused = new Map<string, string>();
    let checked = 0;
    const shownTexts = new Set<string>();
    for (const { task, s, trigger, focus } of cases) {
      const kinds: string[] = [];
      for (let level = 1; level <= 3; level++) {
        const base = stateOf({ ...s, focusedPlace: trigger === 'hesitation_45s' ? focus : undefined }, task, kinds);
        const own = trigger === 'consecutive_errors_4' || trigger === 'conversion_not_performed' || trigger === 'consecutive_undos_3';
        const place = own && focus ? focus : cardFocusPlace(base, task, trigger);
        const ctx = staticCardContextFor(base, task.id, task, { reason: trigger, place });
        const card: SocraticHintResponse = SocraticEngine.getSynchronousTaskHint(task, s.counts, ctx);
        if (card.cardKind && !kinds.includes(card.cardKind)) kinds.push(card.cardKind);
        captured = null;
        const ops = typeof task.numberA === 'number' && typeof task.numberB === 'number';
        await SocraticEngine.fetchGroundedGeminiSocraticQuery({
          currentTask: task, targetNode: task.targetNode ?? 'general', activeColumnName: 'יחידות', counts: s.counts, qMatrixAnchor: card,
          monitoring: {
            studentId: 3, sessionNumber: meetingOf(task.id), triggerReason: trigger,
            consecutiveErrors: trigger === 'consecutive_errors_4' ? 4 : 0, consecutiveUndos: trigger === 'consecutive_undos_3' ? 3 : 0,
            hesitationSeconds: trigger === 'hesitation_45s' ? 45 : 0, memoryCircles: base.carryDigits, answerDigits: base.answerDigits,
            operands: ops ? { a: task.numberA, b: task.numberB, isSubtraction: Boolean(task.isSubtraction) } : null,
            activeColumnIndex: place ? placeToColumnIndex(place) : 0, hasRegroupedInCanvas: Boolean(s.hasGrouped || s.hasUngrouped),
            conversionsDone: ctx.conversionsDone as Place[] | undefined, recentEvents: [], cardContext: ctx,
          },
        });
        expect(captured?.socratic_request, `${task.id}: no request`).toBeTruthy();
        const req = validateSocraticRequest(captured.socratic_request);
        expect(req.ok, `${task.id}: ${!req.ok ? req.reason : ''}`).toBe(true);
        if (!req.ok) continue;
        const res = validateSocraticResponse({
          error_category: 'procedural',
          guiding_question: card.questionHe,
          options: card.choices.map((c) => ({ option_text: c.textHe, feedback_text: c.feedbackHe ?? '', is_correct: c.isCorrect ?? c.id === card.correctChoiceId })),
        }, deriveSocraticFacts(req.value));
        checked++;
        for (const c of card.choices) shownTexts.add(`${card.questionHe} | ${c.textHe} | ${c.feedbackHe ?? ''}`);
        if (!res.ok) refused.set(`${card.situation} :: ${res.reason.split(' — ')[0]}`, `${task.id} ${JSON.stringify(s.counts)} ${trigger} L${level}: ${card.questionHe}`);
      }
    }
    proxy.mockRestore();
    warn.mockRestore();
    error.mockRestore();
    expect(checked).toBeGreaterThan(10000);
    // The engine's style examples (socraticStyleSpec, 2.10.2026) are decided cards, verbatim: question, options and feedback.
    for (const blocks of [true, false]) {
      for (const line of socraticStyleSpec(blocks).split('\n').filter((l) => l.startsWith('• '))) {
        const [q, ...opts] = line.slice(2).split(' | ');
        for (const o of opts) {
          const [text, fb] = o.slice(2).split(' → ');
          const hit = fb !== undefined ? shownTexts.has(`${q} | ${text} | ${fb}`) : [...shownTexts].some((t) => t.startsWith(`${q} | ${text} | `));
          expect(hit, `not a static card: ${q} | ${o}`).toBe(true);
        }
      }
    }
    const unexpected = [...refused].filter(([k]) => !OWNER_ITEMS.includes(k)).map(([k, v]) => `${k} — e.g. ${v}`);
    expect(unexpected).toEqual([]);
  }, 120_000);
});
