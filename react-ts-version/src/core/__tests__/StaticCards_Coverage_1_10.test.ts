import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { SocraticEngine, TASK_HINTS, absentAidViolation, cardFrameOf, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import {
  secretNumbersOf,
  revealsSecret,
  wrongHintViolation,
  meetingOfTaskId,
  STATIC_CARD_KINDS,
  type StaticCardContext,
} from '@/infrastructure/services/staticSocraticCards';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';
import { approvePath } from '@/test/approvedPath';

/**
 * Owner's decisions of 1.10.2026 (via the coordinator): the static cards are
 * the base and the boundaries of the engine — a ready card for every
 * situation, chosen by situation, trigger and level, each with its frame
 * (situation, frameLevel, intentHe). D8: meeting 8's first card is general,
 * the second names the column. D9: C6's second card checks the student's work
 * column by column without naming the wrong column. D10: station 1's wrong
 * options get "רמז:" and one guiding question, the right one "נכון מאוד!".
 */

type Counts = { units: number; tens: number; hundreds: number; thousands: number };
const EMPTY: Counts = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
const C = (c: Partial<Counts>): Counts => ({ ...EMPTY, ...c });
const PLACES = ['units', 'tens', 'hundreds', 'thousands'] as const;
const digitsOf = (n: number): Counts => ({ units: n % 10, tens: Math.floor(n / 10) % 10, hundreds: Math.floor(n / 100) % 10, thousands: Math.floor(n / 1000) % 10 });

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) {
  for (const p of ['green_path', 'remediation_path'] as const) {
    bank.push(...getSessionTasks(m, p));
    if (m <= 7) for (const b of ['reinforcement', 'challenge'] as const) bank.push(...getSessionBranchTasks(m, b, p));
  }
}
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const q = (task: any, counts: Counts = EMPTY, ctx?: StaticCardContext) => SocraticEngine.getSynchronousTaskHint(task, counts, ctx);
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const right = (h: SocraticHintResponse) => h.choices.find((c) => c.isCorrect)!;
const wrongs = (h: SocraticHintResponse) => h.choices.filter((c) => !c.isCorrect);

/** Board states a card can meet in one exercise. */
function statesOf(task: any): Counts[] {
  const out: Counts[] = [EMPTY, C({ units: 3, tens: 2, hundreds: 1 }), C({ units: 12, tens: 1 }), C({ tens: 14, units: 3 }), C({ hundreds: 12 })];
  if (typeof task.numberA === 'number') out.push(digitsOf(task.numberA));
  if (typeof task.numberA === 'number' && typeof task.numberB === 'number') {
    out.push(digitsOf(task.isSubtraction ? task.numberA - task.numberB : task.numberA + task.numberB));
    out.push(digitsOf(task.numberA + (task.isSubtraction ? 10 : 0)));
  }
  if (task.requiredCounts) out.push(C(task.requiredCounts));
  return out;
}

/** Contexts a card can meet: levels, triggers, typed digits, a hidden board. */
const CONTEXTS: StaticCardContext[] = [
  {},
  { shownKinds: ['borrow_check', 'borrow', 'carry', 's8_check', 'skeleton', 'which_number', 'compose_break', 'compose_group', 'decompose', 'read_write_zero', 'error_analysis', 'error_analysis_2', 'steps', 'flexible', 'crowded', 's1_card', 's1_crowded', 's1_deficit', 's1_after_break', 'place_slip', 'add_start', 'sub_start'] },
  { trigger: 'consecutive_errors_4', focusColumn: 'tens', answerDigits: { units: '3', tens: '6' } },
  { trigger: 'repeated_errors', answerDigits: { units: '0', tens: '4', hundreds: '4' }, blocksRemoved: true },
  { trigger: 'hesitation_45s', memoryCircles: { tens: '1', hundreds: '9', units: '10' }, conversionsDone: ['units'] },
  { trigger: 'consecutive_undos_3' },
  { boardHidden: true },
  { blocksRemoved: false, conversionDone: false, shownKinds: ['build_first', 'missing_part', 'place_slip'] },
];

/** The situations the 1.10.2026 work added: their cards are held to the rule in full (one question per hint). */
const NEW_SITUATIONS = new Set([
  's1_crowded_no_button', 's1_after_break', 'extra_break', 'write_result_boxes', 'stray_blocks', 'group_action', 'borrow_source',
  'build_from_words', 'digit_column', 'borrow_from_box', 'took_too_many', 'break_action', 'board_hidden', 'place_slip',
  'count_not_number', 'read_with_ten_or_more', 'write_digits', 'number_after_grouping_digits', 'count_in_tens', 'zero_position',
  'second_representation', 'flexible_even_tens', 'steps_progress', 'steps_add', 'steps_remove', 'steps_not_enough',
  'check_student_columns', 'one_number_missing', 'build_both_numbers', 'carry_record', 'carry_column_write', 'add_column',
  'carry_forgotten', 'subtract_after_borrow', 'subtract_column', 'check_each_column', 'skeleton_missing_addend',
  'skeleton_missing_addend_column', 'skeleton_hidden_minuend', 'skeleton_hidden_minuend_column', 'extra_break_sub',
  's1_restore_start', 'build_first_number', 'missing_part_value',
]);

