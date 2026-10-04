import { describe, it, expect } from 'vitest';
import { validateSocraticRequest, deriveSocraticFacts, buildSocraticPrompt, validateSocraticResponse, BUILT_BY_CHILD_HE } from '../socraticContract';

/**
 * Station 7's 2,730 (s7_g_t6) opens with its blocks on the board (owner,
 * 4.10.2026): 1 thousand, 16 hundreds, 13 tens, to be grouped twice. The
 * client sends them as start_counts with start_given, and the function
 * describes the exercise as it is: the blocks were given, nothing was built,
 * the opening board is not a mismatch, and a card that says "בניתם" is refused.
 */

type Counts = [number, number, number, number];
const INSTRUCTION = 'בבית המספרים יש לבנת אלף אחת, 16 לבני מאה ו-13 לבני עשרת. בכל טור שיש בו 10 לבנים או יותר, לחצו על הכפתור "קבצו 10" שבראש הטור. איזה מספר מייצגות הלבנים עכשיו? כתבו אותו בשורת התוצאה.';
const G6 = (conversionDone: boolean) => ({
  kind: 'representation',
  instruction_he: INSTRUCTION,
  required_counts: { thousands: 2, hundreds: 7, tens: 3 },
  start_counts: { thousands: 1, hundreds: 16, tens: 13 },
  start_given: true,
  conversion_done: conversionDone,
  secret_numbers: [2730],
});

const request = (counts: Counts, task: Record<string, unknown>, session = 7, trigger = 'hesitation_45s') => {
  const v = validateSocraticRequest({
    student_id: 5, session_id: `session_${session}_student_5`, exercise_id: 's7_g_t6', active_column_index: 1,
    workspace_state: { ones_count: counts[0], tens_count: counts[1], hundreds_count: counts[2], thousands_count: counts[3], memory_circles: {} },
    recent_actions: [],
    student_progress_state: { trigger_reason: trigger, completed_columns: [], current_column_input: null, memory_circles_state: {}, consecutive_errors_count: 0, recent_actions: [] },
    task_context: task,
    card_frame: { situation: 'crowded_column', level: 2 },
  });
  if (!v.ok) throw new Error(v.reason);
  return v.value;
};
const factsOf = (counts: Counts, task: Record<string, unknown>, session = 7, trigger = 'hesitation_45s') => deriveSocraticFacts(request(counts, task, session, trigger));
const promptOf = (counts: Counts, task: Record<string, unknown>) => {
  const req = request(counts, task);
  return buildSocraticPrompt(req, deriveSocraticFacts(req));
};

const OPENING: Counts = [0, 13, 16, 1];
const TENS_GROUPED: Counts = [0, 3, 17, 1];
const BOTH_GROUPED: Counts = [0, 3, 7, 2];

describe('the request: start_given rides with start_counts', () => {
  it('is kept as true only with start_counts, and never as a non-boolean', () => {
    expect(request(OPENING, G6(false)).task_context?.start_given).toBe(true);
    const { start_counts: _dropped, ...noStart } = G6(false);
    expect(request(OPENING, noStart).task_context?.start_given).toBeUndefined();
    expect(request(OPENING, { ...G6(false), start_given: 'yes' }).task_context?.start_given).toBeUndefined();
    expect(request(OPENING, { ...G6(false), start_given: false }).task_context?.start_given).toBeUndefined();
  });
});

