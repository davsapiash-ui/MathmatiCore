import { describe, it, expect } from 'vitest';
import { socraticTaskContextFor, cardFrameOf, SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { SESSIONS_BY_PATH, SESSION1_TASKS } from '@/data/sessionTasks';
import { validateSocraticRequest } from '../../../../functions/src/socraticContract';

/**
 * PRD Module 13, 1.10.2026: what the client tells the engine beyond the
 * numbers — the kind of exercise and its instruction (so the card names only
 * what is on THAT screen), the numbers the child must find (for the server's
 * leak check only), and the card frame the static selection set.
 */
const all: any[] = [...SESSION1_TASKS];
for (const byPath of Object.values(SESSIONS_BY_PATH)) for (const bank of Object.values(byPath as any)) all.push(...(bank as any[]));
const task = (id: string) => {
  const t = all.find((x) => x.id === id);
  if (!t) throw new Error('no task ' + id);
  return t;
};

describe('the task context', () => {
  it('names the kind of every exercise the coach can open on', () => {
    expect(socraticTaskContextFor(task('s4_r_t2'))?.kind).toBe('addition');
    expect(socraticTaskContextFor(task('s5_r_t2'))?.kind).toBe('subtraction');
    expect(socraticTaskContextFor(task('s7_r_t3'))?.kind).toBe('skeleton');
    expect(socraticTaskContextFor(task('s4_r_t7'))?.kind).toBe('missing_result_digit');
    expect(socraticTaskContextFor(task('s7_r_t5'))?.kind).toBe('error_analysis');
    expect(socraticTaskContextFor(task('s3_r_t1'))?.kind).toBe('read_write');
    expect(socraticTaskContextFor(task('s3_r_t2'))?.kind).toBe('compose_break');
    expect(socraticTaskContextFor(task('s3_g_t3'))?.kind).toBe('decompose');
    expect(socraticTaskContextFor(task('s7_r_t1'))?.kind).toBe('compose_group');
    expect(socraticTaskContextFor(task('s7_r_t6'))?.kind).toBe('representation');
    expect(socraticTaskContextFor(task('s7_r_t7'))?.kind).toBe('flexible');
    expect(socraticTaskContextFor(task('s3_r_t7'))?.kind).toBe('missing_element');
    expect(socraticTaskContextFor(task('s4_g_t7'))?.kind).toBe('small_change');
  });

  it('sends the secret numbers for the leak check, and the server accepts the whole context', () => {
    const decompose = socraticTaskContextFor(task('s3_g_t3'))!;
    expect(decompose.secret_numbers).toContain(45);
    expect(decompose.required_counts).toEqual({ hundreds: 45 });
    const choice = socraticTaskContextFor(task('s4_g_t7'))!;
    expect(choice.secret_numbers).toContain(5642);
    const missing = socraticTaskContextFor(task('s4_r_t7'))!;
    expect(missing.hidden_result_places).toEqual(['tens']);
    for (const id of ['s3_r_t1', 's3_r_t2', 's3_g_t3', 's7_r_t1', 's7_r_t6', 's7_r_t7', 's3_r_t7', 's4_g_t7', 's4_r_t7', 's7_r_t3']) {
      const v = validateSocraticRequest({
        student_id: 5, session_id: 'session_3_student_5', exercise_id: id, active_column_index: 0,
        workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [],
        task_context: socraticTaskContextFor(task(id)),
      });
      expect(v.ok, `${id}: ${!v.ok ? v.reason : ''}`).toBe(true);
    }
  });

  it('a break or a grouping says the board before its conversion', () => {
    expect(socraticTaskContextFor(task('s3_r_t2'))?.start_counts).toEqual({ hundreds: 3, tens: 4 });
    expect(socraticTaskContextFor(task('s7_r_t1'))?.start_counts).toMatchObject({ tens: 12, units: 5, hundreds: 0 });
    expect(socraticTaskContextFor(task('s3_r_t2'), { conversionDone: false })?.conversion_done).toBe(false);
  });
});

describe('the card frame', () => {
  it('level 1 where the owner decided the child finds the column', () => {
    expect(cardFrameOf({ questionHe: 'נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?', choices: [], cardKind: 'borrow_check' })).toMatchObject({ situation: 'borrow_check', level: 1 });
    expect(cardFrameOf({ questionHe: 'באחד הטורים יש 10 לבנים או יותר. מה עושים?', choices: [] }, task('s1_t8')).level).toBe(1);
  });
  it('level 2 elsewhere, or the level the card states', () => {
    expect(cardFrameOf({ questionHe: 'נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?', choices: [] }, task('s4_r_t2')).level).toBe(2);
    expect(cardFrameOf({ questionHe: 'מה בודקים?', choices: [], situation: 'meeting8_check', frameLevel: 1, intentHe: 'מה בודקים בכל טור לפני שכותבים' }))
      .toEqual({ situation: 'meeting8_check', level: 1, intent_he: 'מה בודקים בכל טור לפני שכותבים' });
  });
});

describe('the warm-up', () => {
  it('never throws and never waits', () => {
    expect(() => SocraticEngine.warmUp()).not.toThrow();
  });
});
