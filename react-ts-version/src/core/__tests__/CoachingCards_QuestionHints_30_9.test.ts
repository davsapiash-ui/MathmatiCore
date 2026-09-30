import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SocraticEngine, TASK_HINTS, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import {
  exerciseCard,
  representationKindOf,
  secretNumbersOf,
  revealsSecret,
  revealsSecretInCounts,
  wrongHintViolation,
  meetingOfTaskId,
  type StaticCardContext,
} from '@/infrastructure/services/staticSocraticCards';
import { useWorkspaceStore, getActiveTasks, staticCardContextFor } from '@/application/useWorkspaceStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { approvePath } from '@/test/approvedPath';

/**
 * Owner, 30.9.2026. The instructions of stations 5–7 no longer say where or
 * how often to convert, and station 3 no longer puts the answer in the
 * question: the coaching card is where help lives. Seven new cards (C1–C7,
 * his wording), and every wrong-option hint of stations 3–8 is a short
 * guiding question — never an explanation, never the answer.
 */

type Counts = { units: number; tens: number; hundreds: number; thousands: number };
const EMPTY: Counts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const PLACES = ['units', 'tens', 'hundreds', 'thousands'] as const;
const digitsOf = (n: number): Counts => ({
  units: n % 10, tens: Math.floor(n / 10) % 10, hundreds: Math.floor(n / 100) % 10, thousands: Math.floor(n / 1000) % 10,
});

const bank: SessionTask[] = [];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) bank.push(...getSessionBranchTasks(m, b, p));
  }
}
const byId = (id: string) => bank.find((t) => t.id === id)!;

/** Tasks shaped like the station-3 redesign (the other job adds these fields; instructions here are test fixtures). */
const rep = (id: string, kind: string, numberA: number, correctAnswer: number, requiredCounts: Partial<Counts>, instructionHe: string) =>
  ({ id, type: 'representation', representationKind: kind, numberA, correctAnswer, requiredCounts, instructionHe, titleHe: '' }) as any;
const REDESIGN = [
  rep('s3_r_t1', 'read_write', 340, 340, { hundreds: 3, tens: 4 }, 'בנו 3 לבני מאה ו-4 לבני עשרת. איזה מספר בניתם? כתבו אותו.'),
  rep('s3_r_t2', 'compose_break', 340, 340, { hundreds: 2, tens: 14 }, 'בנו 3 לבני מאה ו-4 לבני עשרת. פרטו לבנת מאה אחת. איזה מספר בנוי עכשיו?'),
  rep('s3_r_t3', 'decompose', 450, 45, { tens: 45 }, 'בנו את המספר 450 רק מלבני עשרת. כמה לבני עשרת השתמשתם?'),
  rep('s3_r_t4', 'compose_break', 85, 85, { tens: 7, units: 15 }, 'בנו 8 לבני עשרת ו-5 לבני יחידה. פרטו לבנת עשרת אחת. איזה מספר בנוי עכשיו?'),
  rep('s3_r_t5', 'read_write', 506, 506, { hundreds: 5, units: 6 }, 'בנו 5 לבני מאה ו-6 לבני יחידה. איזה מספר בניתם?'),
  rep('s3_r_t6', 'compose_break', 506, 506, { hundreds: 4, tens: 10, units: 6 }, 'בנו 5 לבני מאה ו-6 לבני יחידה. פרטו לבנת מאה אחת. איזה מספר בנוי עכשיו?'),
  rep('s3_g_t1', 'read_write', 3400, 3400, { thousands: 3, hundreds: 4 }, 'בנו 3 לבני אלף ו-4 לבני מאה. איזה מספר בניתם?'),
  rep('s3_g_t2', 'compose_break', 3400, 3400, { thousands: 2, hundreds: 14 }, 'בנו 3 לבני אלף ו-4 לבני מאה. פרטו לבנת אלף אחת. איזה מספר בנוי עכשיו?'),
  rep('s3_g_t3', 'decompose', 4500, 45, { hundreds: 45 }, 'בנו את המספר 4,500 רק מלבני מאה. כמה לבני מאה השתמשתם?'),
  rep('s3_g_t4', 'compose_break', 5230, 5230, { thousands: 4, hundreds: 11, tens: 13 }, 'בנו 5 לבני אלף, 2 לבני מאה ו-3 לבני עשרת. פרטו לבנת אלף ולבנת מאה. איזה מספר בנוי עכשיו?'),
  rep('s3_g_t5', 'read_write', 6030, 6030, { thousands: 6, tens: 3 }, 'בנו 6 לבני אלף ו-3 לבני עשרת. איזה מספר בניתם?'),
  rep('s3_g_t6', 'compose_break', 6030, 6030, { thousands: 5, hundreds: 10, tens: 3 }, 'בנו 6 לבני אלף ו-3 לבני עשרת. פרטו לבנת אלף אחת. איזה מספר בנוי עכשיו?'),
  rep('s3_r_reinforce_1', 'read_write', 270, 270, { hundreds: 2, tens: 7 }, 'בנו 2 לבני מאה ו-7 לבני עשרת. איזה מספר בניתם?'),
  rep('s3_r_reinforce_2', 'decompose', 270, 27, { tens: 27 }, 'בנו את המספר 270 רק מלבני עשרת. כמה לבני עשרת השתמשתם?'),
  rep('s3_g_reinforce_1', 'read_write', 3600, 3600, { thousands: 3, hundreds: 6 }, 'בנו 3 לבני אלף ו-6 לבני מאה. איזה מספר בניתם?'),
  rep('s3_g_reinforce_2', 'decompose', 3600, 36, { hundreds: 36 }, 'בנו את המספר 3,600 רק מלבני מאה. כמה לבני מאה השתמשתם?'),
  rep('s7_r_t1', 'compose_group', 125, 125, { hundreds: 1, tens: 2, units: 5 }, 'בנו 12 לבני עשרת ו-5 לבני יחידה. קבצו 10 לבני עשרת. איזה מספר בנוי עכשיו?'),
  rep('s7_g_t1', 'compose_group', 2500, 2500, { thousands: 2, hundreds: 5 }, 'בנו 25 לבני מאה. קבצו פעמיים 10 לבני מאה. איזה מספר בנוי עכשיו?'),
];

