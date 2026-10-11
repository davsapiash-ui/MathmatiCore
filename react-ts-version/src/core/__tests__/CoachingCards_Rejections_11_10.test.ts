import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { uniqueBank } from './coachingMatrix';
import { SocraticEngine, GENERAL_FALLBACK } from '@/infrastructure/services/SocraticEngine';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';
import type { SessionTask } from '@/data/sessionTasks';

/**
 * Owner decision, 11.10.2026: a static card the iron rule refuses is recorded
 * on the server (13-1: the closed field list, no learner, no session), and the
 * card served instead is the meeting's card named in the exercise, checked
 * again (13-4); the request carries no quiet mode.
 */
describe('a refused static card (13-1, 13-4)', () => {
  // A made-up skeleton that hides a digit of the number subtracted.
  const base = uniqueBank.find((t) => t.id.startsWith('s6_') && t.isSubtraction && (t.numberB as number) >= 100 && !t.hiddenDigits)!;
  const result = (base.numberA as number) - (base.numberB as number);
  const task: SessionTask = { ...base, hiddenDigits: { b: ['tens'] }, revealedResultDigits: (['units', 'tens', 'hundreds', 'thousands'] as Place[]).slice(0, String(result).length) };

  it('is recorded once, with the closed field list, and the meeting card named in the exercise is served', () => {
    // A static card that names the number with the hidden digit: refused.
    const leaking = { ...GENERAL_FALLBACK, questionHe: `נסו לחשוב: איך מוציאים ${task.numberB}?`, situation: 'test_leak' };
    const chooser = vi.spyOn(SocraticEngine as any, 'resolveStaticHint').mockReturnValue(leaking);
    const sent = vi.spyOn(SocraticEngine, 'sendRejectionReport').mockImplementation(async () => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const card = SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS }, { trigger: 'hesitation_45s' } as any);
    SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS }, { trigger: 'hesitation_45s' } as any);
    warn.mockRestore();
    chooser.mockRestore();
    expect(sent).toHaveBeenCalledTimes(1);
    const payload = sent.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(['attempt', 'card_text', 'demo', 'exercise_id', 'meeting', 'outcome', 'reason']);
    expect(payload).toMatchObject({ outcome: 'static_reject', exercise_id: task.id, meeting: 6, demo: false });
    sent.mockRestore();
    // מסמך 03's meeting-6 card, opening with the exercise as the screen shows it.
    expect(card.questionHe.startsWith('נסו לחשוב: בתרגיל ')).toBe(true);
    expect(card.questionHe).toContain('▢');
    expect(card.questionHe).not.toContain(String(task.numberB));
  });

  it('the general card is named in the exercise unless the name gives the answer away', () => {
    const grounded = SocraticEngine.getSynchronousTaskHint({ id: 's4_x', type: 'unknown_type', numberA: 345, numberB: 182 }, { ...EMPTY_COUNTS });
    expect(grounded.situation).toBe('general_next_step');
    expect(grounded.questionHe).toMatch(/^בתרגיל 345 \+ 182: /);
    expect(GENERAL_FALLBACK.questionHe).toBe('מה הצעד הבא שצריך לעשות בבית המספרים?');
  });
});

describe('ten or more blocks where the target has fewer: blocks too many, not a group (coordinator, 11.10.2026)', () => {
  const all = [...uniqueBank];
  const task = (id: string) => all.find((t) => t.id === id)!;
  const cardOf = (id: string, c: Partial<Record<Place, number>>, ctx: Record<string, unknown> = {}) =>
    SocraticEngine.getSynchronousTaskHint(task(id), { ...EMPTY_COUNTS, ...c }, { trigger: 'hesitation_45s', ...ctx } as any);
  const GROUPING = ['crowded_column', 's1_crowded', 'group_action'];
  const texts = (c: ReturnType<typeof cardOf>) => [c.questionHe, ...c.choices.filter((x) => x.isCorrect).map((x) => `${x.textHe} ${x.feedbackHe ?? ''}`)].join(' ');

  it.each([
    ['s3_f_t5', { hundreds: 7, units: 10 }],
    ['s1_r_words703', { hundreds: 7, units: 10 }],
    ['s1_r_words482', { hundreds: 4, tens: 8, units: 10 }],
    ['s1_r_value368', { hundreds: 3, tens: 6, units: 10 }],
  ] as const)('%s with a tenth unit: the compare-with-the-instruction card, never "קבצו 10"', (id, c) => {
    for (const ctx of [{}, { shownKinds: ['crowded', 's1_crowded'] }]) {
      const card = cardOf(id, c, ctx);
      expect(GROUPING, `${id}: ${card.questionHe}`).not.toContain(card.situation);
      expect(texts(card)).not.toMatch(/קבצו 10|מקבצים/);
      expect(card.situation).toBe('stray_blocks');
    }
  });

  it.each([
    ['s1_r_group26', { units: 26 }, 's1_crowded'],
    ['s1_t8', { hundreds: 7, tens: 10, units: 7 }, 's1_crowded'],
    ['s4_g_t1', null, 'crowded_column'],
  ] as const)('%s: a grouping exercise still gets the grouping card', (id, c, situation) => {
    const t = task(id);
    const counts = c ?? (() => {
      // Both numbers built, before the first grouping.
      const out: Record<Place, number> = { ...EMPTY_COUNTS };
      (['units', 'tens', 'hundreds', 'thousands'] as Place[]).forEach((p, i) => { out[p] = Math.floor((t.numberA as number) / 10 ** i) % 10 + Math.floor((t.numberB as number) / 10 ** i) % 10; });
      return out;
    })();
    expect(cardOf(id, counts).situation).toBe(situation);
  });
});

describe('no quiet mode in the engine request', () => {
  it('learner_profile carries the enhanced profile only', async () => {
    const task = uniqueBank.find((t) => t.id === 's4_g_t1')!;
    let captured: any = null;
    const proxy = vi.spyOn(SocraticEngine, 'callGeminiProxy').mockImplementation(async (p: any) => { captured = p; throw new Error('captured'); });
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const anchor = SocraticEngine.getSynchronousTaskHint(task, { ...EMPTY_COUNTS });
    await SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task, targetNode: 'general', activeColumnName: 'יחידות', counts: { ...EMPTY_COUNTS }, qMatrixAnchor: anchor,
      monitoring: { studentId: 3, sessionNumber: 4, learnerProfile: { enhanced: true } } as any,
    });
    proxy.mockRestore();
    quiet.mockRestore();
    expect(captured.socratic_request.learner_profile).toEqual({ enhanced: true });
  });
});
