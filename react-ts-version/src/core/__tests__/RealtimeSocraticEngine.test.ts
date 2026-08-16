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

    const hint = await SocraticEngine.getSocraticHint(task, 'subtraction_regrouping', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-thousands');
    expect(hint?.questionHe).toContain('2 מאות');
    expect(hint?.questionHe).toContain('8 מאות');
    expect(hint?.choices).toHaveLength(3);
    
    const correctOpt = hint?.choices.find(c => c.id === hint?.correctChoiceId);
    expect(correctOpt).toBeDefined();
    expect(correctOpt?.textHe).toContain('אלף אחד מטור האלפים כדי לפרוט');
    expect(correctOpt?.isCorrect).toBe(true);

    const distractorOpt = hint?.choices.find(c => c.id === 'opt_2');
    expect(distractorOpt?.textHe).toContain('נחסיר הפוך');
    expect(distractorOpt?.isCorrect).toBe(false);
  });

  it('2. Dynamically detects deficit in units for subtraction task 425 - 162', async () => {
    const task = {
      id: 's1_t10',
      exercise: '425 - 162',
      isSubtraction: true,
      numberA: 425,
      numberB: 162,
      targetNode: 'subtraction_regrouping',
      instructionHe: 'החסירו 162 מתוך 425'
    };

    // Live counts on the board: units = 1 (needs 2 units for 162)
    const counts = { units: 1, tens: 2, hundreds: 4, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'subtraction_regrouping', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-tens');
    expect(hint?.questionHe).toContain('1 יחידות');
    expect(hint?.questionHe).toContain('2 יחידות');
    expect(hint?.choices[0].textHe).toContain('עשרת אחת מטור העשרות כדי לפרוט');
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
    expect(hint?.questionHe).toContain('14 קוביות');
    expect(hint?.choices[0].textHe).toContain('נאסוף 10 יחידות מטור היחידות ונמיר אותן לעשרת אחת בטור העשרות');
    expect(hint?.choices[1].textHe).toContain('נמחק 10 יחידות');
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
    expect(hint?.questionHe).toContain('13 עשרות');
    expect(hint?.choices[0].textHe).toContain('נאסוף 10 עשרות ונקבץ אותן למאה אחת בטור המאות');
  });

  it('5. Dynamically detects zero placeholder missing in tens', async () => {
    const task = {
      id: 's6_t3',
      numberA: 4005,
      targetNode: 'zero_placeholder'
    };

    const counts = { units: 5, tens: 0, hundreds: 0, thousands: 4 };

    const hint = await SocraticEngine.getSocraticHint(task, 'zero_placeholder', counts);

    expect(hint).toBeDefined();
    expect(hint?.suggested_highlight).toBe('tour-column-tens');
    expect(hint?.questionHe).toContain('אין קוביות בעמודת העשרות');
    expect(hint?.choices[0].textHe).toContain('נרשום 0 בעמודת העשרות כדי לשמור על ערך המקום');
  });

  it('6. Falls back to static task hint when no active live board anomaly exists', async () => {
    const task = {
      id: 's1_license_test',
      numberA: 420,
      targetNode: 'flexible_regrouping'
    };

    // Clean balanced counts matching target without overcrowding or deficit
    const counts = { units: 0, tens: 2, hundreds: 4, thousands: 0 };

    const hint = await SocraticEngine.getSocraticHint(task, 'flexible_regrouping', counts);

    expect(hint).toBeDefined();
    expect(hint?.questionHe).toContain('כיצד מייצגים את המספר 420');
  });
});