const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const wrongHints = (h: SocraticHintResponse) => h.choices.filter((c) => !c.isCorrect).map((c) => c.feedbackHe ?? '');
const correctFeedback = (h: SocraticHintResponse) => h.choices.find((c) => c.isCorrect)?.feedbackHe ?? '';
const q = (task: any, counts: Counts = EMPTY, ctx?: StaticCardContext) => SocraticEngine.getSynchronousTaskHint(task, counts, ctx);

/** Board states a card can meet in one exercise. */
function statesOf(task: any): Counts[] {
  const out: Counts[] = [EMPTY, { units: 3, tens: 2, hundreds: 1, thousands: 0 }, { ...EMPTY, units: 12, tens: 1 }];
  if (typeof task.numberA === 'number') out.push(digitsOf(task.numberA));
  if (typeof task.numberA === 'number' && typeof task.numberB === 'number') {
    out.push(digitsOf(task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB));
    if (task.isSubtraction) {
      const a = digitsOf(task.numberA);
      const i = PLACES.findIndex((p) => a[p] < digitsOf(task.numberB)[p]);
      const from = PLACES.findIndex((p, j) => j > i && a[p] > 0);
      if (i >= 0 && from > i) out.push({ ...a, [PLACES[from]]: a[PLACES[from]] - 1, [PLACES[from - 1]]: a[PLACES[from - 1]] + 10 });
    }
  }
  if (task.requiredCounts) out.push({ ...EMPTY, ...task.requiredCounts });
  return out;
}
const CONTEXTS: StaticCardContext[] = [
  {},
  { shownKinds: ['borrow_check'] },
  { placeCuesShown: true },
  { placeCuesShown: true, shownKinds: ['place_cues'] },
  { placeCuesShown: true, shownKinds: ['place_cues', 'borrow_check'] },
];

describe('every wrong-option hint of stations 3–8 is a short guiding question (owner, 30.9.2026)', () => {
  const check = (where: string, card: SocraticHintResponse | null, bad: string[]) => {
    if (!card) return;
    const v = wrongHintViolation(card);
    if (v) bad.push(`${where}: ${v} — ${wrongHints(card).join(' | ')}`);
    for (const h of wrongHints(card)) {
      if (h.length > 100) bad.push(`${where}: too long for a short question — ${h}`);
      if (!/\?$/.test(h)) bad.push(`${where}: does not end with "?" — ${h}`);
    }
    if (!correctFeedback(card).startsWith('נכון מאוד!')) bad.push(`${where}: the right option's feedback — ${correctFeedback(card)}`);
  };

  it('every card the exercise computes, in every board state and at every level', () => {
    const bad: string[] = [];
    let seen = 0;
    for (const task of [...bank, ...REDESIGN]) {
      for (const counts of statesOf(task)) {
        for (const ctx of CONTEXTS) {
          const card = exerciseCard(task, counts, ctx);
          if (card) seen++;
          check(`${task.id} ${JSON.stringify(counts)} ${JSON.stringify(ctx)}`, card, bad);
        }
      }
    }
    expect(seen).toBeGreaterThan(1000);
    expect(bad).toEqual([]);
  });

  it('every live card of stations 3–7 (10 or more in a column; an empty board in subtraction; a deficit)', () => {
    const bad: string[] = [];
    const add = byId('s4_g_t1');
    const sub = byId('s5_g_t1');
    const live: [string, SocraticHintResponse | null][] = [
      ['units', SocraticEngine.analyzeLiveBoardState(add, 'regrouping_fluency', { ...EMPTY, units: 13, tens: 6, hundreds: 5, thousands: 1 })],
      ['tens', SocraticEngine.analyzeLiveBoardState(add, 'regrouping_fluency', { ...EMPTY, tens: 12, hundreds: 5, thousands: 1 })],
      ['hundreds', SocraticEngine.analyzeLiveBoardState(add, 'regrouping_fluency', { ...EMPTY, hundreds: 11, thousands: 1 })],
      ['empty board', SocraticEngine.analyzeLiveBoardState(sub, 'subtraction_regrouping', EMPTY)],
      // A deficit card is read off the board only for an exercise outside the banks.
      ['units deficit', SocraticEngine.analyzeLiveBoardState({ id: 'fixture_52', numberA: 52, numberB: 27, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, tens: 5, units: 2 })],
      ['tens deficit', SocraticEngine.analyzeLiveBoardState({ id: 'fixture_425', numberA: 425, numberB: 162, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, hundreds: 4, tens: 2, units: 5 })],
      ['hundreds deficit', SocraticEngine.analyzeLiveBoardState({ id: 'fixture_5240', numberA: 5240, numberB: 1800, isSubtraction: true }, 'subtraction_regrouping', { ...EMPTY, thousands: 5, hundreds: 2, tens: 4 })],
    ];
    for (const [where, card] of live) {
      expect(card, where).not.toBeNull();
      check(where, card, bad);
    }
    expect(bad).toEqual([]);
  });

  it('the session cards of מסמך 03 (s4_card … s8_card)', () => {
    const bad: string[] = [];
    for (const key of ['s4_card', 's5_card', 's6_card', 's7_card', 's8_card']) check(key, TASK_HINTS[key], bad);
    expect(bad).toEqual([]);
  });

  it('what a child of stations 3–8 is served is never replaced by the general card', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const task of [...bank, ...REDESIGN]) {
      for (const counts of statesOf(task)) {
        for (const ctx of CONTEXTS) {
          const card = q(task, counts, ctx);
          expect(card.questionHe, task.id).not.toBe('מה הצעד הבא שצריך לעשות בבית המספרים?');
          expect(wrongHintViolation(card), task.id).toBeNull();
        }
      }
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('Static card rejected'))).toEqual([]);
    warn.mockRestore();
  });

  it('a card whose wrong option is not a question is refused in stations 3–8, not in station 1', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // An id outside the banks falls back to a legacy card without hints.
    const s5 = q({ id: 's5_zz', type: 'unknown' });
    expect(s5.questionHe).toBe('מה הצעד הבא שצריך לעשות בבית המספרים?');
    expect(wrongHintViolation(s5)).toBeNull();
    const s8 = q({ id: 's8_zz', type: 'unknown' });
    expect(s8.questionHe).toBe(TASK_HINTS.s8_card.questionHe);
    const s1 = q({ id: 's1_zz', type: 'unknown' });
    expect(s1.questionHe).not.toBe('מה הצעד הבא שצריך לעשות בבית המספרים?');
    warn.mockRestore();
    expect(wrongHintViolation({ choices: [{ id: 'a', textHe: 'x', isCorrect: true, feedbackHe: 'נכון מאוד!' }, { id: 'b', textHe: 'y', isCorrect: false, feedbackHe: 'רמז: מחיקה משנה את המספר.' }] })).not.toBeNull();
    expect(wrongHintViolation({ choices: [{ id: 'b', textHe: 'y', isCorrect: false, feedbackHe: 'האם המספר ישתנה?' }] })).not.toBeNull();
    expect(wrongHintViolation({ choices: [{ id: 'b', textHe: 'y', isCorrect: false, feedbackHe: 'רמז: האם המספר ישתנה?' }] })).toBeNull();
  });

  it('station 1 keeps the cards the owner approved for it', () => {
    const t = { id: 's1_r_sub61', type: 'vertical_addition', isSubtraction: true, numberA: 61, numberB: 24 };
    const empty = SocraticEngine.analyzeLiveBoardState(t, 'subtraction_regrouping', EMPTY)!;
    expect(empty.choices.map((c) => c.feedbackHe)).toEqual([
      'נכון! גררו לבנים לבית המספרים עד שהוא מראה את המספר הראשון, ורק אז הוציאו ממנו.',
      'רמז: בחיסור לא בונים את שני המספרים. בונים את הראשון ומוציאים ממנו את השני.',
      'רמז: קודם מייצגים את המספר בלבנים, ורק אחר כך כותבים את התוצאה.',
    ]);
    // …and the same card in station 5 asks.
    const s5 = SocraticEngine.analyzeLiveBoardState(byId('s5_g_t1'), 'subtraction_regrouping', EMPTY)!;
    expect(wrongHints(s5)).toEqual(['רמז: האם בחיסור מוסיפים את המספר השני או מוציאים אותו?', 'רמז: בלי לבנים בבית המספרים, איך תמצאו את התוצאה?']);
  });
});

