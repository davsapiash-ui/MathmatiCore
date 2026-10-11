import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { runMatrix, uniqueBank, demoTasks, type MatrixRow } from './coachingMatrix';
import { capturedRequest, serverVerdictFor } from './coachingServerCheck';
import { cardVariantKey } from '@/infrastructure/services/staticSocraticCards';
import { staticCardContextFor, emptyColumnConversions } from '@/application/useWorkspaceStore';

/**
 * Owner, 11.10.2026: every static card comes in more than one wording, and a
 * repeat of the same situation in the same exercise shows the next one. Each
 * wording a repeat shows passes the whole matrix (coachingMatrix runs three
 * versions of every row) and the server's own validator — the same check the
 * engine's card must pass (functions/src/socraticContract.validateSocraticResponse).
 */

const rows = (() => {
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    return runMatrix([...uniqueBank, ...demoTasks]);
  } finally {
    quiet.mockRestore();
  }
})();

const label = (r: MatrixRow) => `${r.task.id} [${r.state.label}] ${r.trigger} v${r.card.cardVariant}: ${r.card.cardKind ?? r.card.situation} — ${r.card.questionHe}`;

describe('card wordings (owner, 11.10.2026)', () => {
  it('a repeat of a card with wordings shows a different question, and never the same one twice in a row', () => {
    const bad = rows.filter((r) => r.variant === 1 && (r.card.sameSituationCards?.length ?? 0) > 0)
      .filter((r) => {
        const first = rows.find((x) => x.task === r.task && x.state === r.state && x.trigger === r.trigger && x.level === r.level && x.variant === 0);
        return first && cardVariantKey(first.card) === cardVariantKey(r.card) && first.card.questionHe === r.card.questionHe;
      });
    expect(bad.map(label)).toEqual([]);
  });

  it('every situation of the matrix has at least two more wordings', () => {
    const keys = new Map<string, number>();
    for (const r of rows) if (r.variant === 0) keys.set(`${r.card.cardKind}/${r.card.situation}`, Math.max(keys.get(`${r.card.cardKind}/${r.card.situation}`) ?? 0, r.card.sameSituationCards?.length ?? 0));
    expect([...keys.entries()].filter(([, n]) => n < 2).map(([k]) => k)).toEqual([]);
  });

  it('every wording, the first one included (decided 11.10.2026), passes the server validator', async () => {
    const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];
    const seen = new Set<string>();
    const bad: string[] = [];
    try {
      for (const r of rows) {
        const k = `${r.task.id}|${r.card.questionHe}|${r.card.choices.map((c) => c.textHe + c.feedbackHe).join('|')}|${JSON.stringify(r.counts)}|${r.trigger}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const v = serverVerdictFor(await capturedRequest(r.task, r.counts, r.ctx, r.card), r.card);
        if (v && !v.ok) bad.push(`${label(r)} (${v.reason})`);
      }
    } finally {
      quiet.forEach((s) => s.mockRestore());
    }
    expect(seen.size).toBeGreaterThan(5000);
    expect([...new Set(bad)]).toEqual([]);
  }, 600_000);

  it('the engine request carries the other wordings of the situation as examples, and the prompt shows them', async () => {
    const r = rows.find((x) => x.variant === 0 && (x.card.sameSituationCards?.length ?? 0) >= 2 && x.task.id.startsWith('s4_'))!;
    const quiet = [vi.spyOn(console, 'warn').mockImplementation(() => undefined), vi.spyOn(console, 'error').mockImplementation(() => undefined)];
    const payload = await capturedRequest(r.task, r.counts, r.ctx, r.card);
    quiet.forEach((s) => s.mockRestore());
    expect(payload.anchor.examples).toHaveLength(2);
    expect(payload.anchor.examples[0].questionHe).toBe(r.card.sameSituationCards![0].questionHe);
    const v = serverVerdictFor(payload, r.card)!;
    expect(v.prompt).toContain('כרטיסים מאושרים נוספים לאותו מצב');
    expect(v.prompt).toContain(r.card.sameSituationCards![1].questionHe);
  });

  it('the store counts the cards shown in the exercise by kind, so the next opening is the next wording', () => {
    const task = uniqueBank.find((t) => t.id === 's4_g_t1')!;
    const s: any = {
      placeCuesShown: false, socraticCardKinds: { taskId: task.id, kinds: ['carry'] },
      socraticCardHistory: { taskId: task.id, cards: [
        { reason: 'hesitation_45s', place: 'units', kind: 'carry', family: 'carry', staticQuestionHe: 'q', questionHe: 'q', shown: true, answeredCorrect: false, openedAt: 0 },
        { reason: 'hesitation_45s', place: 'units', kind: 'carry', family: 'carry', staticQuestionHe: 'q', questionHe: null, shown: false, answeredCorrect: null, openedAt: 0 },
      ] },
      conversionsByColumn: emptyColumnConversions(), counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
    };
    expect(staticCardContextFor(s, task.id, task).cardShows).toEqual({ carry: 1 });
  });
});
