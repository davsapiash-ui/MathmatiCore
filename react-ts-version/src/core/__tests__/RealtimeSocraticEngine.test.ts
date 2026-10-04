import { describe, it, expect } from 'vitest';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

describe('Realtime Socratic Engine & Live Board State Analyzer', () => {
  it('1. Dynamically detects deficit in hundreds for subtraction task 5240 - 1800', async () => {
    const task = {
      id: 's5_t3',
      exercise: '5240 - 1800',
      isSubtraction: true,
      numberA: 5240,
      numberB: 1800,
      targetNode: 'subtraction_regrouping',
      instructionHe: 'החסירו 1,800 מתוך 5,240'
    };

    // Live counts on the board: only 2 hundreds (deficit because 1800 needs 8 hundreds)
    const counts = { units: 0, tens: 4, hundreds: 2, thousands: 5 };

    // The exercise's first card asks what to check in every column (C5, owner
    // 30.9.2026); the one after it names the column.
    const first = await SocraticEngine.getSocraticHint(task, 'subtraction_regrouping', counts);
    expect(first?.questionHe).toBe('נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?');
    const hint = await SocraticEngine.getSocraticHint(task, 'subtraction_regrouping', counts, undefined, false, 0, [], { cardContext: { shownKinds: ['borrow_check'] } });

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-thousands');
    // The column and what it must give, never how many blocks it holds: the
    // digits beside the columns are hidden and the child counts (owner, 30.9.2026).
    expect(hint?.questionHe).toContain('בטור המאות אין מספיק לבנים כדי לחסר 8 מאות');
    expect(hint?.questionHe).not.toContain('2 מאות');
    expect(hint?.choices).toHaveLength(3);
    
    const correctOpt = hint?.choices.find(c => c.id === hint?.correctChoiceId);
    expect(correctOpt).toBeDefined();
    expect(correctOpt?.textHe).toContain('פורטים אלף אחד לעשר מאות'); // the exercise card reads the board (28.9.2026)
    expect(correctOpt?.isCorrect).toBe(true);

    const distractorOpt = hint?.choices.find(c => c.id === 'opt_2');
    expect(distractorOpt?.textHe).toContain('מחסרים הפוך');
    expect(distractorOpt?.isCorrect).toBe(false);
  });

  it('2. Dynamically detects the tens deficit of 425 - 162 once 425 is on the board', async () => {
    const task = {
      // An exercise outside the meeting banks: meeting 1 asks for the column
      // instead of naming it (owner, 29.9.2026; Session1_NoAnswerOnScreen).
      id: 'fixture_sub425',
      exercise: '425 - 162',
      isSubtraction: true,
      numberA: 425,
      numberB: 162,
      targetNode: 'subtraction_regrouping',
      instructionHe: 'החסירו 162 מתוך 425'
    };

    // 425 built as-is: 2 tens on the board, 6 tens to remove — a hundred must be decomposed.
    const counts = { units: 5, tens: 2, hundreds: 4, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'subtraction_regrouping', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-hundreds');
    expect(hint?.questionHe).toContain('2 עשרות');
    expect(hint?.questionHe).toContain('6 עשרות');
    expect(hint?.choices[0].textHe).toContain('מאה אחת מטור המאות כדי לפרוט');
  });

  describe('2b. A deficit belongs to the exercise, not to whatever is on the board (470 - 250, sandbox)', () => {
    const task = {
      id: 's1_t9',
      type: 'vertical_addition',
      isSubtraction: true,
      numberA: 470,
      numberB: 250,
      instructionHe: 'בנו רק את המספר הראשון (470). מתוכו, מחקו 250',
    };

    it('empty board → "build the first number" card, never "יש לנו 0 עשרות"', () => {
      const hint = SocraticEngine.analyzeLiveBoardState(task, 'basic_addition_fluency', { units: 0, tens: 0, hundreds: 0, thousands: 0 });
      expect(hint).not.toBeNull();
      // Opens like every card (audit 4.10.2026, A5-F06).
      expect(hint?.questionHe).toBe('נסו לחשוב: בית המספרים עדיין ריק. בחיסור, מה בונים קודם?');
      expect(hint?.questionHe).not.toContain('0 עשרות');
      expect(hint?.choices.find((c) => c.id === hint?.correctChoiceId)?.textHe).toContain('470');
      expect(hint?.choices.find((c) => c.id === hint?.correctChoiceId)?.textHe).toContain('250');
    });

    it('470 built (7 tens ≥ 5) → no deficit card', () => {
      expect(SocraticEngine.analyzeLiveBoardState(task, 'basic_addition_fluency', { units: 0, tens: 7, hundreds: 4, thousands: 0 })).toBeNull();
    });

    it('250 already removed (board shows 220) → still no deficit card', () => {
      expect(SocraticEngine.analyzeLiveBoardState(task, 'basic_addition_fluency', { units: 0, tens: 2, hundreds: 2, thousands: 0 })).toBeNull();
    });

    it('405 - 132: the tens deficit is real (0 < 3) and is reported from the built number', () => {
      const t = { id: 'task7', isSubtraction: true, numberA: 405, numberB: 132 };
      const hint = SocraticEngine.analyzeLiveBoardState(t, 'subtraction_regrouping', { units: 5, tens: 0, hundreds: 4, thousands: 0 });
      expect(hint?.suggested_highlight).toBe('tour-column-hundreds');
      expect(hint?.questionHe).toContain('בטור העשרות אין אף עשרת');
      expect(hint?.questionHe).toContain('3 עשרות');
    });

    it('a borrow that the units column consumes is counted: 42 - 15 needs the tens, not the hundreds', () => {
      const t = { id: 'task3', isSubtraction: true, numberA: 42, numberB: 15 };
      const hint = SocraticEngine.analyzeLiveBoardState(t, 'subtraction_regrouping', { units: 2, tens: 4, hundreds: 0, thousands: 0 });
      expect(hint?.suggested_highlight).toBe('tour-column-tens');
      expect(hint?.questionHe).toContain('2 יחידות');
    });
  });

  it('3. Dynamically detects overcrowding in units (>= 10) in addition', async () => {
    const task = {
      id: 's3_t1',
      exercise: '146 + 235',
      targetNode: 'regrouping_fluency'
    };

    // Live counts: 14 units on the board
    const counts = { units: 14, tens: 7, hundreds: 3, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'regrouping_fluency', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-units');
    // The column, not its count (owner, 30.9.2026): the child counts.
    expect(hint?.questionHe).toBe('נסו לחשוב: בטור היחידות יש 10 לבנים או יותר. מה עושים?');
    expect(hint?.questionHe).not.toContain('14');
    expect(hint?.choices[0].textHe).toContain('אוספים 10 יחידות מטור היחידות ומקבצים אותן לעשרת אחת בטור העשרות');
    expect(hint?.choices[1].textHe).toContain('מוחקים 10 יחידות');
  });

  it('4. Dynamically detects overcrowding in tens (>= 10)', async () => {
    const task = {
      id: 's3_t4',
      exercise: '580 + 170',
      targetNode: 'regrouping_fluency'
    };

    // Live counts: 13 tens on the board
    const counts = { units: 0, tens: 13, hundreds: 6, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'regrouping_fluency', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-tens');
    expect(hint?.questionHe).toBe('נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?');
    expect(hint?.questionHe).not.toContain('13');
    expect(hint?.choices[0].textHe).toContain('אוספים 10 עשרות ומקבצים אותן למאה אחת בטור המאות');
  });

  // The "zero placeholder" live card ("אין לבנים בטור העשרות ... נרשום 0 בטור
  // העשרות") was removed on 28.9.2026: it fired on every meeting-6 exercise
  // with an empty tens column, whatever the exercise's tens really were, and
  // told the child to write in the number house.
  it('5. An empty tens column is not read as "write 0 in the tens"', async () => {
    const task = { id: 's6_t3', numberA: 4005, targetNode: 'zero_placeholder' };
    const counts = { units: 5, tens: 0, hundreds: 0, thousands: 4 };
    expect(SocraticEngine.analyzeLiveBoardState(task, 'zero_placeholder', counts)).toBeNull();
    const hint = await SocraticEngine.getSocraticHint(task, 'zero_placeholder', counts);
    expect(hint?.questionHe ?? '').not.toContain('נרשום בבית המספרים');
  });

  it('6. Falls back to static task hint when no active live board anomaly exists', async () => {
    const task = {
      id: 's1_target_347',
      numberA: 347,
      targetNode: 'flexible_regrouping'
    };

    // Clean balanced counts matching target without overcrowding or deficit
    const counts = { units: 7, tens: 4, hundreds: 3, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'flexible_regrouping', counts);

    expect(hint).toBeDefined();
    expect(hint?.questionHe).toContain('מה קורה בבית המספרים כשפורטים עשרת אחת');
  });
});