describe('the converted hints ask; the column and the blocks follow the exercise', () => {
  it('a borrow through zeros, without blocks (station 8, 4,000 − 1,562)', () => {
    expect(wrongHints(q(byId('s8_g_t5')))).toEqual([
      'רמז: כשפורטים אלף אחד, מה מקבלים: עשר מאות או עשר יחידות?',
      'רמז: האם יש בטור היחידות מספיק יחידות כדי לחסר?',
    ]);
  });

  it('the column\'s own card, with blocks (station 5, 5,432 − 2,118)', () => {
    expect(wrongHints(q(byId('s5_g_t1'), digitsOf(5432), { shownKinds: ['borrow_check'] }))).toEqual([
      'רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?',
      'רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?',
    ]);
  });

  it('10 or more in a column (station 4, 1,245 + 328)', () => {
    expect(wrongHints(q(byId('s4_g_t1'), digitsOf(1245)))).toEqual([
      'רמז: 10 לבני יחידה שוות לאיזו לבנה?',
      'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?',
    ]);
  });
});

describe('no card gives the answer away', () => {
  it('the new station-3 and station-7 tasks: the number the child writes is a secret, and no card shows it, in digits or in blocks', () => {
    expect(secretNumbersOf(REDESIGN.find((t) => t.id === 's3_r_t3'))).toEqual([45]); // 450 is on the screen; 45 is not ("450" does not hold it)
    expect(secretNumbersOf(REDESIGN.find((t) => t.id === 's3_g_reinforce_2'))).toEqual([36]);
    expect(secretNumbersOf(REDESIGN.find((t) => t.id === 's3_r_t5'))).toEqual([506]);
    expect(secretNumbersOf(REDESIGN.find((t) => t.id === 's7_g_t1'))).toEqual([2500]);
    // A number is on the screen only as a whole number, whichever field holds it.
    expect(secretNumbersOf(rep('x_45', 'decompose', 45, 45, { tens: 45 }, 'בנו את המספר 450 רק מלבני עשרת.'))).toEqual([45]);
    expect(secretNumbersOf(rep('x_450', 'decompose', 450, 450, { tens: 45 }, 'בנו את המספר 450 רק מלבני עשרת.'))).toEqual([]);
    for (const task of REDESIGN) {
      const secrets = secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n));
      expect(secrets.length, task.id).toBeGreaterThan(0);
      for (const counts of statesOf(task)) {
        const texts = textsOf(q(task, counts));
        expect(revealsSecret(texts, secrets), `${task.id} ${JSON.stringify(counts)}`).toBeNull();
        expect(revealsSecretInCounts(texts, secrets), `${task.id} ${JSON.stringify(counts)}`).toBeNull();
      }
    }
  });

  it('the bank tasks, at every level: never the result, a hidden digit or the number asked for', () => {
    for (const task of bank) {
      const secrets = secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n));
      for (const counts of statesOf(task)) {
        for (const ctx of CONTEXTS) {
          expect(revealsSecret(textsOf(q(task, counts, ctx)), secrets), `${task.id} ${JSON.stringify(counts)} ${JSON.stringify(ctx)}`).toBeNull();
        }
      }
    }
  });

  it('the new cards name no count of blocks at all', () => {
    for (const task of REDESIGN) {
      for (const counts of statesOf(task)) expect(revealsSecretInCounts(textsOf(q(task, counts)), [countsValueOf(task.requiredCounts)]), task.id).toBeNull();
    }
  });
});
const countsValueOf = (c: Partial<Counts>) => (c.units ?? 0) + (c.tens ?? 0) * 10 + (c.hundreds ?? 0) * 100 + (c.thousands ?? 0) * 1000;

