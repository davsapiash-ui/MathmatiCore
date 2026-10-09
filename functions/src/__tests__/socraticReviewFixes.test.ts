import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  buildSocraticPrompt,
  validateSocraticResponse,
  screenDescriptionHe,
  instructionStepsOf,
  instructionColumnsOf,
  carryIntoHe,
  breakIntoHe,
  type SocraticRequest,
} from '../socraticContract';
import { languageViolation, cardFormViolation } from '../socraticLanguage';

/**
 * The independent review of PR #205 (1.10.2026), finding by finding: the
 * carried block's noun, the circle's real content, the digit stated for its
 * column, the second person singular, two-step representation tasks, the
 * level-1 check against station 1's own cards, and the meeting-1 screen.
 */
type Counts = [number, number, number, number];
const COLS = ['units', 'tens', 'hundreds', 'thousands'];
const arith = (o: {
  session: number; op: 'addition' | 'subtraction'; a: number; b: number; counts: Counts; col?: number;
  trigger?: string; memory?: Record<string, number>; completed?: string[]; actions?: any[]; hidden?: { a: string[]; b: string[] };
  conversions?: string[]; frame?: { situation: string; level: 1 | 2 | 3 }; task?: Record<string, unknown>;
}): SocraticRequest => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${o.session}_student_5`, exercise_id: 'x', active_column_index: o.col ?? 0,
    workspace_state: { ones_count: o.counts[0], tens_count: o.counts[1], hundreds_count: o.counts[2], thousands_count: o.counts[3], memory_circles: o.memory ?? {}, ...(o.conversions ? { conversions_done: o.conversions } : {}) },
    recent_actions: o.actions ?? [],
    student_progress_state: { trigger_reason: o.trigger ?? 'hesitation_45s', completed_columns: o.completed ?? [], current_column_input: null, memory_circles_state: o.memory ?? {}, consecutive_errors_count: 0, recent_actions: [] },
    exercise_context: { operation: o.op, number_a: o.a, number_b: o.b, session_id: 's', session_topic: '', active_column: COLS[o.col ?? 0], active_column_index: o.col ?? 0, target_sub_problem: '', ...(o.hidden ? { hidden_places: o.hidden } : {}) },
    ...(o.frame ? { card_frame: o.frame } : {}),
    ...(o.task ? { task_context: o.task } : {}),
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};
const rep = (o: { session: number; id: string; counts: Counts; task: Record<string, unknown>; frame?: { situation: string; level: 1 | 2 | 3 } }) => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${o.session}_student_5`, exercise_id: o.id, active_column_index: 0,
    workspace_state: { ones_count: o.counts[0], tens_count: o.counts[1], hundreds_count: o.counts[2], thousands_count: o.counts[3], memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: 'hesitation_45s', completed_columns: [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    task_context: o.task,
    ...(o.frame ? { card_frame: o.frame } : {}),
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};
/** A card in the owner's form; `extra` replaces texts to put the phrase under test where it matters. */
const card = (q: string, right: string, rightFb = 'נכון מאוד! כך עושים.', wrong: [string, string] = ['מנחשים', 'מחכים']) => ({
  error_category: 'procedural', guiding_question: q,
  options: [
    { id: 'opt_1', option_text: right, feedback_text: rightFb, is_correct: true },
    { id: 'opt_2', option_text: wrong[0], feedback_text: 'רמז: איך בודקים בלי לנחש?', is_correct: false },
    { id: 'opt_3', option_text: wrong[1], feedback_text: 'רמז: מה אפשר לעשות עכשיו?', is_correct: false },
  ],
});
const typed = (col: number, d: number, n = 1) => Array.from({ length: n }, () => ({ event_type: 'DIGIT_ENTERED', column_index: col, details: { digit_value: d, is_correct: false } }));

describe('finding 1 — what a grouping passes on is a block of the RECEIVING column', () => {
  it('the nouns themselves', () => {
    expect(carryIntoHe('tens')).toBe('העשרת שעברה מטור היחידות');
    expect(carryIntoHe('hundreds')).toBe('המאה שעברה מטור העשרות');
    expect(carryIntoHe('thousands')).toBe('האלף שעבר מטור המאות');
    expect(breakIntoHe('units')).toBe('פורטים עשרת אחת לעשר יחידות');
    expect(breakIntoHe('tens')).toBe('פורטים מאה אחת לעשר עשרות');
    expect(breakIntoHe('hundreds')).toBe('פורטים אלף אחד לעשר מאות');
  });

  it('456 + 281, the hundreds column receives a hundred, not a ten', () => {
    const req = arith({ session: 8, op: 'addition', a: 456, b: 281, counts: [0, 0, 0, 0], col: 2, completed: ['units', 'tens'], memory: { hundreds: 1 }, trigger: 'consecutive_errors_4' });
    const f = deriveSocraticFacts(req);
    const prompt = buildSocraticPrompt(req, f);
    expect(f.carry_state_he).toContain('המאה שעברה מטור העשרות');
    expect(prompt).toContain('מקבל מאה אחת מההמרה בטור העשרות');
    expect(prompt).not.toMatch(/מקבל עשרת|העשרת שעברה/);
    expect(f.suggested_focus_he).toContain('ועוד המאה שעברה מטור העשרות');
  });

  it('85 + 17, the tens column receives a ten', () => {
    const req = arith({ session: 4, op: 'addition', a: 85, b: 17, counts: [2, 10, 0, 0], col: 1, conversions: ['units'], completed: ['units'] });
    const prompt = buildSocraticPrompt(req, deriveSocraticFacts(req));
    expect(prompt).toContain('מקבל עשרת אחת מההמרה בטור היחידות');
    // The tens of 85 + 17 group too: ten tens into ONE HUNDRED.
    expect(prompt).toContain('דורש הקבצה (10 עשרות למאה אחת)');
  });

  it('3▢6 + 271 = 657: the hidden tens group into a hundred', () => {
    const req = arith({ session: 7, op: 'addition', a: 386, b: 271, counts: [0, 0, 0, 0], col: 2, hidden: { a: ['tens'], b: [] }, completed: ['units', 'tens'] });
    expect(buildSocraticPrompt(req, deriveSocraticFacts(req))).toContain('מקבל מאה אחת מההמרה בטור העשרות');
  });

  it('1,245 + 328 a ten into the tens; 5,678 + 2,453 a thousand into the thousands (masculine)', () => {
    const tens = arith({ session: 8, op: 'addition', a: 1245, b: 328, counts: [0, 0, 0, 0], col: 1, completed: ['units'], memory: { tens: 1 }, trigger: 'consecutive_errors_4' });
    expect(deriveSocraticFacts(tens).carry_state_he).toBe('העשרת שעברה מטור היחידות רשומה בעיגול הזיכרון שמעל טור העשרות.');
    const th = arith({ session: 8, op: 'addition', a: 5678, b: 2453, counts: [0, 0, 0, 0], col: 3, completed: ['units', 'tens', 'hundreds'], memory: { thousands: 1 }, trigger: 'consecutive_errors_4' });
    expect(deriveSocraticFacts(th).carry_state_he).toBe('האלף שעבר מטור המאות רשום בעיגול הזיכרון שמעל טור האלפים.');
    expect(buildSocraticPrompt(th, deriveSocraticFacts(th))).toContain('מקבל אלף אחד מההמרה בטור המאות');
  });

  it('a wrong circle above the hundreds: at most ONE HUNDRED passes into it', () => {
    const f = deriveSocraticFacts(arith({ session: 8, op: 'addition', a: 456, b: 281, counts: [0, 0, 0, 0], col: 2, memory: { hundreds: 13 } }));
    expect(f.suggested_focus_he).toContain('עוברת מטור העשרות לטור המאות לכל היותר מאה אחת');
    expect(f.suggested_focus_he).not.toContain('עשרת אחת בלבד');
  });

  it('a subtraction with a hundreds break: 806 − 351 — the tens get ten tens from one hundred', () => {
    const req = arith({ session: 6, op: 'subtraction', a: 806, b: 351, counts: [6, 0, 8, 0], col: 1, completed: ['units'] });
    const f = deriveSocraticFacts(req);
    const prompt = buildSocraticPrompt(req, f);
    expect(prompt).toContain('דורש פריטה (פורטים מאה אחת לעשר עשרות)');
    expect(prompt).toContain('נותן מאה אחת לפריטה בטור העשרות');
    expect(f.suggested_focus_he).toContain('פורטים מאה אחת לעשר עשרות');
    // Meeting 8, no blocks: the same nouns.
    const noBlocks = arith({ session: 8, op: 'subtraction', a: 806, b: 351, counts: [0, 0, 0, 0], col: 1, completed: ['units'] });
    const fn = deriveSocraticFacts(noBlocks);
    expect(fn.suggested_focus_he).toContain('נדרשת פריטה (פורטים מאה אחת לעשר עשרות)');
    expect(buildSocraticPrompt(noBlocks, fn)).toContain('נותן מאה אחת לפריטה בטור העשרות');
  });
});

describe('finding 6 — the facts describe the memory circle as it is', () => {
  it('507 + 125, meeting 8, tens typed 2 four times, circle empty: no "forgot what is written"', () => {
    const req = arith({ session: 8, op: 'addition', a: 507, b: 125, counts: [0, 0, 0, 0], col: 1, completed: ['units'], trigger: 'consecutive_errors_4', actions: typed(1, 2, 4) });
    const f = deriveSocraticFacts(req);
    expect(f.typing_pattern).toBe('carry_forgotten');
    expect(f.suggested_focus_he).not.toContain('שכח את מה שרשום');
    expect(f.suggested_focus_he).toContain('עיגול הזיכרון שמעל טור העשרות ריק');
    const prompt = buildSocraticPrompt(req, f);
    expect(prompt).toContain('עיגולי הזיכרון: כולם ריקים');
    expect(prompt).not.toContain('העשרת שבעיגול הזיכרון נשכחה');
    expect(prompt).toContain('עיגול הזיכרון שמעליו: ריק');
  });

  it('meeting 4: the units grouped, the circle empty — the focus points to the board, not the circle', () => {
    const req = arith({ session: 4, op: 'addition', a: 507, b: 125, counts: [2, 3, 6, 0], col: 1, completed: ['units'], conversions: ['units'], trigger: 'repeated_errors', actions: typed(1, 2) });
    const f = deriveSocraticFacts(req);
    expect(f.typing_pattern).toBe('carry_forgotten');
    expect(f.suggested_focus_he).toContain('ההקבצה בטור היחידות כבר בוצעה');
    expect(f.suggested_focus_he).toContain('כוון לבית המספרים');
    expect(f.suggested_focus_he).not.toContain('שכח את מה שרשום');
  });

  it('the circle holds the 1: then it is what the child did not add', () => {
    const f = deriveSocraticFacts(arith({ session: 8, op: 'addition', a: 507, b: 125, counts: [0, 0, 0, 0], col: 1, completed: ['units'], memory: { tens: 1 }, trigger: 'repeated_errors', actions: typed(1, 2) }));
    expect(f.suggested_focus_he).toContain('רשומה בעיגול הזיכרון שמעל טור העשרות');
  });
});

describe('finding 2 — a digit stated for its column is refused, in every wording', () => {
  // s7_r_t3: 3▢6 + 271 = 657, the hidden tens digit is 8.
  const skel = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 386, b: 271, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
  const leaks = [
    'הספרה החסרה בטור העשרות היא 8',
    'ספרת העשרות החסרה היא 8',
    'במקום ▢ כותבים 8',
    'חסרות שמונה עשרות',
    'בונים 8 לבני עשרת',
    'ספרת העשרות של המספר הראשון היא 8',
  ];
  for (const t of leaks) {
    it(`refuses: ${t}`, () => {
      const r = validateSocraticResponse(card('מה חסר בטור העשרות?', t), skel);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^hidden digits leaked/);
    });
  }
  const fine = [
    'בתרגיל 3▢6 + 271 = 657, מה חסר בטור העשרות?',
    'בטור העשרות של המספר השני יש 7 עשרות',
    'מקבצים 10 יחידות לעשרת אחת',
    'בודקים כמה עשרות חסרות כדי להגיע ל-5 בשורת התוצאה',
  ];
  for (const t of fine) {
    it(`passes: ${t}`, () => {
      const r = validateSocraticResponse(card('מה בודקים בטור העשרות?', t), skel);
      expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    });
  }

  it('a hidden digit 1 does not refuse "לעשרת אחת"', () => {
    // 316 + 251 = 567 with the tens hidden (1).
    const f = deriveSocraticFacts(arith({ session: 7, op: 'addition', a: 316, b: 251, counts: [0, 0, 0, 0], col: 1, hidden: { a: ['tens'], b: [] } }));
    expect(validateSocraticResponse(card('מה עושים כשבטור יש 10 יחידות?', 'מקבצים 10 יחידות לעשרת אחת'), f).ok).toBe(true);
    expect(validateSocraticResponse(card('מה חסר בטור העשרות?', 'הספרה החסרה היא 1, בטור העשרות'), f).ok).toBe(false);
  });

  it('s4_r_t7 (328 + 145, the tens result digit 7 hidden): "בטור העשרות כותבים 7" is refused', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 328, b: 145, counts: [3, 7, 4, 0], col: 1, task: { kind: 'missing_result_digit', instruction_he: 'בתרגיל 328 + 145 חסרה ספרת העשרות בשורת התוצאה.', hidden_result_places: ['tens'] } }));
    expect(validateSocraticResponse(card('מה כותבים בתיבה הריקה?', 'בטור העשרות כותבים 7'), f).ok).toBe(false);
    expect(validateSocraticResponse(card('מה כותבים בתיבה הריקה?', 'בטור העשרות כותבים שבע'), f).ok).toBe(false);
    // The other result digits are on the screen: the units' 3 is no secret here.
    expect(validateSocraticResponse(card('מה בודקים בטור העשרות?', 'סופרים את הלבנים אחרי ההקבצה'), f).ok).toBe(true);
  });

  it('the iron rule: never the expected digit of a box not yet typed right (85 + 17)', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 85, b: 17, counts: [12, 9, 0, 0], col: 0, trigger: 'consecutive_errors_4' }));
    const r = validateSocraticResponse(card('מה כותבים בתיבה של טור היחידות?', 'כותבים 2 בתיבה של טור היחידות'), f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^final answer leaked/);
    expect(validateSocraticResponse(card('מה כותבים בתיבה?', 'כותבים 2 בתיבה'), f).ok).toBe(false);
    // The rule of the box, the carry and the exercise's numbers stay allowed.
    expect(validateSocraticResponse(card('כמה ספרות כותבים בכל תיבה?', 'בכל תיבה כותבים ספרה אחת'), f).ok).toBe(true);
    expect(validateSocraticResponse(card('מה עושים עם 10 היחידות?', 'מקבצים 10 יחידות לעשרת אחת', 'נכון מאוד! רושמים 1 בעיגול הזיכרון שמעל טור העשרות.'), f).ok).toBe(true);
    expect(validateSocraticResponse(card('בתרגיל 85 + 17, מה עושים בטור היחידות?', 'מחברים 5 ו-7'), f).ok).toBe(true);
    // A column already typed right is no secret any more.
    const done = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 85, b: 17, counts: [2, 10, 0, 0], col: 1, completed: ['units'], conversions: ['units'] }));
    expect(validateSocraticResponse(card('מה כתבתם בטור היחידות?', 'כותבים 2 בתיבה של טור היחידות'), done).ok).toBe(true);
  });
});