describe('every card the selection serves, in every state and context', () => {
  const served: { task: SessionTask; counts: Counts; ctx: StaticCardContext; card: SocraticHintResponse }[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const task of bank) {
    if (task.type === 'session1_intro') continue;
    for (const counts of statesOf(task)) for (const ctx of CONTEXTS) served.push({ task, counts, ctx, card: q(task, counts, ctx) });
  }
  warn.mockRestore();

  it('covers the banks', () => {
    expect(served.length).toBeGreaterThan(5000);
  });

  it('carries its frame: a situation id, a level 1–3 and a Hebrew intent', () => {
    const bad: string[] = [];
    for (const { task, counts, ctx, card } of served) {
      const where = `${task.id} ${JSON.stringify(counts)} ${JSON.stringify(ctx)}`;
      if (!card.situation || !/^[a-z0-9_]+$/.test(card.situation)) bad.push(`${where}: situation ${card.situation}`);
      if (![1, 2, 3].includes(card.frameLevel as number)) bad.push(`${where}: level ${card.frameLevel}`);
      if (!card.intentHe || !/[א-ת]/.test(card.intentHe)) bad.push(`${where}: intent ${card.intentHe}`);
      const f = cardFrameOf(card);
      if (f.situation !== card.situation || f.level !== card.frameLevel) bad.push(`${where}: frame ${JSON.stringify(f)}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('never refused by the iron rule: the general card is never what a child of stations 1 and 3–8 gets', () => {
    const general = q({ id: 's5_zz', type: 'unknown' }).questionHe;
    const bad = served.filter(({ card }) => card.questionHe === general).map(({ task, counts, ctx }) => `${task.id} ${JSON.stringify(counts)} ${JSON.stringify(ctx)}`);
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('every wrong option is "רמז:" and a question; the right one opens "נכון מאוד!"; the new cards ask ONE question', () => {
    const bad: string[] = [];
    for (const { task, card } of served) {
      if (wrongHintViolation(card)) bad.push(`${task.id}: ${wrongHintViolation(card)} — ${card.questionHe}`);
      if (!(right(card).feedbackHe ?? '').startsWith('נכון מאוד!')) bad.push(`${task.id}: ${right(card).feedbackHe}`);
      if (NEW_SITUATIONS.has(card.situation ?? '')) {
        for (const w of wrongs(card)) {
          const h = w.feedbackHe ?? '';
          if ((h.match(/\?/g) ?? []).length !== 1 || h.length > 100) bad.push(`${task.id} ${card.situation}: ${h}`);
        }
        if (!card.questionHe.trim().endsWith('?')) bad.push(`${task.id} ${card.situation}: ${card.questionHe}`);
        if (card.choices.filter((c) => c.isCorrect).length !== 1 || card.choices.length !== 3) bad.push(`${task.id} ${card.situation}: options`);
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('never shows what the child must find: the result, a hidden digit, the number asked for', () => {
    const bad: string[] = [];
    for (const { task, counts, ctx, card } of served) {
      const secrets = secretNumbersOf(task).filter((n) => ![10, 100, 1000].includes(n));
      const leaked = revealsSecret(textsOf(card), secrets);
      if (leaked !== null) bad.push(`${task.id} ${JSON.stringify(counts)} ${JSON.stringify(ctx)}: ${leaked}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('meeting 8 names no blocks, no number house, no trash and no grouping button', () => {
    const bad = served
      .filter(({ task }) => meetingOfTaskId(task.id) === 8)
      .filter(({ card }) => absentAidViolation(textsOf(card), 8) !== null)
      .map(({ task, card }) => `${task.id}: ${card.questionHe}`);
    expect(bad).toEqual([]);
  });

  it('stations 3–7 never say how many blocks a column holds', () => {
    const COUNT = /בטור (היחידות|העשרות|המאות|האלפים) (יש|הצטברו|נשארו|אין אף)(?! 10 לבנים או יותר| אפס)/;
    const bad: string[] = [];
    for (const { task, counts, card } of served) {
      const m = meetingOfTaskId(task.id);
      if (m === null || m < 3 || m > 7) continue;
      for (const t of textsOf(card)) {
        if (COUNT.test(t)) bad.push(`${task.id}: ${t}`);
        for (const p of PLACES) {
          const k = counts[p];
          if (k > 10 && new RegExp(`(^|[^0-9,])${k} (לבנים|יחידות|עשרות|מאות|אלפים)`).test(t)) bad.push(`${task.id} ${JSON.stringify(counts)}: ${t}`);
        }
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('station 1\'s new cards name no column in their question and state no count', () => {
    const bad: string[] = [];
    for (const { task, card } of served) {
      if (meetingOfTaskId(task.id) !== 1 || !NEW_SITUATIONS.has(card.situation ?? '')) continue;
      if (card.situation === 'digit_column') continue; // the child picks the column among the three, like the deficit card
      if (/טור ה(יחידות|עשרות|מאות|אלפים)/.test(card.questionHe)) bad.push(`${task.id}: ${card.questionHe}`);
      for (const t of textsOf(card)) {
        // Digits are the exercise's own numbers (on the screen) or the 10 of a regrouping.
        const nums = (t.match(/\d+(?:,\d{3})*/g) ?? []).filter((x) => x !== '10');
        const screen = `${task.instructionHe} ${(task as any).numberA ?? ''} ${(task as any).numberB ?? ''}`;
        for (const x of nums) if (!screen.includes(x)) bad.push(`${task.id}: "${x}" — ${t}`);
      }
    }
    expect([...new Set(bad)].slice(0, 10)).toEqual([]);
  });

  it('every new kind is one the store keeps (STATIC_CARD_KINDS)', () => {
    for (const { card } of served) if (card.cardKind) expect(STATIC_CARD_KINDS).toContain(card.cardKind);
  });
});

describe('station 1 (D10 and the meeting-1 situations)', () => {
  const t347 = () => byId('s1_target_347');

  it('the cards of station 1 follow the hint rule (D10)', () => {
    for (const id of ['s1_sandbox_controlled', 's1_target_347', 's1_r_words703', 's1_r_value368', 's1_r_words482', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      const card = TASK_HINTS[id];
      expect(wrongHintViolation(card), id).toBeNull();
      expect(right(card).feedbackHe, id).toMatch(/^נכון מאוד!/);
      expect(textsOf(card).join(' '), id).not.toMatch(/↺/);
      expect(card.cardKind, id).toBe('s1_card');
    }
    const crowded = SocraticEngine.analyzeLiveBoardState(byId('s1_t8'), 'regrouping_fluency', C({ hundreds: 7, tens: 10, units: 7 }))!;
    expect(wrongs(crowded).map((c) => c.feedbackHe)).toEqual([
      'רמז: אם תמחקו לבנים, האם המספר יישאר אותו מספר?',
      'רמז: כמה לבנים צריך כדי לקבל לבנה אחת בטור שמשמאל?',
    ]);
  });

  it('10 or more hundreds: there is no button there — not "click the button at the top of that column"', () => {
    const card = q(byId('s1_r_words703'), C({ hundreds: 12, units: 3 }));
    expect(card.questionHe).toBe('נסו לחשוב: באחד הטורים יש 10 לבנים או יותר, ואין בראשו הכפתור "קבצו 10". מה עושים?');
    expect(card.situation).toBe('s1_crowded_no_button');
  });

  it('347: empty → build first; built → its own card; broken once → what became of the ten; then reading 10+ blocks; broken twice → undo', () => {
    expect(q(t347(), EMPTY).situation).toBe('board_empty_build_first');
    expect(q(t347(), C({ hundreds: 3, tens: 4, units: 7 })).questionHe).toBe('נסו לחשוב: מה קורה בבית המספרים כשפורטים עשרת אחת?');
    const after = q(t347(), C({ hundreds: 3, tens: 3, units: 17 }));
    expect(after.questionHe).toBe('נסו לחשוב: מה קרה לעשרת שפרטתם?');
    // The phrase rule the analysts proposed (for the owner): no 347, no "נשאר / לא משתנה / נשמר".
    expect(textsOf(after).join(' ')).not.toMatch(/347|נשאר|לא משתנה|נשמר/);
    // The correct feedback never sends the child to break a second ten.
    expect(right(after).feedbackHe).not.toMatch(/לחצו על לבנת עשרת/);
    const second = q(t347(), C({ hundreds: 3, tens: 3, units: 17 }), { shownKinds: ['s1_after_break'] });
    expect(second.situation).toBe('read_with_ten_or_more');
    expect(textsOf(second).join(' ')).not.toMatch(/347|נשאר|לא משתנה|נשמר|טור ה/);
    expect(q(t347(), C({ hundreds: 3, tens: 2, units: 27 })).situation).toBe('extra_break');
    // Built by hand in its final form (the break not done): build again and break yourselves.
    expect(q(t347(), C({ hundreds: 3, tens: 3, units: 17 }), { conversionDone: false }).situation).toBe('convert_yourselves');
    // The second card on 347 built: the click on a ten block (frame 3).
    const l2 = q(t347(), C({ hundreds: 3, tens: 4, units: 7 }), { shownKinds: ['s1_card'] });
    expect(l2.situation).toBe('break_as_asked');
    expect(l2.frameLevel).toBe(3);
  });

  it('713 + 94: empty → build first; grouped → what goes in each box; one number only → the other; more than both → stray', () => {
    const t = byId('s1_t8');
    expect(q(t, EMPTY).situation).toBe('board_empty_build_first');
    const boxes = q(t, C({ hundreds: 8, units: 7 }));
    expect(boxes.questionHe).toBe('נסו לחשוב: מה כותבים בכל תיבה בשורת התוצאה?');
    expect(boxes.choices.map((c) => c.textHe)).toContain('רק בתיבות של טורים שיש בהם לבנים'); // 807 has a 0 inside
    expect(q(t, C({ hundreds: 7, tens: 1, units: 3 })).situation).toBe('one_number_missing');
    expect(q(t, C({ hundreds: 9, units: 7 })).situation).toBe('stray_blocks');
    expect(q(t, C({ hundreds: 7, units: 12 })).questionHe).toBe('באחד הטורים יש 10 לבנים או יותר. מה עושים?');
    expect(q(t, C({ hundreds: 7, tens: 10, units: 7 }), { shownKinds: ['s1_crowded'] }).situation).toBe('group_action');
  });

  it('26 grouped: what goes in each box — without the option that would be right for 26', () => {
    const card = q(byId('s1_r_group26'), C({ tens: 2, units: 6 }));
    expect(card.situation).toBe('write_result_boxes');
    expect(card.choices.map((c) => c.textHe)).not.toContain('רק בתיבות של טורים שיש בהם לבנים');
  });

  it('61 − 24: above the first number, a ten from the tool box, between, below after taking away, done', () => {
    const t = byId('s1_r_sub61');
    expect(q(t, C({ tens: 8, units: 5 })).situation).toBe('build_only_first');
    expect(q(t, C({ tens: 6, units: 11 })).situation).toBe('borrow_from_box');
    expect(q(t, C({ tens: 5, units: 7 })).situation).toBe('check_before_taking');
    expect(q(t, C({ tens: 2, units: 7 })).situation).toBe('check_before_taking');
    expect(q(t, C({ tens: 2, units: 7 }), { blocksRemoved: true }).situation).toBe('took_too_many');
    expect(q(t, C({ tens: 3, units: 7 })).situation).toBe('s1_finished_taking_away');
    expect(q(t, C({ tens: 3, units: 7 }), { shownKinds: ['s1_card'] }).situation).toBe('write_result_boxes');
    expect(q(t, C({ tens: 6, units: 1 }), { shownKinds: ['s1_deficit'] }).situation).toBe('borrow_source');
  });

  it('the second cards of 703, 482 and 368', () => {
    expect(q(byId('s1_r_words703'), C({ hundreds: 7 }), { shownKinds: ['s1_card'] }).situation).toBe('build_from_words');
    expect(q(byId('s1_r_words703'), C({ hundreds: 7, units: 3 }), { shownKinds: ['s1_card'] }).situation).toBe('write_result_boxes');
    const v = q(byId('s1_r_value368'), C({ hundreds: 3, tens: 6, units: 8 }), { shownKinds: ['s1_card'] });
    expect(v.situation).toBe('digit_column');
    expect(right(v).textHe).toBe('בטור העשרות');
    expect(textsOf(v).join(' ')).not.toMatch(/60/);
  });
});

describe('stations 3 and 7: the board against the instruction, and the second cards', () => {
  it('the number house hidden: the first card shows it again; the second is the exercise\'s own', () => {
    const t = byId('s3_r_t1');
    const c = q(t, C({ hundreds: 3, tens: 4 }), { boardHidden: true });
    expect(c.situation).toBe('board_hidden');
    expect(c.frameLevel).toBe(3);
    expect(right(c).textHe).toBe('לוחצים על הכפתור "הצגת בית המספרים" שבסרגל העליון');
    expect(q(t, C({ hundreds: 3, tens: 4 }), { boardHidden: true, shownKinds: ['show_board'] }).situation).toBe('which_number_built');
    // Not in meeting 8 (no board there) nor in station 1 (it is never hidden).
    expect(q(byId('s8_g_t1'), EMPTY, { boardHidden: true }).situation).toBe('check_each_column');
  });

  it('506 built as 5 hundreds and 6 tens: which column each part goes to; the second card names the column', () => {
    const t = byId('s3_r_t5');
    const l1 = q(t, C({ hundreds: 5, tens: 6 }));
    expect(l1.situation).toBe('place_slip');
    expect(l1.questionHe).toBe('נסו לחשוב: איך יודעים לאיזה טור שייך כל חלק של המספר?');
    const l2 = q(t, C({ hundreds: 5, tens: 6 }), { shownKinds: ['place_slip'] });
    expect(l2.questionHe).toBe('נסו לחשוב: האם ההנחיה מבקשת לבנים בטור העשרות?');
    expect(right(l2).feedbackHe).toBe('נכון מאוד! בנו בטור היחידות אותו מספר של לבנים.');
    expect(textsOf(l2).join(' ')).not.toMatch(/506/);
    // Before the break of s3_r_t6 (5 hundreds and 6 units): the slip first — breaking a block of a wrong board does not mend it.
    expect(q(byId('s3_r_t6'), C({ hundreds: 5, tens: 6 }), { conversionDone: false, pendingConversion: 'tens' }).situation).toBe('place_slip');
  });

  it('a block broken too many, more blocks than asked, and 450 written for 45 tens', () => {
    expect(q(byId('s3_r_t2'), C({ hundreds: 1, tens: 24 })).situation).toBe('extra_break');
    expect(q(byId('s3_r_t1'), C({ hundreds: 3, tens: 5 })).situation).toBe('stray_blocks');
    const n = q(byId('s3_r_t3'), C({ tens: 45 }), { answerDigits: { units: '0', tens: '5', hundreds: '4' } });
    expect(n.situation).toBe('count_not_number');
    expect(right(n).textHe).toBe('בכמה לבני עשרת השתמשתם');
    expect(textsOf(n).join(' ')).not.toMatch(/(^|[^0-9])45(?![0-9])/);
  });

  it('the second cards of C1, C2, C3, C7 and "which number is built"', () => {
    const c1 = q(byId('s3_r_t2'), C({ hundreds: 2, tens: 14 }), { shownKinds: ['compose_break'] });
    expect(c1.situation).toBe('read_with_ten_or_more');
    expect(c1.cardKind).toBe('compose_break_2');
    expect(q(byId('s3_r_t3'), C({ tens: 45 }), { shownKinds: ['decompose'] }).situation).toBe('count_in_tens');
    const c3 = q(byId('s3_r_t5'), C({ hundreds: 5, units: 6 }), { shownKinds: ['read_write_zero'] });
    expect(right(c3).textHe).toBe('בין ספרת המאות לספרת היחידות');
    const c3g = q(byId('s3_g_t5'), C({ thousands: 6, tens: 3 }), { shownKinds: ['read_write_zero'] });
    expect(right(c3g).textHe).toBe('בין ספרת האלפים לספרת העשרות');
    // 6,030 written 603: the zero at the end.
    const end = q(byId('s3_g_t5'), C({ thousands: 6, tens: 3 }), { shownKinds: ['read_write_zero'], answerDigits: { units: '3', tens: '0', hundreds: '6' } });
    expect(end.questionHe).toBe('נסו לחשוב: בטור היחידות אין לבנים. איפה כותבים בשבילו 0 במספר?');
    // 340 written 34 after "which number is built".
    const w = q(byId('s3_r_t1'), C({ hundreds: 3, tens: 4 }), { shownKinds: ['which_number'], answerDigits: { units: '4', tens: '3' } });
    expect(w.situation).toBe('zero_position');
    const digits = q(byId('s3_r_t1'), C({ hundreds: 3, tens: 4 }), { shownKinds: ['which_number'] });
    expect(digits.situation).toBe('write_digits');
    expect(digits.choices.map((c) => c.textHe)).toContain('כותבים רק את הטורים שיש בהם לבנים');
    // C7, 125: no zero in it — the option that skips empty columns would be right there.
    const c7 = q(byId('s7_r_t1'), C({ hundreds: 1, tens: 2, units: 5 }), { shownKinds: ['compose_group'] });
    expect(c7.cardKind).toBe('compose_group_2');
    expect(c7.choices.map((c) => c.textHe)).not.toContain('כותבים רק את הטורים שיש בהם לבנים');
  });

  it('two ways (the "הוספת ייצוג" button), and 150 with an even number of tens', () => {
    expect(q(byId('s3_g_t7'), C({ thousands: 2, hundreds: 1 }), { shownKinds: ['flexible'] }).situation).toBe('second_representation');
    const even = q(byId('s7_r_t7'), C({ hundreds: 1, tens: 5 }));
    expect(even.situation).toBe('flexible_even_tens');
    expect(right(even).textHe).toBe('פורטים לבנת עשרת אחת לעשר לבני יחידה');
  });

  it('the two-step exercises: the steps, the step not yet done, and not enough hundreds to remove (audit C29)', () => {
    const r6 = byId('s7_r_t6'); // 340, + 2 hundreds, − 3 tens → 510
    expect(r6.instructionHe).toContain('הוסיפו 2 מאות, ואז הסירו 3 עשרות');
    const c29 = q(r6, C({ hundreds: 5, tens: 4 }), { trigger: 'repeated_errors' });
    expect(c29.situation).toBe('steps_progress');
    expect(right(c29).textHe).not.toMatch(/סופרים את הלבנים/);
    expect(q(r6, C({ hundreds: 5, tens: 4 }), { shownKinds: ['steps'] }).questionHe).toBe('נסו לחשוב: האם כבר הסרתם את שלוש העשרות שההנחיה מבקשת?');
    expect(q(r6, C({ hundreds: 3, tens: 4 }), { shownKinds: ['steps'] }).questionHe).toBe('נסו לחשוב: האם כבר הוספתם את שתי המאות שההנחיה מבקשת?');
    const g5 = byId('s7_g_t5'); // 3,400, + 1,000, − 600 → 3,800
    expect(g5.instructionHe).toContain('הוסיפו אלף אחד, ואז הסירו 6 מאות');
    expect(q(g5, C({ thousands: 4, hundreds: 4 })).situation).toBe('steps_not_enough');
    // After the right decomposition: no "group the hundreds" card on the way.
    expect(SocraticEngine.analyzeLiveBoardState(g5, 'flexible_regrouping', C({ thousands: 3, hundreds: 14 }))).toBeNull();
    expect(q(g5, C({ thousands: 3, hundreds: 14 })).situation).toBe('steps_progress');
    // At the end, 2 thousands and 18 hundreds is 3,800 too: then group.
    expect(q(g5, C({ thousands: 2, hundreds: 18 })).situation).toBe('crowded_column');
    for (const counts of [C({ hundreds: 5, tens: 4 }), C({ hundreds: 3, tens: 4 }), C({ hundreds: 3, tens: 1 })]) {
      for (const ctx of [{}, { shownKinds: ['steps' as const] }]) expect(textsOf(q(r6, counts, ctx)).join(' ')).not.toMatch(/510/);
    }
  });

  it('error analysis: C6, then column by column without naming the wrong column (D9), then the addition card', () => {
    const t = byId('s7_g_t4');
    const counts = C({ tens: 1 });
    expect(q(t, counts).cardKind).toBe('error_analysis');
    const d9 = q(t, counts, { shownKinds: ['error_analysis'] });
    expect(d9.situation).toBe('check_student_columns');
    expect(textsOf(d9).join(' ')).not.toMatch(/טור (העשרות|המאות|האלפים)/);
    expect(q(t, counts, { shownKinds: ['error_analysis', 'error_analysis_2'] }).questionHe).toContain('בתרגיל 4,857 + 3,568');
  });
});

describe('stations 4–7, vertical exercises: the column the child is at', () => {
  it('stray blocks (audit C13, C14): take them out — not "group the hundreds into a thousand"', () => {
    for (const [id, counts] of [['s4_r_t4', C({ hundreds: 12, tens: 3, units: 7 })], ['s4_r_t1', C({ hundreds: 12, tens: 6, units: 5 })]] as const) {
      const card = q(byId(id), counts);
      expect(card.questionHe, id).toBe('נסו לחשוב: יש בטור המאות לבנים שהתרגיל לא צריך. מה עושים?');
      expect(right(card).textHe, id).not.toMatch(/מקבצים/);
    }
    // 7 hundreds and 13 units on the way (713 built that way) is not stray: grouping fixes it.
    expect(q(byId('s4_r_t4'), C({ hundreds: 4, units: 16 })).situation).toBe('crowded_column');
  });

  it('one number on the board, and a wrong board after a second wrong answer', () => {
    expect(q(byId('s4_g_t1'), digitsOf(1245)).situation).toBe('one_number_missing');
    expect(q(byId('s4_g_t1'), digitsOf(328)).situation).toBe('one_number_missing');
    expect(q(byId('s4_g_t1'), C({ thousands: 1, hundreds: 4, tens: 8, units: 3 }), { trigger: 'repeated_errors' }).situation).toBe('build_both_numbers');
  });

  it('a carry forgotten: the digit typed is one less where a ten came in', () => {
    const t = byId('s4_g_t1'); // 1,245 + 328 = 1,573: the tens get a ten from the units
    const card = q(t, C({ thousands: 1, hundreds: 5, tens: 7, units: 3 }), { trigger: 'consecutive_errors_4', focusColumn: 'tens', answerDigits: { units: '3', tens: '6' } });
    expect(card.situation).toBe('carry_forgotten');
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 1,245 + 328, מה מחברים בטור העשרות?');
    expect(right(card).textHe).toBe('את שתי הספרות של הטור, ועוד העשרת שעברה מטור היחידות');
  });

  it('the carry card names the trigger\'s column, or the first carry column not yet converted', () => {
    const t = byId('s4_g_t5'); // 5,678 + 2,453: carries in units, tens and hundreds
    expect(q(t, C({ thousands: 5, hundreds: 6, tens: 7, units: 1 }), { trigger: 'consecutive_errors_4', focusColumn: 'hundreds' }).questionHe)
      .toBe('נסו לחשוב: בתרגיל 5,678 + 2,453, בטור המאות מצטברות 10 מאות או יותר. מה עושים איתן?');
    expect(q(t, C({ thousands: 5, hundreds: 6, tens: 7, units: 1 }), { conversionsDone: ['units'] }).questionHe)
      .toContain('בטור העשרות מצטברות 10 עשרות או יותר');
  });

  it('the carry family\'s second card follows the stage: building, the button, the memory circle', () => {
    const t = byId('s4_g_t1');
    expect(q(t, C({ thousands: 1, hundreds: 2, tens: 4 }), { shownKinds: ['carry'] }).situation).toBe('build_both_numbers');
    expect(q(t, C({ thousands: 1, hundreds: 5, tens: 6, units: 13 }), { shownKinds: ['crowded'] }).situation).toBe('group_action');
    // 1,245 built, 8 units added and grouped; the tens of 328 not yet in, and no 1 above the tens.
    const rec = q(t, C({ thousands: 1, hundreds: 2, tens: 5, units: 3 }), { shownKinds: ['carry'], conversionsDone: ['units'], memoryCircles: {} });
    expect(rec.situation).toBe('carry_record');
  });

  it('a choice task gets no grouping card; a missing result digit gets the exercise\'s own card', () => {
    expect(q(byId('s4_g_t7'), C({ thousands: 3, hundreds: 4, tens: 5, units: 15 })).situation).toBe('small_change_compare');
    expect(q(byId('s5_g_t7'), C({ thousands: 7, hundreds: 6, tens: 15, units: 1 })).situation).toBe('small_change_compare');
    expect(q(byId('s4_r_t7'), C({ units: 1 })).situation).toBe('carry_column');
    expect(right(q(byId('s4_r_t7'), C({ hundreds: 4, tens: 7, units: 3 }))).textHe).toBe('כותבים בתיבה הריקה את מספר הלבנים שבטור שלה');
    // 400 − 156 (מסמך 03 §3.6): C5, then the zero card.
    expect(q(byId('s6_r_t7'), digitsOf(400)).cardKind).toBe('borrow_check');
    expect(q(byId('s6_r_t7'), digitsOf(400), { shownKinds: ['borrow_check'] }).questionHe).toBe('נסו לחשוב: בתרגיל 400 − 156, איך פורטים כשבטור העשרות יש אפס?');
  });

  it('subtraction with blocks: a ten from the tool box, a block broken too many, too much taken away, the click', () => {
    expect(q(byId('s5_r_t2'), C({ tens: 5, units: 13 })).situation).toBe('borrow_from_box');
    expect(q(byId('s5_g_t1'), C({ thousands: 5, hundreds: 3, tens: 12, units: 12 })).situation).toBe('extra_break_sub');
    expect(q(byId('s5_g_t1'), C({ thousands: 3, hundreds: 3, tens: 1, units: 2 }), { blocksRemoved: true }).situation).toBe('took_too_many');
    expect(q(byId('s5_r_t2'), C({ tens: 5, units: 3 }), { shownKinds: ['borrow_check', 'borrow'] }).situation).toBe('break_action');
    // a − b with a column of 10 or more cannot be written: group it first.
    expect(q(byId('s6_r_t7'), C({ hundreds: 1, tens: 14, units: 4 })).situation).toBe('extra_break_sub');
    // 53 − 18 with 3 tens and 5 units is a − b: the result row, not a second borrow.
    expect(q(byId('s5_r_t2'), C({ tens: 3, units: 5 }), { shownKinds: ['borrow_check'] }).situation).toBe('write_after_take_away');
  });
});

describe('skeletons: what to build, and the column (owner, 1.10.2026)', () => {
  it('a hidden addend digit: from the known number, add up to the result\'s digit', () => {
    const t = byId('s7_r_t3'); // 3▢6 + 271 = 657, the tens hidden (8)
    const l1 = q(t, EMPTY);
    expect(l1.situation).toBe('skeleton_missing_addend');
    expect(right(l1).textHe).toBe('בונים את 271, ובכל טור מוסיפים לבנים עד שמגיעים לספרה של התוצאה');
    const l2 = q(t, EMPTY, { shownKinds: ['skeleton'] });
    expect(l2.questionHe).toBe('נסו לחשוב: בטור העשרות, כמה צריך להוסיף ל-7 כדי לקבל 5 בספרת התוצאה?');
    expect(right(l2).textHe).toBe('מוסיפים ל-7 עד שמגיעים ל-15, וסופרים כמה הוספתם');
    expect(textsOf(l2).join(' ')).not.toMatch(/(^|[^0-9])8([^0-9]|$)/);
  });

  it('every addend skeleton: the column card is true, and none of its wrong options is the answer', () => {
    const adds = bank.filter((t) => (t as any).hiddenDigits?.a?.length && !t.isSubtraction);
    expect(adds.length).toBeGreaterThan(5);
    for (const t of adds) {
      const a = t.numberA as number;
      const b = t.numberB as number;
      for (const p of (t as any).hiddenDigits.a as (typeof PLACES[number])[]) {
        const card = q(t, EMPTY, { shownKinds: ['skeleton'], trigger: 'consecutive_errors_4', focusColumn: p });
        if (card.situation !== 'skeleton_missing_addend_column') continue;
        const h = Math.floor(a / 10 ** PLACES.indexOf(p)) % 10;
        const target = Number(/עד שמגיעים ל-(\d+)/.exec(right(card).textHe)![1]);
        const start = Number(/ל-(\d+)/.exec(card.questionHe)![1]) + (/ועוד 1 כדי/.test(card.questionHe) ? 1 : 0);
        expect(start + h, `${t.id} ${p}`).toBe(target);
        expect((a + b) % 10 ** (PLACES.indexOf(p) + 1) >= 0).toBe(true);
        // "smaller from larger" is offered only where it is wrong.
        const ql = card.choices.find((c) => c.textHe === 'מחסרים את הספרה הקטנה מהגדולה');
        if (ql) expect(Math.abs((target % 10) - start), `${t.id} ${p}`).not.toBe(h);
      }
    }
  });

  it('a hidden first number of a subtraction: work backwards; the second card names the column', () => {
    const g3 = q(byId('s7_g_t3'), EMPTY); // 5,▢▢▢ − 2,847 = 2,159
    expect(right(g3).textHe).toBe('בונים את 2,159, ומחזירים לבית המספרים את 2,847');
    expect(textsOf(g3).join(' ')).toContain('בתיבות הריקות');
    const r7 = q(byId('s5_r_t7'), EMPTY, { shownKinds: ['skeleton'] }); // 4▢2 − 128 = 314
    expect(r7.questionHe).toBe('נסו לחשוב: טור היחידות היה צריך עשרת אחת. איך מגלים כמה עשרות היו בטור העשרות לפני שהיא עברה?');
    expect(textsOf(r7).join(' ')).not.toMatch(/442/);
    const s8 = q(byId('s8_g_t7'), EMPTY); // meeting 8, no blocks
    expect(right(s8).textHe).toBe('מחברים את 2,438 ואת 1,562');
    expect(absentAidViolation(textsOf(s8), 8)).toBeNull();
  });
});

describe('meeting 8 (D8): general first, then the column the child is at', () => {
  it('the first card names no column; the second names the column', () => {
    const add = q(byId('s8_g_t1'), EMPTY);
    expect(add.situation).toBe('check_each_column');
    expect(add.questionHe).not.toMatch(/טור ה/);
    expect(q(byId('s8_g_t1'), EMPTY, { shownKinds: ['s8_check'] }).questionHe).toContain('בטור היחידות');
    const sub = q(byId('s8_g_t3'), EMPTY);
    expect(right(sub).textHe).toBe('אם הספרה העליונה גדולה מהתחתונה או שווה לה');
  });

  it('audit C30: 1,245 + 328, the units done, the 1 above the tens — the tens, not the units again', () => {
    const card = q(byId('s8_g_t1'), EMPTY, { shownKinds: ['s8_check'], trigger: 'hesitation_45s', answerDigits: { units: '3' }, memoryCircles: { tens: '1' } });
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 1,245 + 328, מה מחברים בטור העשרות?');
  });

  it('three undos in a row (the guessing loop): מסמך 03\'s meeting-8 card, grounded in the exercise', () => {
    const card = q(byId('s8_g_t1'), EMPTY, { trigger: 'consecutive_undos_3', answerDigits: { units: '3' } });
    expect(card.situation).toBe('guessing_loop');
    expect(card.questionHe).toContain('כיצד תפתרו את התרגיל');
    expect(card.questionHe).toContain('1,245');
  });

  it('audit C32: 4,000 − 1,562 with the circles 3, 9, 9 and 10 written — subtract from the circle, not the zeros again', () => {
    const card = q(byId('s8_g_t5'), EMPTY, { shownKinds: ['s8_check'], memoryCircles: { thousands: '3', hundreds: '9', tens: '9', units: '10' }, answerDigits: {} });
    expect(card.situation).toBe('subtract_after_borrow');
    expect(card.questionHe).toContain('בטור היחידות');
    expect(textsOf(card).join(' ')).not.toMatch(/איך פורטים כש/);
  });

  it('no conversion and the units done: the tens, not "which column do you start from"', () => {
    const card = q(byId('s8_r_t1'), EMPTY, { shownKinds: ['s8_check'], answerDigits: { units: '5' } }); // 142 + 23 = 165
    expect(card.questionHe).toBe('נסו לחשוב: בתרגיל 142 + 23, מה מחברים בטור העשרות?');
  });
});

describe('the store records the new kinds, and the next card of the exercise is the next level', () => {
  const ws = () => useWorkspaceStore.getState();
  const current = () => getActiveTasks(ws())[ws().standardTaskIdx];
  beforeEach(() => {
    vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
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

  it('station 4: 10 or more units, then the button', async () => {
    ws().resetWorkspace();
    approvePath('green_path');
    ws().initSession(4, false, 0);
    const idx = getActiveTasks(ws()).findIndex((t) => t.id === 's4_g_t1');
    ws().initSession(4, false, idx);
    expect(current().id).toBe('s4_g_t1');
    useWorkspaceStore.setState({ counts: C({ thousands: 1, hundreds: 5, tens: 6, units: 13 }) } as any);
    expect((await openCard()).situation).toBe('crowded_column');
    expect(ws().socraticCardKinds.kinds).toContain('crowded');
    expect((await openCard()).situation).toBe('group_action');
  });
});

describe('the analysts\' remaining rows (1.10.2026, second pass)', () => {
  it('an empty addition board builds first, in stations 1 and 4–7; the second card names what is built', () => {
    for (const id of ['s4_g_t1', 's4_r_t7', 's1_t8']) {
      expect(q(byId(id), EMPTY).situation, id).toBe('board_empty_build_first');
      expect(q(byId(id), EMPTY).cardKind, id).toBe('build_first');
      expect(q(byId(id), EMPTY, { shownKinds: ['build_first'] }).situation, id).toBe('build_both_numbers');
    }
    // Error analysis keeps C6 first; skeletons keep their own card.
    expect(q(byId('s7_r_t5'), EMPTY).cardKind).toBe('error_analysis');
    expect(q(byId('s7_r_t3'), EMPTY).situation).toBe('skeleton_missing_addend');
  });

  it('station 1: both numbers of 806 − 351 built (11 hundreds) — what is built in subtraction, not "no button"', () => {
    expect(q(byId('s1_r_sub806'), C({ hundreds: 11, tens: 5, units: 7 })).situation).toBe('build_only_first');
    // An addition with 10 or more hundreds keeps the no-button card.
    expect(q(byId('s1_r_words703'), C({ hundreds: 12, units: 3 })).situation).toBe('s1_crowded_no_button');
  });

  it('station 1, 347: a hundred broken — undo the break, not "group the 10 or more"', () => {
    const t = byId('s1_target_347');
    for (const counts of [C({ hundreds: 2, tens: 14, units: 7 }), C({ hundreds: 2, tens: 13, units: 17 })]) {
      const card = q(t, counts);
      expect(card.situation, JSON.stringify(counts)).toBe('extra_break');
      expect(textsOf(card).join(' ')).not.toMatch(/347|טור ה/);
    }
    // Built and not yet broken, and broken as asked: unchanged.
    expect(q(t, C({ hundreds: 3, tens: 4, units: 7 })).cardKind).toBe('s1_card');
    expect(q(t, C({ hundreds: 3, tens: 3, units: 17 })).situation).toBe('s1_after_break');
  });

  it('station 1: a subtraction finished with a block broken too many — group it (the meeting-1 card, no column named)', () => {
    const c = q(byId('s1_r_sub806'), C({ hundreds: 4, tens: 4, units: 15 }));
    expect(c.questionHe).toBe('באחד הטורים יש 10 לבנים או יותר. מה עושים?');
    expect(q(byId('s1_r_sub806'), C({ hundreds: 4, tens: 4, units: 15 }), { shownKinds: ['s1_crowded'] }).situation).toBe('group_action');
    // On the way (after a break, before taking away) 10 or more is still the goal.
    expect(q(byId('s1_r_sub61'), C({ tens: 5, units: 11 })).situation).not.toBe('s1_crowded');
  });

  it('station 1, 26: blocks deleted, added, or the result built by hand — back to the blocks the exercise started with', () => {
    const t = byId('s1_r_group26');
    for (const [counts, ctx] of [[C({ units: 8 }), {}], [C({ units: 30 }), {}], [C({ tens: 2, units: 6 }), { conversionDone: false }], [EMPTY, {}]] as const) {
      const card = q(t, counts, ctx);
      expect(card.situation, JSON.stringify(counts)).toBe('s1_restore_start');
      expect(card.questionHe).not.toMatch(/טור ה|\d/);
    }
    // Grouped with the button: what goes in each box.
    expect(q(t, C({ tens: 2, units: 6 })).situation).toBe('write_result_boxes');
    expect(q(t, C({ tens: 2, units: 6 }), { conversionDone: true }).situation).toBe('write_result_boxes');
    // The 26 units it starts with: the "10 or more" card.
    expect(q(t, C({ units: 26 })).questionHe).toBe('באחד הטורים יש 10 לבנים או יותר. מה עושים?');
  });

  it('station 1, 703 / 482 built otherwise: how many blocks in each column, then which column each part goes to', () => {
    const t = byId('s1_r_words703');
    const l1 = q(t, C({ hundreds: 7, tens: 3 }));
    expect(l1.situation).toBe('build_from_words');
    expect(l1.cardKind).toBe('s1_card');
    const l2 = q(t, C({ hundreds: 7, tens: 3 }), { shownKinds: ['s1_card'] });
    expect(l2.situation).toBe('place_slip');
    expect(l2.questionHe).not.toMatch(/טור ה/);
    expect(q(t, C({ hundreds: 7, tens: 3 }), { shownKinds: ['s1_card', 'place_slip'] }).situation).toBe('build_from_words');
    // A miscount (702): no place slip — how many blocks in each column.
    expect(q(t, C({ hundreds: 7, units: 2 }), { shownKinds: ['s1_card'] }).situation).toBe('build_from_words');
    // Built right: the exercise's own card, then the boxes.
    expect(q(t, C({ hundreds: 7, units: 3 })).cardKind).toBe('s1_card');
    expect(q(byId('s1_r_words482'), C({ hundreds: 2, tens: 8, units: 4 })).situation).toBe('build_from_words');
  });

  it('subtraction, less than the first number and nothing taken away: which number is built', () => {
    for (const [id, counts] of [['s5_r_t2', C({ tens: 5 })], ['s5_r_t2', C({ tens: 1, units: 8 })], ['s1_r_sub61', C({ tens: 2, units: 4 })], ['s6_g_t3', C({ thousands: 3 })]] as const) {
      const card = q(byId(id), counts, { blocksRemoved: false });
      expect(card.situation, `${id} ${JSON.stringify(counts)}`).toBe('build_first_number');
    }
    const c = q(byId('s5_r_t2'), C({ tens: 5 }), { blocksRemoved: false });
    expect(c.questionHe).toBe('נסו לחשוב: בתרגיל 53 − 18, איזה מספר בונים בבית המספרים?');
    expect(right(c).textHe).toBe('רק את המספר הראשון, 53');
    // Taking away under way: the check before taking; too much: the comparison per column.
    expect(q(byId('s5_r_t2'), C({ tens: 4, units: 3 }), { blocksRemoved: true }).situation).toBe('check_before_taking');
    expect(q(byId('s5_r_t2'), C({ tens: 2, units: 3 }), { blocksRemoved: true }).situation).toBe('took_too_many');
    // Without the store's field: as before.
    expect(q(byId('s5_r_t2'), C({ tens: 5 })).situation).toBe('check_before_taking');
  });

  it('two ways of 2,100 with another number on the board: which number is built', () => {
    const t = byId('s3_g_t7');
    expect(q(t, C({ thousands: 2 })).situation).toBe('which_number_built');
    expect(q(t, C({ thousands: 2, hundreds: 1 })).situation).toBe('flexible_second_way');
    expect(q(t, C({ thousands: 1, hundreds: 11 })).situation).toBe('flexible_second_way');
  });

  it('160 = 100 + ?: 6 written for 60, or the second card — what the tens of the missing part are worth', () => {
    const t = byId('s3_r_t7');
    expect(q(t, C({ hundreds: 1, tens: 6 })).situation).toBe('missing_part');
    expect(q(t, C({ hundreds: 1, tens: 6 })).cardKind).toBe('missing_part');
    const typed6 = q(t, C({ hundreds: 1, tens: 6 }), { answerDigits: { units: '6' } });
    expect(typed6.situation).toBe('missing_part_value');
    expect(textsOf(typed6).join(' ')).not.toMatch(/(^|[^0-9])60(?![0-9])/);
    expect(q(t, C({ hundreds: 1, tens: 6 }), { shownKinds: ['missing_part'] }).situation).toBe('missing_part_value');
  });
});