describe('C1 — a number built, then a block broken (station 3)', () => {
  const card = (id: string) => q(REDESIGN.find((t) => t.id === id), { ...EMPTY, ...REDESIGN.find((t) => t.id === id).requiredCounts });

  it('the owner\'s wording, with a hundred broken into tens', () => {
    for (const id of ['s3_r_t2', 's3_r_t6']) {
      const c = card(id);
      expect(c.questionHe).toBe('נסו לחשוב: לפני הפריטה בניתם מספר. האם הפריטה שינתה אותו?');
      expect(c.choices.map((o) => [o.textHe, o.feedbackHe, o.isCorrect])).toEqual([
        ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', 'נכון מאוד! איזה מספר בניתם לפני הפריטה?', true],
        ['כן. עכשיו יש יותר לבנים, ולכן המספר גדל', 'רמז: מאיפה הגיעו לבני העשרת החדשות? האם הוספתם לבנים?', false],
        ['כן. עכשיו יש פחות לבני מאה, ולכן המספר קטן', 'רמז: מה קרה ללבנת המאה? מה קיבלתם במקומה?', false],
      ]);
      expect(c.cardKind).toBe('compose_break');
    }
  });

  it('85: a ten broken into units', () => {
    const c = card('s3_r_t4');
    expect(c.choices.map((o) => o.textHe)[2]).toBe('כן. עכשיו יש פחות לבני עשרת, ולכן המספר קטן');
    expect(wrongHints(c)).toEqual(['רמז: מאיפה הגיעו לבני היחידה החדשות? האם הוספתם לבנים?', 'רמז: מה קרה ללבנת העשרת? מה קיבלתם במקומה?']);
  });

  it('the green path: a thousand broken into hundreds (5,230 breaks a thousand first)', () => {
    for (const id of ['s3_g_t2', 's3_g_t4', 's3_g_t6']) {
      const c = card(id);
      expect(c.choices.map((o) => o.textHe)[2], id).toBe('כן. עכשיו יש פחות לבני אלף, ולכן המספר קטן');
      expect(wrongHints(c), id).toEqual(['רמז: מאיפה הגיעו לבני המאה החדשות? האם הוספתם לבנים?', 'רמז: מה קרה ללבנת האלף? מה קיבלתם במקומה?']);
    }
  });

  it('the bank tasks of today get it by their id', () => {
    for (const id of ['s3_r_t2', 's3_r_t4', 's3_r_t6', 's3_g_t2', 's3_g_t4', 's3_g_t6']) {
      expect(representationKindOf(byId(id)), id).toBe('compose_break');
      expect(q(byId(id), { ...EMPTY, ...byId(id).requiredCounts }).questionHe, id).toBe('נסו לחשוב: לפני הפריטה בניתם מספר. האם הפריטה שינתה אותו?');
    }
  });

  it('only once something is built: on an empty board no card says "בניתם" (owner, 30.9.2026)', () => {
    for (const task of [...REDESIGN.filter((t) => t.representationKind === 'compose_break' || t.representationKind === 'compose_group'),
      byId('s3_r_t2'), byId('s3_g_t4'), byId('s7_r_t1'), byId('s7_g_t1')]) {
      const empty = q(task, EMPTY);
      expect(empty.questionHe, task.id).not.toMatch(/בניתם|לפני הפריטה|לפני ההקבצה/);
      expect(empty.cardKind, task.id).toBeUndefined();
      expect(wrongHintViolation(empty), task.id).toBeNull();
      // One block placed is enough.
      expect(q(task, { ...EMPTY, hundreds: 1 }).questionHe, task.id).toMatch(/^נסו לחשוב: לפני (הפריטה|ההקבצה) בניתם מספר/);
    }
  });
});

