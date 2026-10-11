import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { staticCardContextFor, cardFocusPlace, emptyColumnConversions, type SocraticTriggerReason } from '@/application/useWorkspaceStore';
import { SocraticEngine, GENERAL_FALLBACK, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { orderSocraticChoices } from '@/infrastructure/services/socraticOptionOrder';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TEACHER_DEMOS, type DemoStation } from '@/data/teacherDemos';
import { demoSessionTask } from '@/application/teacherDemoTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';
import { stepsOf } from '@/infrastructure/services/staticSocraticCards';

/**
 * The whole matrix of the static coaching cards (owner, 11.10.2026): every
 * learner exercise of stations 1 and 3–8, all four paths, compulsory and
 * choice, and every teacher demonstration, through the board states a child
 * really passes (empty, partly built, built before the conversion, each
 * conversion, the result being typed, a wrong digit, solved), every trigger,
 * and the three levels of a run. Each card:
 *  - is not the generic "מה הצעד הבא" card (the iron rule's fallback) — a
 *    specific situation is always recognisable on these boards;
 *  - is not refused by the iron rule (a leaked answer or hidden digit, a form
 *    rule) — the refusal is what sends a child to the generic card;
 *  - has exactly one correct option, as the card on the screen reads it.
 */

type Counts = Record<Place, number>;
const PLACES: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
const C = (th: number, h: number, t: number, u: number): Counts => ({ thousands: th, hundreds: h, tens: t, units: u });
const digitsOf = (n: number) => C(Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10);
const meetingOf = (id: string) => Number(/^s(\d)_/.exec(id)?.[1] ?? 0);
const valueOf = (c: Counts) => c.thousands * 1000 + c.hundreds * 100 + c.tens * 10 + c.units;
const width = (n: number) => String(Math.abs(n)).length;

interface St {
  label: string;
  counts: Counts;
  answer?: Partial<Record<Place, string>>;
  circles?: Partial<Record<Place, string>>;
  operand?: { a?: Partial<Record<Place, string>> };
  composed?: Place[];
  decomposed?: Place[];
  hasGrouped?: boolean;
  hasUngrouped?: boolean;
  blocksRemoved?: boolean;
  history?: Counts[];
  /** The column of the "own column" triggers (four errors, conversion not performed). */
  focus?: Place;
}

const isVertical = (t: SessionTask) => t.type === 'addition_simple' || t.type === 'vertical_addition';

