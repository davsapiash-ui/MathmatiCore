import { describe, it, expect } from 'vitest';
import {
  validateSocraticRequest,
  deriveSocraticFacts,
  validateSocraticResponse,
  findAbsentAid,
  SOCRATIC_SYSTEM_INSTRUCTION,
  SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS,
  SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1,
  SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7,
} from '../socraticContract';
import {
  cardStyleViolation,
  cardWordCount,
  instructionQuoteRun,
  languageViolation,
  socraticLanguageSpec,
  socraticStyleSpec,
  CARD_MAX_WORDS,
  CARD_TARGET_WORDS,
  INSTRUCTION_QUOTE_MAX_RUN,
} from '../socraticLanguage';

/**
 * The card's style (owner, 2.10.2026). A real card of the live site was right
 * but long, ran a fronted phrase into the main clause without a comma, and
 * repeated the task's title: "נסו לחשוב: במשימת היעד עם המספר 347 בית
 * המספרים עדיין ריק, מה עושים עכשיו?". The prompt now shows the decided cards
 * of 2.10.2026 as examples and real faults as ✗ → ✓ pairs, and the validator
 * refuses a card that is too long, repeats the title, copies the instruction,
 * puts "נסו לחשוב:" in the middle, or leaves out the comma after a fronted
 * clause. Every static card still passes (the client's
 * StaticCards_ServerValidator_2_10.test.ts sends them all through).
 */

const T347 = { kind: 'representation', instruction_he: 'משימת היעד: בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות. איזה מספר, לדעתכם, מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.', required_counts: { hundreds: 3, tens: 3, units: 17 }, secret_numbers: [347] };

const facts347 = (task: Record<string, unknown> = T347) => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: 'session_1_student_5', exercise_id: 's1_target_347', active_column_index: 0,
    workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, thousands_count: 0, memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: 'hesitation_45s', completed_columns: [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    task_context: task,
    card_frame: { situation: 'board_empty_build_first', level: 1 },
  });
  if (!v.ok) throw new Error(v.reason);
  return deriveSocraticFacts(v.value);
};

const factsAddition = (topic = 'חיבור במאונך עם המרה') => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: 'session_4_student_5', exercise_id: 's4_r_t2', active_column_index: 1,
    workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [],
    exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: topic, active_column: 'tens', active_column_index: 1, target_sub_problem: '2 + 3' },
  });
  if (!v.ok) throw new Error(v.reason);
  return deriveSocraticFacts(v.value);
};

const card = (q: string, opts: [string, string, string] = ['בונים בבית המספרים את מה שההנחיה מבקשת', 'כותבים מספר בשורת התוצאה', 'מנחשים את התשובה'], fb: [string, string, string] = ['נכון מאוד! קראו את ההנחיה. בנו בבית המספרים את מה שהיא מבקשת.', 'רמז: מה ההנחיה מבקשת לעשות לפני שכותבים?', 'רמז: מה אפשר לבנות בבית המספרים במקום לנחש?']) => ({
  error_category: 'procedural',
  guiding_question: q,
  options: opts.map((t, i) => ({ id: `opt_${i + 1}`, option_text: t, feedback_text: fb[i], is_correct: i === 0 })),
});
const check = (c: ReturnType<typeof card>, ctx = {}) => cardStyleViolation({ guiding_question: c.guiding_question, options: c.options }, ctx)?.id ?? null;

describe('the live card of 2.10.2026 is refused, its short version passes', () => {
  it('the live card: the title repeated — refused with a rule name the retry can fix', () => {
    const live = card('נסו לחשוב: במשימת היעד עם המספר 347 בית המספרים עדיין ריק, מה עושים עכשיו?', ['בונים בבית המספרים את מה שההנחיה מבקשת', 'מנחשים איזה מספר לכתוב', 'כותבים מיד מספר בשורת התוצאה']);
    expect(check(live, { instruction: T347.instruction_he })).toBe('title_repeated');
    // It names 347, the number the child finds: with the secret, the server refuses it for that first.
    expect(validateSocraticResponse(live, facts347()).ok).toBe(false);
    const { secret_numbers: _s, ...noSecret } = T347;
    const r = validateSocraticResponse(live, facts347(noSecret));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^style: title_repeated — /);
  });

  it('the short version passes the whole validator', () => {
    const r = validateSocraticResponse(card('נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?'), facts347());
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  });
});

