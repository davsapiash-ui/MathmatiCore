import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, absentAidViolation, inferIsSubtraction, socraticTextViolation } from '@/infrastructure/services/SocraticEngine';
import {
  carryColumns,
  borrowColumns,
  secretNumbersOf,
  revealsSecret,
  formatNumberHe,
} from '@/infrastructure/services/staticSocraticCards';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * Audit of 28.9.2026 (reports/spec-vs-software-2026-09-28.md), rows 3.14 and
 * 8.5, approved by the owner on 28.9.2026: the static Socratic card uses the
 * numbers of the exercise on the screen (register, approved deviation 2), it
 * names the column where the exercise really converts, it never shows what
 * the child is to find, and in meeting 8 — no blocks, no trash, no number
 * house on the screen — it names none of them (PRD Module 13 §א).
 *
 * Every exercise of meetings 3–8, both paths, compulsory and choice-path,
 * with the board empty and with a few blocks on it.
 */

const EMPTY = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const SOME = { units: 3, tens: 2, hundreds: 1, thousands: 0 };

type Row = { meeting: number; path: string; task: SessionTask };
const rows: Row[] = [];
for (const meeting of [3, 4, 5, 6, 7, 8] as const) {
  for (const path of ['green_path', 'remediation_path'] as const) {
    const tasks = [...getSessionTasks(meeting, path)];
    if (meeting <= 7) for (const b of ['reinforcement', 'challenge'] as const) tasks.push(...getSessionBranchTasks(meeting, b, path));
    for (const task of tasks) rows.push({ meeting, path, task });
  }
}

const textsOf = (h: { questionHe: string; choices: { textHe: string; feedbackHe?: string }[] }) =>
  [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];

/** What the child reads on the exercise sheet. */
const screenText = (t: SessionTask) => [t.instructionHe, (t as any).givenHe, (t as any).questionHe, (t as any).titleHe].filter(Boolean).join(' ');

