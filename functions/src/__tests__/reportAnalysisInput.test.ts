import { describe, it, expect } from 'vitest';
import { buildTelemetrySummary, collectFailedExercises } from '../reportAnalysis';
import { generateExerciseNarrativeFromEvents } from '../pedagogicalReport';
import { COMPULSORY_EXERCISES_PER_MEETING, resolveCompulsoryTotal } from '../meetingMetrics';

const ev = (
  exercise: string,
  type: string,
  details: Record<string, unknown> = {},
  t = 0,
  column_index?: number
) => ({
  session_id: 'session_4_student_student_user3',
  student_id: 3,
  exercise_id: exercise,
  event_type: type,
  details,
  client_timestamp: 1_000_000 + t,
  ...(column_index !== undefined ? { column_index } : {}),
});

/** A Firestore stand-in whose catalog holds one bank. */
const dbWithBank = (bankId: string, tasks: Record<string, unknown>[]) => ({
  collection: () => ({
    doc: (id: string) => ({
      get: async () => ({ exists: id === bankId, data: () => ({ tasks }) }),
    }),
  }),
});

describe('X30 — the AI analysis sees the whole meeting (Module 23 §ב)', () => {
  it('sends every event, not the first 120', () => {
    const events = Array.from({ length: 400 }, (_, i) =>
      ev(`s4_g_t${(i % 7) + 1}`, 'DIGIT_ENTERED', { digit_value: i % 10, is_correct: i % 3 === 0 }, i, i % 4)
    );
    const summary = buildTelemetrySummary(events);
    const total = summary.reduce((n, e) => n + (e.count ?? 1), 0);
    expect(total).toBe(400);
    expect(summary[summary.length - 1]).toMatchObject({ exercise_id: events[399].exercise_id, details: events[399].details });
  });

  it('compacts identical consecutive events into one entry with a count, in order', () => {
    const drag = (t: number) => ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 10, source_column_index: null }, t, 1);
    const summary = buildTelemetrySummary([
      drag(1), drag(2), drag(3),
      ev('s4_g_t1', 'REGROUPING_SUCCESS', { regrouping_type: 'composition', duration_ms: 900 }, 4, 1),
      drag(5),
    ]);
    expect(summary.map((e) => [e.event_type, e.count ?? 1])).toEqual([
      ['BLOCK_DRAG_COMPLETE', 3],
      ['REGROUPING_SUCCESS', 1],
      ['BLOCK_DRAG_COMPLETE', 1],
    ]);
  });

  it('events that differ in one field only stay separate: is_correct, column_index, exercise_id', () => {
    const digit = (ex: string, col: number, isCorrect: boolean) =>
      ev(ex, 'DIGIT_ENTERED', { digit_value: 4, is_correct: isCorrect }, 0, col);
    const pairs = [
      [digit('s4_g_t1', 0, true), digit('s4_g_t1', 0, false)],
      [digit('s4_g_t1', 0, true), digit('s4_g_t1', 1, true)],
      [digit('s4_g_t1', 0, true), digit('s4_g_t2', 0, true)],
    ];
    for (const pair of pairs) {
      const summary = buildTelemetrySummary(pair);
      expect(summary).toHaveLength(2);
      expect(summary.every((e) => e.count === undefined)).toBe(true);
    }
  });

  it('carries the undo depth and the reflection fields', () => {
    const summary = buildTelemetrySummary([
      ev('s4_g_t1', 'UNDO_EXECUTED', { undo_stack_depth_before: 3, reverted_event_type: 'DIGIT_ENTERED' }),
      ev('reflection', 'REFLECTION_SUBMITTED', { reflection_step: 2, effort_score: 'HIGH', persistence_index: 60, selected_strategies: null }),
    ]);
    expect(summary[0].details).toEqual({ undo_stack_depth_before: 3, reverted_event_type: 'DIGIT_ENTERED' });
    expect(summary[1].details).toEqual({ reflection_step: 2, effort_score: 'HIGH', persistence_index: 60 });
  });

  it('carries the completion counters, and never free text', () => {
    const [complete] = buildTelemetrySummary([
      ev('s4_g_t1', 'PROBLEM_COMPLETE', { total_duration_ms: 5000, undo_count: 1, error_count: 2, note: 'דני' }),
    ]);
    expect(complete.details).toEqual({ total_duration_ms: 5000, undo_count: 1, error_count: 2 });
  });
});

describe('X31 — failed exercises include failed board checks', () => {
  it('an exercise completed with error_count > 0 is a failed exercise', () => {
    const { failedExerciseIds } = collectFailedExercises([
      ev('s3_g_t1', 'PROBLEM_COMPLETE', { error_count: 2 }, 1),
      ev('s3_g_t2', 'PROBLEM_COMPLETE', { error_count: 0 }, 2),
      ev('s3_g_t3', 'DIGIT_ENTERED', { digit_value: 4, is_correct: false }, 3, 0),
      ev('s3_g_t3', 'PROBLEM_COMPLETE', { error_count: 1 }, 4),
    ]);
    expect(failedExerciseIds).toEqual(['s3_g_t1', 's3_g_t3']);
  });

  it('still records the regrouping columns per exercise', () => {
    const { regroupingColumnsByExercise } = collectFailedExercises([
      ev('s3_g_t1', 'REGROUPING_SUCCESS', { regrouping_type: 'decomposition' }, 1, 1),
      ev('s3_g_t1', 'REGROUPING_TRIGGERED', { regrouping_type: 'decomposition' }, 2, 2),
      ev('s3_g_t1', 'REGROUPING_SUCCESS', { regrouping_type: 'decomposition' }, 3, 1),
    ]);
    expect(regroupingColumnsByExercise).toEqual({ s3_g_t1: [1, 2] });
  });
});