describe('each style rule, with a clear rule name', () => {
  it('good short cards pass', () => {
    for (const q of ['נסו לחשוב: בתרגיל 128 + 35, מה מחברים בטור העשרות?', 'באיזה טור אין מספיק לבנים כדי לחסר?', 'נסו לחשוב: כשמחברים את הספרות של טור העשרות, מה עושים עם ה-1 שבעיגול הזיכרון?']) {
      expect(check(card(q)), q).toBeNull();
    }
  });

  it('a long question, option, hint or correct feedback', () => {
    const longQ = 'נסו לחשוב: בתרגיל 53 − 18, אחרי שבניתם את 53 ובדקתם את טור היחידות וראיתם שאין בו מספיק לבנים, מה צריך לעשות עכשיו כדי שתוכלו להמשיך?';
    expect(cardWordCount(longQ)).toBeGreaterThan(CARD_MAX_WORDS.question);
    expect(check(card(longQ))).toBe('length_question');
    expect(check(card('נסו לחשוב: מה עושים קודם?', ['קוראים שוב את כל ההנחיה מההתחלה ועד הסוף, ואחר כך בונים בבית המספרים את כל מה שכתוב בה בדיוק', 'ב', 'ג']))).toBe('length_option');
    expect(check(card('נסו לחשוב: מה עושים קודם?', undefined, ['נכון מאוד! בנו.', 'רמז: אם תוסיפו לבנים חדשות מארגז הכלים לטור היחידות, האם המספר שבבית המספרים יישאר בדיוק אותו מספר שבניתם בהתחלה?', 'רמז: למה?']))).toBe('length_hint');
    expect(check(card('נסו לחשוב: מה עושים קודם?', undefined, ['נכון מאוד! ' + 'בנו את המספר בבית המספרים, '.repeat(6), 'רמז: למה?', 'רמז: מה?']))).toBe('length_feedback');
  });

  it('numbers are not words; the opening is not counted', () => {
    expect(cardWordCount('נסו לחשוב: בתרגיל 5,678 + 2,453, מה מחברים?')).toBe(3);
    expect(cardWordCount('רמז: איזה סימן כתוב בין המספרים?')).toBe(5);
  });

  it('"נסו לחשוב:" in the middle of the question or in an option', () => {
    expect(check(card('בניתם את המספר 347. נסו לחשוב: מה קרה לעשרת שפרטתם?'))).toBe('opening_not_first');
    expect(check(card('מה עושים?', ['נסו לחשוב: בונים', 'ב', 'ג']))).toBe('opening_not_first');
  });

  it('the title: "משימת …" or the exercise\'s topic', () => {
    expect(check(card('נסו לחשוב: במשימת הקיבוץ, מה עושים?'))).toBe('title_repeated');
    expect(check(card('נסו לחשוב: במשימת חקר זו, מה עושים?'))).toBe('title_repeated');
    const r = validateSocraticResponse(card('נסו לחשוב: בחיבור במאונך עם המרה, מה מחברים בטור העשרות?', ['את שתי הספרות של הטור, ועוד העשרת שעברה', 'רק את שתי הספרות', 'את כל הספרות'], ['נכון מאוד! כתבו את הסכום בתיבה.', 'רמז: מה עבר לטור העשרות?', 'רמז: אילו ספרות כתובות בטור?']), factsAddition());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^style: title_repeated/);
  });

  it('the instruction copied word for word', () => {
    const quoted = card('נסו לחשוב: ההנחיה אומרת בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות, אז מה עושים קודם?');
    expect(instructionQuoteRun(quoted.guiding_question, T347.instruction_he)).toBeGreaterThanOrEqual(INSTRUCTION_QUOTE_MAX_RUN);
    expect(check(quoted, { instruction: T347.instruction_he })).toBe('instruction_quoted');
    expect(check(card('נסו לחשוב: מה ההנחיה מבקשת לבנות קודם?'), { instruction: T347.instruction_he })).toBeNull();
  });

  it('a fronted clause with no comma before the question — in the question or a hint', () => {
    expect(check(card('נסו לחשוב: כשמחברים את הספרות של טור העשרות מה עושים עם ה-1 שבעיגול הזיכרון?'))).toBe('comma_after_fronted_clause');
    expect(check(card('אם בטור אין מספיק לבנים איך מחסרים?'))).toBe('comma_after_fronted_clause');
    expect(check(card('מה עושים?', undefined, ['נכון מאוד! בנו.', 'רמז: אם תמחקו לבנים האם המספר יישאר אותו מספר?', 'רמז: מה?']))).toBe('comma_after_fronted_clause');
    // A question word inside the clause, the clause closed by a comma, the clause at the end.
    for (const q of ['נסו לחשוב: כשבודקים כמה לבנים יש בטור, מה עושים?', 'מה עושים כשבטור יש 10 לבנים או יותר?', 'רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?']) {
      expect(check(card(q)), q).toBeNull();
    }
  });
});

