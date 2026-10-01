import { describe, it, expect } from 'vitest';
import { validateSocraticRequest, deriveSocraticFacts } from '../socraticContract';

/**
 * System check 1.10.2026, review of the fix round: in a subtraction after a
 * borrow (61 − 24 as 5 tens and 11 units) ten or more blocks in a column is the
 * step the exercise asks for. The client's static cards never call it a column
 * to group (SocraticEngine crowdingIsTheGoal); the server's reading did, and
 * steered the model to "group them back". And the recent actions were read
 * twice — the client sends the same list in two places.
 */
const request = (operation: 'addition' | 'subtraction', units: number, tens: number, actions: string[] = []) => {
  const recent = actions.map((event_type, i) => ({ event_type, timestamp: 1000 + i }));
  const v = validateSocraticRequest({
    student_id: 5,
    session_id: 'session_5_student_5',
    exercise_id: 's5_g_t1',
    active_column_index: 0,
    workspace_state: { ones_count: units, tens_count: tens, hundreds_count: 0, thousands_count: 0, memory_circles: {} },
    recent_actions: recent,
    student_progress_state: { trigger_reason: 'repeated_errors', recent_actions: recent },
    exercise_context: {
      operation, number_a: 61, number_b: 24, session_id: 'session_5_student_5',
      session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '1 - 4',
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

describe('the server reading of a crowded column', () => {
  it('a subtraction after a borrow: 11 units is not a column to group', () => {
    const facts = deriveSocraticFacts(request('subtraction', 11, 5));
    expect(facts.columns.find((c) => c.column === 'units')?.board_overcrowded).toBe(false);
    expect(facts.suggested_focus_he).not.toContain('נדרשת הקבצה של 10');
  });

  it('an addition still is — when the blocks are the exercise\'s own (68 + 43: 8 + 3 units)', () => {
    const v = validateSocraticRequest({
      student_id: 5, session_id: 'session_4_student_5', exercise_id: 's4_x', active_column_index: 0,
      workspace_state: { ones_count: 11, tens_count: 10, hundreds_count: 0, thousands_count: 0, memory_circles: {} },
      recent_actions: [],
      exercise_context: { operation: 'addition', number_a: 68, number_b: 43, session_id: 'session_4_student_5', session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '8 + 3' },
    });
    if (!v.ok) throw new Error(v.reason);
    expect(deriveSocraticFacts(v.value).columns.find((c) => c.column === 'units')?.board_overcrowded).toBe(true);
  });

  it('an addition with more blocks than the exercise can use is not a column to group (61 + 24 with 11 units)', () => {
    const facts = deriveSocraticFacts(request('addition', 11, 5));
    const units = facts.columns.find((c) => c.column === 'units');
    expect(units?.stray).toBe(true);
    expect(units?.board_overcrowded).toBe(false);
    expect(facts.suggested_focus_he).toContain('אסור להציע לקבץ את הלבנים המיותרות');
  });

  it('each recent action is read once', () => {
    const facts = deriveSocraticFacts(request('subtraction', 1, 6, ['PROBLEM_LOAD', 'UNDO_EXECUTED']));
    expect(facts.recent_event_types).toEqual(['PROBLEM_LOAD', 'UNDO_EXECUTED']);
  });
});
