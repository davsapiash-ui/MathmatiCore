import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  validateSocraticResponse,
  mentionsDigitAnywhere,
  type SocraticRequest,
} from '../socraticContract';
import { languageViolation } from '../socraticLanguage';
import { reportTextViolation, isEmptyAnalysis, reportAnalysisOutcome } from '../reportAnalysis';

/**
 * The final review of the Socratic coaching round (2.10.2026), server side:
 * finding 4 ("הוצא" is also the passive), finding 5 (digit leaks the validator
 * missed) and finding 11 (the report's term filter and the empty analysis).
 */
type Counts = [number, number, number, number];
const COLS = ['units', 'tens', 'hundreds', 'thousands'];
const arith = (o: {
  session: number; op: 'addition' | 'subtraction'; a: number; b: number; counts: Counts; col?: number;
  completed?: string[]; hidden?: { a: string[]; b: string[] }; frame?: { situation: string; level: 1 | 2 | 3 };
}): SocraticRequest => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${o.session}_student_5`, exercise_id: 'x', active_column_index: o.col ?? 0,
    workspace_state: { ones_count: o.counts[0], tens_count: o.counts[1], hundreds_count: o.counts[2], thousands_count: o.counts[3], memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: 'hesitation_45s', completed_columns: o.completed ?? [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    exercise_context: { operation: o.op, number_a: o.a, number_b: o.b, session_id: 's', session_topic: '', active_column: COLS[o.col ?? 0], active_column_index: o.col ?? 0, target_sub_problem: '', ...(o.hidden ? { hidden_places: o.hidden } : {}) },
    ...(o.frame ? { card_frame: o.frame } : {}),
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};
const card = (q: string, right: string, rightFb = 'נכון מאוד! כך עושים.') => ({
  error_category: 'procedural', guiding_question: q,
  options: [
    { id: 'opt_1', option_text: right, feedback_text: rightFb, is_correct: true },
    { id: 'opt_2', option_text: 'מנחשים', feedback_text: 'רמז: איך בודקים בלי לנחש?', is_correct: false },
    { id: 'opt_3', option_text: 'מחכים', feedback_text: 'רמז: מה אפשר לעשות עכשיו?', is_correct: false },
  ],
});

describe('finding 4 — "הוצא" is the passive too', () => {
  it('the passive passes; the imperative with an object is still refused', () => {
    expect(languageViolation(['בודקים כמה הוצא מכל טור'])).toBeNull();
    expect(languageViolation(['בודקים בכל טור כמה לבנים כבר יצאו ממנו'])).toBeNull();
    expect(languageViolation(['הוצא את הלבנים'])?.id).toBe('second_person_singular');
    expect(languageViolation(['הוצא לבנה אחת'])?.id).toBe('second_person_singular');
  });
});

describe('finding 5 — a hidden digit the screen shows nowhere is refused anywhere', () => {
  // s7_r_t3: 3▢6 + 271 = 657, the hidden tens digit is 8 — no 8 on the screen.
  const skel = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 386, b: 271, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
  for (const [right, fb] of [
    ['מוסיפים 8', 'נכון מאוד! כך עושים.'],
    ['בודקים מה חסר', 'נכון מאוד! הספרה 8, כי 7 ועוד 8 הם 15.'],
    ['מוסיפים שמונה', 'נכון מאוד! כך עושים.'],
    ['מוסיפים ל-8', 'נכון מאוד! כך עושים.'],
  ] as const) {
    it(`refuses: ${right} / ${fb}`, () => {
      const r = validateSocraticResponse(card('מה חסר בטור העשרות?', right, fb), skel);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^hidden digits leaked/);
    });
  }
  // The reviewer's sample: zero false positives.
  for (const t of [
    'מה כתוב בהנחיה', 'איזה מספר נבנה בבית המספרים', 'נסו את הכפתור', 'שימו לב לטור העשרות', 'בודקים בלי לחץ',
    'מה רשום בעיגול הזיכרון', 'כותבים ספרה אחת בכל תיבה', 'רושמים 1 בעיגול הזיכרון', 'מקבצים 10 יחידות לעשרת אחת',
    'בתרגיל 3▢6 + 271 = 657, מה חסר בטור העשרות', 'בודקים את שני המספרים', 'בודקים את 18 העשרות',
  ]) {
    it(`passes: ${t}`, () => {
      const r = validateSocraticResponse(card('מה בודקים בטור העשרות?', t), skel);
      expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    });
  }
  it('a hidden digit that IS on the screen is judged by its column only (as before)', () => {
    // 316 + 251 = 567 with the tens hidden (1): the 1 of 251 is on the screen.
    const f = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 316, b: 251, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
    expect(validateSocraticResponse(card('מה בודקים?', 'מחברים 1 ו-5 בטור היחידות'), f).ok).toBe(true);
  });
  it('mentionsDigitAnywhere: tokens, words, and the exempt look-alikes', () => {
    expect(mentionsDigitAnywhere('הספרה 8', 8)).toBe(true);
    expect(mentionsDigitAnywhere('שמונה עשרות', 8)).toBe(true);
    expect(mentionsDigitAnywhere('18 ו-80', 8)).toBe(false);
    expect(mentionsDigitAnywhere('שני המספרים', 2)).toBe(false);
    expect(mentionsDigitAnywhere('שתי עשרות', 2)).toBe(true);
    expect(mentionsDigitAnywhere('עשרת אחת', 1)).toBe(false);
    expect(mentionsDigitAnywhere('רושמים 1 בעיגול הזיכרון', 1)).toBe(false);
    expect(mentionsDigitAnywhere('מוסיפים 1', 1)).toBe(true);
  });
});

describe('finding 5 — what a column WILL hold or show states the result digit', () => {
  it('53 − 18 at level 2: "בטור היחידות יישארו 5 לבנים" is refused', () => {
    const f = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [13, 4, 0, 0], col: 0, frame: { situation: 'take_away', level: 2 } }));
    const r = validateSocraticResponse(card('מה קורה בטור היחידות?', 'בטור היחידות יישארו 5 לבנים'), f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^final answer leaked/);
    expect(validateSocraticResponse(card('מה קורה בטור היחידות?', 'בטור היחידות יישארו חמש לבנים'), f).ok).toBe(false);
    expect(validateSocraticResponse(card('מה קורה בטור היחידות?', '5 לבנים יישארו בטור היחידות'), f).ok).toBe(false);
    // Asking stays allowed, and so does the number to take away.
    expect(validateSocraticResponse(card('כמה לבנים יישארו בטור היחידות?', 'מוציאים 8 לבנים וסופרים כמה נשארו'), f).ok).toBe(true);
  });
  it('85 + 17: "בתיבה של טור המאות יופיע 1" is refused', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 85, b: 17, counts: [2, 10, 0, 0], col: 1, completed: ['units'] }));
    const r = validateSocraticResponse(card('מה קורה בטור המאות?', 'בתיבה של טור המאות יופיע 1'), f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^final answer leaked/);
    expect(validateSocraticResponse(card('מה קורה בטור העשרות?', 'בטור העשרות תהיה עשרת אחת נוספת'), f).ok).toBe(true);
    expect(validateSocraticResponse(card('מה עושים בטור העשרות?', 'מקבצים 10 עשרות למאה אחת', 'נכון מאוד! רושמים 1 בעיגול הזיכרון שמעל טור המאות.'), f).ok).toBe(true);
  });
});

describe('finding 11 — the report term filter and the empty analysis', () => {
  it('"ללוות מהעשרות" is the borrowing term; "ללוות את הלומד" is not', () => {
    expect(reportTextViolation(['הלומד ניסה ללוות מהעשרות.'])).not.toBeNull();
    expect(reportTextViolation(['הלומד לווה מהמאות.'])).not.toBeNull();
    expect(reportTextViolation(['מומלץ ללוות את הלומד בתרגול.'])).toBeNull();
  });
  it('arrays of non-strings are malformed, not empty', () => {
    const keys = ['knowledge_gaps', 'teaching_recommendations'] as const;
    expect(isEmptyAnalysis('{"knowledge_gaps":[1],"teaching_recommendations":[]}', keys)).toBe(false);
    expect(isEmptyAnalysis('{"knowledge_gaps":[{}],"teaching_recommendations":[null]}', keys)).toBe(false);
    expect(reportAnalysisOutcome(false, false, '{"knowledge_gaps":[1],"teaching_recommendations":[]}', keys).outcome).toBe('schema_reject');
    expect(isEmptyAnalysis('{"knowledge_gaps":[" "],"teaching_recommendations":[]}', keys)).toBe(true);
  });
});
