import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  buildSocraticPrompt,
  socraticSystemInstructionFor,
  SOCRATIC_SYSTEM_INSTRUCTION,
  SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1,
  SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7,
} from '../socraticContract';

/**
 * Stations 3–7 hide the digit beside each column name and the child counts
 * the blocks (owner, 29–30.9.2026). The general instruction told the model to
 * name "the exact block count in each column" and "the board state" in the
 * question; meetings 3–7 now get meeting 1's wording on counts.
 */
const request = (meeting: number) => {
  const v = validateSocraticRequest({
    student_id: 3,
    session_id: `session_${meeting}_student_3`,
    exercise_id: `s${meeting}_r_t1`,
    active_column_index: 0,
    workspace_state: { ones_count: 12, tens_count: 4, hundreds_count: 2, memory_circles: {} },
    recent_actions: [],
    exercise_context: {
      operation: 'addition', number_a: 237, number_b: 175, session_id: `session_${meeting}_student_3`,
      session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '7 + 5',
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

describe('stations 3–7: the model is told not to write block counts', () => {
  it('meetings 3–7 get the stations instruction; meeting 1 keeps its own', () => {
    for (const m of [3, 4, 5, 6, 7]) {
      expect(socraticSystemInstructionFor(deriveSocraticFacts(request(m))), `meeting ${m}`).toBe(SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7);
    }
    expect(socraticSystemInstructionFor(deriveSocraticFacts(request(1)))).toBe(SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1);
  });

  it('every replace took effect: no "exact block count", no "board state in the question"', () => {
    const s = SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7;
    expect(s).not.toContain('the exact block count in each column');
    expect(s).not.toContain('the board state in the question itself');
    expect(s).toContain('never write a count in the card');
    expect(s).toContain('never how many blocks the board or a column holds');
    expect(s).toContain('STATIONS 3–7: the screen shows no digit beside a column name');
    // Unlike meeting 1, the active column is still named.
    expect(s).toContain('Name the exercise and the active column sub-problem in the question itself');
    expect(s).not.toContain('NEVER name the column where the difficulty is');
    // The hint rule and the rest of the general instruction are kept.
    expect(s).toContain('The feedback of a WRONG option starts with "רמז:"');
    expect(SOCRATIC_SYSTEM_INSTRUCTION).not.toContain('STATIONS 3–7');
  });

  it('the JSON template asks for the board state without a count', () => {
    for (const m of [1, 3, 7]) {
      const facts = deriveSocraticFacts(request(m));
      expect(buildSocraticPrompt(request(m), facts)).toContain('ואת מצב הלבנים, בלי לכתוב כמה לבנים יש בטור');
    }
  });
});