describe('the prompt: the style section with the decided cards and the faults', () => {
  const instructions = [SOCRATIC_SYSTEM_INSTRUCTION, SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1, SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7];

  it('every system instruction carries it: with blocks, and without blocks for meetings 2 and 8', () => {
    for (const s of instructions) expect(s).toContain(socraticStyleSpec(true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS).toContain(socraticStyleSpec(false));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS).not.toContain(socraticStyleSpec(true));
    for (const blocks of [true, false]) {
      const spec = socraticStyleSpec(blocks);
      expect(spec).toContain('The decided cards of 2.10.2026');
      expect(spec).toContain(`at most ${CARD_TARGET_WORDS.question} words after "נסו לחשוב:"`);
      expect(spec).toContain('NEVER by its title');
    }
  });

  it('8 decided cards with blocks, 5 without; every one passes the language and style rules', () => {
    for (const [blocks, n] of [[true, 8], [false, 5]] as const) {
      const lines = socraticStyleSpec(blocks).split('\n').filter((l) => l.startsWith('• '));
      expect(lines).toHaveLength(n);
      for (const l of lines) {
        const [q, right, wrong1, wrong2] = l.slice(2).split(' | ');
        const [rText, rFb] = right.slice(2).split(' → ');
        const [w1Text, w1Fb] = wrong1.slice(2).split(' → ');
        const c = card(q, [rText, w1Text, wrong2.slice(2)], [rFb, w1Fb, 'רמז: מה?']);
        expect(cardStyleViolation({ guiding_question: c.guiding_question, options: c.options }), q).toBeNull();
        expect(languageViolation([q, rText, rFb, w1Text, w1Fb, wrong2]), q).toBeNull();
        if (!blocks) expect(findAbsentAid([q, rText, rFb, w1Text, w1Fb, wrong2], false), q).toBeNull();
      }
    }
  });

  it('each ✗ is refused by a style rule, each ✓ passes the language and style rules', () => {
    for (const blocks of [true, false]) {
      const pairs = socraticStyleSpec(blocks).split('\n').filter((l) => l.startsWith('✗'));
      expect(pairs.length).toBeGreaterThanOrEqual(4);
      for (const line of pairs) {
        const [, bad, good] = /^✗ "([^"]+)" ✓ "([^"]+)"/.exec(line)!;
        const asCard = (t: string) => t.startsWith('רמז:')
          ? card('מה עושים?', undefined, ['נכון מאוד! בנו.', t, 'רמז: מה?'])
          : /\?$/.test(t) ? card(t) : card('מה עושים?', [t, 'ב', 'ג']);
        expect(check(asCard(bad), { instruction: T347.instruction_he }), bad).not.toBeNull();
        expect(check(asCard(good), { instruction: T347.instruction_he }), good).toBeNull();
        expect(languageViolation([good]), good).toBeNull();
      }
      if (!blocks) expect(socraticStyleSpec(false)).not.toMatch(/מקבצים|קבצו 10|לבנ|בית המספרים|פח/);
    }
  });

  it('the language spec\'s own ✗ / ✓ lines are untouched by the style section', () => {
    expect(socraticLanguageSpec(true)).not.toContain('STYLE');
  });

  it('the token budget stays sane: the style section adds at most 5,000 characters', () => {
    expect(socraticStyleSpec(true).length).toBeLessThan(5000);
    expect(socraticStyleSpec(false).length).toBeLessThan(4000);
    expect(SOCRATIC_SYSTEM_INSTRUCTION.length).toBeLessThan(15000);
  });
});
