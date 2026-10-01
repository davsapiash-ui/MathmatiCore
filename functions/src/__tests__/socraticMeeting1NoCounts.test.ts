import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  validateSocraticRequest,
  validateSocraticResponse,
  deriveSocraticFacts,
  leaksAnswerInCounts,
  socraticSystemInstructionFor,
  SOCRATIC_SYSTEM_INSTRUCTION,
  SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1,
  SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS,
  SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7,
} from '../socraticContract';

/**
 * Owner decision, 29.9.2026: in station 1 (meeting 1) nothing on the screen
 * or read aloud gives the child the answer, a block count he must find
 * himself, or where the difficulty is. The model is told so, and a card that
 * writes the result as blocks is refused. Other meetings are unchanged.
 */
const request = (sessionId: string, exerciseId: string) => {
  const v = validateSocraticRequest({
    student_id: 3,
    session_id: sessionId,
    exercise_id: exerciseId,
    active_column_index: 1,
    workspace_state: { ones_count: 7, tens_count: 10, hundreds_count: 7, memory_circles: {} },
    recent_actions: [],
    exercise_context: {
      operation: 'addition', number_a: 713, number_b: 94, session_id: sessionId,
      session_topic: '', active_column: 'tens', active_column_index: 1, target_sub_problem: '1 + 9',
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

// 8 מאות ו-7 יחידות is 807, the result of 713 + 94.
const leakingCard = {
  error_category: 'procedural',
  guiding_question: 'בתרגיל 713 + 94 יוצאות בסוף 8 מאות ו-7 יחידות. מה עושים עכשיו?',
  options: [
    { id: 'opt_1', option_text: 'מקבצים 10 לבנים ללבנה אחת', feedback_text: 'נכון מאוד!', is_correct: true },
    { id: 'opt_2', option_text: 'מוחקים לבנים לפח', feedback_text: 'רמז: מה קורה למספר כשמוחקים לבנים?', is_correct: false },
    { id: 'opt_3', option_text: 'כותבים 10 בתיבה אחת', feedback_text: 'רמז: כמה ספרות כותבים בכל תיבה?', is_correct: false },
  ],
};

describe('meeting 1: the model is told not to state counts, digits of the answer or the column', () => {
  it('meeting 1 gets its own instruction; meetings 2/8 and the others keep theirs', () => {
    expect(socraticSystemInstructionFor(deriveSocraticFacts(request('session_1_student_3', 's1_t8')))).toBe(SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1);
    expect(socraticSystemInstructionFor(deriveSocraticFacts(request('session_4_student_3', 's4_r_t1')))).toBe(SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7);
    expect(socraticSystemInstructionFor(deriveSocraticFacts(request('session_8_student_3', 's8_g_t1')))).toBe(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS);
    expect(socraticSystemInstructionFor(null)).toBe(SOCRATIC_SYSTEM_INSTRUCTION);
  });

  it('the meeting-1 instruction forbids counts, answer digits and naming the column', () => {
    const s = SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1;
    expect(s).toContain('MEETING 1 (station 1): NEVER state how many blocks are in a column');
    expect(s).toContain('NEVER write any digit of the answer');
    expect(s).toContain('NEVER name the column where the difficulty is');
    expect(s).toContain('never write a count in the card');
    // Every replace took effect: the instruction no longer asks for the board state in the question.
    expect(s).not.toContain('the board state in the question itself');
    expect(s).not.toContain('the exact block count in each column');
    // The general instruction is untouched.
    expect(SOCRATIC_SYSTEM_INSTRUCTION).not.toContain('MEETING 1');
  });

  it('the proxy chooses the instruction by meeting', () => {
    const src = readFileSync(resolve(__dirname, '../geminiProxy.ts'), 'utf-8');
    expect(src).toContain('systemInstruction: socraticSystemInstructionFor(facts)');
  });
});

describe('meeting 1: a card that gives the result as blocks is refused', () => {
  it('reads the result in a run of blocks, or a stretch of it', () => {
    expect(leaksAnswerInCounts(['יוצאות 8 מאות ו-7 יחידות'], 807)).toBe(true);
    expect(leaksAnswerInCounts(['יש 3 עשרות ו-7 יחידות'], 37)).toBe(true);
    expect(leaksAnswerInCounts(['יש מאה אחת ועוד 6 עשרות'], 60)).toBe(true);
    expect(leaksAnswerInCounts(['יש 7 מאות ו-10 עשרות'], 807)).toBe(false);
    expect(leaksAnswerInCounts(['יש 8 מאות ו-7 יחידות'], null)).toBe(false);
  });

  it('meeting 1 refuses it as the answer; meeting 4 refuses it only because "7 יחידות" is the board\'s own count', () => {
    const m1 = validateSocraticResponse(leakingCard, deriveSocraticFacts(request('session_1_student_3', 's1_t8')));
    expect(m1).toEqual({ ok: false, reason: 'final answer leaked as block counts' });
    // Since 1.10.2026 the server mirrors the client's stations 3–7 count rule
    // (owner, 30.9.2026): the board holds 7 units, so "7 יחידות" counts them for the child.
    const m4 = validateSocraticResponse(leakingCard, deriveSocraticFacts(request('session_4_student_3', 's4_r_t1')));
    expect(m4.ok).toBe(false);
    if (!m4.ok) expect(m4.reason).toMatch(/^counts:/);
  });
});
