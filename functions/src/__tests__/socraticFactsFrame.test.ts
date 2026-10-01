import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  buildSocraticPrompt,
  validateSocraticResponse,
  secretInBlockCounts,
  screenDescriptionHe,
  type SocraticRequest,
} from '../socraticContract';

/**
 * 1.10.2026 — the facts read the board against the exercise (stage-aware),
 * the request carries the task context and the card frame, and the
 * validator checks the frame, the hidden digits and the secret numbers.
 * Every case is a situation of the audit / the analysts' matrix.
 */
type Counts = [number, number, number, number];
const arith = (o: {
  session: number; op: 'addition' | 'subtraction'; a: number; b: number; counts: Counts; col?: number;
  trigger?: string; memory?: Record<string, number>; completed?: string[]; actions?: any[]; hidden?: { a: string[]; b: string[] };
  conversions?: string[]; frame?: { situation: string; level: 1 | 2 | 3 }; task?: Record<string, unknown>;
}): SocraticRequest => {
  const cols = ['units', 'tens', 'hundreds', 'thousands'];
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${o.session}_student_5`, exercise_id: 'x', active_column_index: o.col ?? 0,
    workspace_state: { ones_count: o.counts[0], tens_count: o.counts[1], hundreds_count: o.counts[2], thousands_count: o.counts[3], memory_circles: o.memory ?? {}, ...(o.conversions ? { conversions_done: o.conversions } : {}) },
    recent_actions: o.actions ?? [],
    student_progress_state: { trigger_reason: o.trigger ?? 'hesitation_45s', completed_columns: o.completed ?? [], current_column_input: null, memory_circles_state: o.memory ?? {}, consecutive_errors_count: 0, recent_actions: [] },
    exercise_context: { operation: o.op, number_a: o.a, number_b: o.b, session_id: 's', session_topic: '', active_column: cols[o.col ?? 0], active_column_index: o.col ?? 0, target_sub_problem: '', ...(o.hidden ? { hidden_places: o.hidden } : {}) },
    ...(o.frame ? { card_frame: o.frame } : {}),
    ...(o.task ? { task_context: o.task } : {}),
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};
const card = (q: string, right: string, rightFb = 'נכון מאוד! כך.') => ({
  error_category: 'procedural', guiding_question: q,
  options: [
    { id: 'opt_1', option_text: right, feedback_text: rightFb, is_correct: true },
    { id: 'opt_2', option_text: 'מנחשים', feedback_text: 'רמז: איך בודקים בלי לנחש?', is_correct: false },
    { id: 'opt_3', option_text: 'מחכים', feedback_text: 'רמז: מה אפשר לעשות עכשיו?', is_correct: false },
  ],
});

describe('the board against the exercise', () => {
  it('stray blocks in an addition are not a column to group (456 + 281 with 12 hundreds)', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 456, b: 281, counts: [7, 13, 12, 0], col: 1 }));
    expect(f.board_stage).toBe('beyond');
    expect(f.columns.find((c) => c.column === 'hundreds')?.stray).toBe(true);
    expect(f.columns.some((c) => c.board_overcrowded)).toBe(false);
    expect(f.suggested_focus_he).toContain('אסור להציע לקבץ את הלבנים המיותרות');
  });

  it('a subtraction deficit is read only in the column whose turn it is', () => {
    // 53 − 18 after the borrow and taking 8 units: 4 tens, 5 units — no second borrow.
    const mid = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [5, 4, 0, 0], col: 0 }));
    expect(mid.board_stage).toBe('taking_away');
    expect(mid.columns.every((c) => c.board_deficit === 0)).toBe(true);
    // 425 − 162 with the units taken (4 h, 2 t, 3 u): the tens lack, it is their turn.
    const tens = deriveSocraticFacts(arith({ session: 4, op: 'subtraction', a: 425, b: 162, counts: [3, 2, 4, 0], col: 1, completed: ['units'] }));
    expect(tens.columns.find((c) => c.column === 'tens')?.board_deficit).toBe(4);
    // At the minuend, the first short column becomes the card's column.
    const start = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [3, 5, 0, 0], col: 1 }));
    expect(start.board_stage).toBe('minuend');
    expect(start.active_column).toBe('units');
  });

  it('everything taken away with a column of 10 or more: group back', () => {
    const f = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [15, 2, 0, 0] }));
    expect(f.board_stage).toBe('result');
    expect(f.columns.find((c) => c.column === 'units')?.group_back).toBe(true);
    expect(f.suggested_focus_he).toContain('לקבץ אותן בחזרה');
  });

  it('a block dragged from the toolbox instead of a break (345 − 182 as 445)', () => {
    const f = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 345, b: 182, counts: [5, 4, 4, 0] }));
    expect(f.added_from_toolbox).toBe(true);
    expect(f.suggested_focus_he).toContain('ארגז הכלים');
  });

  it('the carry comes from the exercise, not from a typed circle; a circle above 1 is a wrong record', () => {
    const f = deriveSocraticFacts(arith({ session: 8, op: 'addition', a: 1245, b: 328, counts: [0, 0, 0, 0], col: 1, memory: { tens: 13 }, completed: ['units'] }));
    expect(f.columns.find((c) => c.column === 'tens')?.carry_in).toBe(1);
    expect(f.columns.find((c) => c.column === 'tens')?.needs_conversion).toBe(false);
    expect(f.wrong_carry_circles).toEqual(['tens']);
    expect(buildSocraticPrompt(arith({ session: 8, op: 'addition', a: 1245, b: 328, counts: [0, 0, 0, 0], col: 1, memory: { tens: 13 } }), f)).toContain('רישום שגוי');
  });

  it('a column whose conversion is done is not coached to convert again', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 128, b: 35, counts: [3, 6, 1, 0], conversions: ['units'], trigger: 'consecutive_errors_4' }));
    expect(f.columns.find((c) => c.column === 'units')?.conversion_done).toBe(true);
    expect(f.suggested_category).toBe('calculation');
  });

  it('typing patterns: the forgotten carry and the reversed subtraction', () => {
    const typed = (col: number, d: number) => [{ event_type: 'DIGIT_ENTERED', column_index: col, details: { digit_value: d, is_correct: false } }];
    const carry = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 247, b: 135, counts: [2, 8, 3, 0], col: 1, trigger: 'repeated_errors', actions: typed(1, 7) }));
    expect(carry.typing_pattern).toBe('carry_forgotten');
    const rev = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 142, b: 25, counts: [2, 4, 1, 0], trigger: 'repeated_errors', actions: typed(0, 3) }));
    expect(rev.typing_pattern).toBe('reversed_subtraction');
  });

  it('"typing before converting" is procedural even on a crowded board (category order)', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 5678, b: 2453, counts: [1, 13, 10, 7], col: 1, trigger: 'conversion_not_performed' }));
    expect(f.suggested_category).toBe('procedural');
  });

  it('a skeleton on an empty board is never "build both numbers"', () => {
    const f = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 386, b: 271, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
    expect(f.suggested_focus_he).not.toContain('לבנות את שני המספרים');
    expect(f.suggested_focus_he).toContain('אי אפשר לבנות את המספר המוסתר');
  });
});

describe('the frame and the leaks', () => {
  it('a level-1 card names no column, in its question or its right option', () => {
    const req = arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [3, 5, 0, 0], frame: { situation: 'borrow_check', level: 1 } });
    const f = deriveSocraticFacts(req);
    expect(validateSocraticResponse(card('מה בודקים בכל טור לפני שמוציאים לבנים?', 'אם יש בטור מספיק לבנים כדי לחסר'), f).ok).toBe(true);
    const named = validateSocraticResponse(card('מה בודקים בטור היחידות?', 'אם יש בו מספיק לבנים'), f);
    expect(named.ok).toBe(false);
    if (!named.ok) expect(named.reason).toMatch(/^frame:/);
    const level2 = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [3, 5, 0, 0], frame: { situation: 'borrow', level: 2 } }));
    expect(validateSocraticResponse(card('מה בודקים בטור היחידות?', 'אם יש בו מספיק לבנים'), level2).ok).toBe(true);
    expect(buildSocraticPrompt(req, f)).toContain('רמה 1 — כללית');
  });

  it('meeting 1: the question names no column', () => {
    const f = deriveSocraticFacts(arith({ session: 1, op: 'addition', a: 713, b: 94, counts: [7, 10, 7, 0], col: 1 }));
    const r = validateSocraticResponse(card('בטור העשרות יש הרבה לבנים. מה עושים?', 'מקבצים 10 לבנים ללבנה אחת'), f);
    expect(r.ok).toBe(false);
  });

  it('a hidden digit is never named for its column, nor a missing result digit', () => {
    const skel = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 386, b: 271, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
    expect(validateSocraticResponse(card('מה חסר בטור העשרות?', 'בונים 8 עשרות'), skel).ok).toBe(false);
    expect(validateSocraticResponse(card('מה חסר בטור העשרות?', 'ספרת העשרות החסרה היא 8'), skel).ok).toBe(false);
    const missing = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 328, b: 145, counts: [3, 7, 4, 0], col: 1, task: { kind: 'missing_result_digit', instruction_he: 'בתרגיל 328 + 145 חסרה ספרת העשרות בשורת התוצאה.', hidden_result_places: ['tens'] } }));
    expect(validateSocraticResponse(card('מה כותבים בטור העשרות?', 'כותבים 7 עשרות'), missing).ok).toBe(false);
  });

  it('a representation\'s secret number is refused as digits and as blocks', () => {
    expect(secretInBlockCounts(['בניתם 3 לבני אלף ו-4 לבני מאה'], [3400])).toBe(3400);
    expect(secretInBlockCounts(['פורטים לבנת אלף אחת'], [3400])).toBeNull();
    const v = validateSocraticRequest({
      student_id: 5, session_id: 'session_3_student_5', exercise_id: 's3_g_t2', active_column_index: 0,
      workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 14, thousands_count: 2, memory_circles: {} }, recent_actions: [],
      task_context: { kind: 'compose_break', instruction_he: 'בנו בבית המספרים 3 לבני אלף ו-4 לבני מאה. פרטו לבנת אלף אחת לעשר לבני מאה.', required_counts: { thousands: 2, hundreds: 14 }, start_counts: { thousands: 3, hundreds: 4 }, conversion_done: true, secret_numbers: [3400] },
    });
    if (!v.ok) throw new Error(v.reason);
    const f = deriveSocraticFacts(v.value);
    expect(f.screen).toBe('representation_one_box');
    expect(f.memory_circles_on_screen).toBe(false);
    expect(validateSocraticResponse(card('האם המספר 3,400 השתנה?', 'לא'), f).ok).toBe(false);
    expect(validateSocraticResponse(card('בניתם 3 לבני אלף ו-4 לבני מאה. האם הפריטה שינתה את המספר?', 'לא'), f).ok).toBe(false);
    expect(validateSocraticResponse(card('האם הפריטה שינתה את המספר?', 'לא. הלבנים השתנו, המספר לא'), f).ok).toBe(true);
    // No memory circles on this screen.
    expect(validateSocraticResponse(card('מה רושמים בעיגול הזיכרון?', 'כלום'), f).ok).toBe(false);
    expect(screenDescriptionHe(f).join(' ')).toContain('תיבת תשובה אחת');
  });

  it('the request refuses a malformed task context or frame', () => {
    const base = { student_id: 5, session_id: 'session_3_student_5', exercise_id: 'x', active_column_index: 0, workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [] };
    expect(validateSocraticRequest({ ...base, task_context: { kind: 'essay', instruction_he: 'בנו' } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...base, task_context: { kind: 'read_write', instruction_he: 'write your name: david@example.com' } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...base, task_context: { kind: 'read_write', instruction_he: 'בנו', secret_numbers: [1, 2, 3, 4, 5] } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...base, card_frame: { situation: 'Bad Id', level: 1 } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...base, card_frame: { situation: 'borrow_check', level: 4 } }).ok).toBe(false);
    expect(validateSocraticRequest({ ...base, card_frame: { situation: 'borrow_check', level: 1, intent_he: 'מה בודקים בכל טור' } }).ok).toBe(true);
  });
});
