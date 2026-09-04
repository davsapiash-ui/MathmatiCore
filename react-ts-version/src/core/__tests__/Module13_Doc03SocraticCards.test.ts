import { describe, it, expect } from 'vitest';
import { SocraticEngine, sessionCardKeysForTaskId } from '@/infrastructure/services/SocraticEngine';

/**
 * מסמך 03 §3.3–3.8 writes one Socratic card per session (question + three
 * options, the first correct). The static fallback served on AI timeout must be
 * that card, for every exercise of the session and for its early-finisher
 * exercises, with session 3 split by learning path (34 tens vs 34 hundreds).
 */
const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };

describe('Module 13: static Socratic cards come from מסמך 03', () => {
  it('maps compulsory and early-finisher ids of sessions 3–8 to their session card', () => {
    expect(sessionCardKeysForTaskId('s3_r_t2')).toEqual(['s3_r_card', 's3_card']);
    expect(sessionCardKeysForTaskId('s3_g_reinforce_1')).toEqual(['s3_g_card', 's3_card']);
    expect(sessionCardKeysForTaskId('s7_r_challenge_1')).toEqual(['s7_r_card', 's7_card']);
    expect(sessionCardKeysForTaskId('s8_g_t7')).toEqual(['s8_g_card', 's8_card']);
    expect(sessionCardKeysForTaskId('s1_t7')).toEqual([]);
  });

  it('session 3 serves the path-specific card: tens for remediation, hundreds for green', async () => {
    const rem = (await SocraticEngine.getSocraticHint({ id: 's3_r_t3', type: 'representation', numberA: 450 } as any, 'flexible_regrouping', EMPTY))!;
    expect(rem.questionHe).toContain('ערך המיקום');
    expect(rem.choices[0].textHe).toBe('נשתמש ב-34 עשרות');
    const green = (await SocraticEngine.getSocraticHint({ id: 's3_g_t3', type: 'representation', numberA: 4500 } as any, 'flexible_regrouping', EMPTY))!;
    expect(green.choices[0].textHe).toBe('נשתמש ב-34 מאות');
  });

  it('every other session serves the document card, correct option first, with feedback on each option', async () => {
    const expected: Record<number, string> = {
      4: 'מקבצים 10 יחידות לעשרת אחת',
      5: 'פורטים עשרת אחת לעשר יחידות',
      6: 'פרטו תחילה לבנת מאה אחת לעשר עשרות',
      7: 'ניעזר בלבני הדינס',
      8: 'נתבונן בלוח בית המספרים',
    };
    for (const [session, opening] of Object.entries(expected)) {
      for (const id of [`s${session}_r_t1`, `s${session}_g_t7`, ...(Number(session) <= 7 ? [`s${session}_g_challenge_1`] : [])]) {
        const hint = (await SocraticEngine.getSocraticHint({ id, type: 'vertical_addition' } as any, 'procedural_fluency', EMPTY))!;
        expect(hint.choices, id).toHaveLength(3);
        expect(hint.choices[0].textHe, id).toContain(opening);
        expect(hint.correctChoiceId, id).toBe('opt_1');
        for (const c of hint.choices) expect(c.feedbackHe, id).toBeTruthy();
      }
    }
  });

  it('never leaks a final numeric answer inside the card (Module 13 iron rule)', async () => {
    for (const id of ['s4_g_t5', 's5_g_t3', 's6_r_t7', 's8_g_t6']) {
      const hint = (await SocraticEngine.getSocraticHint({ id, type: 'vertical_addition' } as any, 'procedural_fluency', EMPTY))!;
      for (const c of hint.choices) expect(c.textHe, id).not.toMatch(/\d{3,}/);
    }
  });
});