/** The result row as typed so far: the given places, correct (or one wrong). */
function typed(task: SessionTask, answer: number, places: Place[], wrong?: Place): Partial<Record<Place, string>> {
  const out: Partial<Record<Place, string>> = {};
  const revealed = task.revealedResultDigits ?? [];
  for (const p of places) {
    if (revealed.includes(p)) continue;
    const d = Math.floor(answer / { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[p]) % 10;
    out[p] = String(p === wrong ? (d + 1) % 10 : d);
  }
  return out;
}

function hiddenTyped(task: SessionTask, a: number): { a?: Partial<Record<Place, string>> } | undefined {
  const hidden = task.hiddenDigits?.a;
  if (!hidden?.length) return undefined;
  const out: Partial<Record<Place, string>> = {};
  for (const p of hidden) out[p] = String(Math.floor(a / { units: 1, tens: 10, hundreds: 100, thousands: 1000 }[p]) % 10);
  return { a: out };
}

function verticalStates(task: SessionTask): St[] {
  const a = task.numberA as number;
  const b = task.numberB as number;
  const sub = Boolean(task.isSubtraction);
  const answer = sub ? a - b : a + b;
  const cols = PLACES.slice(0, Math.max(width(a), width(b), width(answer)));
  const da = digitsOf(a);
  const db = digitsOf(b);
  const states: St[] = [];
  const blocks = meetingOf(task.id) !== 8;
  const lowFirst = (places: Place[]) => places;
  const opnd = hiddenTyped(task, a);
  if (blocks) {
    states.push({ label: 'empty', counts: C(0, 0, 0, 0) });
    const top = cols.filter((p) => da[p] > 0).pop();
    if (top) states.push({ label: 'partly built', counts: { ...C(0, 0, 0, 0), [top]: da[top] } });
    states.push({ label: 'first number built', counts: { ...da } });
    if (!sub) {
      let c: Counts = { ...C(0, 0, 0, 0) };
      for (const p of PLACES) c[p] = da[p] + db[p];
      states.push({ label: 'both built, before grouping', counts: { ...c } });
      const composed: Place[] = [];
      for (const p of lowFirst(PLACES.slice(0, 3))) {
        if (c[p] >= 10) {
          const next = PLACES[PLACES.indexOf(p) + 1];
          c = { ...c, [p]: c[p] - 10, [next]: c[next] + 1 };
          composed.push(p);
          states.push({ label: `grouped ${p}`, counts: { ...c }, composed: [...composed], hasGrouped: true });
        }
      }
      const conv = composed.length ? { composed: [...composed], hasGrouped: true } : {};
      const firstConv = composed[0];
      if (firstConv) {
        // The digit typed without the grouping (the conversion not performed).
        const raw: Counts = { ...C(0, 0, 0, 0) };
        for (const p of PLACES) raw[p] = da[p] + db[p];
        states.push({ label: 'typed before grouping', counts: raw, answer: { [firstConv]: String(raw[firstConv] % 10) }, focus: firstConv, operand: opnd });
      }
      states.push({ label: 'result: lowest digit typed', counts: { ...c }, ...conv, answer: typed(task, answer, cols.slice(0, 1)), operand: opnd });
      states.push({ label: 'wrong digit', counts: { ...c }, ...conv, answer: typed(task, answer, cols.slice(0, 2), cols[1] ?? cols[0]), focus: cols[1] ?? cols[0], operand: opnd });
      states.push({ label: 'solved', counts: { ...c }, ...conv, answer: typed(task, answer, cols), operand: opnd });
    } else {
      let c: Counts = { ...da };
      const decomposed: Place[] = [];
      for (const p of PLACES.slice(0, 3)) {
        if (c[p] < db[p]) {
          // Break from the nearest column above that has a block.
          let i = PLACES.indexOf(p) + 1;
          while (i < PLACES.length && c[PLACES[i]] === 0) i++;
          for (let j = i; j > PLACES.indexOf(p); j--) {
            c = { ...c, [PLACES[j]]: c[PLACES[j]] - 1, [PLACES[j - 1]]: c[PLACES[j - 1]] + 10 };
            if (!decomposed.includes(PLACES[j - 1])) decomposed.push(PLACES[j - 1]);
            states.push({ label: `broke into ${PLACES[j - 1]}`, counts: { ...c }, decomposed: [...decomposed], hasUngrouped: true });
          }
        }
      }
      const conv = decomposed.length ? { decomposed: [...decomposed], hasUngrouped: true } : {};
      const first = decomposed[0];
      if (first) states.push({ label: 'typed before break', counts: { ...da }, answer: { [first]: String((10 + da[first] - db[first]) % 10) }, focus: first, operand: opnd });
      const removedHist = [{ ...da }];
      for (const p of PLACES) {
        if (db[p] > 0) {
          c = { ...c, [p]: c[p] - db[p] };
          states.push({ label: `took away ${p}`, counts: { ...c }, ...conv, blocksRemoved: true, history: removedHist });
        }
      }
      states.push({ label: 'result: lowest digit typed', counts: { ...c }, ...conv, blocksRemoved: true, history: removedHist, answer: typed(task, answer, cols.slice(0, 1)), operand: opnd });
      states.push({ label: 'wrong digit', counts: { ...c }, ...conv, blocksRemoved: true, history: removedHist, answer: typed(task, answer, cols.slice(0, 2), cols[1] ?? cols[0]), focus: cols[1] ?? cols[0], operand: opnd });
      states.push({ label: 'solved', counts: { ...c }, ...conv, blocksRemoved: true, history: removedHist, answer: typed(task, answer, cols), operand: opnd });
    }
  } else {
    const z = C(0, 0, 0, 0);
    states.push({ label: 'nothing typed', counts: z });
    states.push({ label: 'lowest digit typed', counts: z, answer: typed(task, answer, cols.slice(0, 1)), operand: opnd });
    states.push({ label: 'wrong digit', counts: z, answer: typed(task, answer, cols.slice(0, 2), cols[1] ?? cols[0]), focus: cols[1] ?? cols[0], operand: opnd });
    states.push({ label: 'solved', counts: z, answer: typed(task, answer, cols), operand: opnd });
  }
  if (task.hiddenDigits?.a?.length) {
    // The hidden digits: none typed yet, the board as above.
    states.push({ label: 'hidden digit not found yet', counts: blocks ? { ...digitsOf(b) } : C(0, 0, 0, 0) });
  }
  return states;
}

function representationStates(task: SessionTask): St[] {
  const target: Counts = task.requiredCounts
    ? { ...C(0, 0, 0, 0), ...task.requiredCounts }
    : typeof task.numberA === 'number' ? digitsOf(task.numberA) : C(0, 0, 0, 0);
  const start: Counts = task.initialCounts ? { ...C(0, 0, 0, 0), ...task.initialCounts } : C(0, 0, 0, 0);
  const answer = typeof task.correctAnswer === 'number' ? task.correctAnswer : valueOf(target);
  const cols = PLACES.slice(0, width(answer));
  const states: St[] = [{ label: 'start', counts: start }];
  const top = PLACES.filter((p) => target[p] > 0).pop();
  if (top && !task.initialCounts) states.push({ label: 'partly built', counts: { ...C(0, 0, 0, 0), [top]: target[top] } });
  if (typeof task.numberA === 'number' && !task.initialCounts) states.push({ label: 'number built standard', counts: digitsOf(task.numberA) });
  // The conversions the child made on the way to the target: a break (the
  // receiving column holds more than the standard number), a grouping (the
  // opening blocks hold more than the target).
  const conv: Pick<St, 'decomposed' | 'composed' | 'hasGrouped' | 'hasUngrouped'> = {};
  if (typeof task.numberA === 'number') {
    const std = digitsOf(task.numberA);
    const into = PLACES.filter((p) => target[p] > std[p] && !task.initialCounts);
    if (into.length) Object.assign(conv, { decomposed: into, hasUngrouped: true });
  }
  if (task.initialCounts) {
    const from = PLACES.filter((p) => start[p] > target[p]);
    if (from.length) Object.assign(conv, { composed: from, hasGrouped: true });
  }
  // Station 7's two steps: build the start, add, (break,) take away.
  const steps = stepsOf(task);
  if (steps) {
    const s0 = digitsOf(steps.start);
    states.push({ label: 'steps: start built', counts: s0 });
    const added: Counts = { ...s0 };
    for (const p of PLACES) added[p] += steps.add[p] ?? 0;
    states.push({ label: 'steps: added', counts: added });
    const rp = PLACES.find((p) => (steps.remove[p] ?? 0) > 0)!;
    if (added[rp] < steps.remove[rp]!) {
      const up = PLACES[PLACES.indexOf(rp) + 1];
      states.push({ label: 'steps: broke for the take-away', counts: { ...added, [up]: added[up] - 1, [rp]: added[rp] + 10 }, decomposed: [rp], hasUngrouped: true });
    }
  }
  states.push({ label: 'target built', counts: target, ...conv });
  states.push({ label: 'one block too many', counts: { ...target, units: target.units + 1 }, ...conv });
  states.push({ label: 'answer: lowest digit', counts: target, ...conv, answer: typed(task, answer, cols.slice(0, 1)) });
  states.push({ label: 'wrong digit', counts: target, ...conv, answer: typed(task, answer, cols.slice(0, 2), cols[1] ?? cols[0]), focus: cols[1] ?? cols[0] });
  states.push({ label: 'solved', counts: target, ...conv, answer: typed(task, answer, cols) });
  return states;
}

function choiceStates(task: SessionTask): St[] {
  const states: St[] = [{ label: 'empty', counts: C(0, 0, 0, 0) }];
  if (typeof task.numberA === 'number' && meetingOf(task.id) !== 8) states.push({ label: 'first number built', counts: digitsOf(task.numberA) });
  return states;
}

export function statesOf(task: SessionTask): St[] {
  if (isVertical(task) && typeof task.numberA === 'number' && typeof task.numberB === 'number') return verticalStates(task);
  if (task.type === 'representation') return representationStates(task);
  return choiceStates(task);
}

function storeState(s: St, task: SessionTask, kinds: string[]) {
  const conv = emptyColumnConversions();
  for (const p of s.composed ?? []) conv.composed[p] = true;
  for (const p of s.decomposed ?? []) conv.decomposed[p] = true;
  const history = s.history ?? [];
  return {
    sessionNumber: meetingOf(task.id), isASD: false, placeCuesShown: false,
    socraticCardKinds: { taskId: task.id, kinds }, conversionsByColumn: conv, hasGrouped: s.hasGrouped === true, hasUngrouped: s.hasUngrouped === true,
    counts: s.counts, answerDigits: s.answer ?? {}, carryDigits: s.circles ?? {}, operandDigits: { a: s.operand?.a ?? {}, b: {} },
    boardOpen: true, hasDeletedBlock: s.blocksRemoved === true,
    takeAwayTrack: task.isSubtraction ? { taskId: task.id, held: true, started: s.blocksRemoved === true } : undefined,
    undoStack: history.map((counts) => ({ counts, actionType: 'BLOCK_DRAG_COMPLETE' })),
    focusedPlace: null, socraticTriggerReason: null, socraticCardPlace: null, previousSocraticCard: null,
  } as any;
}

const TRIGGERS: SocraticTriggerReason[] = ['hesitation_45s', 'repeated_errors', 'consecutive_errors_4', 'conversion_not_performed', 'consecutive_undos_3'];

export interface MatrixRow { task: SessionTask; state: St; trigger: SocraticTriggerReason; level: number; card: SocraticHintResponse; refusal: string | null }

/** Runs one exercise through its states, triggers and levels. */
export function runMatrix(tasks: SessionTask[]): MatrixRow[] {
  const rows: MatrixRow[] = [];
  let lastWarn: string | null = null;
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.includes('iron rule')) lastWarn = msg;
  });
  try {
    for (const task of tasks) {
      if (task.type === 'session1_intro') continue;
      const m = meetingOf(task.id);
      for (const state of statesOf(task)) {
        for (const trigger of TRIGGERS) {
          if (trigger === 'consecutive_undos_3' && m !== 8) continue;
          const kinds: string[] = [];
          for (let level = 1; level <= 3; level++) {
            const base = storeState(state, task, kinds);
            const own = trigger === 'consecutive_errors_4' || trigger === 'conversion_not_performed';
            const place = own && state.focus ? state.focus : cardFocusPlace(base, task, trigger);
            const ctx = staticCardContextFor(base, task.id, task, { reason: trigger, place });
            lastWarn = null;
            const card = SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS, ...state.counts }, ctx);
            rows.push({ task, state, trigger, level, card, refusal: lastWarn });
            if (card.cardKind && !kinds.includes(card.cardKind)) kinds.push(card.cardKind);
          }
        }
      }
    }
  } finally {
    warn.mockRestore();
  }
  return rows;
}

