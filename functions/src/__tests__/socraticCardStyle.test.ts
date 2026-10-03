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
  frontedClauseWithoutComma,
  instructionQuoteRun,
  languageViolation,
  socraticLanguageSpec,
  socraticStyleSpec,
  CARD_MAX_WORDS,
  INSTRUCTION_QUOTE_MAX_RUN,
} from '../socraticLanguage';

/**
 * The card's style (owner, 2.10.2026). A real card of the live site repeated
 * the task's title and ran a fronted phrase into the main clause without a
 * comma: "נסו לחשוב: במשימת היעד עם המספר 347 בית המספרים עדיין ריק, מה עושים
 * עכשיו?". The owner then set the order: "שיפור אינו אומר בהכרח קיצור אלא
 * שיפור הנוסח ועד כמה הוא נכון לשונית וברור" — correctness and clarity first,
 * brevity after, and never a phrase that sends the child to a wrong action
 * ("מאיפה מקבלים עוד לבנים כשחסרות לבנים בטור?"). The prompt shows static
 * cards as examples and real faults as ✗ → ✓ pairs; the validator refuses a
 * card that repeats the title, copies the instruction, puts "נסו לחשוב:" in
 * the middle, leaves out the comma after a fronted clause, uses the
 * misleading phrase, or runs away in length. Every static card still passes
 * (the client's StaticCards_ServerValidator_2_10.test.ts sends them all).
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
const words = (n: number) => Array.from({ length: n }, () => 'מילה').join(' ');

describe('the live card of 2.10.2026 is refused, its corrected version passes', () => {
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

  it('the corrected version passes the whole validator', () => {
    const r = validateSocraticResponse(card('נסו לחשוב: בית המספרים עדיין ריק. מה עושים קודם?'), facts347());
    expect(r.ok, r.ok ? '' : r.reason).toBe(true);
  });
});

describe('each style rule, with a clear rule name', () => {
  it('good cards pass, long or short', () => {
    for (const q of [
      'נסו לחשוב: בתרגיל 128 + 35, מה מחברים בטור העשרות?',
      'באיזה טור אין מספיק לבנים כדי לחסר?',
      'נסו לחשוב: כשמחברים את הספרות של טור העשרות, מה עושים עם ה-1 שבעיגול הזיכרון?',
      // Correct and clear, longer than the old 16-word cap: the facts the question depends on stay.
      'נסו לחשוב: בתרגיל 4,000 − 1,562, רשמתם את הפריטה בעיגולי הזיכרון. ממה מחסרים עכשיו בטור היחידות?',
      'נסו לחשוב: בתרגיל 53 − 18, אחרי שבניתם את 53, ראיתם שבטור היחידות אין מספיק לבנים כדי לחסר 8 יחידות. מה עושים עכשיו?',
    ]) {
      expect(check(card(q)), q).toBeNull();
    }
  });

  it('length is a runaway guard only: question, option, hint and correct feedback', () => {
    expect(CARD_MAX_WORDS).toEqual({ question: 24, option: 16, hint: 24, correct_feedback: 30 });
    expect(check(card(`נסו לחשוב: ${words(CARD_MAX_WORDS.question)}?`))).toBeNull();
    expect(check(card(`נסו לחשוב: ${words(CARD_MAX_WORDS.question + 1)}?`))).toBe('length_question');
    expect(check(card('נסו לחשוב: מה עושים קודם?', [words(CARD_MAX_WORDS.option + 1), 'ב', 'ג']))).toBe('length_option');
    expect(check(card('נסו לחשוב: מה עושים קודם?', undefined, ['נכון מאוד! בנו.', `רמז: ${words(CARD_MAX_WORDS.hint + 1)}?`, 'רמז: למה?']))).toBe('length_hint');
    expect(check(card('נסו לחשוב: מה עושים קודם?', undefined, ['נכון מאוד! ' + 'בנו את המספר בבית המספרים, '.repeat(7), 'רמז: למה?', 'רמז: מה?']))).toBe('length_feedback');
    // The retry is told to keep the facts, never to drop them.
    const fix = cardStyleViolation({ guiding_question: `נסו לחשוב: ${words(30)}?`, options: card('x').options })!.fix;
    expect(fix).toMatch(/Keep every fact the question depends on/);
    expect(fix).not.toMatch(/6–10|short fact/);
  });

  it('numbers are not words; the opening is not counted', () => {
    expect(cardWordCount('נסו לחשוב: בתרגיל 5,678 + 2,453, מה מחברים?')).toBe(3);
    expect(cardWordCount('רמז: איזה סימן כתוב בין המספרים?')).toBe(5);
  });

  it('"נסו לחשוב:" in the middle of the question or in an option', () => {
    expect(check(card('בניתם את המספר 347. נסו לחשוב: מה קרה לעשרת שפרטתם?'))).toBe('opening_not_first');
    expect(check(card('מה עושים?', ['נסו לחשוב: בונים', 'ב', 'ג']))).toBe('opening_not_first');
  });

  it('the title: "משימת …" or the exercise\'s topic — the plural "משימות" is not a title', () => {
    expect(check(card('נסו לחשוב: במשימת הקיבוץ, מה עושים?'))).toBe('title_repeated');
    expect(check(card('נסו לחשוב: במשימת חקר זו, מה עושים?'))).toBe('title_repeated');
    expect(check(card('מה עושים?', undefined, ['נכון מאוד! בנו.', 'רמז: מה עשיתם במשימות הקודמות?', 'רמז: מה?']))).toBeNull();
    const r = validateSocraticResponse(card('נסו לחשוב: בחיבור במאונך עם המרה, מה מחברים בטור העשרות?', ['את שתי הספרות של הטור, ועוד העשרת שעברה', 'רק את שתי הספרות', 'את כל הספרות'], ['נכון מאוד! כתבו את הסכום בתיבה.', 'רמז: מה עבר לטור העשרות?', 'רמז: אילו ספרות כתובות בטור?']), factsAddition());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^style: title_repeated/);
  });

  it('the instruction copied word for word — in the question, an option or a hint', () => {
    const quoted = card('נסו לחשוב: ההנחיה אומרת בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות, אז מה עושים קודם?');
    expect(instructionQuoteRun(quoted.guiding_question, T347.instruction_he)).toBeGreaterThanOrEqual(INSTRUCTION_QUOTE_MAX_RUN);
    expect(check(quoted, { instruction: T347.instruction_he })).toBe('instruction_quoted');
    expect(check(card('נסו לחשוב: מה ההנחיה מבקשת לבנות קודם?'), { instruction: T347.instruction_he })).toBeNull();
    const inHint = card('נסו לחשוב: מה עושים קודם?', undefined, ['נכון מאוד! בנו.', 'רמז: מה פירוש בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות?', 'רמז: מה?']);
    expect(check(inHint, { instruction: T347.instruction_he })).toBe('instruction_quoted');
  });

  it('the "נכון מאוד!" feedback may name the instruction\'s action in its words (review, 2.10.2026)', () => {
    const S5 = 'פתרו במאונך: 53 − 18. בנו את המחוסר בבית המספרים. אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה. הוציאו מבית המספרים את הכמות הנדרשת וכתבו את התוצאה בשורת התוצאה.';
    const S5G = S5.replace('53 − 18', '5,432 − 2,118');
    const S4G = 'פתרו במאונך: 1,245 + 328. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. רשמו את התוצאה בשורת התוצאה.';
    const S7R = 'בתרגיל 3▢6 + 271 = 657 חסרה ספרת העשרות של המחובר הראשון. גלו את הספרה בעזרת הלבנים וכתבו אותה בתיבה הריקה.';
    const S3G = 'בנו בבית המספרים את המספר 4,500 מלבני מאה בלבד. בכמה לבני מאה השתמשתם? כתבו את התשובה בשורת התוצאה.';
    const cases: [string, string, string][] = [
      ['s5_r_t2', S5, 'נכון מאוד! אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.'],
      ['s4_g_t1', S4G, 'נכון מאוד! כשמגיעים ל-10 או יותר, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון.'],
      ['s5_g_t1', S5G, 'נכון מאוד! לחצו על לבנה בטור שמשמאל או גררו אותה אל אותו טור. אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.'],
      ['s7_r_t3', S7R, 'נכון מאוד! גלו את הספרה בעזרת הלבנים וכתבו אותה בתיבה הריקה.'],
      ['s3_g_t3', S3G, 'נכון מאוד! בנו בבית המספרים את המספר 4,500 מלבני מאה בלבד, וכתבו בשורת התוצאה בכמה לבני מאה השתמשתם.'],
    ];
    for (const [id, instruction, right] of cases) {
      expect(instructionQuoteRun(right, instruction), id).toBeGreaterThanOrEqual(INSTRUCTION_QUOTE_MAX_RUN);
      const c = card('נסו לחשוב: מה עושים עכשיו?', ['בודקים מה ההנחיה מבקשת', 'מנחשים', 'מחכים'], [right, 'רמז: מה ההנחיה מבקשת?', 'רמז: מה?']);
      expect(check(c, { instruction }), id).toBeNull();
    }
  });

  it('a fronted clause with no comma before the question — in the question or a hint', () => {
    expect(check(card('נסו לחשוב: כשמחברים את הספרות של טור העשרות מה עושים עם ה-1 שבעיגול הזיכרון?'))).toBe('comma_after_fronted_clause');
    expect(check(card('אם בטור אין מספיק לבנים איך מחסרים?'))).toBe('comma_after_fronted_clause');
    expect(check(card('מה עושים?', undefined, ['נכון מאוד! בנו.', 'רמז: אם תמחקו לבנים האם המספר יישאר אותו מספר?', 'רמז: מה?']))).toBe('comma_after_fronted_clause');
    // A question word inside the clause, the clause closed by a comma, the clause at the end, "אם … או …".
    for (const q of [
      'נסו לחשוב: כשבודקים כמה לבנים יש בטור, מה עושים?',
      'מה עושים כשבטור יש 10 לבנים או יותר?',
      'רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?',
      'נסו לחשוב: איזה טור בודקים, כשרוצים לדעת מאיפה פורטים?',
      'נסו לחשוב: מה מחסרים קודם, כשרוצים לדעת כמה נשאר בטור היחידות?',
      'רמז: מה בודקים קודם: אם יש בטור מספיק לבנים או כמה לבנים יש בו?',
    ]) {
      expect(frontedClauseWithoutComma(q), q).toBe(false);
      expect(check(card(q)), q).toBeNull();
    }
  });

  it('a misleading phrase: "מקבלים עוד לבנים", a bare "חסרות לבנים" (owner, 2.10.2026)', () => {
    for (const q of ['מאיפה מקבלים עוד לבנים כשחסרות לבנים בטור?', 'נסו לחשוב: בחיסור, כשבטור אין מספיק לבנים, מאיפה מקבלים עוד לבנים?', 'נסו לחשוב: מה עושים כשחסרות לבנים בטור?']) {
      expect(check(card(q)), q).toBe('misleading_phrase');
    }
    expect(check(card('מה עושים?', undefined, ['נכון מאוד! בנו.', 'רמז: האם חסרות עוד לבנים בבית המספרים?', 'רמז: מה?']))).toBe('misleading_phrase');
    for (const q of ['נסו לחשוב: בחיסור, כשבטור אין מספיק לבנים כדי לחסר, מה עושים?', 'נסו לחשוב: בתרגיל 345 − 182, בטור העשרות אין מספיק לבנים כדי לחסר. מה עושים?', 'נסו לחשוב: בתרגיל 31▢ + 254 = 568, איך מגלים את הספרה החסרה?']) {
      expect(check(card(q)), q).toBeNull();
    }
  });
});

/** The example lines of a style section: "• (where, level) question | ✓ … → … | ✗ … → … | ✗ …". */
const exampleLines = (spec: string) => spec.split('\n').filter((l) => l.startsWith('• '));
const parseExample = (l: string) => {
  const [q, right, wrong1, wrong2] = l.slice(2).replace(/^\([^)]*\) /, '').split(' | ');
  const [rText, rFb] = right.slice(2).split(' → ');
  const [w1Text, w1Fb] = wrong1.slice(2).split(' → ');
  return { q, rText, rFb, w1Text, w1Fb, w2Text: wrong2.slice(2) };
};
const COLUMN_NAME = /טור (?:היחידות|העשרות|המאות|האלפים)/;