describe('the static card is about the exercise on the screen (3.14, 8.5)', () => {
  it('covers both paths of meetings 3–8', () => {
    expect(rows.length).toBeGreaterThan(100);
    expect(new Set(rows.map((r) => r.meeting))).toEqual(new Set([3, 4, 5, 6, 7, 8]));
  });

  it('names no number that is not on the screen, and never what the child is to find', () => {
    const bad: string[] = [];
    for (const { task } of rows) {
      for (const counts of [EMPTY, SOME]) {
        const card = SocraticEngine.getSynchronousTaskHint(task, counts);
        const texts = textsOf(card);
        const leaked = revealsSecret(texts, secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n)));
        if (leaked !== null) bad.push(`${task.id}: shows ${leaked}`);
        const screen = screenText(task);
        // Numbers of two or more digits (a single digit is a column digit or
        // the 1 of a memory circle; 10 is the regrouping itself).
        for (const t of texts) {
          for (const m of t.match(/\d[\d,]*\d|\d{2,}/g) ?? []) {
            if (m === '10') continue;
            // A count of blocks in tens, not a number of an exercise (owner,
            // 30.9.2026): C2's distractor "100 לבני עשרת" (the worth of a hundred
            // taken for a count) and C7's "ל-20 לבני המאה" (two groupings of 10).
            if (/0$/.test(m) && new RegExp(`(^|[^0-9,])${m} לבני `).test(t)) continue;
            if (!screen.includes(m)) bad.push(`${task.id}: "${m}" is not on the screen — ${t}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('a skeleton exercise is shown with its hidden digits hidden', () => {
    for (const { task } of rows.filter((r) => (r.task as any).hiddenDigits)) {
      const q = SocraticEngine.getSynchronousTaskHint(task, EMPTY).questionHe;
      const shown = /בתרגיל (.+), איך מגלים/.exec(q)?.[1];
      expect(shown, task.id).toBeTruthy();
      expect(shown, task.id).toContain('▢');
      expect(task.instructionHe, task.id).toContain(shown!);
    }
  });

  it('names the first column where the exercise really converts', () => {
    const PLACE: Record<string, string> = { units: 'היחידות', tens: 'העשרות', hundreds: 'המאות', thousands: 'האלפים' };
    for (const { task } of rows) {
      const t = task as any;
      if (t.type !== 'vertical_addition' || t.hiddenDigits || t.revealedResultDigits) continue;
      // Station 7's error analysis has its own card (C6, owner 30.9.2026).
      if (/תלמיד פתר/.test(t.instructionHe)) continue;
      // Meeting 8: the column card is the second card; the first is general (owner's D8, 1.10.2026).
      const ctx = /^s8_/.test(t.id) ? { shownKinds: ['s8_check' as const] } : undefined;
      // A block on the board: an empty board builds first since 1.10.2026 (analysts' matrix 4.2).
      const counts = /^s8_/.test(t.id) ? EMPTY : { ...EMPTY, units: 1 };
      const q = SocraticEngine.getSynchronousTaskHint(task, counts, ctx).questionHe;
      if (!t.isSubtraction) {
        const first = carryColumns(t.numberA, t.numberB)[0];
        if (first) expect(q, t.id).toContain(`בטור ${PLACE[first]} מצטברות 10`);
        else expect(q, t.id).toContain('מאיזה טור מתחילים לחבר');
      } else if (q.includes('וצריך לחסר')) {
        expect(q, t.id).toContain(`בטור ${PLACE[borrowColumns(t.numberA, t.numberB)[0]]}`);
      }
    }
  });

  it('an addition is never coached as a subtraction ("חסרות שתי ספרות" is not a minus sign)', () => {
    for (const { task } of rows) {
      const t = task as any;
      if (t.type === 'vertical_addition' && !t.isSubtraction) {
        expect(inferIsSubtraction(t), t.id).toBe(false);
        for (const counts of [EMPTY, SOME]) expect(SocraticEngine.getSynchronousTaskHint(t, counts).questionHe, t.id).not.toContain('בחיסור');
      }
    }
  });

  it('meeting 8 names no blocks, no trash and no number house — in any board state', () => {
    for (const { task } of rows.filter((r) => r.meeting === 8)) {
      for (const counts of [EMPTY, SOME, { units: 14, tens: 12, hundreds: 0, thousands: 0 }]) {
        const texts = textsOf(SocraticEngine.getSynchronousTaskHint(task, counts));
        expect(absentAidViolation(texts, 8), `${task.id} ${JSON.stringify(counts)}`).toBeNull();
      }
    }
  });
});

describe('one name per thing, as the screen names it (owner, 27.9.2026, register ט)', () => {
  // The block tray has no visible name ("מחסן" is only its screen-reader
  // label), and the result row's cells are "תיבות".
  it('no card says "מחסן" or "משבצת", in any board state', () => {
    const states = [EMPTY, SOME, { units: 14, tens: 12, hundreds: 11, thousands: 0 }, { units: 1, tens: 0, hundreds: 3, thousands: 2 }];
    for (const { task } of rows) {
      for (const counts of states) {
        const all = textsOf(SocraticEngine.getSynchronousTaskHint(task, counts)).join(' ');
        expect(all, `${task.id} ${JSON.stringify(counts)}`).not.toMatch(/מחסן|משבצת/);
      }
    }
  });
});

describe('the two cards the audit saw', () => {
  const byId = (id: string) => rows.find((r) => r.task.id === id)!.task;

  it('3.14 — "build 4,500 from hundreds only": no card about 3,400, and none that gives away the 45 hundreds', () => {
    // Since the owner's redesign of 30.9.2026 the exercise asks HOW MANY
    // hundreds make 4,500 — the 45 the card used to name is the answer now.
    // Its card (C2) asks how many hundred blocks one thousand block is worth.
    const card = SocraticEngine.getSynchronousTaskHint(byId('s3_g_t3'), EMPTY);
    expect(byId('s3_g_t3').correctAnswer).toBe(45);
    expect(card.questionHe).toBe('נסו לחשוב: כמה לבני מאה שוות ללבנת אלף אחת?');
    expect(card.choices.map((c) => c.textHe)).toEqual(['10 לבני מאה', 'לבנת מאה אחת', '100 לבני מאה']);
    expect(JSON.stringify(card)).not.toMatch(/3,?400|34|45/);
  });

  it('8.5 — 1,245 + 328 in meeting 8: the units convert, and there are no blocks', () => {
    // Owner's D8 (1.10.2026): the first card is general, the second names the column.
    expect(SocraticEngine.getSynchronousTaskHint(byId('s8_g_t1'), EMPTY).questionHe).toBe('נסו לחשוב: לפני שכותבים ספרה בשורת התוצאה, מה בודקים בכל טור?');
    const card = SocraticEngine.getSynchronousTaskHint(byId('s8_g_t1'), EMPTY, { shownKinds: ['s8_check'] });
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 1,245 + 328, בטור היחידות מצטברות 10 יחידות או יותר. מה עושים איתן?');
    expect(card.choices[0].textHe).toBe('מקבצים 10 יחידות לעשרת אחת, ורושמים אותה בעיגול הזיכרון שמעל טור העשרות');
    expect(JSON.stringify(card)).not.toMatch(/עשרות הצטברו|יותר מ-9 עשרות|לבנ|פח|1245/);
  });

  it('8.5 — the same exercise in meeting 4 names the units too, with the blocks that are on that screen', () => {
    // One block on the board (1.10.2026: an empty board builds first).
    const card = SocraticEngine.getSynchronousTaskHint(byId('s4_g_t1'), { ...EMPTY, units: 1 });
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 1,245 + 328, בטור היחידות מצטברות 10 יחידות או יותר. מה עושים איתן?');
    expect(card.choices[0].textHe).toBe('מקבצים 10 יחידות לעשרת אחת ומעבירים אותה שמאלה לטור העשרות');
  });

  it('numbers are written as on the exercise sheet: 1,245 — not 1245', () => {
    expect(formatNumberHe(1245)).toBe('1,245');
    expect(formatNumberHe(328)).toBe('328');
    for (const { task } of rows) {
      const q = SocraticEngine.getSynchronousTaskHint(task, EMPTY).questionHe;
      expect(q, task.id).not.toMatch(/\d{4}/);
    }
  });
});

describe('meeting 1 target task (347): the card does not answer the task\'s question', () => {
  // 347 built and not yet broken (an empty board gets "build first" since 1.10.2026).
  const BUILT_347 = { units: 7, tens: 4, hundreds: 3, thousands: 0 };

  it('the wrong-option hints no longer say that the quantity is kept', () => {
    const card = SocraticEngine.getSynchronousTaskHint({ id: 's1_target_347', type: 'representation', numberA: 347 }, BUILT_347);
    expect(card.questionHe).toBe('נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?');
    const hints = card.choices.filter((c) => !c.isCorrect).map((c) => c.feedbackHe);
    // Owner's D10 (1.10.2026): guiding questions.
    expect(hints).toEqual([
      'רמז: מה קורה ללבנת העשרת כשלוחצים עליה?',
      'רמז: מה מופיע בבית המספרים במקום העשרת?',
    ]);
    expect(JSON.stringify(card)).not.toMatch(/שומרת על ערך הכמות|נשמרת|347/);
  });

  it('speaks the words of the screen: "פורטים", "בית המספרים", no formal "אנו" (28.9.2026)', () => {
    const card = SocraticEngine.getSynchronousTaskHint({ id: 's1_target_347', type: 'representation', numberA: 347 }, BUILT_347);
    expect(card.choices.map((c) => c.textHe)).toEqual([
      'מקבלים עשר יחידות שנוספות לטור היחידות',
      'בית המספרים נשאר בלי שינוי',
      'העשרת נמחקת מבית המספרים',
    ]);
    const all = textsOf(card).join(' ');
    expect(all).not.toMatch(/מפרק|(^|[^א-ת])[ובלמהש]{0,3}לוח(?![א-ת])|(^|[^א-ת])אנו(?![א-ת])/);
    expect(card.tts_text).toBe(card.questionHe);
  });
});

describe('the AI card gets the same checks (the engine runs on the server)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  // Wrong-option hints are guiding questions, as stations 3–8 require (owner,
  // 30.9.2026); each test below changes one other thing.
  const answer = (question: string, correct = 'נבדוק טור אחר טור') => ({
    data: {
      error_category: 'procedural',
      guiding_question: question,
      options: [
        { id: 'opt_1', option_text: correct, feedback_text: 'נכון', is_correct: true },
        { id: 'opt_2', option_text: 'ננחש', feedback_text: 'רמז: האם זה נכון?', is_correct: false },
        { id: 'opt_3', option_text: 'נחכה', feedback_text: 'רמז: האם זה נכון?', is_correct: false },
      ],
    },
  });
  const ask = (task: any, sessionNumber: number) =>
    SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: 'procedural_fluency',
      activeColumnName: 'יחידות',
      counts: EMPTY,
      qMatrixAnchor: SocraticEngine.getSynchronousTaskHint(task, EMPTY),
      monitoring: { sessionNumber },
    });

  it('a card that names the hidden number of a skeleton is thrown away', async () => {
    const task = rows.find((r) => r.task.id === 's7_r_t2')!.task; // 31▢ + 254 = 568
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בתרגיל 314 + 254, מה בטור היחידות?'));
    expect(await ask(task, 7)).toBeNull();
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בתרגיל 31▢ + 254 = 568, מה חסר בטור היחידות?'));
    expect(await ask(task, 7)).not.toBeNull();
  });

  // Thousand separators (28.9.2026): "1,573" and "1 573" are the answer too.
  it('the answer or a hidden number with a thousands separator is thrown away', async () => {
    const add = rows.find((r) => r.task.id === 's8_g_t1')!.task; // 1,245 + 328
    for (const leak of ['נקבל 1,573', 'נקבל 1 573', 'נקבל 1\u00A0573', 'נקבל 1\u202F573', 'נקבל 1\u2009573', "נקבל 1'573", 'נקבל 1\u05F3573']) {
      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer(`בתרגיל 1,245 + 328, ${leak}?`));
      expect(await ask(add, 8), leak).toBeNull();
    }
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בתרגיל 1,245 + 328, מה עושים בטור היחידות?'));
    expect(await ask(add, 8)).not.toBeNull();

    const skeleton = rows.find((r) => r.task.id === 's7_g_challenge_1')!.task; // ▢,▢▢▢ − 2,587
    for (const leak of ['בונים את 8003 בבית המספרים', 'בונים את 8,003 בבית המספרים', 'בונים את 8 003 בבית המספרים']) {
      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer(leak));
      expect(await ask(skeleton, 7), leak).toBeNull();
    }
  });

  it('the missing part written as blocks is thrown away: "6 עשרות" is 60 (s3_r_t7)', async () => {
    const t = rows.find((r) => r.task.id === 's3_r_t7')!.task;
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('במספר 160 יש מאה אחת ועוד 6 עשרות. מה כותבים?'));
    expect(await ask(t, 3)).toBeNull();
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('איך נגלה מה יש במספר 160 חוץ ממאה אחת?'));
    expect(await ask(t, 3)).not.toBeNull();
    // An addition whose board holds both numbers, not yet grouped, is worth
    // the result; describing it is the coaching, not a leak.
    const add = rows.find((r) => r.task.id === 's4_r_t3')!.task; // 247 + 135
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בבית המספרים יש 3 מאות, 7 עשרות ו-12 יחידות. מה עושים?'));
    expect(await ask(add, 4)).not.toBeNull();
    const s7 = rows.find((r) => r.task.id === 's7_g_t5')!.task; // asks for 3,800
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בבית המספרים יש 3 אלפים ו-8 מאות. איזה מספר זה?'));
    expect(await ask(s7, 7)).toBeNull();
  });

  it('an AI card that marks the instruction\'s own representation wrong is thrown away (שהB.1)', async () => {
    // An exercise whose instruction names both 3,400 and its blocks, as
    // station 3's did until the owner's redesign of 30.9.2026.
    const s3g1 = rows.find((r) => r.task.id === 's3_g_t1')!.task;
    // Its own id: s3_g_t1 is a "build it any way" exercise by its id too (owner, 4.10.2026).
    const t = { ...s3g1, id: 's3_g_t9', representationKind: undefined, instructionHe: 'בנו את המספר 3,400 מ-3 אלפים ו-4 מאות. כתבו אותו בשורת התוצאה.' };
    const card = (right: string, wrong: string) => ({
      data: {
        error_category: 'conceptual',
        guiding_question: 'באילו לבנים ההוראה מבקשת לבנות את המספר 3,400?',
        options: [
          { id: 'opt_1', option_text: right, feedback_text: 'נכון', is_correct: true },
          { id: 'opt_2', option_text: wrong, feedback_text: 'רמז: מה כתוב בהוראה?', is_correct: false },
          { id: 'opt_3', option_text: 'נכתוב את המספר בלי לבנות', feedback_text: 'רמז: מה כתוב בהוראה?', is_correct: false },
        ],
      },
    });
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(card('נשתמש ב-34 מאות', 'נשתמש ב-3 אלפים ו-4 מאות'));
    expect(await ask(t, 3)).toBeNull();
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(card('נשתמש ב-3 אלפים ו-4 מאות', 'נשתמש ב-34 מאות'));
    expect(await ask(t, 3)).not.toBeNull();
    // Station 3 itself: "בנו את המספר שלושת אלפים וארבע מאות. כתבו אותו
    // בספרות" — the blocks ARE the answer there, and a card naming them is
    // thrown away too.
    expect(await ask(s3g1, 3)).toBeNull();
  });

  it('the client check itself: socraticTextViolation and revealsSecret read through separators', () => {
    const ops = { a: 1245, b: 328, isSubtraction: false };
    for (const t of ['נקבל 1,573', 'נקבל 1 573', "נקבל 1'573", 'נקבל 1\u00A0573']) expect(socraticTextViolation([t], ops), t).toBe('final answer leaked');
    expect(socraticTextViolation(['בתרגיל 1,245 + 328'], ops)).toBeNull();
    expect(revealsSecret(['בונים את 8 003'], [8003])).toBe(8003);
    expect(revealsSecret(['בתרגיל 3,400'], [400])).toBeNull();
  });

  it('no static card of a skeleton exercise prints its hidden number, in any board state', () => {
    for (const { task } of rows.filter((r) => (r.task as any).hiddenDigits)) {
      const hidden = secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n));
      for (const counts of [EMPTY, SOME, { units: 3, tens: 0, hundreds: 0, thousands: 8 }]) {
        expect(revealsSecret(textsOf(SocraticEngine.getSynchronousTaskHint(task, counts)), hidden), task.id).toBeNull();
      }
    }
  });

  it('a meeting-8 card that sends the child to blocks or the trash is thrown away', async () => {
    const task = rows.find((r) => r.task.id === 's8_g_t1')!.task;
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בתרגיל 1,245 + 328, מה עושים?', 'נקבץ 10 לבנים בטור היחידות'));
    expect(await ask(task, 8)).toBeNull();
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(answer('בתרגיל 1,245 + 328, מה עושים בטור היחידות?', 'נרשום 1 בעיגול הזיכרון'));
    expect(await ask(task, 8)).not.toBeNull();
  });

  it('"לבנות" (to build) and "לפחות" (at least) are not aids', () => {
    expect(absentAidViolation(['צריך לפחות עשר', 'אפשר לבנות'], 8)).toBeNull();
    expect(absentAidViolation(['גררו לפח'], 8)).not.toBeNull();
    expect(absentAidViolation(['כיצד תפתרו את התרגילים כאשר אין לכם לבנים על המסך?'], 8)).toBeNull();
    expect(absentAidViolation(['גררו לפח'], 7)).toBeNull();
  });
});

/**
 * Independent review of 28.9.2026: with blocks on the screen (meetings 3–7)
 * the card must follow the board. A card that still said "break a ten" after
 * the ten was broken — or "break a ten" when the tens column is empty
 * (4,000 − 1,562) — sent the child the wrong way.
 */
describe('with blocks on the screen, the card follows the board', () => {
  const PL = ['units', 'tens', 'hundreds', 'thousands'] as const;
  const ONE: Record<string, string> = { units: 'יחידה אחת', tens: 'עשרת אחת', hundreds: 'מאה אחת', thousands: 'אלף אחד' };
  const ONE_BLOCK: Record<string, string> = { units: 'לבנת יחידה אחת', tens: 'לבנת עשרת אחת', hundreds: 'לבנת מאה אחת', thousands: 'לבנת אלף אחת' };
  const COLUMN_HE: Record<string, string> = { units: 'טור היחידות', tens: 'טור העשרות', hundreds: 'טור המאות', thousands: 'טור האלפים' };
  const digit = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;

  it('every subtraction of meetings 3–7: follow the card, one decomposition at a time, until every column has enough', () => {
    const subs = rows.filter((r) => r.meeting <= 7 && (r.task as any).type === 'vertical_addition' && (r.task as any).isSubtraction && !(r.task as any).hiddenDigits && !(r.task as any).revealedResultDigits);
    expect(subs.length).toBeGreaterThan(20);
    for (const { task } of subs) {
      const a = (task as any).numberA as number;
      const b = (task as any).numberB as number;
      const counts: Record<string, number> = { units: digit(a, 0), tens: digit(a, 1), hundreds: digit(a, 2), thousands: digit(a, 3) };
      // The first card of the exercise asks what to check in every column (C5,
      // owner 30.9.2026); the cards after it name the column.
      const first = SocraticEngine.getSynchronousTaskHint(task, counts as any);
      if (PL.some((p, i) => counts[p] < digit(b, i))) expect(first.questionHe, task.id).toBe('נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?');
      for (let step = 0; step < 12; step++) {
        const card = SocraticEngine.getSynchronousTaskHint(task, counts as any, { shownKinds: ['borrow_check'] });
        const lacking = PL.findIndex((p, i) => counts[p] < digit(b, i));
        if (lacking < 0) {
          expect(card.questionHe, task.id).toContain('בכל טור יש מספיק לבנים');
          break;
        }
        // Where the blocks come from: the first column to the left that has any.
        let m = lacking + 1;
        while (counts[PL[m]] === 0) m++;
        const correct = card.choices.find((c) => c.isCorrect)!.textHe;
        // Through a zero one breaks a BLOCK first — "פורטים תחילה לבנת מאה אחת"
        // (owner, 4.10.2026: the documents' form); otherwise "פורטים מאה אחת".
        expect(correct, `${task.id} ${JSON.stringify(counts)}`).toMatch(
          m > lacking + 1 ? new RegExp(`^פורטים תחילה ${ONE_BLOCK[PL[m]]}`) : new RegExp(`^פורטים ${ONE[PL[m]]}`)
        );
        if (m > lacking + 1) expect(card.questionHe, task.id).toMatch(/איך פורטים כש.* (אפס|אפסים)\?$/);
        // The column, and no count of its blocks: the child counts (owner, 30.9.2026).
        else expect(card.questionHe, task.id).toContain(`ב${COLUMN_HE[PL[lacking]]} אין מספיק לבנים כדי לחסר`);
        // Do what the card says: break one block of column m.
        counts[PL[m]] -= 1;
        counts[PL[m - 1]] += 10;
        expect(step, task.id).toBeLessThan(11);
      }
    }
  });

  // The board cannot tell "still building the first number" from "taking
  // away under way" (re-review, 28.9.2026): 305 − 12 with 3 hundreds and
  // 3 units is both. Neither card may then call a needed decomposition a
  // mistake, nor say that taking away has started.
  it('between building and the result, the card asks what to check before taking from a column', () => {
    const t = rows.find((r) => r.task.id === 's5_g_t1')!.task; // 5,432 − 2,118
    for (const counts of [
      { thousands: 5, hundreds: 0, tens: 0, units: 0 }, // only the thousands built
      { thousands: 5, hundreds: 4, tens: 2, units: 4 }, // 8 units taken away
    ]) {
      const card = SocraticEngine.getSynchronousTaskHint(t, counts);
      expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 5,432 − 2,118, מה בודקים לפני שמוציאים לבנים מטור?');
      expect(JSON.stringify(card)).not.toMatch(/סיימנו|סיימתם|פורטים רק כש/);
    }
    // Both numbers built: only the first one is built in subtraction.
    const both = SocraticEngine.getSynchronousTaskHint(rows.find((r) => r.task.id === 's6_g_t3')!.task, { thousands: 5, hundreds: 5, tens: 6, units: 2 });
    expect(both.choices[0].textHe).toBe('רק את המספר הראשון, 4,000');
    // Everything taken away: the result row.
    const done = SocraticEngine.getSynchronousTaskHint(t, { thousands: 3, hundreds: 3, tens: 1, units: 4 });
    expect(done.questionHe).toBe('נסו לחשוב: בתרגיל 5,432 − 2,118, אם כבר הוצאתם לפח האשפה את כל מה שמחסרים, מה עושים עכשיו?');
  });

  it('independent review, 28.9.2026: a short column with nothing to its left is not "every column has enough"', () => {
    const t = rows.find((r) => r.task.id === 's5_g_t1')!.task; // 5,432 − 2,118
    // 54 hundreds: even after the 1 hundred is taken, 10 or more stay in the
    // column. Since 1.10.2026 the card says so — group 10 hundreds into a
    // thousand (the thousands column needs them too).
    const card = SocraticEngine.getSynchronousTaskHint(t, { thousands: 0, hundreds: 54, tens: 2, units: 12 });
    expect(card.questionHe).toBe('נסו לחשוב: בסוף החיסור יישארו בטור המאות 10 לבנים או יותר. מה עושים איתן?');
    expect(JSON.stringify(card)).not.toMatch(/בכל טור יש מספיק/);
  });

  it('an addition whose blocks are all on the board, grouped, asks for the result row', () => {
    const t = rows.find((r) => r.task.id === 's4_g_t1')!.task; // 1,245 + 328 = 1,573
    const done = SocraticEngine.getSynchronousTaskHint(t, { thousands: 1, hundreds: 5, tens: 7, units: 3 });
    expect(done.questionHe).toBe('נסו לחשוב: בתרגיל 1,245 + 328, כל הלבנים כבר בבית המספרים. מה עושים עכשיו?');
    // Before that, the grouping advice holds in any state: the button shows only at 10.
    // (1,245 alone on the board asks for the other number since 1.10.2026.)
    const building = SocraticEngine.getSynchronousTaskHint(t, { thousands: 1, hundreds: 2, tens: 4, units: 0 });
    expect(building.choices[0].feedbackHe).toBe('נכון מאוד! כשיש בטור היחידות 10 לבנים או יותר, לחצו על הכפתור "קבצו 10" שבראש הטור.');
  });

  it('a block is feminine: "לחצו על לבנת אלף כדי לפרוט אותה"', () => {
    for (const { task } of rows) {
      for (const counts of [EMPTY, SOME]) {
        const all = textsOf(SocraticEngine.getSynchronousTaskHint(task, counts)).join(' ');
        expect(all, task.id).not.toMatch(/לבנת \S+ כדי לפרוט אותו/);
      }
    }
  });

  it('meeting 8, through a zero: one decomposition does not yet give units', () => {
    const t = rows.find((r) => r.task.id === 's8_g_t5')!.task; // 4,000 − 1,562
    // The column card is meeting 8's second card (owner's D8, 1.10.2026).
    const all = textsOf(SocraticEngine.getSynchronousTaskHint(t, EMPTY, { shownKinds: ['s8_check'] })).join(' ');
    expect(all).not.toContain('פורטים אלף אחד, ואז יש מספיק');
    expect(all).toContain('אחר כך פרטו שוב, טור אחר טור, עד טור היחידות');
  });

  it('a skeleton with several empty boxes speaks of boxes, in the plural', () => {
    for (const { task } of rows.filter((r) => ((r.task as any).hiddenDigits?.a?.length ?? 0) > 1)) {
      const all = textsOf(SocraticEngine.getSynchronousTaskHint(task, EMPTY)).join(' ');
      // 'בכל תיבה ריקה' (second review, 1.10.2026: four columns, two empty boxes) is the plural too.
      expect(all, task.id).toMatch(/בתיבות הריקות|בכל תיבה ריקה/);
      expect(all, task.id).not.toContain('בתיבה הריקה');
    }
  });
});