describe('finding 3 — second person singular is refused; plural and look-alikes pass', () => {
  const bad = ['שים לב לטור העשרות', 'נסה שוב', 'לחץ על הכפתור', 'בדוק את הטור', 'תבדוק כמה לבנים יש', 'בדקי את הטור', 'כתוב את המספר', 'גרור לבנה לפח', 'חשוב רגע', 'שימי לב', 'נסי שוב', 'כשתבדוק את הטור', 'ושים לב', 'מה נראה לך?', 'הלבנים שלך'];
  for (const t of bad) it(`refuses: ${t}`, () => expect(languageViolation([t])?.id).toBe('second_person_singular'));
  const good = ['שימו לב לטור העשרות', 'נסו שוב', 'לחצו על הכפתור', 'בדקו את הטור', 'מה כתוב בהוראה?', 'מה רשום בעיגול הזיכרון?', 'חשוב לבדוק כל טור', 'התלמיד בחר בתשובה', 'העשרת תעבור לטור העשרות', 'איך תראה התוצאה?', 'בלי לחץ', 'נסו לחשוב: מה עושים?', 'שישים לבנים'];
  for (const t of good) it(`passes: ${t}`, () => expect(languageViolation([t])).toBeNull());
});

describe('finding 7 — language false positives and negatives', () => {
  it('passive "נבנה", "נסו את", a drag to a column after a break', () => {
    expect(languageViolation(['איזה מספר נבנה בבית המספרים?'])).toBeNull();
    expect(languageViolation(['נסו את הכפתור קבצו 10'])).toBeNull();
    expect(languageViolation(['פרטו עשרת אחת וגררו את היחידות לטור היחידות'])).toBeNull();
    expect(languageViolation(['פרטו לבנה מטור העשרות לטור היחידות'])?.id).toBe('break_into_column');
    expect(languageViolation(['נבנה את המספר 340'])?.id).toBe('first_person_plural_object');
  });
  it('prefixed first person plural is caught', () => {
    expect(languageViolation(['ונבדוק את הטור'])?.id).toMatch(/^first_person_plural/);
    expect(languageViolation(['כשנגיע לטור המאות'])?.id).toBe('first_person_plural_prefixed');
    expect(languageViolation(['ונמשיך'])?.id).toBe('first_person_plural_prefixed');
    // nif'al with a prefix stays allowed
    expect(languageViolation(['מה שנעשה בטור הזה'])).toBeNull();
  });
  it('the opening: only "נסו לחשוב:", and none is required', () => {
    const c = (q: string) => ({ guiding_question: q, options: [{ option_text: 'א', feedback_text: 'נכון מאוד! כך.', is_correct: true }, { option_text: 'ב', feedback_text: 'רמז: מה קורה?', is_correct: false }, { option_text: 'ג', feedback_text: 'רמז: למה?', is_correct: false }] });
    expect(cardFormViolation(c('נסו לחשוב: מה עושים?'))).toBeNull();
    expect(cardFormViolation(c('לפני שמוציאים לבנים, מה בודקים בכל טור?'))).toBeNull();
    expect(cardFormViolation(c('בתרגיל 61 − 24: מה בודקים?'))).toBeNull();
    expect(cardFormViolation(c('חשבו רגע: מה עושים?'))).toMatch(/נסו לחשוב/);
    // An indirect question is not a guiding question.
    expect(cardFormViolation(c('בדקו אם צריך לרשום משהו בעיגול הזיכרון.'))).toMatch(/direct question/);
  });
  it('the system instruction and the spec agree: direct questions with "?", indirect ones only in the right feedback', () => {
    const f = deriveSocraticFacts(arith({ session: 4, op: 'addition', a: 128, b: 35, counts: [13, 5, 1, 0] }));
    const prompt = buildSocraticPrompt(arith({ session: 4, op: 'addition', a: 128, b: 35, counts: [13, 5, 1, 0] }), f);
    expect(prompt).not.toContain('בוצעה כבר פריטה/הקבצה');
    expect(prompt).not.toContain('טרם בוצעה פריטה/הקבצה');
  });
});