describe('C2 — a number built from one kind of block (station 3)', () => {
  it('tens in a hundred (450 → 45, 270 → 27)', () => {
    for (const id of ['s3_r_t3', 's3_r_reinforce_2']) {
      const c = q(REDESIGN.find((t) => t.id === id));
      expect(c.questionHe, id).toBe('נסו לחשוב: כמה לבני עשרת שוות ללבנת מאה אחת?');
      expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
        ['10 לבני עשרת', 'נכון מאוד! בנו כל מאה מ-10 לבני עשרת. אחר כך ספרו את כל לבני העשרת.'],
        ['לבנת עשרת אחת', 'רמז: הניחו לבנת מאה בבית המספרים. פרטו אותה ללבני עשרת. כמה לבני עשרת קיבלתם?'],
        ['100 לבני עשרת', 'רמז: הניחו לבנת מאה בבית המספרים. פרטו אותה ללבני עשרת. כמה לבני עשרת קיבלתם?'],
      ]);
    }
  });

  it('the green path: hundreds in a thousand (4,500 → 45, 3,600 → 36)', () => {
    for (const id of ['s3_g_t3', 's3_g_reinforce_2']) {
      const c = q(REDESIGN.find((t) => t.id === id));
      expect(c.questionHe, id).toBe('נסו לחשוב: כמה לבני מאה שוות ללבנת אלף אחת?');
      expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
        ['10 לבני מאה', 'נכון מאוד! בנו כל אלף מ-10 לבני מאה. אחר כך ספרו את כל לבני המאה.'],
        ['לבנת מאה אחת', 'רמז: הניחו לבנת אלף בבית המספרים. פרטו אותה ללבני מאה. כמה לבני מאה קיבלתם?'],
        ['100 לבני מאה', 'רמז: הניחו לבנת אלף בבית המספרים. פרטו אותה ללבני מאה. כמה לבני מאה קיבלתם?'],
      ]);
    }
  });
});

describe('C3 — reading and writing a number with an empty column (station 3)', () => {
  it('506 and 6,030: the zero keeps the place; the card speaks of the place in the number, not of a box', () => {
    for (const task of [REDESIGN.find((t) => t.id === 's3_r_t5'), REDESIGN.find((t) => t.id === 's3_g_t5'), byId('s3_r_t5'), byId('s3_g_t5')]) {
      const c = q(task);
      expect(c.questionHe, task.id).toBe('נסו לחשוב: יש טור שאין בו לבנים. מה כותבים במספר בשביל הטור הזה?');
      expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
        ['כותבים 0', 'נכון מאוד! האפס שומר את המקום של הטור הריק.'],
        ['לא כותבים כלום וממשיכים', 'רמז: אם לא תכתבו כלום בשביל הטור הזה, איך תקראו את המספר?'],
        ['כותבים 1', 'רמז: כמה לבנים יש בטור הזה?'],
      ]);
    }
  });

  it('a number with no empty column inside (340, 270, 3,400, 3,600): which number is built', () => {
    for (const id of ['s3_r_t1', 's3_r_reinforce_1', 's3_g_t1', 's3_g_reinforce_1']) {
      expect(q(REDESIGN.find((t) => t.id === id)).questionHe, id).toBe('נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?');
      expect(q(byId(id)).questionHe, id).toBe('נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?');
    }
  });
});

describe('C4 — a digit in another column\'s box (stations 4–7)', () => {
  const C4 = 'נסו לחשוב: איך יודעים באיזו תיבה בשורת התוצאה כותבים כל ספרה?';

  it('the first card once the result row\'s place cues are on; then the exercise\'s own card', () => {
    for (const id of ['s4_g_t1', 's5_g_t1', 's6_r_t4', 's7_r_t5', 's7_r_t2']) {
      const t = byId(id);
      const built = digitsOf(t.numberA as number);
      expect(q(t, built, { placeCuesShown: true }).questionHe, id).toBe(C4);
      expect(q(t, built, { placeCuesShown: true, shownKinds: ['place_cues'] }).questionHe, id).not.toBe(C4);
      expect(q(t, built).questionHe, id).not.toBe(C4);
    }
    const c = q(byId('s4_g_t1'), EMPTY, { placeCuesShown: true });
    expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
      ['לכל טור יש תיבה משלו, מתחת לטור', 'נכון מאוד! כתבו כל ספרה בתיבה של הטור שלה.'],
      ['כותבים את הספרות לפי הסדר שבו מחשבים אותן', 'רמז: מתחת לאיזה טור נמצאת התיבה שבה כתבתם?'],
      ['כותבים כל ספרה בתיבה הפנויה הראשונה', 'רמז: לאיזה טור שייכת כל תיבה?'],
    ]);
    expect(c.cardKind).toBe('place_cues');
  });

  it('never in station 8 (no place-cue scaffold) nor on a station-3 task', () => {
    expect(q(byId('s8_g_t1'), EMPTY, { placeCuesShown: true }).questionHe).not.toBe(C4);
    expect(q(byId('s3_r_t5'), EMPTY, { placeCuesShown: true }).questionHe).not.toBe(C4);
  });
});

describe('C5 → the column\'s card, within one exercise (stations 5–6)', () => {
  const C5 = 'נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?';

  it('the first card asks what to check in every column; the next one names the column', () => {
    const t = byId('s5_g_t1'); // 5,432 − 2,118
    const built = digitsOf(5432);
    const first = q(t, built);
    expect(first.questionHe).toBe(C5);
    expect(first.cardKind).toBe('borrow_check');
    expect(first.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
      ['אם יש בטור מספיק לבנים כדי לחסר', 'נכון מאוד! מצאו את הטור שאין בו מספיק לבנים.'],
      ['כמה לבנים יש בבית המספרים כולו', 'רמז: בחיסור במאונך, האם מחסרים את כל המספר בבת אחת?'],
      ['אם יש בטור 10 לבנים או יותר', 'רמז: מתי מקבצים 10 לבנים, בחיבור או בחיסור? ומה בודקים בחיסור?'],
    ]);
    const second = q(t, built, { shownKinds: ['borrow_check'] });
    // The column, and not its count (owner, 30.9.2026): the child counts the blocks.
    expect(second.questionHe).toBe('נסו לחשוב: בתרגיל 5,432 − 2,118, בטור היחידות אין מספיק לבנים כדי לחסר 8 יחידות. מה עושים?');
    expect(second.cardKind).toBeUndefined();
  });

  it('through a zero too (station 6); never in station 8, where there are no blocks', () => {
    const t = byId('s6_r_t4'); // 300 − 142
    expect(q(t, digitsOf(300)).questionHe).toBe(C5);
    expect(q(t, digitsOf(300), { shownKinds: ['borrow_check'] }).questionHe).toBe('נסו לחשוב: בתרגיל 300 − 142, איך פורטים כשבטור העשרות יש אפס?');
    for (const task of bank.filter((x) => meetingOfTaskId(x.id) === 8)) expect(q(task).questionHe, task.id).not.toBe(C5);
  });

  it('a subtraction without a borrow never gets it', () => {
    expect(q(byId('s5_r_reinforce_1'), digitsOf(86)).questionHe).not.toBe(C5); // 86 − 34
  });
});

