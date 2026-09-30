import { describe, it, expect } from 'vitest';
import { feminineCountHe, speakBlockCounts } from '@/core/blockCountSpeech';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * Owner, 30.9.2026: לבנה is feminine, so a count of blocks is said in the
 * feminine — "2 לבני מאה" is "שתי לבני מאה", 12 "שתים-עשרה", 25 "עשרים
 * וחמש". The digits stay on the screen; only the read-aloud changes
 * (TTSService.cleanTextForSpeech; TTSNarration.test.ts plays it through).
 */

const tasks: SessionTask[] = [];
for (const m of [3, 7] as const) {
  for (const p of ['remediation_path', 'green_path'] as const) {
    tasks.push(...getSessionTasks(m, p), ...getSessionBranchTasks(m, 'reinforcement', p), ...getSessionBranchTasks(m, 'challenge', p));
  }
}
const said = (id: string) => speakBlockCounts(tasks.find((t) => t.id === id)!.instructionHe);

describe('the feminine count before a block', () => {
  it('the owner\'s list: 2, 3, 4, 5, 6, 8, 10, 12, 25', () => {
    expect([2, 3, 4, 5, 6, 8, 10, 12, 25].map(feminineCountHe)).toEqual([
      'שתי', 'שלוש', 'ארבע', 'חמש', 'שש', 'שמונה', 'עשר', 'שתים-עשרה', 'עשרים וחמש',
    ]);
  });

  it('the rest of 2–99', () => {
    expect([7, 9, 11, 13, 14, 15, 16, 17, 18, 19].map(feminineCountHe)).toEqual([
      'שבע', 'תשע', 'אחת-עשרה', 'שלוש-עשרה', 'ארבע-עשרה', 'חמש-עשרה', 'שש-עשרה', 'שבע-עשרה', 'שמונה-עשרה', 'תשע-עשרה',
    ]);
    expect([20, 21, 22, 30, 45, 99].map(feminineCountHe)).toEqual([
      'עשרים', 'עשרים ואחת', 'עשרים ושתיים', 'שלושים', 'ארבעים וחמש', 'תשעים ותשע',
    ]);
  });

  it('none for 1 (it is written in words: "לבנת מאה אחת"), 0 or 100 and above', () => {
    expect([0, 1, 100, 450, 2.5].map(feminineCountHe)).toEqual([null, null, null, null, null]);
  });
});

describe('the station-3 and station-7 instructions, read aloud', () => {
  it('the breaks of station 3', () => {
    expect(said('s3_r_t2')).toBe(
      'בנו בבית המספרים שלוש לבני מאה וארבע לבני עשרת. פרטו לבנת מאה אחת לעשר לבני עשרת. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.'
    );
    expect(said('s3_r_t4')).toBe(
      'בנו בבית המספרים שמונה לבני עשרת וחמש לבני יחידה. פרטו לבנת עשרת אחת לעשר לבני יחידה. איזה מספר מייצגות הלבנים לאחר הפריטה? כתבו אותו בשורת התוצאה.'
    );
    expect(said('s3_r_t6')).toContain('בנו בבית המספרים חמש לבני מאה ושש לבני יחידה.');
    expect(said('s3_g_t2')).toContain('בנו בבית המספרים שלוש לבני אלף וארבע לבני מאה.');
    expect(said('s3_g_t4')).toContain('בנו בבית המספרים חמש לבני אלף, שתי לבני מאה ושלוש לבני עשרת.');
    expect(said('s3_g_t6')).toContain('בנו בבית המספרים שש לבני אלף ושלוש לבני עשרת.');
  });

  it('the groupings of station 7: 12, 10 and 25', () => {
    expect(said('s7_r_t1')).toBe(
      'בנו בבית המספרים שתים-עשרה לבני עשרת וחמש לבני יחידה. קבצו עשר לבני עשרת ללבנת מאה אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.'
    );
    expect(said('s7_g_t1')).toBe(
      'בנו בבית המספרים עשרים וחמש לבני מאה. קבצו עשר לבני מאה ללבנת אלף אחת. קבצו שוב עשר לבני מאה ללבנת אלף אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה? כתבו אותו בשורת התוצאה.'
    );
  });

  it('a number that is not a count of blocks is left to the voice: "את המספר 450 מלבני עשרת"', () => {
    for (const id of ['s3_r_t3', 's3_g_t3', 's3_r_reinforce_2', 's3_g_reinforce_2', 's3_r_t1', 's3_g_t1', 's3_r_t5', 's3_g_t5']) {
      const t = tasks.find((x) => x.id === id)!;
      expect(said(id), id).toBe(t.instructionHe);
    }
  });

  it('only speech changes: the instructions on the screen keep their digits', () => {
    expect(tasks.find((t) => t.id === 's7_r_t1')!.instructionHe).toContain('12 לבני עשרת ו-5 לבני יחידה');
  });
});

describe('everything else is said as before', () => {
  it('a text with no block count is unchanged', () => {
    for (const text of [
      'פתרו במאונך: 142 + 23. רשמו את התוצאה בשורת התוצאה.',
      'בנו את המספר 160 בבית המספרים. המספר 160 מורכב ממאה אחת ועוד כמה?',
      'בתרגיל 3▢6 + 271 = 657 חסרה ספרת העשרות של המחובר הראשון.',
    ]) {
      expect(speakBlockCounts(text)).toBe(text);
    }
  });

  it('a number joined to another word, with a thousands comma, or of three digits stays as written', () => {
    expect(speakBlockCounts('ב-2 לבני מאה')).toBe('ב-2 לבני מאה');
    expect(speakBlockCounts('3,400 לבני יחידה')).toBe('3,400 לבני יחידה');
    expect(speakBlockCounts('450 לבני יחידה')).toBe('450 לבני יחידה');
    expect(speakBlockCounts('1 לבנת מאה')).toBe('1 לבנת מאה');
    expect(speakBlockCounts('2 לבניםםם')).toBe('2 לבניםםם');
  });

  it('"לבנים" and "לבנת" too, at the start of a line and before punctuation', () => {
    expect(speakBlockCounts('בטור יש 10 לבנים או יותר.')).toBe('בטור יש עשר לבנים או יותר.');
    expect(speakBlockCounts('2 לבני מאה')).toBe('שתי לבני מאה');
    expect(speakBlockCounts('יש בו 25 לבנים.')).toBe('יש בו עשרים וחמש לבנים.');
    expect(speakBlockCounts('(3 לבני עשרת)')).toBe('(שלוש לבני עשרת)');
  });
});
