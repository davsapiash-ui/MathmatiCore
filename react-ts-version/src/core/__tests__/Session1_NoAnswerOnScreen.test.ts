import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, TASK_HINTS } from '../../infrastructure/services/SocraticEngine';

/**
 * Owner decision, 29.9.2026: in station 1 nothing on the screen or read
 * aloud gives the child the answer, a block count he must find himself, or
 * where the difficulty is. The coaching cards of meeting 1 ask; they do not
 * tell. Other meetings keep their cards.
 */
const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const textsOf = (card: { questionHe: string; tts_text?: string; choices: { textHe: string; feedbackHe?: string }[] }) =>
  [card.questionHe, card.tts_text ?? '', ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const COLUMN_NAMES = /טור (היחידות|העשרות|המאות|האלפים)/;

describe('station 1 static cards', () => {
  it('each has exactly one correct option, and options of similar length', () => {
    for (const id of ['s1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      const card = TASK_HINTS[id];
      expect(card.choices.filter((c) => c.isCorrect).map((c) => c.id), id).toEqual([card.correctChoiceId]);
      const lengths = card.choices.map((c) => c.textHe.length);
      expect(Math.max(...lengths) / Math.min(...lengths), id).toBeLessThanOrEqual(1.8);
    }
  });

  it('no card gives the result', () => {
    for (const [id, answer] of [['s1_t8', '807'], ['s1_r_sub61', '37'], ['s1_r_sub806', '455']] as const) {
      expect(textsOf(TASK_HINTS[id]).join(' '), id).not.toContain(answer);
    }
    // 26 units → 2 tens and 6 units: neither is named
    expect(textsOf(TASK_HINTS['s1_r_group26']).join(' ')).not.toMatch(/(?<!\d)[26] (עשרות|יחידות|לבנים)/);
  });

  it('713 + 94 does not name the column that crowds', () => {
    const card = TASK_HINTS['s1_t8'];
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 713 + 94, מה עושים כשבאחד הטורים יש 10 לבנים או יותר?');
    expect(card.tts_text).toBe(card.questionHe);
    expect(textsOf(card).join(' ')).not.toMatch(/עשרות|מאות|מאה/);
    expect(card.suggested_highlight).toBe('tour-place-value-board');
  });

  it('the subtraction cards do not say how many borrows the exercise needs', () => {
    for (const id of ['s1_r_sub61', 's1_r_sub806']) {
      const all = textsOf(TASK_HINTS[id]).join(' ');
      expect(all, id).not.toContain('בלבד');
      // Owner's D10 (1.10.2026): the hint is a guiding question (was "רמז: פורטים רק כשאין בטור מספיק לבנים.").
      expect(all, id).toContain('רמז: מתי פורטים לבנה: כשיש בטור מספיק לבנים, או כשאין?');
    }
  });
});

describe('station 1 live cards', () => {
  it('10 or more blocks in a column: no count, no column name', () => {
    for (const [task, counts] of [
      [{ id: 's1_r_group26', type: 'representation', numberA: 26 }, { ...EMPTY, units: 26 }],
      [{ id: 's1_t8', numberA: 713, numberB: 94 }, { ...EMPTY, hundreds: 7, tens: 10, units: 7 }],
      [{ id: 's1_t8', numberA: 713, numberB: 94 }, { ...EMPTY, hundreds: 7, units: 12 }],
    ] as const) {
      const card = SocraticEngine.analyzeLiveBoardState(task, 'regrouping_fluency', counts)!;
      expect(card.questionHe).toBe('נסו לחשוב: באחד הטורים יש 10 לבנים או יותר. מה עושים?');
      expect(card.tts_text).toBe(card.questionHe);
      expect(card.suggested_highlight).toBe('tour-place-value-board');
      const all = textsOf(card).join(' ');
      expect(all).not.toMatch(COLUMN_NAMES);
      expect(all.replace(/10/g, '')).not.toMatch(/\d/);
      expect(card.choices.filter((c) => c.isCorrect)).toHaveLength(1);
    }
  });

  // Stations 3–7 hide the column digits too (owner, 30.9.2026): their card
  // names the column, never its count.
  it('other meetings name the column, not its count', () => {
    const card = SocraticEngine.analyzeLiveBoardState({ id: 's4_r_t1', numberA: 146, numberB: 235 }, 'regrouping_fluency', { ...EMPTY, hundreds: 3, tens: 7, units: 14 })!;
    expect(card.questionHe).toBe('נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?');
    expect(textsOf(card).join(' ')).not.toMatch(/14/);
  });

  it('61 − 24 with 61 on the board: the child finds the units column', () => {
    const card = SocraticEngine.analyzeLiveBoardState({ id: 's1_r_sub61', numberA: 61, numberB: 24, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, tens: 6, units: 1 })!;
    expect(card.questionHe).toBe('נסו לחשוב: באיזה טור אין מספיק לבנים כדי לחסר?');
    expect(card.tts_text).toBe(card.questionHe);
    expect(card.suggested_highlight).toBe('tour-place-value-board');
    expect(card.choices.map((c) => c.textHe)).toEqual(['בטור היחידות', 'בטור העשרות', 'בטור המאות']);
    expect(card.correctChoiceId).toBe('opt_1');
    expect(card.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['opt_1']);
    expect(textsOf(card).join(' ').replace(/10/g, '')).not.toMatch(/\d/);
  });

  it('806 − 351 with 806 on the board: the child finds the tens column', () => {
    const card = SocraticEngine.analyzeLiveBoardState({ id: 's1_r_sub806', numberA: 806, numberB: 351, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, hundreds: 8, units: 6 })!;
    expect(card.questionHe).toBe('נסו לחשוב: באיזה טור אין מספיק לבנים כדי לחסר?');
    expect(card.correctChoiceId).toBe('opt_2');
    expect(card.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['opt_2']);
    expect(textsOf(card).join(' ').replace(/10/g, '')).not.toMatch(/\d/);
  });

  it('two short columns: the question says where to start, so one option is right', () => {
    // 523 − 148: 3 < 8 units and 2 < 4 tens on the board
    const card = SocraticEngine.analyzeLiveBoardState({ id: 's1_fixture', numberA: 523, numberB: 148, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, hundreds: 5, tens: 2, units: 3 })!;
    expect(card.questionHe).toBe('נסו לחשוב: בודקים מטור היחידות שמאלה. באיזה טור אין מספיק לבנים כדי לחסר?');
    expect(card.choices.filter((c) => c.isCorrect).map((c) => c.id)).toEqual(['opt_1']);
  });

  it('outside meeting 1 the deficit card still names the column', () => {
    const card = SocraticEngine.analyzeLiveBoardState({ id: 'fixture_sub', numberA: 61, numberB: 24, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, tens: 6, units: 1 })!;
    expect(card.questionHe).toContain('בטור היחידות יש יחידה אחת');
  });
});

describe('the AI card in meeting 1 never gives the result as blocks', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const aiCard = (question: string) => ({
    data: {
      error_category: 'procedural',
      guiding_question: question,
      options: [
        { option_text: 'מקבצים 10 לבנים ללבנה אחת', feedback_text: 'נכון מאוד!', is_correct: true },
        // Guiding questions, as stations 3–8 require (owner, 30.9.2026).
        { option_text: 'מוחקים לבנים לפח', feedback_text: 'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?', is_correct: false },
        { option_text: 'כותבים 10 בתיבה אחת', feedback_text: 'רמז: כמה ספרות אפשר לכתוב בתיבה אחת?', is_correct: false },
      ],
    },
  });
  const ask = (id: string, sessionNumber: number) => {
    const task = { id, numberA: 713, numberB: 94, targetNode: 'regrouping_fluency' };
    const counts = { ...EMPTY, hundreds: 7, tens: 10, units: 7 };
    return SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: 'regrouping_fluency',
      activeColumnName: 'עשרות',
      counts,
      qMatrixAnchor: SocraticEngine.getSynchronousTaskHint(task, counts),
      monitoring: { sessionNumber, operands: { a: 713, b: 94, isSubtraction: false } },
    });
  };
  // 8 מאות ו-7 יחידות is 807, the result of 713 + 94.
  const leaking = 'בתרגיל 713 + 94 יוצאות בסוף 8 מאות ו-7 יחידות. מה עושים עכשיו?';

  it('meeting 1: refused', async () => {
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard(leaking));
    expect(await ask('s1_t8', 1)).toBeNull();
  });

  it('other meetings: the result as blocks is not refused as a result; a count the board holds now is (owner, 30.9.2026)', async () => {
    // 8 hundreds is not what the board holds (7): accepted outside meeting 1.
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('בתרגיל 713 + 94 יוצאות בסוף 8 מאות. מה עושים עכשיו?'));
    expect(await ask('s4_r_t9', 4)).not.toBeNull();
    // "7 יחידות" is the units column as it is now: stations 3–7 hide the column digits, the child counts.
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard(leaking));
    expect(await ask('s4_r_t9', 4)).toBeNull();
  });
});