export const isGeneric = (card: SocraticHintResponse) => card.situation === 'general_next_step';
export const correctCount = (card: SocraticHintResponse, taskId: string) =>
  orderSocraticChoices(card.choices, taskId, card.questionHe, card.correctChoiceId).filter((c) => c.isCorrect === true).length;

const learnerBank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path', 'graded_path', 'graded_foundation_path'] as const) {
    learnerBank.push(...getSessionTasks(m, p));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) learnerBank.push(...getSessionBranchTasks(m, b, p));
  }
}
const uniqueBank = [...new Map(learnerBank.map((t) => [t.id, t])).values()];
const demoTasks: SessionTask[] = (Object.entries(TEACHER_DEMOS) as unknown as [string, (typeof TEACHER_DEMOS)[DemoStation]][])
  .flatMap(([st, parts]) => parts.map((p) => demoSessionTask(Number(st) as DemoStation, p)));

function describeRow(r: MatrixRow) {
  return `${r.task.id} [${r.state.label}] ${r.trigger} L${r.level}: ${r.card.situation} — ${r.card.questionHe}${r.refusal ? ` (refused: ${r.refusal.replace(/^.*iron rule:\s*/, '')})` : ''}`;
}

describe('coaching cards, the whole matrix (exercise × board state × trigger × level)', () => {
  it('learner exercises: no generic card, no refusal, exactly one correct option', () => {
    const rows = runMatrix(uniqueBank);
    expect(rows.length).toBeGreaterThan(5000);
    const generic = rows.filter((r) => isGeneric(r.card) || r.refusal);
    const correct = rows.filter((r) => correctCount(r.card, r.task.id) !== 1);
    expect(correct.map(describeRow)).toEqual([]);
    expect([...new Set(generic.map(describeRow))]).toEqual([]);
  }, 180_000);

  it('teacher demonstrations: no generic card, no refusal, exactly one correct option', () => {
    const rows = runMatrix(demoTasks);
    const bad = rows.filter((r) => isGeneric(r.card) || r.refusal || correctCount(r.card, r.task.id) !== 1);
    expect([...new Set(bad.map(describeRow))]).toEqual([]);
  });
});

