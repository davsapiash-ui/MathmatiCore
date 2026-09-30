import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  buildSocraticPrompt,
  findAbsentAid,
  SOCRATIC_SYSTEM_INSTRUCTION,
  SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1,
  SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS,
} from '../socraticContract';

/**
 * Owner, 30.9.2026: the feedback of a wrong option is "רמז:" and a short
 * guiding question — never an explanation, never the answer; the feedback of
 * the right one opens with "נכון מאוד!". The static cards follow it
 * (react-ts-version staticSocraticCards.ts); the model is told the same.
 */
const request = (sessionId: string) => {
  const v = validateSocraticRequest({
    student_id: 5,
    session_id: sessionId,
    exercise_id: 's5_g_t1',
    active_column_index: 0,
    workspace_state: { ones_count: 2, tens_count: 3, hundreds_count: 4, thousands_count: 5, memory_circles: {} },
    recent_actions: [],
    exercise_context: {
      operation: 'subtraction', number_a: 5432, number_b: 2118, session_id: sessionId,
      session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '2 - 8',
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

describe('the model is told: a wrong option gets a guiding question', () => {
  it('in every instruction — with blocks, without blocks (meeting 8) and in meeting 1', () => {
    for (const s of [SOCRATIC_SYSTEM_INSTRUCTION, SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS, SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1]) {
      expect(s).toContain('The feedback of a WRONG option starts with "רמז:" and is ONE short guiding QUESTION that ends with "?"');
      expect(s).toContain('it NEVER explains, NEVER states the rule or the correct action, and NEVER gives the answer or any digit of it');
      expect(s).toContain('The correct option\'s feedback starts with "נכון מאוד!"');
    }
  });

  it('the examples name no aid that meeting 8 lacks', () => {
    const rule = SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS.slice(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS.indexOf('The feedback of a WRONG option'));
    const examples = [...rule.slice(0, rule.indexOf('\n')).matchAll(/"(רמז: [^"]+)"/g)].map((m) => m[1]);
    expect(examples).toHaveLength(2);
    expect(findAbsentAid(examples, false)).toBeNull();
  });

  it('and again next to the JSON it returns', () => {
    for (const session of ['session_5_student_5', 'session_8_student_5']) {
      const req = request(session);
      expect(buildSocraticPrompt(req, deriveSocraticFacts(req))).toContain('משוב לאפשרות שגויה: "רמז:" ושאלה מנחה קצרה אחת שמסתיימת ב-"?" — לא הסבר, לא הפעולה הנכונה ולא התשובה.');
    }
  });
});