describe('the opening board: given, not built, not a mismatch', () => {
  it('facts: the blocks are the given ones, before the grouping; no column is "more" or "less"', () => {
    const f = factsOf(OPENING, G6(false));
    expect(f.start_given).toBe(true);
    expect(f.built_before_conversion).toBe(true);
    expect(f.board_vs_task).toBeNull();
    expect(f.board_matches_task).toBe(false);
    // The next step is the crowded column, the tens first.
    expect(f.suggested_focus_he).toContain('בטור העשרות יש 10 לבנים או יותר');
    expect(f.suggested_focus_he).toContain('נדרשת הקבצה');
    expect(f.suggested_focus_he).not.toMatch(/בניתם|בנוי/);
  });

  it('prompt: the task is described as given blocks to group; nothing says the child built, nothing says "more than the instruction asks"', () => {
    const p = promptOf(OPENING, G6(false));
    expect(p).toContain('סוג המשימה: הלבנים נמצאות בבית המספרים מתחילת התרגיל — התרגיל נתן אותן, והלומד לא בנה אותן.');
    expect(p).toContain('הלומד לא בנה את הלבנים ולא את המספר: אסור לכתוב "בניתם" או "המספר שבניתם".');
    expect(p).toContain('הלבנים שהתרגיל נתן נמצאות בבית המספרים כמו בתחילת התרגיל, וההקבצה שההנחיה מבקשת עוד לא נעשתה. הלומד לא בנה אותן.');
    expect(p).toContain('ההמרה שההנחיה מבקשת עוד לא נעשתה בלבנים.');
    expect(p).not.toContain('בונים בבית המספרים את מה שההנחיה מבקשת');
    expect(p).not.toContain('ממה שההנחיה מבקשת');
    expect(p).not.toContain('הלבנים בנויות');
    expect(p).toContain('10 ומעלה, וכולן חלק מהתרגיל — צריך לקבץ');
  });
});

describe('on the way and at the end', () => {
  it('after the tens were grouped (1, 17, 3): still no mismatch; the hundreds are the crowded column', () => {
    const f = factsOf(TENS_GROUPED, G6(false));
    expect(f.board_vs_task).toBeNull();
    expect(f.built_before_conversion).toBe(false);
    expect(f.suggested_focus_he).toContain('בטור המאות יש 10 לבנים או יותר');
    const p = promptOf(TENS_GROUPED, G6(false));
    expect(p).not.toContain('פחות לבנים');
    expect(p).not.toContain('יותר לבנים');
    expect(p).not.toContain('הלבנים שהתרגיל נתן נמצאות בבית המספרים כמו בתחילת התרגיל');
  });

  it('after both groupings (2, 7, 3): the board is what the instruction asks for', () => {
    const f = factsOf(BOTH_GROUPED, G6(true));
    expect(f.board_matches_task).toBe(true);
    expect(f.board_vs_task).toEqual({ thousands: 'match', hundreds: 'match', tens: 'match' });
    const p = promptOf(BOTH_GROUPED, G6(true));
    expect(p).toContain('בית המספרים מראה בדיוק את מה שההנחיה מבקשת.');
    expect(p).toContain('ההמרה שההנחיה מבקשת כבר נעשתה בלבנים.');
    expect(p).not.toContain('לא נעשתה');
  });

  it('the final blocks arranged by hand, nothing grouped: not "built as the instruction asks"; the grouping is still owed', () => {
    const f = factsOf(BOTH_GROUPED, G6(false));
    expect(f.board_vs_task).toBeNull();
    expect(f.built_before_conversion).toBe(false);
    const p = promptOf(BOTH_GROUPED, G6(false));
    expect(p).toContain('ההמרה שההנחיה מבקשת עוד לא נעשתה בלבנים.');
    expect(f.suggested_focus_he).toContain('הן סודרו ביד, בלי הכפתור "קבצו 10"');
    expect(f.suggested_focus_he).not.toMatch(/בניתם|בנוי/);
  });
});

describe('blocks lost or added: read against the blocks the exercise gave', () => {
  it('a ten deleted (1, 16, 12)', () => {
    const f = factsOf([0, 12, 16, 1], G6(false));
    expect(f.board_vs_task).toEqual({ thousands: 'match', hundreds: 'match', tens: 'less' });
    expect(f.suggested_focus_he).toContain('הלבנים שהתרגיל נתן בהתחלה השתנו: בטור העשרות יש פחות לבנים ממה שהתרגיל נתן');
    expect(f.suggested_focus_he).toContain('כפתור ביטול הפעולה');
    const p = promptOf([0, 12, 16, 1], G6(false));
    expect(p).toContain('פחות לבנים ממה שהתרגיל נתן');
    expect(p).not.toContain('ממה שההנחיה מבקשת');
    // 16 hundreds "match" the given blocks — never "this is what the instruction asks, do not group".
    expect(p).not.toContain('לא מקבצים');
  });

  it('unit blocks added (1, 16, 13, 4)', () => {
    const f = factsOf([4, 13, 16, 1], G6(false));
    expect(f.board_vs_task?.units).toBe('more');
    expect(f.suggested_focus_he).toContain('בטור היחידות יש יותר לבנים ממה שהתרגיל נתן');
  });
});