describe('the demonstrations get the card of the step on the board (owner, 11.10.2026)', () => {
  const card = (station: DemoStation, part: number, counts: Partial<Counts>, ctx: Record<string, unknown> = {}) =>
    SocraticEngine.getSynchronousTaskHint(demoSessionTask(station, TEACHER_DEMOS[station][part]), { ...EMPTY_COUNTS, ...counts }, { trigger: 'hesitation_45s', ...ctx } as any);

  it('station 3, part א: build, then break the hundred, then the number after the break', () => {
    expect(card(3, 0, { hundreds: 2 }).situation).toBe('build_before_conversion');
    expect(card(3, 0, { hundreds: 3, tens: 5 }).situation).toBe('break_as_asked');
    expect(card(3, 0, { hundreds: 2, tens: 15 }).situation).toBe('number_after_break');
  });

  it('station 7, part א (2▢3 + 134 = 35▢): its own card, the result never whole, then the column', () => {
    const first = card(7, 0, {});
    expect(first.situation).toBe('skeleton_missing_addend_and_result');
    expect(first.questionHe).toContain('2▢3 + 134 = 35▢');
    const texts = [first.questionHe, ...first.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])].join(' | ');
    expect(texts).not.toMatch(/357|(^|[^\d▢])7(?![\d▢])/);
    expect(card(7, 0, {}, { shownKinds: ['skeleton'] }).situation).toBe('skeleton_missing_result_column');
    expect(card(7, 0, {}, { shownKinds: ['skeleton'], answerDigits: { units: '7' } }).situation).toBe('skeleton_missing_addend_column');
  });

  it('station 7, part ב: the steps of 260, add a hundred, take away 8 tens', () => {
    expect(card(7, 1, { hundreds: 2, tens: 6 }, { shownKinds: ['steps'] }).situation).toBe('steps_add');
    expect(card(7, 1, { hundreds: 3, tens: 6 }).situation).toBe('steps_not_enough');
    expect(card(7, 1, { hundreds: 2, tens: 16 }, { shownKinds: ['steps'] }).situation).toBe('steps_remove');
  });
});

