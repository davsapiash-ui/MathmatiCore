import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { runMatrix, isGeneric, correctCount, uniqueBank, demoTasks, type MatrixRow } from './coachingMatrix';
import { SocraticEngine, GENERAL_FALLBACK } from '@/infrastructure/services/SocraticEngine';
import { TEACHER_DEMOS, type DemoStation } from '@/data/teacherDemos';
import { demoSessionTask } from '@/application/teacherDemoTasks';
import { EMPTY_COUNTS, type Place } from '@/core/placeValue';

type Counts = Record<Place, number>;

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
