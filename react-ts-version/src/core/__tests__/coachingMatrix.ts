/**
 * The coaching-card matrix (owner, 11.10.2026), shared by the matrix test and
 * the server check of every card version: the exercises, the board states a
 * child passes, every trigger and the three levels of a run.
 */
import { vi } from 'vitest';
import { staticCardContextFor, cardFocusPlace, emptyColumnConversions, type SocraticTriggerReason } from '@/application/useWorkspaceStore';
import { SocraticEngine, GENERAL_FALLBACK, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { orderSocraticChoices } from '@/infrastructure/services/socraticOptionOrder';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { TEACHER_DEMOS, type DemoStation } from '@/data/teacherDemos';
import { demoSessionTask } from '@/application/teacherDemoTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';
import { stepsOf, cardVariantKey, type StaticCardContext } from '@/infrastructure/services/staticSocraticCards';

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

export interface MatrixRow { task: SessionTask; state: St; trigger: SocraticTriggerReason; level: number; card: SocraticHintResponse; refusal: string | null; ctx: StaticCardContext; counts: Counts; variant: number }

/** Every card is checked in each of its versions (owner, 11.10.2026): the first, and the variants a repeat of the same situation shows. */
export const VARIANTS_CHECKED = 3;

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
            const counts = { ...EMPTY_COUNTS, ...state.counts };
            lastWarn = null;
            const card = SocraticEngine.getSynchronousTaskHint(task, counts, ctx);
            rows.push({ task, state, trigger, level, card, refusal: lastWarn, ctx, counts, variant: 0 });
            // The same situation again in the same exercise: its next versions.
            const key = cardVariantKey(card);
            for (let v = 1; v < VARIANTS_CHECKED; v++) {
              const vctx: StaticCardContext = { ...ctx, cardShows: { ...(ctx.cardShows ?? {}), [key]: v } };
              lastWarn = null;
              const again = SocraticEngine.getSynchronousTaskHint(task, counts, vctx);
              rows.push({ task, state, trigger, level, card: again, refusal: lastWarn, ctx: vctx, counts, variant: v });
            }
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
export const uniqueBank = [...new Map(learnerBank.map((t) => [t.id, t])).values()];
export const demoTasks: SessionTask[] = (Object.entries(TEACHER_DEMOS) as unknown as [string, (typeof TEACHER_DEMOS)[DemoStation]][])
  .flatMap(([st, parts]) => parts.map((p) => demoSessionTask(Number(st) as DemoStation, p)));

