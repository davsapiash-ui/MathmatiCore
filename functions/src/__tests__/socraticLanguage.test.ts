import { describe, it, expect } from 'vitest';
import { LANGUAGE_RULES, languageViolation, cardFormViolation, socraticLanguageSpec } from '../socraticLanguage';
import { validateSocraticRequest, deriveSocraticFacts, validateSocraticResponse, SOCRATIC_SYSTEM_INSTRUCTION, SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS } from '../socraticContract';

/**
 * The coaching card's language spec (owner, 28.9–1.10.2026): one module, used
 * by the system instruction and by the validator. Each rule is pinned with
 * real errors of the audit of 1.10.2026 and with the correct wording that
 * must pass.
 */
const rule = (id: string) => {
  const r = LANGUAGE_RULES.find((x) => x.id === id);
  if (!r) throw new Error('no rule ' + id);
  return r;
};

const cases: Record<string, { bad: string[]; good: string[] }> = {
  first_person_plural: {
    bad: ['אם נמחק חלק מהן?', 'אם נזרוק לבנים לפח?', 'מה נעשה עכשיו?', 'בואו נבדוק', 'כמה פעמים פרטנו?', 'האם חיסרנו כבר?', 'הלבנים שלנו'],
    good: ['מה עושים עכשיו?', 'בדקו את טור העשרות', 'הטור נראה ריק', 'הטור שנמצא מימין', 'בנו את המספר'],
  },
  first_person_plural_object: {
    bad: ['כשנקרא את הספרות', 'נבנה את המספר 340'],
    good: ['כשקוראים את הספרות', 'בונים את המספר', 'המספר נותן את התשובה', 'נסו את הכפתור קבצו 10'],
  },
  first_person_plural_prefixed: {
    bad: ['כשנגיע לטור המאות', 'ונמשיך', 'שנוסיף עוד לבנה'],
    good: ['כשמגיעים לטור המאות', 'מה שנעשה בטור הזה', 'איזה מספר נבנה בבית המספרים?'],
  },
  second_person_singular: {
    bad: ['שים לב לטור העשרות', 'נסה שוב', 'לחץ על הכפתור', 'בדוק את הטור', 'תבדוק כמה לבנים יש', 'בדקי את הטור', 'כתוב את המספר', 'חשוב רגע', 'שימי לב', 'כשתבדוק את הטור'],
    good: ['שימו לב לטור העשרות', 'נסו שוב', 'לחצו על הכפתור', 'מה כתוב בהנחיה?', 'מה רשום בעיגול הזיכרון?', 'חשוב לבדוק כל טור', 'העשרת תעבור לטור העשרות'],
  },
  not_a_form_kabetz: { bad: ['והקביצו אותן', 'הקבצו 10 יחידות'], good: ['קבצו 10 יחידות', 'מקבצים 10 יחידות לעשרת אחת'] },
  blocks_plural: { bad: ['הלבנות העודפות', 'גררו את הלבנות לפח', 'לבנות מיותרות'], good: ['הלבנים המיותרות', 'כדי לבנות את המספר', 'לבנות מאה אחת מעשר עשרות'] },
  result_box_name: { bad: ['כמה ספרות בכל משבצת?'], good: ['כמה ספרות כותבים בכל תיבה בשורת התוצאה?'] },
  action_not_on_screen_mark: { bad: ['סמנו 10 לבני עשרת', 'מסמנים את הלבנים'], good: ['לחצו על הכפתור קבצו 10'] },
  name_not_on_screen: { bad: ['גררו לבנים ממאגר הלבנים', 'לבני הדינס', 'מה רואים על הלוח?'], good: ['גררו לבנים מארגז הכלים', 'לוחצים על הכפתור'] },
  parsing_verb: { bad: ['מפרקים עשרת', 'לאיזה טור היא מתפרקת', 'הפירוק של המאה'], good: ['פורטים עשרת אחת לעשר יחידות', 'הלבנה נפרטת לעשר לבנים'] },
  break_into_column: { bad: ['כשפורטים עשרת אחת לטור היחידות', 'אחרי שפרטתם אלף אחד אל טור המאות'], good: ['פורטים עשרת אחת לעשר יחידות', 'פורטים מאה אחת ומעבירים את העשרות', 'פרטו עשרת אחת וגררו את היחידות לטור היחידות'] },
  gender_slash: { bad: ['תלמידים/ות', 'בדקו/י'], good: ['בדקו'] },
  filler_or_formal: { bad: ['למעשה יש לבצע פריטה', 'במידה שאין מספיק', 'בכדי לחסר', 'אנו מחסרים'], good: ['אם אין מספיק לבנים, פרטו', 'כדי לחסר'] },
  icon_symbol: { bad: ['לחצו על ↺'], good: ['לחצו על כפתור ביטול הפעולה', 'בתרגיל 3▢6 + 271 = 657'] },
};

describe('the language spec: each rule refuses the real errors and passes the right wording', () => {
  for (const [id, { bad, good }] of Object.entries(cases)) {
    it(id, () => {
      const r = rule(id);
      for (const t of bad) expect(r.re.test(t), `${id} should refuse: ${t}`).toBe(true);
      for (const t of good) expect(languageViolation([t]), `nothing should refuse: ${t}`).toBeNull();
    });
  }

  it('every rule is pinned here', () => {
    expect(LANGUAGE_RULES.map((r) => r.id).sort()).toEqual(Object.keys(cases).sort());
  });
});