describe('C6 — station 7, error analysis', () => {
  it('"a student solved … and got …": how to find where he went wrong', () => {
    for (const id of ['s7_r_t5', 's7_g_t4']) {
      const t = byId(id);
      for (const counts of [EMPTY, digitsOf(t.numberA as number)]) {
        const c = q(t, counts);
        expect(c.questionHe, id).toBe('נסו לחשוב: איך מוצאים איפה התלמיד טעה?');
        expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
          ['פותרים את התרגיל בלבנים ומשווים לתוצאה שלו, טור אחר טור', 'נכון מאוד! חפשו את הטור שבו התוצאה שלכם שונה מהתוצאה שלו.'],
          ['מחפשים את הספרה הגדולה ביותר בתוצאה שלו', 'רמז: איך אפשר לדעת שספרה לא נכונה בלי לפתור את התרגיל?'],
          ['מוחקים את התוצאה שלו ומתחילים מחדש', 'רמז: אם תמחקו את התוצאה שלו, איך תמצאו איפה הוא טעה?'],
        ]);
      }
    }
  });
});

describe('C7 — blocks built one way, then grouped (station 7)', () => {
  it('12 tens and 5 units → 125: tens into a hundred', () => {
    for (const task of [REDESIGN.find((t) => t.id === 's7_r_t1'), byId('s7_r_t1')]) {
      const c = q(task, { ...EMPTY, hundreds: 1, tens: 2, units: 5 });
      expect(c.questionHe).toBe('נסו לחשוב: לפני ההקבצה בניתם מספר. האם ההקבצה שינתה אותו?');
      expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
        ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', 'נכון מאוד! איזה מספר בניתם לפני ההקבצה?'],
        ['כן. עכשיו יש פחות לבנים, ולכן המספר קטן', 'רמז: מה קרה ל-10 לבני העשרת? מה קיבלתם במקומן?'],
        ['כן. עכשיו יש לבנת מאה, ולכן המספר גדל', 'רמז: מאיפה הגיעה לבנת המאה? האם הוספתם לבנה?'],
      ]);
    }
  });

  it('25 hundreds grouped twice → 2,500: the plural the owner chose (two thousand blocks, 20 hundred blocks)', () => {
    for (const task of [REDESIGN.find((t) => t.id === 's7_g_t1'), byId('s7_g_t1')]) {
      const c = q(task, { ...EMPTY, thousands: 2, hundreds: 5 });
      expect(c.choices.map((o) => o.textHe)[2]).toBe('כן. עכשיו יש לבני אלף, ולכן המספר גדל');
      expect(wrongHints(c)).toEqual(['רמז: מה קרה ל-20 לבני המאה? מה קיבלתם במקומן?', 'רמז: מאיפה הגיעו לבני האלף? האם הוספתם לבנים?']);
      // The 20 is the blocks grouped, not the answer: 2,500 is never shown, in digits or in blocks.
      const secrets = secretNumbersOf(task);
      expect(secrets).toContain(2500);
      expect(revealsSecret(textsOf(c), secrets)).toBeNull();
      expect(revealsSecretInCounts(textsOf(c), secrets)).toBeNull();
    }
  });

  it('14 hundreds and 3 tens, grouped once → 1,430 (s7_g_reinforce_2): the singular, with the green block names', () => {
    const task = rep('s7_g_reinforce_2', 'compose_group', 1430, 1430, { thousands: 1, hundreds: 4, tens: 3 },
      'בנו בבית המספרים 14 לבני מאה ו-3 לבני עשרת. קבצו 10 לבני מאה ללבנת אלף אחת. איזה מספר מייצגות הלבנים לאחר ההקבצה?');
    const c = q(task, { ...EMPTY, thousands: 1, hundreds: 4, tens: 3 });
    expect(c.questionHe).toBe('נסו לחשוב: לפני ההקבצה בניתם מספר. האם ההקבצה שינתה אותו?');
    expect(c.choices.map((o) => [o.textHe, o.feedbackHe])).toEqual([
      ['לא. הלבנים השתנו, אבל המספר נשאר אותו מספר', 'נכון מאוד! איזה מספר בניתם לפני ההקבצה?'],
      ['כן. עכשיו יש פחות לבנים, ולכן המספר קטן', 'רמז: מה קרה ל-10 לבני המאה? מה קיבלתם במקומן?'],
      ['כן. עכשיו יש לבנת אלף, ולכן המספר גדל', 'רמז: מאיפה הגיעה לבנת האלף? האם הוספתם לבנה?'],
    ]);
    expect(revealsSecret(textsOf(c), secretNumbersOf(task))).toBeNull();
    // It is a grouping composition by its id too, until the task carries its kind.
    expect(representationKindOf({ id: 's7_g_reinforce_2' })).toBe('compose_group');
  });

  it('while 10 or more blocks wait in a column, the grouping card speaks first', () => {
    const c = q(REDESIGN.find((t) => t.id === 's7_r_t1'), { ...EMPTY, tens: 12, units: 5 });
    expect(c.questionHe).toBe('נסו לחשוב: בטור העשרות יש 10 לבנים או יותר. מה עושים?');
  });
});

