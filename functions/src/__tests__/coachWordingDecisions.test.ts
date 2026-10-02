import { describe, it, expect } from 'vitest';
import { validateSocraticRequest, deriveSocraticFacts, validateSocraticResponse, S1_TARGET_SAME_NUMBER } from '../socraticContract';
import { languageViolation } from '../socraticLanguage';
import { exerciseLabelHe } from '../meetingMetrics';

/**
 * The coaching round's wording decisions (coordinator, 2.10.2026): the
 * s1_target_347 discovery is never told, subtraction is the pi'el, and a
 * report names an untitled exercise in Hebrew.
 */

type Counts = [number, number, number, number];
const T347 = { kind: 'representation', instruction_he: 'משימת היעד: בנו את המספר 347 בלבנים ופרטו עשרת אחת לעשר יחידות. איזה מספר, לדעתכם, מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.', required_counts: { hundreds: 3, tens: 3, units: 17 }, secret_numbers: [347] };
const G26 = { kind: 'representation', instruction_he: 'בטור היחידות יש לבני יחידה. קבצו כל 10 יחידות לעשרת אחת בעזרת הכפתור "קבצו 10 לעשרת" שבראש הטור, וכתבו בשורת התוצאה כמה עשרות וכמה יחידות קיבלתם.', required_counts: { tens: 2, units: 6 }, secret_numbers: [26] };

const facts = (id: string, counts: Counts, task: Record<string, unknown>) => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: 'session_1_student_5', exercise_id: id, active_column_index: 0,
    workspace_state: { ones_count: counts[0], tens_count: counts[1], hundreds_count: counts[2], thousands_count: counts[3], memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: 'hesitation_45s', completed_columns: [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    task_context: task,
    card_frame: { situation: id, level: 1 },
  });
  if (!v.ok) throw new Error(v.reason);
  return deriveSocraticFacts(v.value);
};

/** A card in the owner's form; the phrase under test goes into the right option's feedback. */
const cardWith = (question: string, rightFeedback: string, hints: [string, string] = ['רמז: מאיפה הגיעו עשר היחידות החדשות?', 'רמז: האם הוספתם לבנים מארגז הכלים?']) => ({
  error_category: 'conceptual',
  guiding_question: question,
  options: [
    { id: 'opt_1', option_text: 'היא הפכה לעשר יחידות, וכולן בבית המספרים', feedback_text: rightFeedback, is_correct: true },
    { id: 'opt_2', option_text: 'היא יצאה מבית המספרים, ולכן המספר קטן יותר', feedback_text: hints[0], is_correct: false },
    { id: 'opt_3', option_text: 'נוספו עשר לבנים חדשות, ולכן המספר גדל', feedback_text: hints[1], is_correct: false },
  ],
});