describe('finding 7 — the meeting-1 screen has no thousands', () => {
  it('the screen section and the validator', () => {
    const req = arith({ session: 1, op: 'addition', a: 713, b: 94, counts: [7, 10, 7, 0], col: 1 });
    const f = deriveSocraticFacts(req);
    const screen = screenDescriptionHe(f).join(' ');
    expect(screen).not.toMatch(/טור האלפים|קבצו 10 לאלף/);
    expect(screen).toContain('אין טור אלפים');
    expect(screenDescriptionHe({ screen: 'vertical_blocks', meeting: 4 }).join(' ')).toContain('קבצו 10 לאלף');
    const r = validateSocraticResponse(card('מה עושים כשבאחד הטורים יש 10 לבנים או יותר?', 'מקבצים 10 מאות לאלף אחד'), f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^screen: meeting 1/);
    expect(validateSocraticResponse(card('מה עושים כשבאחד הטורים יש 10 לבנים או יותר?', 'מקבצים 10 לבנים ללבנה אחת בטור שמשמאלו'), f).ok).toBe(true);
  });
});

describe('finding 5 — two-step representation tasks are read step by step', () => {
  const G5 = { kind: 'representation', instruction_he: 'בנו את המספר 3,400 בבית המספרים. הוסיפו אלף אחד, ואז הסירו 6 מאות. השאירו את הלבנים בבית המספרים. איזה מספר קיבלתם? כתבו אותו בשורת התוצאה.', required_counts: { thousands: 3, hundreds: 8 }, secret_numbers: [3800] };
  const R6 = { kind: 'representation', instruction_he: 'בנו את המספר 340 בבית המספרים. הוסיפו 2 מאות, ואז הסירו 3 עשרות. השאירו את הלבנים בבית המספרים. איזה מספר קיבלתם? כתבו אותו בשורת התוצאה.', required_counts: { hundreds: 5, tens: 1 }, secret_numbers: [510] };

  it('the steps are read from the instruction and end on the required board', () => {
    expect(instructionStepsOf(G5.instruction_he, G5.required_counts)?.map((s) => s.value_after)).toEqual([3400, 4400, 3800]);
    expect(instructionStepsOf(R6.instruction_he, R6.required_counts)?.map((s) => s.value_after)).toEqual([340, 540, 510]);
    expect(instructionStepsOf('בנו בבית המספרים את המספר 368.', { hundreds: 3, tens: 6, units: 8 })).toBeNull();
    expect(instructionStepsOf(G5.instruction_he, { thousands: 4 })).toBeNull();
  });

  it('s7_g_t5 after building 3,400: the next step is adding a thousand — never "fewer blocks than needed"', () => {
    const req = rep({ session: 7, id: 's7_g_t5', counts: [0, 0, 4, 3], task: G5 });
    const f = deriveSocraticFacts(req);
    expect(f.instruction_steps?.done).toBe(1);
    expect(f.board_vs_task).toBeNull();
    expect(f.suggested_focus_he).toContain('הצעד הבא בהוראה: מוסיפים אלף אחד');
    expect(f.suggested_focus_he).not.toContain('פחות לבנים');
    const prompt = buildSocraticPrompt(req, f);
    expect(prompt).toContain('2. מוסיפים אלף אחד ← הצעד הבא');
    expect(prompt).not.toContain('פחות לבנים ממה שההוראה מבקשת');
    expect(prompt).not.toContain('3800');
  });

  it('s7_g_t5 at 4,400 as 4 thousands, 4 hundreds: remove 6 hundreds needs a break first', () => {
    const f = deriveSocraticFacts(rep({ session: 7, id: 's7_g_t5', counts: [0, 0, 4, 4], task: G5 }));
    expect(f.instruction_steps?.done).toBe(2);
    expect(f.instruction_steps?.needs_break).toBe(true);
    expect(f.suggested_focus_he).toContain('קודם פורטים אלף אחד לעשר מאות');
  });

  it('s7_g_t5 after the right break (3 thousands, 14 hundreds): crowding is the intended state, grouping back is refused', () => {
    const req = rep({ session: 7, id: 's7_g_t5', counts: [0, 0, 14, 3], task: G5 });
    const f = deriveSocraticFacts(req);
    expect(f.crowding_intended).toBe(true);
    expect(f.suggested_focus_he).toContain('אסור להציע לקבץ אותן בחזרה');
    const prompt = buildSocraticPrompt(req, f);
    expect(prompt).not.toContain('יותר לבנים ממה שההוראה מבקשת');
    expect(prompt).toContain('10 ומעלה בכוונה');
    const back = validateSocraticResponse(card('מה עושים עם המאות בטור המאות?', 'מקבצים 10 מאות לאלף אחד', 'נכון מאוד! לחצו על "קבצו 10".'), f);
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.reason).toMatch(/^frame:/);
    // As a wrong option with a hint it may stay.
    expect(validateSocraticResponse(card('מה ההוראה מבקשת לעשות עכשיו?', 'מסירים מאות לפח האשפה', 'נכון מאוד! גררו לפח את המאות שההוראה מבקשת להסיר.', ['מקבצים 10 מאות לאלף אחד', 'מוסיפים עוד אלף']), f).ok).toBe(true);
  });

  it('s7_g_t5 done: the final board is compared again', () => {
    const f = deriveSocraticFacts(rep({ session: 7, id: 's7_g_t5', counts: [0, 0, 8, 3], task: G5 }));
    expect(f.instruction_steps?.done).toBe(3);
    expect(f.board_matches_task).toBe(true);
    expect(f.crowding_intended).toBe(false);
  });

  it('s7_r_t6 (510): after 340 the next step is adding 2 hundreds; mid-removal is the remove step under way', () => {
    const built = deriveSocraticFacts(rep({ session: 7, id: 's7_r_t6', counts: [0, 4, 3, 0], task: R6 }));
    expect(built.suggested_focus_he).toContain('מוסיפים 2 מאות');
    const mid = deriveSocraticFacts(rep({ session: 7, id: 's7_r_t6', counts: [0, 3, 5, 0], task: R6 }));
    expect(mid.instruction_steps).toMatchObject({ done: 2, partial: true, needs_break: false });
    // 4 tens give 3 without a break: a crowded tens column is a break too many, not "intended".
    const extra = deriveSocraticFacts(rep({ session: 7, id: 's7_r_t6', counts: [0, 14, 4, 0], task: R6 }));
    expect(extra.crowding_intended).toBe(false);
  });
});