describe('the opening board with no word on the grouping (a request without conversion_done)', () => {
  // The client sends conversion_done with every card of these exercises; a
  // request without it (an older client, a card opened without the store's
  // context) reads the opening board against the final one.
  const { conversion_done: _dropped, ...NO_WORD } = G6(false);

  it('2,730: the given blocks stand as at the start, the grouping is still owed — never "the blocks are built"', () => {
    const f = factsOf(OPENING, NO_WORD);
    expect(f.start_given).toBe(true);
    expect(f.built_before_conversion).toBe(true);
    expect(f.board_vs_task).toEqual({ thousands: 'less', hundreds: 'more', tens: 'more' });
    expect(f.suggested_focus_he).toBe('הלבנים שהתרגיל נתן נמצאות בבית המספרים כמו בתחילת התרגיל, וההקבצה שההנחיה מבקשת עוד לא נעשתה. הלומד לא בנה אותן.');
  });

  it('the same board in an exercise the child builds keeps its own sentence', () => {
    const { start_given: _given, ...built } = NO_WORD;
    const f = factsOf(OPENING, built);
    expect(f.start_given).toBe(false);
    expect(f.built_before_conversion).toBe(true);
    expect(f.suggested_focus_he).toBe('הלבנים בנויות כמו שההנחיה מבקשת בהתחלה, וההמרה שההנחיה מבקשת (פריטה או הקבצה) עוד לא נעשתה.');
  });
});