describe('a hidden digit 1 and the carried 1 (▢▢▢ + 258 = 673)', () => {
  it('the column card names the memory circle\'s 1, and is not refused', () => {
    const task = uniqueBank.find((t) => t.id === 's7_r_challenge_1')!;
    const c = SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS }, { trigger: 'consecutive_errors_4', focusColumn: 'tens', shownKinds: ['skeleton'] } as any);
    expect(c.situation).toBe('skeleton_missing_addend_column');
    expect(c.choices[0].feedbackHe).toContain('ועוד ה-1 שבעיגול הזיכרון');
  });
});

describe('the general card', () => {
  it('says which option is right, on every option (exactly one)', () => {
    expect(GENERAL_FALLBACK.choices.map((c) => c.isCorrect)).toEqual([true, false, false]);
    expect(GENERAL_FALLBACK.choices.find((c) => c.isCorrect)?.id).toBe(GENERAL_FALLBACK.correctChoiceId);
  });
});

describe('the AI path on 2▢3 + 134 = 35▢: the server refuses a card that gives a missing digit away', () => {
  it('the result, or the units digit of it, is refused; the static card passes', async () => {
    const task = demoTasks.find((t) => t.id === 's7_demo_s7_a')!;
    const counts = { ...EMPTY_COUNTS };
    const anchor = SocraticEngine.getSynchronousTaskHint(task, counts, { trigger: 'hesitation_45s' } as any);
    let captured: any = null;
    const proxy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(async (payload: any) => { captured = payload; throw new Error('captured'); });
    const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];
    await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task, targetNode: 'general', activeColumnName: 'יחידות', counts, qMatrixAnchor: anchor,
      monitoring: {
        studentId: 3, sessionNumber: 7, triggerReason: 'hesitation_45s', consecutiveErrors: 0, consecutiveUndos: 0, hesitationSeconds: 45,
        memoryCircles: {}, answerDigits: {}, operands: { a: 223, b: 134, isSubtraction: false }, activeColumnIndex: 0,
        hasRegroupedInCanvas: false, recentEvents: [], cardContext: { trigger: 'hesitation_45s' },
      },
    } as any);
    proxy.mockRestore();
    quiet.forEach((s) => s.mockRestore());
    const { validateSocraticRequest, deriveSocraticFacts, validateSocraticResponse } = await import('../../../../functions/src/socraticContract');
    const req = validateSocraticRequest(captured?.socratic_request);
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    const facts = deriveSocraticFacts(req.value);
    const respond = (q: string, right: string) => validateSocraticResponse({
      error_category: 'procedural',
      guiding_question: q,
      options: [
        { option_text: right, feedback_text: 'נכון מאוד! כתבו את הספרות בתיבות הריקות.', is_correct: true },
        { option_text: 'מתחילים מהטור השמאלי', feedback_text: 'רמז: מה קורה בטור היחידות?', is_correct: false },
        { option_text: 'מנחשים ספרות וכותבים אותן בתיבות', feedback_text: 'רמז: איך אפשר לבדוק אם הספרות נכונות?', is_correct: false },
      ],
    }, facts);
    expect(respond('נסו לחשוב: איך מגלים את הספרות החסרות?', 'מגלים שהתוצאה היא 357').ok).toBe(false);
    expect(respond('נסו לחשוב: איך מגלים את הספרות החסרות?', 'בטור היחידות כותבים 7').ok).toBe(false);
    const own = validateSocraticResponse({
      error_category: 'procedural', guiding_question: anchor.questionHe,
      options: anchor.choices.map((c) => ({ option_text: c.textHe, feedback_text: c.feedbackHe ?? '', is_correct: c.isCorrect ?? c.id === anchor.correctChoiceId })),
    }, facts);
    expect(own.ok).toBe(true);
  });
});