describe('the task kind: the field of the redesign first, then the ids of today', () => {
  it('reads representationKind when the task has it', () => {
    expect(representationKindOf({ id: 'any', representationKind: 'decompose' })).toBe('decompose');
    expect(representationKindOf({ id: 's3_r_t1', representationKind: 'compose_break' })).toBe('compose_break');
    expect(representationKindOf({ id: 's3_r_t1' })).toBe('read_write');
    expect(representationKindOf({ id: 's3_r_t7' })).toBeNull();
    const task = rep('fixture_506', 'read_write', 506, 506, { hundreds: 5, units: 6 }, 'בנו 5 לבני מאה ו-6 לבני יחידה.');
    expect(q(task).questionHe).toBe('נסו לחשוב: יש טור שאין בו לבנים. מה כותבים במספר בשביל הטור הזה?');
  });

  it('a kind whose blocks cannot be read gets the card that marks nothing wrong', () => {
    expect(q({ id: 's3_r_t2', type: 'representation', numberA: 340 }).questionHe).toBe('נסו לחשוב: איך יודעים איזה מספר בנוי בבית המספרים?');
  });
});

describe('the store serves the levels in order (useWorkspaceStore)', () => {
  const ws = () => useWorkspaceStore.getState();
  const current = () => getActiveTasks(ws())[ws().standardTaskIdx];

  beforeEach(() => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline')); // the static card, at once
  });
  afterEach(() => {
    vi.restoreAllMocks();
    ws().closeHelp();
  });

  async function openCard(): Promise<SocraticHintResponse> {
    ws().openSocraticCard('hesitation_45s');
    await vi.waitFor(() => expect(ws().socraticPending).toBe(false));
    const card = ws().aiSocraticHint!;
    ws().closeHelp();
    return card;
  }

  function start(meeting: 4 | 5, id: string) {
    ws().resetWorkspace();
    approvePath('green_path');
    ws().initSession(meeting, false, 0);
    const idx = getActiveTasks(ws()).findIndex((t) => t.id === id);
    ws().initSession(meeting, false, idx);
    expect(current().id).toBe(id);
  }

  it('station 5: C5, then the column\'s card; the next exercise starts again at C5', async () => {
    start(5, 's5_g_t1');
    useWorkspaceStore.setState({ counts: digitsOf(5432) } as any);
    expect((await openCard()).questionHe).toBe('נסו לחשוב: לפני שמוציאים לבנים, מה בודקים בכל טור?');
    expect(ws().socraticCardKinds).toEqual({ taskId: 's5_g_t1', kinds: ['borrow_check'] });
    expect((await openCard()).questionHe).toContain('בטור היחידות אין מספיק לבנים כדי לחסר 8 יחידות');
    expect(staticCardContextFor(ws(), 's5_g_t1').shownKinds).toEqual(['borrow_check']);
    // Another exercise: nothing shown there yet.
    expect(staticCardContextFor(ws(), 's5_g_t2').shownKinds).toEqual([]);
    ws().initSession(5, false, ws().standardTaskIdx + 1);
    expect(ws().socraticCardKinds).toEqual({ taskId: null, kinds: [] });
  });

  it('station 4: C4 once the place cues are on, then the exercise\'s own card', async () => {
    start(4, 's4_g_t1');
    useWorkspaceStore.setState({ counts: digitsOf(1245), placeCuesShown: true } as any);
    expect((await openCard()).questionHe).toBe('נסו לחשוב: איך יודעים באיזו תיבה בשורת התוצאה כותבים כל ספרה?');
    const next = await openCard();
    expect(next.questionHe).not.toBe('נסו לחשוב: איך יודעים באיזו תיבה בשורת התוצאה כותבים כל ספרה?');
    expect(next.questionHe).toContain('בתרגיל 1,245 + 328');
    expect(ws().socraticCardKinds.kinds).toEqual(['place_cues']);
  });

  it('the engine\'s anchor is the card the child would see', async () => {
    const spy = vi.mocked(SocraticEngine.getSocraticHint);
    start(5, 's5_g_t1');
    useWorkspaceStore.setState({ counts: digitsOf(5432) } as any);
    await openCard();
    const monitoring = spy.mock.calls[0][7];
    expect(monitoring?.cardContext).toEqual({ placeCuesShown: false, shownKinds: [] });
    await openCard();
    expect(spy.mock.calls[1][7]?.cardContext).toEqual({ placeCuesShown: false, shownKinds: ['borrow_check'] });
  });

  /** What the database keeps: no nulls, no empty lists or objects. */
  const likeTheDatabase = (value: unknown): any => {
    const prune = (v: any): any => {
      if (Array.isArray(v)) {
        const out = v.map(prune).filter((x) => x !== undefined);
        return out.length ? out : undefined;
      }
      if (v && typeof v === 'object') {
        const out = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prune(x)]).filter(([, x]) => x !== undefined));
        return Object.keys(out).length ? out : undefined;
      }
      return v === null ? undefined : v;
    };
    return prune(JSON.parse(JSON.stringify(value)));
  };

  it('a reload keeps the cards already shown: C5 does not come back (owner, 30.9.2026)', async () => {
    const svc = firebaseSyncService as any;
    start(5, 's5_g_t1');
    useWorkspaceStore.setState({ counts: digitsOf(5432) } as any);
    await openCard(); // C5
    const saved = likeTheDatabase(svc.getSyncableWorkspaceState());
    expect(saved.socraticCardKinds).toEqual({ taskId: 's5_g_t1', kinds: ['borrow_check'] });
    ws().resetWorkspace();
    approvePath('green_path');
    ws().restoreSession(saved);
    expect(ws().socraticCardKinds).toEqual({ taskId: 's5_g_t1', kinds: ['borrow_check'] });
    expect((await openCard()).questionHe).toContain('בטור היחידות אין מספיק לבנים כדי לחסר 8 יחידות');
    // A snapshot of an exercise where nothing was shown (the database drops the empty list).
    ws().initSession(5, false, ws().standardTaskIdx + 1);
    const fresh = likeTheDatabase(svc.getSyncableWorkspaceState());
    expect(fresh.socraticCardKinds).toBeUndefined();
    ws().restoreSession(fresh);
    expect(ws().socraticCardKinds).toEqual({ taskId: null, kinds: [] });
  });
});

