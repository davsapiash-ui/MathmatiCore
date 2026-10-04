import { describe, it, expect } from 'vitest';
import { MISSING_DIGIT_BOX, MISSING_DIGIT_HE, speakMissingDigits } from '@/core/missingDigitSpeech';
import * as SessionTasks from '@/data/sessionTasks';
import * as BranchTasks from '@/data/sessionBranchTasks';
import type { SessionTask } from '@/data/sessionTasks';

/**
 * The read-aloud button says a number with a missing-digit box the way the
 * vertical exercise's screen-reader label says it: digit by digit, each "▢" as
 * "ספרה חסרה", separated by commas, with the thousands comma inside that number
 * dropped. Numbers without a box and all other text are said as before.
 */

const all: SessionTask[] = [];
const seen = new Set<string>();
const walk = (o: unknown): void => {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') {
    const t = o as SessionTask;
    if (typeof t.id === 'string' && typeof t.type === 'string') {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        all.push(t);
      }
    } else Object.values(o).forEach(walk);
  }
};
walk(SessionTasks);
walk(BranchTasks);
const instructionOf = (id: string) => all.find((t) => t.id === id)!.instructionHe;

describe('a number with a missing-digit box is said digit by digit', () => {
  it('s7_r_t3: 3▢6 + 271', () => {
    const text = instructionOf('s7_r_t3');
    expect(text).toBe(
      'בתרגיל 3▢6 + 271 = 657 חסרה ספרת העשרות של המחובר הראשון. גלו את הספרה בעזרת הלבנים וכתבו אותה בתיבה הריקה.'
    );
    expect(speakMissingDigits(text)).toBe(
      'בתרגיל 3, ספרה חסרה, 6 + 271 = 657 חסרה ספרת העשרות של המחובר הראשון. גלו את הספרה בעזרת הלבנים וכתבו אותה בתיבה הריקה.'
    );
  });

  it('s7_r_t4: two hidden digits in a subtraction, 5▢▢ − 178', () => {
    const text = instructionOf('s7_r_t4');
    expect(text).toBe(
      'בתרגיל 5▢▢ − 178 = 364 חסרות ספרת העשרות וספרת היחידות של המחוסר. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.'
    );
    expect(speakMissingDigits(text)).toBe(
      'בתרגיל 5, ספרה חסרה, ספרה חסרה − 178 = 364 חסרות ספרת העשרות וספרת היחידות של המחוסר. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות.'
    );
  });

  it('s6_g_t7: a four-digit number, 6,0▢▢ − 2,847 — its thousands comma is dropped; 2,847 and 3,158 keep theirs', () => {
    const text = instructionOf('s6_g_t7');
    expect(text).toBe(
      'בשורת המחוסר חסרות שתי ספרות: 6,0▢▢ − 2,847 = 3,158. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות. רוצים לחזור צעד אחד אחורה? לחצו על כפתור ביטול הפעולה ↺.'
    );
    expect(speakMissingDigits(text)).toBe(
      'בשורת המחוסר חסרות שתי ספרות: 6, 0, ספרה חסרה, ספרה חסרה − 2,847 = 3,158. גלו אותן בעזרת הלבנים וכתבו אותן בתיבות הריקות. רוצים לחזור צעד אחד אחורה? לחצו על כפתור ביטול הפעולה ↺.'
    );
  });

  it('every digit hidden, with and without a thousands comma', () => {
    expect(speakMissingDigits('▢,▢▢▢ − 2,587 = 5,416')).toBe(
      'ספרה חסרה, ספרה חסרה, ספרה חסרה, ספרה חסרה − 2,587 = 5,416'
    );
    expect(speakMissingDigits('▢▢▢ + 258 = 673')).toBe('ספרה חסרה, ספרה חסרה, ספרה חסרה + 258 = 673');
  });
});

describe('everything else is said exactly as before', () => {
  it('s4_r_t7: a text with no box is unchanged', () => {
    const text = instructionOf('s4_r_t7');
    expect(text).toBe(
      'בתרגיל 328 + 145 חסרה ספרת העשרות בשורת התוצאה. ייצגו את המספרים בעזרת לבנים. כאשר מצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור ורשמו את ההמרה בעיגול הזיכרון. כתבו את הספרה החסרה בתיבה הריקה.'
    );
    expect(speakMissingDigits(text)).toBe(text);
  });

  it('numbers with thousands commas, lists and other text are untouched', () => {
    for (const text of ['פתרו חיסור עם אפסים: 2,045 − 1,128.', 'בנו את המספר 305.', '1, 2, 3', '', 'שלום']) {
      expect(speakMissingDigits(text), text).toBe(text);
    }
  });

  it('every instruction in every bank: no box is left to be read, one "ספרה חסרה" per box, and a text with no box is unchanged', () => {
    const texts = all.map((t) => t.instructionHe).filter((s): s is string => typeof s === 'string');
    const withBox = texts.filter((s) => s.includes(MISSING_DIGIT_BOX));
    expect(withBox.length).toBeGreaterThan(10);
    for (const text of texts) {
      const said = speakMissingDigits(text);
      expect(said, text).not.toContain(MISSING_DIGIT_BOX);
      const boxes = text.split(MISSING_DIGIT_BOX).length - 1;
      expect(said.split(MISSING_DIGIT_HE).length - 1 - (text.split(MISSING_DIGIT_HE).length - 1), text).toBe(boxes);
      if (boxes === 0) expect(said, text).toBe(text);
    }
  });
});