describe('the prompt: the style section with static cards and the faults', () => {
  it('every system instruction carries it: blocks, meeting 1, and no blocks for meetings 2 and 8', () => {
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain(socraticStyleSpec(true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_STATIONS_3_7).toContain(socraticStyleSpec(true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1).toContain(socraticStyleSpec(true, true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_MEETING_1).not.toContain(socraticStyleSpec(true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS).toContain(socraticStyleSpec(false));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS).not.toContain(socraticStyleSpec(true));
  });

  it('correctness and clarity lead; length is not the first rule and has no target', () => {
    for (const spec of [socraticStyleSpec(true), socraticStyleSpec(true, true), socraticStyleSpec(false)]) {
      const firstBullet = spec.split('\n').find((l) => l.startsWith('- '))!;
      expect(firstBullet).toMatch(/^- CORRECT AND CLEAR FIRST\. One clear question\./);
      expect(firstBullet).toContain('Keep every fact the question depends on');
      expect(firstBullet).toContain('NEVER a phrase that suggests a wrong action');
      expect(spec).toContain('Brevity only after that: never drop a fact');
      expect(spec).not.toMatch(/- Short\.|6–10 words|at most \d+ words/);
      expect(spec).toContain('NEVER by its title');
    }
    expect(socraticStyleSpec(true)).toContain('"מקבלים עוד לבנים"');
  });

  it('the examples are labelled honestly and pass the language and style rules', () => {
    for (const [blocks, meeting1, n] of [[true, false, 7], [true, true, 5], [false, false, 5]] as const) {
      const lines = exampleLines(socraticStyleSpec(blocks, meeting1));
      expect(lines).toHaveLength(n);
      for (const l of lines) {
        expect(l, l).toMatch(blocks ? /^• \((?:station|stations) [^)]*level [123]/ : /^• \(meeting 8 — level [12]/);
        const { q, rText, rFb, w1Text, w1Fb, w2Text } = parseExample(l);
        const c = card(q, [rText, w1Text, w2Text], [rFb, w1Fb, 'רמז: מה?']);
        expect(cardStyleViolation({ guiding_question: c.guiding_question, options: c.options }), q).toBeNull();
        expect(languageViolation([q, rText, rFb, w1Text, w1Fb, w2Text]), q).toBeNull();
        if (!blocks) expect(findAbsentAid([q, rText, rFb, w1Text, w1Fb, w2Text], false), q).toBeNull();
        // A level-1 example never names a column; a column-naming one says it is level 2.
        if (COLUMN_NAME.test(q)) expect(l, l).toMatch(/level 2, names the column/);
      }
    }
  });

  it('meeting 1: no example and no fault pair names a column', () => {
    const spec = socraticStyleSpec(true, true);
    for (const l of spec.split('\n').filter((x) => x.startsWith('• ') || x.startsWith('✗'))) expect(l, l).not.toMatch(COLUMN_NAME);
  });

  it('each ✗ is refused by a rule unless marked "meaning" or "clarity"; each ✓ passes the language and style rules', () => {
    for (const [blocks, meeting1] of [[true, false], [true, true], [false, false]] as const) {
      const pairs = socraticStyleSpec(blocks, meeting1).split('\n').filter((l) => l.startsWith('✗'));
      expect(pairs.length).toBeGreaterThanOrEqual(5);
      for (const line of pairs) {
        const [, bad, good] = /^✗ "([^"]+)" ✓ "([^"]+)"/.exec(line)!;
        const asCard = (t: string) => t.startsWith('רמז:')
          ? card('מה עושים?', undefined, ['נכון מאוד! בנו.', t, 'רמז: מה?'])
          : /\?$/.test(t) ? card(t) : card('מה עושים?', [t, 'ב', 'ג']);
        if (!/\((?:meaning|clarity):/.test(line)) expect(check(asCard(bad), { instruction: T347.instruction_he }), bad).not.toBeNull();
        expect(check(asCard(good), { instruction: T347.instruction_he }), good).toBeNull();
        expect(languageViolation([good]), good).toBeNull();
      }
      if (!blocks) expect(socraticStyleSpec(false)).not.toMatch(/מקבצים|קבצו 10|לבנ|בית המספרים|פח/);
    }
  });

  it('the owner\'s pair (2.10.2026): the ✓ for 345 − 182 is about the tens column, where the break is', () => {
    // 345 − 182: units 5 − 2 need no break; tens 4 − 8 do — one hundred is broken into ten tens.
    const spec = socraticStyleSpec(true);
    expect(spec).toContain('✗ "מאיפה מקבלים עוד לבנים כשחסרות לבנים בטור?" ✓ "נסו לחשוב: בתרגיל 345 − 182, בטור העשרות אין מספיק לבנים כדי לחסר. מה עושים?"');
    expect(spec).toContain('"פורטים מאה אחת לעשר עשרות"');
    expect(spec).not.toContain('בתרגיל 345 − 182, בטור היחידות');
  });

  it('the language spec\'s own ✗ / ✓ lines are untouched by the style section', () => {
    expect(socraticLanguageSpec(true)).not.toContain('STYLE');
  });

  it('the token budget stays sane', () => {
    expect(socraticStyleSpec(true).length).toBeLessThan(7000);
    expect(socraticStyleSpec(true, true).length).toBeLessThan(6000);
    expect(socraticStyleSpec(false).length).toBeLessThan(6000);
    expect(SOCRATIC_SYSTEM_INSTRUCTION.length).toBeLessThan(17000);
  });
});