describe('the engine\'s card follows the same rule in stations 3–8 (owner, 30.9.2026)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const aiCard = (hint: string) => ({
    data: {
      error_category: 'procedural',
      guiding_question: 'בתרגיל 5,432 − 2,118, מה בודקים בטור היחידות?',
      options: [
        { id: 'opt_1', option_text: 'בודקים אם יש בטור מספיק לבנים כדי לחסר', feedback_text: 'נכון מאוד! בדקו את טור היחידות.', is_correct: true },
        { id: 'opt_2', option_text: 'מחסרים הפוך', feedback_text: hint, is_correct: false },
        { id: 'opt_3', option_text: 'מוסיפים לבנים חדשות', feedback_text: 'רמז: אם תוסיפו לבנים חדשות, האם המספר יישאר אותו מספר?', is_correct: false },
      ],
    },
  });
  const ask = (task: any, sessionNumber: number) =>
    SocraticEngine.fetchGroundedGeminiSocraticQuery({
      currentTask: task,
      targetNode: 'subtraction_regrouping',
      activeColumnName: 'יחידות',
      counts: digitsOf(5432),
      qMatrixAnchor: q(task, digitsOf(5432)),
      monitoring: { sessionNumber },
    });

  it('a wrong option that explains, or has no hint, is refused: the child gets the static card', async () => {
    const t = byId('s5_g_t1');
    for (const hint of ['רמז: בחיסור מחסרים את הספרה התחתונה מהעליונה.', 'לא נכון', '']) {
      vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard(hint));
      expect(await ask(t, 5), hint).toBeNull();
    }
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('רמז: מאיזו ספרה מחסרים: מהספרה העליונה או מהתחתונה?'));
    expect(await ask(t, 5)).not.toBeNull();
  });

  it('station 1 keeps the cards it has (the rule is for stations 3–8)', async () => {
    const t = { id: 's1_r_sub61', type: 'vertical_addition', isSubtraction: true, numberA: 5432, numberB: 2118 };
    vi.spyOn(SocraticEngine, 'callGeminiProxy').mockResolvedValue(aiCard('רמז: בחיסור מחסרים את הספרה התחתונה מהעליונה.'));
    expect(await ask(t, 1)).not.toBeNull();
  });
});

describe('no card of stations 3–7 says how many blocks a column holds (owner, 30.9.2026)', () => {
  // The digit beside each column is hidden there: the child counts. A card may
  // name a column and a threshold ("10 לבנים או יותר"), or the exercise's zero.
  const COUNT_STATEMENT = /בטור (היחידות|העשרות|המאות|האלפים) (יש|הצטברו|נשארו|אין אף)(?! 10 לבנים או יותר| אפס)/;
  const stationTasks = bank.filter((t) => { const m = meetingOfTaskId(t.id); return m !== null && m >= 3 && m <= 7; });

  it('in any board state, at any level', () => {
    const bad: string[] = [];
    for (const task of [...stationTasks, ...REDESIGN]) {
      const states = [...statesOf(task), { units: 13, tens: 12, hundreds: 11, thousands: 1 }, { ...EMPTY, tens: 14, units: 3 }, { ...EMPTY, hundreds: 12 }];
      for (const counts of states) {
        for (const ctx of CONTEXTS) {
          const card = q(task, counts, ctx);
          const texts = [card.questionHe, card.tts_text ?? '', ...card.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
          for (const t of texts) {
            if (COUNT_STATEMENT.test(t)) bad.push(`${task.id} ${JSON.stringify(counts)}: ${t}`);
            // A count of 11 or more is never a digit of the exercise, nor the 10
            // of a regrouping ("10 לבנים או יותר"): it can only be the board's.
            for (const p of PLACES) {
              const k = counts[p];
              if (k > 10 && new RegExp(`(^|[^0-9,])${k} (לבנים|יחידות|עשרות|מאות|אלפים)`).test(t)) bad.push(`${task.id} ${JSON.stringify(counts)}: ${t}`);
            }
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('station 8 is unchanged: its card still reads the exercise\'s digits', () => {
    expect(q(byId('s8_g_t4')).questionHe).toMatch(/בטור (היחידות|העשרות|המאות|האלפים) (יש|אין אף)/);
  });
});

describe('the session cards of מסמך 03 offer actions in the impersonal present (owner, 30.9.2026)', () => {
  it('s4_card … s8_card: every option opens with a present plural verb', () => {
    for (const key of ['s4_card', 's5_card', 's6_card', 's7_card', 's8_card']) {
      for (const c of TASK_HINTS[key].choices) expect(c.textHe.split(' ')[0], `${key}: ${c.textHe}`).toMatch(/ים$/);
    }
    expect(TASK_HINTS.s6_card.choices.map((c) => c.textHe)).toEqual([
      'פורטים תחילה לבנת מאה אחת לעשר עשרות בטור העשרות',
      'מתעלמים מהאפס וממשיכים לטור הבא',
      'מוסיפים עשרת אחת לטור היחידות ללא פריטה',
    ]);
  });
});
