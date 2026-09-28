import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  validateSocraticResponse,
  deriveSocraticFacts,
  buildSocraticPrompt,
  findAbsentAid,
} from '../socraticContract';

/**
 * Audit row 8.5 (28.9.2026), approved by the owner: in meeting 8 no blocks,
 * no trash and no number house are on the screen (PRD Module 14 §ב), and the
 * card must not use "מונחי עזרים פיזיים שאינם קיימים בממשק" (Module 13 §א).
 *
 * The workspace counts of meeting 8 are always 0. The prompt used to read
 * that as "the number house is empty — build the numbers in blocks", and said
 * nothing about the blocks being absent.
 */
const request = (sessionId: string) => {
  const v = validateSocraticRequest({
    student_id: 12,
    session_id: sessionId,
    exercise_id: 's8_g_t1',
    active_column_index: 0,
    workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} },
    recent_actions: [],
    exercise_context: {
      operation: 'addition', number_a: 1245, number_b: 328, session_id: sessionId,
      session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '5 + 8',
    },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};

const card = (question: string, correct: string) => ({
  error_category: 'procedural',
  guiding_question: question,
  options: [
    { id: 'opt_1', option_text: correct, feedback_text: 'נכון מאוד!', is_correct: true },
    { id: 'opt_2', option_text: 'ננחש את התוצאה', feedback_text: 'רמז: הימנעו מניחושים.', is_correct: false },
    { id: 'opt_3', option_text: 'נחכה', feedback_text: 'רמז: התשובה לא תופיע מעצמה.', is_correct: false },
  ],
});

describe('meeting 8: the prompt and the check know there are no blocks', () => {
  it('the facts say so, and do not read the zero counts as an empty board', () => {
    const facts = deriveSocraticFacts(request('session_8_student_12'));
    expect(facts.meeting).toBe(8);
    expect(facts.blocks_on_screen).toBe(false);
    expect(facts.suggested_focus_he).not.toMatch(/בית המספרים ריק|בלבנים|לבנים/);
    expect(facts.suggested_focus_he).toContain('עיגול הזיכרון');
  });

  it('the prompt tells the model the blocks are not on the screen, and gives no board section', () => {
    const req = request('session_8_student_12');
    const prompt = buildSocraticPrompt(req, deriveSocraticFacts(req));
    expect(prompt).toContain('אין לבנים, אין פח אשפה ואין בית מספרים');
    expect(prompt).not.toContain('ערך כולל בלוח');
    expect(prompt).not.toContain('ואת מצב הלבנים');
  });

  it('a card that sends the child to blocks or to the trash is refused in meeting 8 only', () => {
    const blocky = card('בתרגיל 1,245 + 328, מה עושים?', 'נקבץ 10 לבנים בטור היחידות');
    const m8 = deriveSocraticFacts(request('session_8_student_12'));
    const m4 = deriveSocraticFacts(request('session_4_student_12'));
    expect(validateSocraticResponse(blocky, m8).ok).toBe(false);
    expect(validateSocraticResponse(blocky, m4).ok).toBe(true);
    const circles = card('בתרגיל 1,245 + 328, מה עושים בטור היחידות?', 'נרשום 1 בעיגול הזיכרון שמעל טור העשרות');
    expect(validateSocraticResponse(circles, m8).ok).toBe(true);
  });

  it('whole words only: "לבנות" and "לפחות" are not aids; מסמך 03\'s own question passes', () => {
    expect(findAbsentAid(['צריך לפחות עשר', 'אפשר לבנות'], false)).toBeNull();
    expect(findAbsentAid(['כיצד תפתרו את התרגילים כאשר אין לכם לבני דינס על המסך?'], false)).toBeNull();
    expect(findAbsentAid(['גררו לפח האשפה'], false)).not.toBeNull();
    expect(findAbsentAid(['גררו לפח האשפה'], true)).toBeNull();
  });

  it('meeting 4 keeps its board section', () => {
    const req = request('session_4_student_12');
    const prompt = buildSocraticPrompt(req, deriveSocraticFacts(req));
    expect(prompt).toContain('המצב הייצוגי בבית המספרים (לבנים)');
  });
});
