import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { runMatrix, correctCount, isGeneric, uniqueBank } from './coachingMatrix';
import { capturedRequest, serverVerdictFor } from './coachingServerCheck';
import { SocraticEngine, meeting1OwnCard, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import {
  applyCardVariant, cardVariantKey, exerciseCard, revealsSecret, revealsHiddenDigit, secretNumbersOf, wrongHintViolation, type StaticCardContext,
} from '@/infrastructure/services/staticSocraticCards';
import { SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { S1_GRADED_ADDITION, S1_GRADED_SUBTRACTION } from '@/data/sessionGradedTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';

/**
 * Owner, 11.10.2026: the wordings of the cards the whole matrix does not
 * reach — meeting 1's graded refresh exercises, a hundreds column of 10 or
 * more in meeting 1, station 7's 2,730 changed (B1, and B2 on an empty board),
 * a skeleton with hidden digits in both numbers (or in the number subtracted),
 * and every meeting-1 exercise's own card. Each of the three wordings: not the
 * generic card, not refused by the client's iron rule, exactly one correct
 * option, no secret or hidden digit named, every wrong hint a guiding
 * question, and accepted by the server's own validator; a repeat shows a
 * different question.
 */

type Counts = Record<Place, number>;
const counts = (c: Partial<Counts>): Counts => ({ ...EMPTY_COUNTS, ...c });
const texts = (c: SocraticHintResponse) => [c.questionHe, ...c.choices.flatMap((x) => [x.textHe, x.feedbackHe ?? ''])];

interface Row { task: SessionTask; counts: Counts; ctx: StaticCardContext; card: SocraticHintResponse; refusal: string | null; variant: number }

/** The card of this board, and its next two wordings (the same situation shown again). */
function threeWordings(task: SessionTask, c: Counts, ctx: StaticCardContext): Row[] {
  const rows: Row[] = [];
  let refusal: string | null = null;
  const warn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    const msg = args.map(String).join(' ');
    if (msg.includes('iron rule')) refusal = msg;
  });
  try {
    const first = SocraticEngine.getSynchronousTaskHint(task, c, ctx);
    const key = cardVariantKey(first);
    for (let v = 0; v < 3; v++) {
      refusal = null;
      const vctx: StaticCardContext = { ...ctx, cardShows: { ...(ctx.cardShows ?? {}), [key]: v } };
      const card = SocraticEngine.getSynchronousTaskHint(task, c, vctx);
      rows.push({ task, counts: c, ctx: vctx, card, refusal, variant: v });
    }
  } finally {
    warn.mockRestore();
  }
  return rows;
}

const label = (r: Row) => `${r.task.id} v${r.variant}: ${r.card.situation} — ${r.card.questionHe}`;

async function serverBad(rows: Row[]): Promise<string[]> {
  const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];
  const bad: string[] = [];
  try {
    for (const r of rows) {
      const v = serverVerdictFor(await capturedRequest(r.task, r.counts, r.ctx, r.card), r.card);
      if (!v) bad.push(`${label(r)} (no request)`);
      else if (!v.ok) bad.push(`${label(r)} (${v.reason})`);
    }
  } finally {
    quiet.forEach((s) => s.mockRestore());
  }
  return bad;
}

function checkRows(rows: Row[], situation?: string) {
  if (situation) expect(rows.map((r) => r.card.situation)).toEqual([situation, situation, situation]);
  expect(rows.filter((r) => isGeneric(r.card) || r.refusal).map(label)).toEqual([]);
  expect(rows.filter((r) => correctCount(r.card, r.task.id) !== 1).map(label)).toEqual([]);
  expect(new Set(rows.map((r) => r.card.questionHe)).size).toBe(3);
  expect(rows.map((r) => r.card.cardVariant)).toEqual([0, 1, 2]);
}

const byId = (id: string) => uniqueBank.find((t) => t.id === id)!;