describe('moving the new blocks to a column is not breaking into a column', () => {
  it('the owner\'s s5 card passes; breaking a block into a column does not', () => {
    expect(languageViolation(['פורטים עשרת אחת לעשר יחידות בודדות ומעבירים אותן לטור היחידות'])).toBeNull();
    expect(languageViolation(['פורטים מאה אחת ל-10 עשרות בטור העשרות'])).toBeNull();
    expect(languageViolation(['פרטו לבנה מטור העשרות לטור היחידות'])?.id).toBe('break_into_column');
  });
});

describe('the card form (owner, 30.9.2026)', () => {
  const card = (q: string, fb: [string, string, string]) => ({
    guiding_question: q,
    options: [
      { option_text: 'א', feedback_text: fb[0], is_correct: true },
      { option_text: 'ב', feedback_text: fb[1], is_correct: false },
      { option_text: 'ג', feedback_text: fb[2], is_correct: false },
    ],
  });
  const ok: [string, string, string] = ['נכון מאוד! לחצו על הכפתור.', 'רמז: מה קורה למספר?', 'רמז: כמה ספרות כותבים בכל תיבה?'];
  it('passes the owner\'s form', () => expect(cardFormViolation(card('מה עושים?', ok))).toBeNull());
  it('the question ends with "?"', () => expect(cardFormViolation(card('מה עושים.', ok))).toMatch(/guiding question/));
  it('the only thinking opening is "נסו לחשוב:"; none is required', () => {
    expect(cardFormViolation(card('נסו לחשוב: מה עושים?', ok))).toBeNull();
    expect(cardFormViolation(card('חשבו רגע: מה עושים?', ok))).toMatch(/נסו לחשוב/);
  });
  it('the right option opens with "נכון מאוד!"', () => expect(cardFormViolation(card('מה עושים?', ['נכון! לחצו.', ok[1], ok[2]]))).toMatch(/נכון מאוד/));
  it('a wrong option opens with "רמז:"', () => expect(cardFormViolation(card('מה עושים?', [ok[0], 'מה קורה למספר?', ok[2]]))).toMatch(/רמז/));
  it('a wrong option is one guiding question', () => {
    expect(cardFormViolation(card('מה עושים?', [ok[0], 'רמז: מחיקה משנה את המספר.', ok[2]]))).toMatch(/guiding question/);
    expect(cardFormViolation(card('מה עושים?', [ok[0], 'רמז: מה קורה? ולמה?', ok[2]]))).toMatch(/ONE question/);
  });
});

describe('the spec reaches the model, and the validator applies it', () => {
  it('the system instructions carry the spec; without blocks, no grouping verb', () => {
    expect(SOCRATIC_SYSTEM_INSTRUCTION).toContain(socraticLanguageSpec(true));
    expect(SOCRATIC_SYSTEM_INSTRUCTION_NO_BLOCKS).toContain(socraticLanguageSpec(false));
    expect(socraticLanguageSpec(false)).not.toMatch(/מקבצים|קבצו 10/);
    expect(socraticLanguageSpec(true)).toContain('✗ "סמנו 10 לבני עשרת" ✓ "לחצו על הכפתור קבצו 10"');
    // The DON'T / DO pairs the prompt shows are the validator's own verdicts.
    for (const blocks of [true, false]) {
      for (const line of socraticLanguageSpec(blocks).split('\n').filter((l) => l.startsWith('✗') || l.startsWith('✓'))) {
        for (const m of line.matchAll(/([✗✓]) "([^"]+)"/g)) {
          if (m[1] === '✗') expect(languageViolation([m[2]]), `the spec's ✗ should be refused: ${m[2]}`).not.toBeNull();
          else expect(languageViolation([m[2]]), `the spec's ✓ should pass: ${m[2]}`).toBeNull();
        }
      }
    }
  });

  it('a card in the first person plural is refused with the rule\'s fix', () => {
    const v = validateSocraticRequest({
      student_id: 5, session_id: 'session_4_student_5', exercise_id: 's4_r_t2', active_column_index: 0,
      workspace_state: { ones_count: 0, tens_count: 0, hundreds_count: 0, memory_circles: {} }, recent_actions: [],
      exercise_context: { operation: 'addition', number_a: 128, number_b: 35, session_id: 's', session_topic: '', active_column: 'units', active_column_index: 0, target_sub_problem: '8 + 5' },
    });
    if (!v.ok) throw new Error(v.reason);
    const r = validateSocraticResponse({
      error_category: 'procedural', guiding_question: 'מה עושים עם 10 היחידות?',
      options: [
        { id: 'opt_1', option_text: 'מקבצים 10 יחידות לעשרת אחת', feedback_text: 'נכון מאוד! לחצו על הכפתור "קבצו 10".', is_correct: true },
        { id: 'opt_2', option_text: 'מוחקים לבנים', feedback_text: 'רמז: אם נמחק חלק מהן?', is_correct: false },
        { id: 'opt_3', option_text: 'כותבים 13', feedback_text: 'רמז: כמה ספרות כותבים בכל תיבה?', is_correct: false },
      ],
    }, deriveSocraticFacts(v.value));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^language: first_person_plural/);
  });
});