describe('finding 8 — level 1: the column to act on, not a column the instruction names', () => {
  const T347 = { kind: 'representation', instruction_he: 'משימת היעד: בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות. איזה מספר, לדעתכם, מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.', required_counts: { hundreds: 3, tens: 3, units: 17 }, secret_numbers: [347] };
  const G26 = { kind: 'representation', instruction_he: 'בטור היחידות יש לבני יחידה. קבצו כל 10 יחידות לעשרת אחת בעזרת הכפתור "קבצו 10 לעשרת" שבראש הטור, וכתבו בשורת התוצאה כמה עשרות וכמה יחידות קיבלתם.', required_counts: { tens: 2, units: 6 }, secret_numbers: [26] };

  it('the instruction\'s own columns', () => {
    expect([...instructionColumnsOf(T347.instruction_he)].sort()).toEqual(['tens', 'units']);
    expect([...instructionColumnsOf(G26.instruction_he)].sort()).toEqual(['tens', 'units']);
    expect([...instructionColumnsOf('בנו 61 והוציאו ממנו 24: גררו לפח האשפה את הלבנים שאתם מחסרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו.')]).toEqual([]);
  });

  it('the PRD 7.15 wording names the blocks on both sides of the conversion, and still yields both columns', () => {
    // s1_target_347 and s1_r_group26 as sessionTasks.ts says them since uniformity-texts (PRD 7.15, Module 14 §ב).
    expect([...instructionColumnsOf('משימת היעד: איזה מספר, לדעתכם, מייצגות הלבנים לאחר הפריטה?\nבנו את המספר 347 בבית המספרים.\nפרטו לבנת עשרת אחת לעשר לבני יחידה.\nכתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו.')].sort()).toEqual(['tens', 'units']);
    expect([...instructionColumnsOf('קבצו כל 10 לבני יחידה ללבנת עשרת אחת: לחצו על הכפתור "קבצו 10" שבראש הטור.')].sort()).toEqual(['tens', 'units']);
  });

  it('a faithful copy of the CURRENT s1_target_347 card passes (hints in the 30.9 question form)', () => {
    const f = deriveSocraticFacts(rep({ session: 1, id: 's1_target_347', counts: [7, 4, 3, 0], task: T347, frame: { situation: 's1_target_347', level: 1 } }));
    const r = validateSocraticResponse({
      error_category: 'conceptual', guiding_question: 'נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?',
      options: [
        { id: 'opt_1', option_text: 'מקבלים עשר יחידות שנוספות לטור היחידות', feedback_text: 'נכון מאוד! לחצו על לבנת עשרת, וראו את היחידות שנוספות לטור היחידות.', is_correct: true },
        { id: 'opt_2', option_text: 'בית המספרים נשאר בלי שינוי', feedback_text: 'רמז: מה קורה בטור העשרות ובטור היחידות כשפורטים?', is_correct: false },
        { id: 'opt_3', option_text: 'העשרת נמחקת מבית המספרים', feedback_text: 'רמז: מה קורה ללבנת העשרת כשפורטים אותה?', is_correct: false },
      ],
    }, f);
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
  });

  it('a faithful copy of the CURRENT s1_r_group26 card passes', () => {
    const f = deriveSocraticFacts(rep({ session: 1, id: 's1_r_group26', counts: [16, 1, 0, 0], task: G26, frame: { situation: 's1_r_group26', level: 1 } }));
    const r = validateSocraticResponse({
      error_category: 'conceptual', guiding_question: 'מה צריך להיות בטור היחידות בסוף התרגיל?',
      options: [
        { id: 'opt_1', option_text: 'פחות מ-10 לבנים', feedback_text: 'נכון מאוד! כשיש בטור 10 יחידות או יותר, לחצו על הכפתור "קבצו 10 לעשרת" שבראש הטור.', is_correct: true },
        { id: 'opt_2', option_text: 'כל הלבנים שהיו בטור', feedback_text: 'רמז: מה עושים כשיש 10 יחידות או יותר בטור?', is_correct: false },
        { id: 'opt_3', option_text: 'אף לבנה, הטור ריק', feedback_text: 'רמז: אילו לבנים נשארות בטור היחידות אחרי ההקבצה?', is_correct: false },
      ],
    }, f);
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
  });

  it('naming the column where the difficulty is stays refused (713 + 94, 61 − 24)', () => {
    const add = deriveSocraticFacts(arith({ session: 1, op: 'addition', a: 713, b: 94, counts: [7, 10, 7, 0], col: 1, task: { kind: 'addition', instruction_he: 'בנו בבית המספרים 713 ו-94 וחברו אותם. כאשר באחד הטורים מצטברות 10 לבנים, לחצו על הכפתור שבראש הטור.' } }));
    expect(validateSocraticResponse(card('בטור העשרות יש הרבה לבנים. מה עושים?', 'מקבצים 10 לבנים ללבנה אחת'), add).ok).toBe(false);
    const sub = deriveSocraticFacts(arith({ session: 5, op: 'subtraction', a: 53, b: 18, counts: [3, 5, 0, 0], frame: { situation: 'borrow_check', level: 1 } }));
    const r = validateSocraticResponse(card('מה בודקים בכל טור?', 'פורטים עשרת אחת לעשר יחידות בטור היחידות'), sub);
    expect(r.ok).toBe(false);
  });
});