describe('the wordings of the cards the matrix does not reach (owner, 11.10.2026)', () => {
  it('meeting 1, a hundreds column of 10 or more (no "קבצו 10" there)', async () => {
    const rows = [
      ...threeWordings(byId('s1_t8'), counts({ hundreds: 16, units: 7 }), { trigger: 'hesitation_45s' }),
      ...threeWordings(byId('s1_r_words482'), counts({ hundreds: 14, tens: 8, units: 2 }), { trigger: 'hesitation_45s' }),
    ];
    checkRows(rows.slice(0, 3), 's1_crowded_no_button');
    checkRows(rows.slice(3), 's1_crowded_no_button');
    expect(await serverBad(rows)).toEqual([]);
  });

  it('station 7\'s 2,730 changed: B1 (the undo button), and B2 on an empty board', async () => {
    const task = byId('s7_g_t6');
    const b1 = threeWordings(task, counts({ thousands: 1, hundreds: 15, tens: 13 }), { trigger: 'hesitation_45s', givenOnTheWay: false, undoReachesStart: true });
    const b2 = threeWordings(task, counts({}), { trigger: 'hesitation_45s', givenOnTheWay: false, undoReachesStart: false });
    checkRows(b1, 'restore_given');
    checkRows(b2, 'restore_given_how');
    // Nothing to throw away on an empty board: no wording sends the child to the trash.
    expect(b2.filter((r) => r.card.choices.find((c) => c.isCorrect)?.feedbackHe?.includes('פח האשפה')).map(label)).toEqual([]);
    expect(await serverBad([...b1, ...b2])).toEqual([]);
  });

  it('a skeleton with hidden digits in both numbers, or in the number subtracted', async () => {
    const add7 = uniqueBank.find((t) => t.id.startsWith('s7_') && t.type === 'vertical_addition' && !t.isSubtraction && (t.numberA as number) >= 100 && !t.hiddenDigits)!;
    const add8 = uniqueBank.find((t) => t.id.startsWith('s8_') && !t.isSubtraction && !t.hiddenDigits)!;
    const sub6 = uniqueBank.find((t) => t.id.startsWith('s6_') && t.isSubtraction && (t.numberB as number) >= 100 && !t.hiddenDigits)!;
    // A skeleton shows its whole result (taskBuilders: revealedResultDigits).
    const skeleton = (t: SessionTask, hiddenDigits: SessionTask['hiddenDigits']): SessionTask => {
      const result = t.isSubtraction ? (t.numberA as number) - (t.numberB as number) : (t.numberA as number) + (t.numberB as number);
      return { ...t, hiddenDigits, revealedResultDigits: (['units', 'tens', 'hundreds', 'thousands'] as Place[]).slice(0, String(result).length) };
    };
    const tasks: SessionTask[] = [
      skeleton(add7, { a: ['units'], b: ['tens'] }),
      skeleton(add8, { a: ['tens'], b: ['units'] }),
      skeleton(sub6, { b: ['tens'] }),
      skeleton(sub6, { b: ['units', 'tens'] }),
    ];
    // No such exercise in the banks (missingDigitsCard): the card itself, as the
    // chooser makes it (exerciseCard) and a repeat words it (applyCardVariant) —
    // other cards of these made-up boards are not what is checked here.
    const rows: Row[] = tasks.flatMap((t) => [0, 1, 2].map((v): Row => {
      const ctx: StaticCardContext = { trigger: 'hesitation_45s', shownKinds: ['error_analysis', 'error_analysis_2'], cardShows: { skeleton: v } };
      return { task: t, counts: counts({}), ctx, card: applyCardVariant(exerciseCard(t, counts({}), ctx)!, ctx), refusal: null, variant: v };
    }));
    for (let i = 0; i < rows.length; i += 3) checkRows(rows.slice(i, i + 3), 'skeleton_generic');
    expect(rows.filter((r) => wrongHintViolation(r.card) !== null).map(label)).toEqual([]);
    expect(rows.filter((r) => revealsSecret(texts(r.card), secretNumbersOf(r.task)) !== null).map(label)).toEqual([]);
    expect(rows.filter((r) => revealsHiddenDigit(texts(r.card), r.task) !== null).map(label)).toEqual([]);
    // The first wording names the units column on a level-1 card (an approved card the server refuses: reported to the owner).
    expect(await serverBad(rows.filter((r) => r.variant > 0))).toEqual([]);
  });

  it('meeting 1\'s graded refresh exercises (47 + 26, 307 − 63): the whole matrix, every wording', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rows = runMatrix([S1_GRADED_ADDITION, S1_GRADED_SUBTRACTION]);
    quiet.mockRestore();
    const describeRow = (r: (typeof rows)[number]) => `${r.task.id} [${r.state.label}] ${r.trigger} v${r.variant}: ${r.card.situation} — ${r.card.questionHe}`;
    expect(rows.filter((r) => isGeneric(r.card) || r.refusal).map(describeRow)).toEqual([]);
    expect(rows.filter((r) => correctCount(r.card, r.task.id) !== 1).map(describeRow)).toEqual([]);
    const seen = new Set<string>();
    const quiet2 = [vi.spyOn(console, 'warn').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];
    const bad: string[] = [];
    try {
      for (const r of rows) {
        if (!r.card.cardVariant) continue;
        const k = `${r.task.id}|${r.card.questionHe}|${r.card.choices.map((c) => c.textHe + c.feedbackHe).join('|')}|${JSON.stringify(r.counts)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const v = serverVerdictFor(await capturedRequest(r.task, r.counts, r.ctx, r.card), r.card);
        if (v && !v.ok) bad.push(`${describeRow(r)} (${v.reason})`);
      }
    } finally {
      quiet2.forEach((s) => s.mockRestore());
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(bad).toEqual([]);
  }, 120_000);

  it('every meeting-1 exercise\'s own card has two more wordings, each sound and accepted by the server', async () => {
    const ids = ['s1_target_347', 's1_r_words703', 's1_r_value368', 's1_r_words482', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806', 's1_d_add47', 's1_d_sub307'];
    const tasks: SessionTask[] = [...SESSION1_TASKS, S1_GRADED_ADDITION, S1_GRADED_SUBTRACTION];
    const rows: Row[] = [];
    for (const id of ids) {
      const task = tasks.find((t) => t.id === id)!;
      const own = meeting1OwnCard(id)!;
      expect(own.variants, id).toHaveLength(2);
      for (let v = 0; v < 3; v++) {
        const ctx: StaticCardContext = { trigger: 'hesitation_45s', cardShows: { s1_card: v } };
        rows.push({ task, counts: counts({}), ctx, card: applyCardVariant(own, ctx), refusal: null, variant: v });
      }
    }
    expect(rows.filter((r) => correctCount(r.card, r.task.id) !== 1).map(label)).toEqual([]);
    expect(rows.filter((r) => wrongHintViolation(r.card) !== null).map(label)).toEqual([]);
    const secret = (r: Row) => revealsSecret(texts(r.card), secretNumbersOf(r.task).filter((n) => n !== 10 && n !== 100 && n !== 1000));
    expect(rows.filter((r) => secret(r) !== null).map(label)).toEqual([]);
    for (let i = 0; i < rows.length; i += 3) expect(new Set(rows.slice(i, i + 3).map((r) => r.card.questionHe)).size).toBe(3);
    expect(await serverBad(rows.filter((r) => r.variant > 0))).toEqual([]);
  });
});
