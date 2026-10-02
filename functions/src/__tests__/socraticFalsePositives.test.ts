import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  validateSocraticResponse,
  type SocraticRequest,
} from '../socraticContract';
import { languageViolation } from '../socraticLanguage';

/**
 * Verification of the final-review fixes (2.10.2026): the validator refused
 * good cards — a count of digits or boxes that equals a hidden digit the
 * screen shows nowhere ("שתי ספרות" in 5▢▢ − 178 = 364), and an operand that
 * equals the column's result digit ("אחרי שמוציאים 5" in 480 − 155). Each
 * refusal costs the child the Gemini card. A card is refused only when it
 * STATES that the column's result (or the hidden digit) is a value.
 */
type Counts = [number, number, number, number];
const COLS = ['units', 'tens', 'hundreds', 'thousands'];
const arith = (o: {
  session: number; op: 'addition' | 'subtraction'; a: number; b: number; counts: Counts; col?: number;
  completed?: string[]; hidden?: { a: string[]; b: string[] };
}): SocraticRequest => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${o.session}_student_5`, exercise_id: 'x', active_column_index: o.col ?? 0,
    workspace_state: { ones_count: o.counts[0], tens_count: o.counts[1], hundreds_count: o.counts[2], thousands_count: o.counts[3], memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: 'hesitation_45s', completed_columns: o.completed ?? [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    exercise_context: { operation: o.op, number_a: o.a, number_b: o.b, session_id: 's', session_topic: '', active_column: COLS[o.col ?? 0], active_column_index: o.col ?? 0, target_sub_problem: '', ...(o.hidden ? { hidden_places: o.hidden } : {}) },
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
type Case = readonly [question: string, right: string, feedback?: string];

const skel = (a: number, b: number, op: 'addition' | 'subtraction', hidden: string[], col = 1) =>
  deriveSocraticFacts(arith({ session: 7, op, a, b, counts: [0, 0, 0, 0], col, hidden: { a: hidden, b: [] } }));

// The skeletons: the hidden digits and whether the screen shows them.
const EX = {
  // s7_r_t4: 5▢▢ − 178 = 364 — hidden 4 (on the screen, in 364) and 2 (nowhere).
  s7_r_t4: () => skel(542, 178, 'subtraction', ['tens', 'units'], 0),
  // 4▢6 + 351 = 777 — hidden 2, nowhere on the screen.
  t426: () => skel(426, 351, 'addition', ['tens']),
  // 3▢7 + 455 = 772 — hidden 1, nowhere on the screen.
  t317: () => skel(317, 455, 'addition', ['tens']),
  // ▢6 + 21 = 57 — hidden 3, nowhere on the screen.
  t36: () => skel(36, 21, 'addition', ['tens']),
  // 3▢6 + 452 = 758 — hidden 0, nowhere on the screen.
  t306: () => skel(306, 452, 'addition', ['tens']),
  // s7_r_t3: 3▢6 + 271 = 657 — hidden 8, nowhere on the screen.
  t386: () => skel(386, 271, 'addition', ['tens']),
};
const vert = (session: number, op: 'addition' | 'subtraction', a: number, b: number, counts: Counts, col = 0, completed: string[] = []) =>
  deriveSocraticFacts(arith({ session, op, a, b, counts, col, completed }));
const V = {
  v480_155: () => vert(5, 'subtraction', 480, 155, [10, 7, 4, 0]),
  v6020_1485: () => vert(7, 'subtraction', 6020, 1485, [10, 1, 0, 6]),
  v76_38: () => vert(5, 'subtraction', 76, 38, [16, 6, 0, 0]),
  v68_24: () => vert(5, 'subtraction', 68, 24, [8, 6, 0, 0]),
  v5678_2453: () => vert(7, 'addition', 5678, 2453, [1, 3, 10, 7], 2, ['units', 'tens']),
  v40_25: () => vert(4, 'addition', 40, 25, [5, 6, 0, 0]),
  v53_18: () => vert(5, 'subtraction', 53, 18, [13, 4, 0, 0]),
  v85_17: () => vert(4, 'addition', 85, 17, [2, 10, 0, 0], 1, ['units']),
};

const passes = (name: string, facts: () => ReturnType<typeof deriveSocraticFacts>, cases: Case[]) => {
  for (const [q, right, fb] of cases) {
    it(`${name} passes: ${q} → ${right}${fb ? ` / ${fb}` : ''}`, () => {
      const r = validateSocraticResponse(card(q, right, fb), facts());
      expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    });
  }
};
const refuses = (name: string, facts: () => ReturnType<typeof deriveSocraticFacts>, cases: Case[], reason: RegExp) => {
  for (const [q, right, fb] of cases) {
    it(`${name} refuses: ${q} → ${right}${fb ? ` / ${fb}` : ''}`, () => {
      const r = validateSocraticResponse(card(q, right, fb), facts());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(reason);
    });
  }
};

describe('a hidden digit the screen shows nowhere: counts of other things are not the digit', () => {
  passes('s7_r_t4 (5▢▢ − 178 = 364)', EX.s7_r_t4, [
    ['בתרגיל חסרות שתי ספרות. מאיזו מתחילים?', 'מטור היחידות'],
    ['מה חסר בתרגיל?', 'שתי ספרות: ספרת היחידות וספרת העשרות'],
    ['כמה תיבות ריקות יש?', 'שתיים'],
  ]);
  passes('4▢6 + 351 = 777', EX.t426, [
    ['מה חסר בתרגיל?', 'שתי ספרות, ובטור העשרות אחת מהן חסרה'],
    ['יש שתי דרכים לבדוק. מה אחת מהן?', 'מחסרים בטור העשרות'],
  ]);
  passes('3▢7 + 455 = 772', EX.t317, [
    ['בטור היחידות 7 ועוד 5 הם 12. מה עושים עם ה-1 של 12?', 'רושמים אותו בעיגול הזיכרון'],
    ['כמה עשרות עברו מטור היחידות?', 'אחת'],
  ]);
  passes('▢6 + 21 = 57', EX.t36, [
    ['כמה מספרים יש בתרגיל?', 'שלושה: שני מספרים ותוצאה'],
  ]);
  // The question asks for the hidden digit itself: a matching answer is the leak.
  refuses('3▢6 + 452 = 758', EX.t306, [
    ['מה עושים בטור העשרות?', 'כותבים אפס'],
  ], /^hidden digits leaked/);
  refuses('3▢7 + 455 = 772', EX.t317, [
    ['כמה עשרות חסרות במספר הראשון?', 'אחת'],
    ['מה הספרה החסרה?', 'אחת'],
    ['האם הספרה החסרה היא אחת?', 'בודקים בעזרת חיסור'],
    ['מה עושים בטור העשרות?', 'מוסיפים 1'],
  ], /^hidden digits leaked/);
  refuses('s7_r_t4 (5▢▢ − 178 = 364)', EX.s7_r_t4, [
    ['מה הספרה החסרה בטור היחידות?', 'שתיים'],
    ['כמה יחידות חסרות?', 'שתיים'],
    ['מה עושים בטור היחידות?', 'כותבים 2 בתיבה'],
  ], /^hidden digits leaked/);
  refuses('s7_r_t3 (3▢6 + 271 = 657)', EX.t386, [
    ['מה עושים בטור העשרות?', 'חסרות שמונה עשרות'],
    ['מה עושים בטור העשרות?', 'מוסיפים 8'],
    ['כמה מוסיפים ל-7 כדי לקבל 15?', 'שמונה'],
  ], /^hidden digits leaked/);
});

describe('state verbs: a digit that is an operand, or inside a question, is not the result', () => {
  passes('480 − 155', V.v480_155, [
    ['כמה לבנים יישארו בטור היחידות אחרי שמוציאים 5?', 'סופרים את הלבנים שנשארו'],
    ['מה יהיה בטור היחידות אחרי שמוציאים 5 לבנים?', 'סופרים את הלבנים שנשארו'],
  ]);
  passes('6020 − 1485', V.v6020_1485, [
    ['כמה יחידות יישארו אם מוציאים 5 מטור היחידות?', 'סופרים את הלבנים שנשארו'],
  ]);
  passes('76 − 38', V.v76_38, [
    ['כמה לבנים יישארו בטור היחידות אם מוציאים 8?', 'סופרים את הלבנים שנשארו'],
    ['מה עושים בטור היחידות?', 'בטור היחידות יהיו 16 פחות 8'],
    ['מה עושים בטור היחידות?', 'מוציאים 8 לבנים, ובטור היחידות יישארו 16 פחות 8'],
  ]);
  passes('68 − 24', V.v68_24, [
    ['כמה לבנים יישארו בטור היחידות אחרי שמוציאים 4?', 'סופרים את הלבנים שנשארו'],
  ]);
  passes('5,678 + 2,453', V.v5678_2453, [
    ['מה יהיה בטור המאות אם מחברים 6, 4 ועוד 1?', 'סופרים את כל הלבנים בטור'],
  ]);
  passes('40 + 25', V.v40_25, [
    ['מה יהיה בטור היחידות אם מחברים 0 ו-5?', 'סופרים את כל הלבנים בטור'],
  ]);
  // A statement of the result, and a yes/no question that asserts it, stay refused.
  refuses('53 − 18', V.v53_18, [
    ['מה קורה בטור היחידות?', 'בטור היחידות יישארו 5'],
    ['האם בטור היחידות יישארו 5?', 'בודקים בעזרת הלבנים'],
    ['מה קורה בטור היחידות?', 'מוציאים 8, ובטור היחידות יישארו 5'],
    ['מה קורה בטור העשרות?', 'התשובה בטור העשרות היא 3'],
  ], /^final answer leaked/);
  refuses('480 − 155', V.v480_155, [
    ['מה קורה בטור היחידות?', 'אחרי שמוציאים 5, בטור היחידות יישארו 5 לבנים'],
  ], /^final answer leaked/);
});

describe('own sample: natural Gemini-style cards that must pass', () => {
  passes('s7_r_t3 (3▢6 + 271 = 657)', EX.t386, [
    ['מה חסר בטור העשרות?', 'בודקים כמה עשרות יש בתוצאה ובמספר השני'],
    ['כמה צריך להוסיף ל-7 כדי לקבל 15?', 'סופרים מ-7 עד 15'],
    ['באיזה טור חסרה ספרה?', 'בטור העשרות'],
  ]);
  passes('s7_r_t4 (5▢▢ − 178 = 364)', EX.s7_r_t4, [
    ['שתי ספרות חסרות במספר הראשון. איזו בודקים קודם?', 'את ספרת היחידות'],
    ['איך אפשר לבדוק תרגיל חיסור?', 'מחברים את 178 ואת 364'],
    ['מאיזו תיבה מתחילים?', 'יש שתי תיבות ריקות, מתחילים מהימנית'],
  ]);
  passes('4▢6 + 351 = 777', EX.t426, [
    ['כמה מספרים מחברים בתרגיל?', 'שניים'],
    ['בטור העשרות, כמה צריך להוסיף ל-5 כדי לקבל 7?', 'סופרים מ-5 עד 7'],
    ['מה בודקים בשני הטורים האחרים?', 'שהחיבור בהם נכון'],
  ]);
  passes('▢6 + 21 = 57', EX.t36, [
    ['כמה מספרים רואים בתרגיל?', 'שלושה'],
    ['איך מוצאים את הספרה החסרה?', 'מחסרים: 5 פחות 2'],
  ]);
  passes('3▢7 + 455 = 772', EX.t317, [
    ['מה קרה בטור היחידות?', '7 ועוד 5 הם 12, ועשרת אחת עוברת לטור העשרות', 'נכון מאוד! רושמים 1 בעיגול הזיכרון שמעל טור העשרות.'],
    ['מה מסמן עיגול הזיכרון?', 'עשרת אחת שעברה מטור היחידות'],
    ['כמה פעמים בודקים כל טור?', 'פעם אחת, ואחר כך עוברים לטור הבא'],
  ]);
  passes('53 − 18', V.v53_18, [
    ['כמה לבנים יישארו בטור היחידות אחרי שמוציאים 8?', 'סופרים את הלבנים שנשארו'],
    ['מה עושים כשאין מספיק יחידות כדי להוציא 8?', 'פורטים עשרת אחת ל-10 יחידות'],
    ['מה יהיה בטור העשרות אחרי שמוציאים לבנת עשרת אחת?', 'סופרים כמה עשרות נשארו'],
  ]);
  passes('85 + 17', V.v85_17, [
    ['מה יהיה בטור העשרות אם מחברים 8, 1 ועוד 1?', 'סופרים את כל העשרות בטור'],
    ['מה עושים כשבטור יש יותר מ-9 לבנים?', 'מקבצים 10 עשרות למאה אחת'],
  ]);
  passes('6020 − 1485', V.v6020_1485, [
    ['אם מוציאים 8 עשרות מטור העשרות, כמה יישארו?', 'בודקים קודם אם יש מספיק עשרות'],
    ['מה יהיה בטור המאות אחרי שמוציאים 4 לבנים?', 'סופרים כמה מאות נשארו'],
  ]);
});

describe('"הוצא": the singular imperative with a number, "מ…" or a block noun', () => {
  it('is refused', () => {
    expect(languageViolation(['הוצא 3 לבנים מטור היחידות'])?.id).toBe('second_person_singular');
    expect(languageViolation(['הוצא מטור היחידות 3 לבנים'])?.id).toBe('second_person_singular');
    expect(languageViolation(['הוצא שלוש לבנים'])?.id).toBe('second_person_singular');
    expect(languageViolation(['הוצא לבנים מהטור'])?.id).toBe('second_person_singular');
    expect(languageViolation(['עכשיו הוצא מהטור עשרת אחת'])?.id).toBe('second_person_singular');
  });
  it('the passive still passes', () => {
    expect(languageViolation(['בודקים כמה הוצא מכל טור'])).toBeNull();
    expect(languageViolation(['מה הוצא מטור העשרות?'])).toBeNull();
    expect(languageViolation(['בודקים מה כבר הוצא מהטור'])).toBeNull();
  });
});