describe('meeting 1\'s 26 unit blocks (s1_r_group26): given blocks too', () => {
  const INSTRUCTION_26 = 'בטור היחידות יש לבני יחידה. קבצו כל 10 יחידות לעשרת אחת בעזרת הכפתור "קבצו 10 לעשרת" שבראש הטור, וכתבו בשורת התוצאה כמה עשרות וכמה יחידות קיבלתם.';
  const G26 = (conversionDone?: boolean) => ({
    kind: 'representation',
    instruction_he: INSTRUCTION_26,
    required_counts: { tens: 2, units: 6 },
    start_counts: { units: 26 },
    start_given: true,
    ...(conversionDone === undefined ? {} : { conversion_done: conversionDone }),
    secret_numbers: [26],
  });
  const U26: Counts = [26, 0, 0, 0];

  it('the request keeps start_given; the opening board is given, not built, and not a mismatch', () => {
    expect(request(U26, G26(false), 1).task_context?.start_given).toBe(true);
    const f = factsOf(U26, G26(false), 1);
    expect(f.start_given).toBe(true);
    expect(f.built_before_conversion).toBe(true);
    expect(f.board_vs_task).toBeNull();
    expect(f.board_matches_task).toBe(false);
    // The crowded units are the next step, not what the instruction asks to keep.
    expect(f.columns.find((c) => c.column === 'units')?.board_overcrowded).toBe(true);
    expect(f.suggested_focus_he).toContain('נדרשת הקבצה');
    expect(f.suggested_focus_he).not.toMatch(/בניתם|בנוי/);
  });

  it('the prompt says the blocks were given, and forbids "בניתם"', () => {
    const req = request(U26, G26(false), 1);
    const p = buildSocraticPrompt(req, deriveSocraticFacts(req));
    expect(p).toContain('הלומד לא בנה את הלבנים ולא את המספר: אסור לכתוב "בניתם" או "המספר שבניתם".');
    expect(p).toContain('הלבנים שהתרגיל נתן נמצאות בבית המספרים כמו בתחילת התרגיל, וההקבצה שההנחיה מבקשת עוד לא נעשתה. הלומד לא בנה אותן.');
    expect(p).not.toContain('הלבנים בנויות');
  });

  it('one grouping made (1 ten, 16 units): on the way, no mismatch', () => {
    const f = factsOf([16, 1, 0, 0], G26(false), 1);
    expect(f.board_vs_task).toBeNull();
    expect(f.built_before_conversion).toBe(false);
  });

  it('a unit block deleted (25): read against the given blocks; meeting 1 names no column', () => {
    const f = factsOf([25, 0, 0, 0], G26(false), 1);
    expect(f.board_vs_task).toEqual({ units: 'less' });
    expect(f.suggested_focus_he).toMatch(/^הלבנים שהתרגיל נתן בהתחלה השתנו\./);
    expect(f.suggested_focus_he).toContain('כפתור ביטול הפעולה');
  });

  it('with no word on the grouping, the opening 26 units are still "given, not built"', () => {
    const f = factsOf(U26, G26(), 1);
    expect(f.built_before_conversion).toBe(true);
    expect(f.suggested_focus_he).toBe('הלבנים שהתרגיל נתן נמצאות בבית המספרים כמו בתחילת התרגיל, וההקבצה שההנחיה מבקשת עוד לא נעשתה. הלומד לא בנה אותן.');
  });

  it('a card that says the child built the 26 units is refused', () => {
    const f = factsOf(U26, G26(false), 1);
    const r = validateSocraticResponse({
      error_category: 'procedural',
      guiding_question: 'נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?',
      options: [
        { id: 'opt_1', option_text: 'מקבצים 10 לבני יחידה ללבנת עשרת אחת בכפתור שבראש הטור', feedback_text: 'נכון מאוד! המספר שבניתם לא משתנה כשמקבצים.', is_correct: true },
        { id: 'opt_2', option_text: 'מוחקים יחידות מיותרות לפח האשפה', feedback_text: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?', is_correct: false },
        { id: 'opt_3', option_text: 'רושמים מספר דו-ספרתי בתיבת היחידות', feedback_text: 'רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?', is_correct: false },
      ],
    }, f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/^start_given/);
  });
});

describe('the validator: no card may say the child built the blocks', () => {
  const card = (feedback: string, question = 'נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?') => ({
    error_category: 'procedural',
    guiding_question: question,
    options: [
      { id: 'opt_1', option_text: 'מקבצים 10 לבני עשרת ללבנת מאה אחת בכפתור שבראש הטור', feedback_text: feedback, is_correct: true },
      { id: 'opt_2', option_text: 'מוחקים עשרות מיותרות לפח האשפה', feedback_text: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?', is_correct: false },
      { id: 'opt_3', option_text: 'רושמים מספר דו-ספרתי בתיבת העשרות', feedback_text: 'רמז: כמה ספרות אפשר לכתוב בתיבה אחת בשורת התוצאה?', is_correct: false },
    ],
  });

  it('"בניתם" is refused for the given-blocks exercise, with its reason', () => {
    const f = factsOf(OPENING, G6(false));
    for (const fb of [
      'נכון מאוד! המספר שבניתם לא משתנה כשמקבצים.',
      'נכון מאוד! כמו שבניתם, קבצו עכשיו.',
      'נכון מאוד! אחרי שבניתם, לחצו על הכפתור.',
    ]) {
      const r = validateSocraticResponse(card(fb), f);
      expect(r.ok, fb).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^start_given/);
    }
    expect(BUILT_BY_CHILD_HE.test('הלבנים בנויות כמו שצריך')).toBe(false);
    expect(BUILT_BY_CHILD_HE.test('איזה מספר בנוי בבית המספרים?')).toBe(false);
  });

  it('a card about the grouping passes; the same "בניתם" card passes where the child did build', () => {
    const f = factsOf(OPENING, G6(false));
    const ok = validateSocraticResponse(card('נכון מאוד! לחצו על הכפתור "קבצו 10" שבראש טור העשרות.'), f);
    expect(ok.ok, !ok.ok ? ok.reason : '').toBe(true);
    const { start_given: _dropped, ...built } = G6(false);
    const g = factsOf(OPENING, built);
    expect(g.start_given).toBe(false);
    const r = validateSocraticResponse(card('נכון מאוד! המספר שבניתם לא משתנה כשמקבצים.'), g);
    expect(r.ok === false && /^start_given/.test(r.reason)).toBe(false);
  });
});