describe('s1_target_347: the number staying the same is the discovery itself', () => {
  const after = facts('s1_target_347', [17, 3, 3, 0], T347);
  const Q = 'נסו לחשוב: מה קרה לעשרת שפרטתם?';

  it('refuses a card that says the number stays, is kept or did not change', () => {
    for (const fb of [
      'נכון מאוד! המספר נשאר כמו שהיה.',
      'נכון מאוד! הכמות לא משתנה כשפורטים.',
      'נכון מאוד! המספר לא השתנה, רק הלבנים.',
      'נכון מאוד! הערך נשמר גם אחרי הפריטה.',
      'נכון מאוד! כתבו את המספר שבניתם בהתחלה.',
      'נכון מאוד! זה אותו מספר כמו בהתחלה.',
    ]) {
      const r = validateSocraticResponse(cardWith(Q, fb), after);
      expect(r.ok, fb).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^secret number leaked: s1_target_347/);
    }
  });

  it('passes the static cards of 347: what became of the ten, how to read 10 or more, an extra break', () => {
    const cards = [
      cardWith(Q, 'נכון מאוד! עכשיו כתבו בשורת התוצאה איזה מספר מייצגות הלבנים.'),
      {
        error_category: 'conceptual', guiding_question: 'נסו לחשוב: באחד הטורים יש 10 לבנים או יותר. איך יודעים איזה מספר מייצגות הלבנים?',
        options: [
          { id: 'opt_1', option_text: 'סופרים כל 10 לבנים כמו לבנה אחת של הטור שמשמאל', feedback_text: 'נכון מאוד! ספרו כך בלי ללחוץ על הכפתור "קבצו 10". אחר כך כתבו את המספר.', is_correct: true },
          { id: 'opt_2', option_text: 'סופרים את כל הלבנים יחד', feedback_text: 'רמז: האם לבנת עשרת ולבנת יחידה שוות אותו דבר?', is_correct: false },
          { id: 'opt_3', option_text: 'כותבים את מספר הלבנים של כל טור, זה אחרי זה', feedback_text: 'רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?', is_correct: false },
        ],
      },
    ];
    for (const c of cards) {
      const r = validateSocraticResponse(c, after);
      expect(r.ok, !r.ok ? r.reason : '').toBe(true);
    }
    // A question about adding blocks asks; it does not tell (HINT.addBlocks, the 347 break cards).
    expect(S1_TARGET_SAME_NUMBER.test('רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?')).toBe(false);
    expect(S1_TARGET_SAME_NUMBER.test('בית המספרים נשאר בלי שינוי')).toBe(false);
  });

  it('is a rule of that exercise only', () => {
    const r = validateSocraticResponse({
      error_category: 'conceptual', guiding_question: 'מה צריך להיות בטור היחידות בסוף התרגיל?',
      options: [
        { id: 'opt_1', option_text: 'פחות מ-10 לבנים', feedback_text: 'נכון מאוד! כשמקבצים, המספר לא משתנה.', is_correct: true },
        { id: 'opt_2', option_text: 'כל הלבנים שהיו בטור', feedback_text: 'רמז: מה עושים עם כל 10 יחידות שבטור?', is_correct: false },
        { id: 'opt_3', option_text: 'אף לבנה, הטור ריק', feedback_text: 'רמז: אם בטור יש פחות מ-10 יחידות, האם אפשר לקבץ אותן?', is_correct: false },
      ],
    }, facts('s1_r_group26', [16, 1, 0, 0], G26));
    expect(r.ok, !r.ok ? r.reason : '').toBe(true);
  });
});

describe('subtraction is the pi\'el in every coaching card', () => {
  it('refuses the hif\'il, passes the pi\'el', () => {
    for (const t of ['באיזה טור אין מספיק לבנים כדי להחסיר?', 'מחסירים הפוך: 8 פחות 3', 'החסירו את המספר השני']) {
      expect(languageViolation([t])?.id, t).toBe('subtraction_verb');
    }
    for (const t of ['באיזה טור אין מספיק לבנים כדי לחסר?', 'מחסרים הפוך: 8 פחות 3', 'כך מקבלים את המספר שממנו חיסרו.', 'חסרות שתי ספרות']) {
      expect(languageViolation([t]), t).toBeNull();
    }
  });
});

describe('a report names an exercise without a catalog title in Hebrew, never by its id', () => {
  it('the title when there is one', () => {
    expect(exerciseLabelHe({ s4_g_t1: 'חיבור במאונך' }, 's4_g_t1')).toBe('חיבור במאונך');
  });
  it('choice exercises, compulsory ones, placeholders', () => {
    expect(exerciseLabelHe({}, 's4_r_reinforce_2')).toBe('משימת ביסוס 2 בתחנה 4');
    expect(exerciseLabelHe(null, 's7_g_challenge_1')).toBe('משימת אתגר 1 בתחנה 7');
    expect(exerciseLabelHe(undefined, 's5_g_t3')).toBe('תרגיל 3 בתחנה 5');
    expect(exerciseLabelHe({}, 'ex_4_01')).toBe('משימה בתחנה 4');
    expect(exerciseLabelHe({}, 'something')).toBe('משימה');
  });
});