describe('X32 — the narrative follows the actual order, in correct Hebrew', () => {
  it('one wrong digit reads "(פעם אחת)", more read "(N פעמים)"', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: 3, is_correct: false }, 1, 0),
      ev('s4_g_t1', 'PROBLEM_COMPLETE', {}, 2),
      ev('s4_g_t2', 'DIGIT_ENTERED', { digit_value: 3, is_correct: false }, 3, 1),
      ev('s4_g_t2', 'DIGIT_ENTERED', { digit_value: 5, is_correct: false }, 4, 1),
      ev('s4_g_t2', 'DIGIT_ENTERED', { digit_value: 6, is_correct: true }, 5, 0),
      ev('s4_g_t2', 'PROBLEM_COMPLETE', {}, 6),
    ]);
    expect(compulsory[0]).toBe('בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד הזין ספרה שגויה בטור היחידות (פעם אחת), והשלים את התרגיל לאחר תיקון.');
    // Every column typed in is named, the correct-digit column too.
    expect(compulsory[1]).toBe('בתרגיל השני (תרגיל במפגש 4, מס׳ זיהוי 2) הלומד הזין ספרות שגויות בטור העשרות ובטור היחידות (פעמיים), והשלים את התרגיל לאחר תיקון.');
    expect(compulsory.join(' ')).not.toMatch(/\((1|2) פעמים\)/);
  });

  it('three wrong digits or more read "(N פעמים)"', () => {
    const wrong = (t: number) => ev('s4_g_t1', 'DIGIT_ENTERED', { digit_value: t, is_correct: false }, t, 0);
    const { compulsory } = generateExerciseNarrativeFromEvents([wrong(1), wrong(2), wrong(3), ev('s4_g_t1', 'PROBLEM_COMPLETE', {}, 4)]);
    expect(compulsory[0]).toBe('בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד הזין ספרות שגויות בטור היחידות (3 פעמים), והשלים את התרגיל לאחר תיקון.');
  });

  it('the canvas representation sits where the first drag happened, not hoisted to the front', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([
      ev('s4_g_t1', 'HESITATION_DETECTED', { hesitation_seconds: 52 }, 1, 0),
      ev('s4_g_t1', 'SOCRATIC_CARD_SHOWN', { trigger_reason: 'hesitation_45s' }, 2, 0),
      ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 10 }, 3, 1),
      ev('s4_g_t1', 'BLOCK_DRAG_COMPLETE', { block_value: 1 }, 4, 0),
      ev('s4_g_t1', 'REGROUPING_SUCCESS', { regrouping_type: 'decomposition' }, 5, 1),
      ev('s4_g_t1', 'PROBLEM_COMPLETE', {}, 6),
    ]);
    expect(compulsory[0]).toBe(
      'בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד השתהה 52 שניות, קיבל כרטיס חניכה, ייצג את המספרים בבית המספרים באמצעות לבני הדינס של 10, 1, ביצע פריטה מטור העשרות, והשלים את התרגיל בניסיון הראשון.'
    );
  });

  it('an exercise with nothing but its completion reads "הלומד השלים", not "הלומד והשלים"', () => {
    const { compulsory } = generateExerciseNarrativeFromEvents([ev('s4_g_t1', 'PROBLEM_COMPLETE', {}, 1)]);
    expect(compulsory[0]).toBe('בתרגיל הראשון (תרגיל במפגש 4, מס׳ זיהוי 1) הלומד השלים את התרגיל בניסיון הראשון.');
  });
});

describe('X36 — the score denominator is 7 in meetings 2–8 (Module 14 §ב)', () => {
  it('is 7 whatever the published bank holds, and the ids still come from the bank', async () => {
    expect(COMPULSORY_EXERCISES_PER_MEETING).toBe(7);
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `s5_g_t${i + 1}` }));
    const ids = new Map<string, ReadonlySet<string>>();
    await expect(
      resolveCompulsoryTotal(dbWithBank('session_5_green_path', six) as any, 5, 'green_path', new Map(), ids)
    ).resolves.toBe(7);
    expect(ids.get('5:green_path')?.size).toBe(6);
  });

  it('is 7 also when the bank is not published', async () => {
    await expect(resolveCompulsoryTotal(dbWithBank('none', []) as any, 8, 'remediation_path')).resolves.toBe(7);
  });

  it('meeting 1 still has none', async () => {
    await expect(resolveCompulsoryTotal(dbWithBank('none', []) as any, 1, 'green_path')).resolves.toBeNull();
  });
});
