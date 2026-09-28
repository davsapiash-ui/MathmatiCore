import { describe, it, expect, vi, afterEach } from 'vitest';
import { SocraticEngine, absentAidViolation, inferIsSubtraction } from '@/infrastructure/services/SocraticEngine';
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
      const shown = /בתרגיל (.+), איך נגלה/.exec(q)?.[1];
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
      const q = SocraticEngine.getSynchronousTaskHint(task, EMPTY).questionHe;
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

describe('the two cards the audit saw', () => {
  const byId = (id: string) => rows.find((r) => r.task.id === id)!.task;

  it('3.14 — "represent 4,500 with hundreds only" is about 4,500 and 45 hundreds', () => {
    const card = SocraticEngine.getSynchronousTaskHint(byId('s3_g_t3'), EMPTY);
    expect(card.questionHe).toBe('בואו נחשוב רגע יחד: האם שקלתם את ערך המיקום של הספרות במספר 4,500?');
    expect(card.choices.map((c) => c.textHe)).toEqual(['נשתמש ב-45 מאות', 'נשתמש ב-4 אלפים ו-5 מאות', 'נשתמש ב-4,500 יחידות']);
    expect(JSON.stringify(card)).not.toMatch(/3,?400|34/);
  });

  it('8.5 — 1,245 + 328 in meeting 8: the units convert, and there are no blocks', () => {
    const card = SocraticEngine.getSynchronousTaskHint(byId('s8_g_t1'), EMPTY);
    expect(card.questionHe).toBe('בואו נחשוב רגע יחד: בתרגיל 1,245 + 328, בטור היחידות מצטברות 10 יחידות או יותר. מה עושים איתן?');
    expect(card.choices[0].textHe).toBe('ממירים 10 יחידות לעשרת אחת, ורושמים אותה בעיגול הזיכרון שמעל טור העשרות');
    expect(JSON.stringify(card)).not.toMatch(/עשרות הצטברו|יותר מ-9 עשרות|לבנ|פח|1245/);
  });

  it('8.5 — the same exercise in meeting 4 names the units too, with the blocks that are on that screen', () => {
    const card = SocraticEngine.getSynchronousTaskHint(byId('s4_g_t1'), EMPTY);
    expect(card.questionHe).toBe('בואו נחשוב רגע יחד: בתרגיל 1,245 + 328, בטור היחידות מצטברות 10 יחידות או יותר. מה עושים איתן?');
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
  it('the wrong-option hints no longer say that the quantity is kept', () => {
    const card = SocraticEngine.getSynchronousTaskHint({ id: 's1_target_347', type: 'representation', numberA: 347 }, EMPTY);
    expect(card.questionHe).toBe('בואו נחשוב רגע יחד: מה קורה כאשר אנו מפרקים עשרת אחת לטור היחידות?');
    const hints = card.choices.filter((c) => !c.isCorrect).map((c) => c.feedbackHe);
    expect(hints).toEqual([
      'רמז: הפריטה משנה את הלבנים בבית המספרים. בדקו מה קורה לכמות.',
      'רמז: בפריטה לא מוחקים לבנים. בדקו מה קורה לעשרת.',
    ]);
    expect(JSON.stringify(card)).not.toMatch(/שומרת על ערך הכמות|נשמרת|347/);
  });
});

describe('the AI card gets the same checks (the engine runs on the server)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const answer = (question: string, correct = 'נבדוק טור אחר טור') => ({
    data: {
      error_category: 'procedural',
      guiding_question: question,
      options: [
        { id: 'opt_1', option_text: correct, feedback_text: 'נכון', is_correct: true },
        { id: 'opt_2', option_text: 'ננחש', feedback_text: 'רמז: לא', is_correct: false },
        { id: 'opt_3', option_text: 'נחכה', feedback_text: 'רמז: לא', is_correct: false },
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
    expect(absentAidViolation(['כיצד תפתרו את התרגילים כאשר אין לכם לבני דינס על המסך?'], 8)).toBeNull();
    expect(absentAidViolation(['גררו לפח'], 7)).toBeNull();
  });
});
