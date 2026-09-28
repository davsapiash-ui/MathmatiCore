import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  validateSocraticResponse,
  deriveSocraticFacts,
  stripDigitGroupSeparators,
} from '../socraticContract';

/**
 * Iron rule 1 (PRD Module 13 §א): the final answer is never in the card. The
 * check matched "1573" only; "1,573" — the way the screen itself writes
 * numbers — and "1 573", "1'573" went through. A separator between two digits
 * is deleted before matching, on the live validateSocraticResponse path.
 */
const request = (extra: Record<string, unknown> = {}) => {
  const v = validateSocraticRequest({
    student_id: 12,
    session_id: 'session_4_student_12',
    exercise_id: 's4_g_t1',
    active_column_index: 0,
    workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} },
    recent_actions: [],
    exercise_context: {
      operation: 'addition', number_a: 1245, number_b: 328, session_id: 'session_4_student_12',
      session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '5 + 8',
      ...extra,
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

const card = (question: string) => ({
  error_category: 'procedural',
  guiding_question: question,
  options: [
    { id: 'opt_1', option_text: 'ממירים 10 יחידות לעשרת אחת', feedback_text: 'נכון מאוד!', is_correct: true },
    { id: 'opt_2', option_text: 'ננחש את התוצאה', feedback_text: 'רמז: הימנעו מניחושים.', is_correct: false },
    { id: 'opt_3', option_text: 'נחכה', feedback_text: 'רמז: התשובה לא תופיע מעצמה.', is_correct: false },
  ],
});

describe('the final answer with a thousands separator is still the final answer', () => {
  const facts = deriveSocraticFacts(request());

  it('1,245 + 328: every way of writing 1,573 is refused', () => {
    for (const q of [
      'בתרגיל 1,245 + 328 נקבל 1573?',
      'בתרגיל 1,245 + 328 נקבל 1,573?',
      'נקבל 1 573',
      'נקבל 1 573',
      'נקבל 1 573',
      'נקבל 1 573',
      "נקבל 1'573",
      'נקבל 1׳573',
    ]) {
      const v = validateSocraticResponse(card(q), facts);
      expect(v.ok, q).toBe(false);
      if (!v.ok) expect(v.reason).toBe('final answer leaked');
    }
  });

  it('a card that names only the operands "1,245" and "328" passes', () => {
    expect(validateSocraticResponse(card('בתרגיל 1,245 + 328, מה עושים בטור היחידות?'), facts).ok).toBe(true);
  });

  it('a skeleton\'s hidden operand is refused however it is grouped', () => {
    // 8,0▢3 + 1,452 = 9,4▢▢ is not the point here; 8003 with its tens hidden is.
    const f = deriveSocraticFacts(request({ number_a: 8003, number_b: 1452, target_sub_problem: '3 + 2', hidden_places: { a: ['tens'], b: [] } }));
    for (const q of ['בונים את 8003 בבית המספרים', 'בונים את 8,003 בבית המספרים', 'בונים את 8 003 בבית המספרים', "בונים את 8'003"]) {
      expect(validateSocraticResponse(card(q), f).ok, q).toBe(false);
    }
  });

  it('only separators between a digit and exactly three digits are removed', () => {
    expect(stripDigitGroupSeparators('1,573 ו-1 245')).toBe('1573 ו-1245');
    expect(stripDigitGroupSeparators('3, 4 ו-5')).toBe('3, 4 ו-5');
    expect(stripDigitGroupSeparators('12,34')).toBe('12,34');
  });
});
