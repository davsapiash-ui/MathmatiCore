import { describe, it, expect } from 'vitest';
import { getSessionTasks, SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';
import { EMPTY_COUNTS, getValue, type Place, type PlaceCounts } from '@/core/placeValue';
import { emptyColumnConversions, useWorkspaceStore } from '@/application/useWorkspaceStore';
import { approvePath } from '@/test/approvedPath';
import { answerFilled, fmt, guideTicksNow, stickyBuildValue, taskGuide, type GuideTickState } from '@/core/taskGuide';
import { instructionLines } from '@/core/instructionLines';
import { session1Checklist } from '@/core/session1Checklist';

/**
 * The learner's task zone (owner, 8.10.2026: the wording proposal for the
 * learner screens and the task-zone design spec, approved as recommended):
 * every exercise of stations 1 and 3–7 has a heading topic where one is
 * approved, one goal line, the steps ("מה עושים:"), and the done sentences.
 * Tick rule (proposal §ג): a step says the instruction was carried out, never
 * that the answer is right.
 */

const banks = (): { meeting: number; task: SessionTask }[] => {
  const out = SESSION1_TASKS.map((task) => ({ meeting: 1, task }));
  for (const meeting of [3, 4, 5, 6, 7] as const)
    for (const path of ['remediation_path', 'green_path'] as const) for (const task of getSessionTasks(meeting, path)) out.push({ meeting, task });
  for (const [m, byPath] of Object.entries(SESSION_BRANCH_TASKS))
    for (const kinds of Object.values(byPath as unknown as Record<string, Record<string, SessionTask[]>>))
      for (const list of Object.values(kinds)) for (const task of list) out.push({ meeting: Number(m), task });
  return out;
};

const state = (over: Partial<GuideTickState> = {}): GuideTickState => ({
  sessionNumber: 1,
  isASD: false,
  counts: { ...EMPTY_COUNTS },
  answerDigits: {},
  operandDigits: { a: {}, b: {} },
  probeAnswer: '',
  q3Reps: [],
  conversionsByColumn: emptyColumnConversions(),
  takeAwayTrack: null,
  builtTrack: null,
  checklist: null,
  ...over,
});
const c = (x: Partial<PlaceCounts>): PlaceCounts => ({ ...EMPTY_COUNTS, ...x });
const byId = (id: string) => banks().find((b) => b.task.id === id)!;

describe('every exercise of stations 1 and 3–7 has a guide; stations 2 and 8 keep the PRD instruction', () => {
  it('a guide for each, with at most four numbered steps, and no step without words', () => {
    const all = banks();
    expect(all.length).toBeGreaterThan(80);
    for (const { meeting, task } of all) {
      const g = taskGuide(task, meeting)!;
      expect(g, task.id).toBeTruthy();
      expect(g.steps.length, task.id).toBeLessThanOrEqual(4);
      for (const st of g.steps) if (st.tick.kind !== 'checklist') expect(st.label.trim(), task.id).not.toBe('');
    }
    expect(taskGuide(getSessionTasks(8, 'green_path')[0], 8)).toBeNull();
    expect(taskGuide(SESSION1_TASKS[0], 2)).toBeNull();
  });

  it('the topic is never the teacher\'s exercise title (PRD Module 14 §ב)', () => {
    for (const { meeting, task } of banks()) {
      const t = taskGuide(task, meeting)!.topicHe;
      if (t) expect(t, task.id).not.toBe(task.titleHe);
    }
  });

  it('the approved topics: one for every exercise of stations 4–6, and the station-1 list', () => {
    for (const { meeting, task } of banks()) {
      const t = taskGuide(task, meeting)!.topicHe;
      if (meeting === 4) expect(t, task.id).toBe('מחברים במאונך');
      if (meeting === 5 || meeting === 6) expect(t, task.id).toBe('מחסרים במאונך');
    }
    expect(SESSION1_TASKS.map((t) => taskGuide(t, 1)!.topicHe)).toEqual([
      'מכירים את הלבנים',
      'פורטים לבנה ללבנים קטנות',
      'בונים את המספר 305',
      'מבטלים פעולה ומנקים',
      'ממילים לספרות',
      'מוצאים את ערך הספרה',
      'ממילים לספרות',
      'מקבצים לבני יחידה לעשרות',
      'בודקים אם המספר משתנה',
      'מחברים בעזרת הלבנים',
      'מחסרים בעזרת הלבנים',
      'מחסרים בעזרת הלבנים',
    ]);
    // No topic of station 6 or of 703 speaks of the zero (owner, 9.10.2026: no hint at the zero).
    for (const { meeting, task } of banks()) if (meeting === 6 || task.id === 's1_r_words703') expect(taskGuide(task, meeting)!.topicHe ?? '', task.id).not.toMatch(/אפס/);
  });

  it('the representative exercises read as the proposal writes them', () => {
    const s5 = taskGuide(byId('s5_r_t2').task, 5)!;
    expect(s5.goalHe).toBe('פתרו במאונך: 53 − 18.');
    expect(s5.steps.map((s) => s.label)).toEqual(['בנו את המחוסר בבית המספרים', 'הוציאו מבית המספרים את הכמות הנדרשת', 'כתבו את התוצאה בשורת התוצאה']);
    expect(s5.steps[1].subs).toEqual([
      'אם בטור אין מספיק לבנים, אפשר לפרוט לבנה מהטור שמשמאלו: לחצו עליה או גררו אותה אל אותו טור.',
      'אחרי שפרטתם, רשמו בעיגולי הזיכרון כמה לבנים יש עכשיו בכל טור שהשתנה.',
    ]);
    expect(s5.correctHe).toBe('נכון! ‏53 − 18 = 35, וגם בבית המספרים נשארו 35.');
    const s4 = taskGuide(byId('s4_r_t2').task, 4)!;
    expect(s4.steps.map((s) => s.label)).toEqual(['בנו בבית המספרים את 128 ואת 35', 'כתבו את התוצאה בשורת התוצאה']);
    expect(s4.correctHe).toBe('נכון! ‏128 + 35 = 163, וגם בבית המספרים בניתם 163.');
    const s3 = taskGuide(byId('s3_r_t2').task, 3)!;
    expect(s3.topicHe).toBe('פורטים לבנת מאה');
    expect(s3.goalHe).toBe('איזה מספר מייצגות הלבנים לאחר הפריטה?');
    expect(s3.steps.map((s) => s.label)).toEqual(['בנו בבית המספרים 3 לבני מאה ו-4 לבני עשרת', 'פרטו לבנת מאה אחת לעשר לבני עשרת', 'כתבו בשורת התוצאה איזה מספר מייצגות הלבנים עכשיו']);
    expect(s3.correctHe).toBe('נכון! הלבנים מסודרות אחרת, אבל המספר נשאר 340.');
    const s7 = taskGuide(byId('s7_r_t3').task, 7)!;
    expect(s7.topicHe).toBe('מגלים ספרה חסרה');
    expect(s7.steps.map((s) => s.label)).toEqual(['גלו את הספרה בעזרת הלבנים', 'כתבו אותה בתיבה הריקה']);
    expect(s7.correctHe).toBe('נכון! הספרה החסרה היא 8: ‏386 + 271 = 657.');
  });

  it('station 1: the goal, the steps and the condition lines are the instruction\'s own lines (one source, PRD 7.15 Module 14 §ב)', () => {
    for (const task of SESSION1_TASKS) {
      const g = taskGuide(task, 1)!;
      const shown = [g.goalHe, ...g.steps.flatMap((s) => (s.label ? [`${s.label}.`, ...(s.subs ?? [])] : []))];
      expect(shown, task.id).toEqual(task.instructionHe.split('\n'));
    }
    // A checklist step shows the checklist's label: it is the instruction's line, without its full stop.
    for (const id of ['s1_sandbox_controlled', 's1_decompose_hundred', 's1_build_305', 's1_undo_trash', 's1_target_347']) {
      const task = SESSION1_TASKS.find((t) => t.id === id)!;
      const labels = session1Checklist(id, { counts: { ...EMPTY_COUNTS }, blocksAddedCount: 0, hasUngrouped: false, undoCount: 0, hasClearedBoard: false })!.map((i) => i.label);
      expect(labels.map((l) => `${l}.`), id).toEqual(task.instructionHe.split('\n').slice(1));
    }
    const t8 = taskGuide(SESSION1_TASKS.find((t) => t.id === 's1_t8'), 1)!;
    expect(t8.goalHe).toBe('פתרו: 713 + 94.');
    expect(t8.steps.map((s) => s.label)).toEqual(['בנו בבית המספרים את 713 ואת 94', 'כתבו את התוצאה בשורת התוצאה']);
    expect(t8.steps[0].subs).toEqual(['כשמצטברות 10 לבנים בטור, לחצו על הכפתור "קבצו 10" שבראש הטור.', 'רשמו את ההמרה בעיגול הזיכרון שמעל הטור שאליו עברה הלבנה החדשה.']);
  });
});

describe('nothing in the guide gives the answer before "ממשיכים"', () => {
  it('the goal and the steps never name the number the learner writes (representation exercises)', () => {
    for (const { meeting, task } of banks()) {
      // Skeletons show their result by design: the answer is the hidden digits, which no line names.
      if (task.type !== 'representation') continue;
      const g = taskGuide(task, meeting)!;
      const text = [g.topicHe ?? '', g.goalHe ?? '', ...g.steps.flatMap((s) => [s.label, ...(s.subs ?? [])])].join(' ');
      const answer = typeof task.correctAnswer === 'number' ? task.correctAnswer : null;
      if (answer === null) continue;
      // A building step may name the number built (368, 160); never the one written, when they differ.
      if (answer === task.numberA && !task.representationKind && meeting === 1) continue;
      const re = new RegExp(`(^|[^0-9,])(${fmt(answer)}|${answer})(?![0-9,]*[0-9])`);
      if (task.representationKind === 'read_write') continue; // the number is said in words; digits are the answer
      expect(re.test(text), `${task.id}: ${text}`).toBe(false);
    }
  });

  it('"נכון! …" is said only after the check (judgeStandardTask), never in the guide block', () => {
    for (const { meeting, task } of banks()) {
      const g = taskGuide(task, meeting)!;
      if (task.id === 's1_target_347') continue; // the PRD's own box (Module 14 §ב, task 9)
      expect(g.doneNoteHe ?? '', task.id).not.toMatch(/נכון/);
      expect(g.goalHe ?? '', task.id).not.toMatch(/נכון/);
    }
  });
});

describe('tick rule (proposal §ג): carried out, not right', () => {
  it('the writing step ticks when the boxes are filled — a wrong number too', () => {
    const { task } = byId('s1_r_words703');
    const g = taskGuide(task, 1)!;
    const ticks = guideTicksNow(g, task, state({ answerDigits: { hundreds: '7', tens: '3', units: '0' } }));
    expect(ticks).toEqual([false, true]);
  });

  it('a building step that names the number ticks only on that board; 702 does not tick 703', () => {
    const { task } = byId('s1_r_words703');
    const g = taskGuide(task, 1)!;
    expect(guideTicksNow(g, task, state({ counts: c({ hundreds: 7, units: 2 }) }))[0]).toBe(false);
    expect(guideTicksNow(g, task, state({ counts: c({ hundreds: 6, tens: 10, units: 3 }) }))[0]).toBe(true);
  });

  it('the minuend built stays built while blocks are taken away (takeAwayTrack); taking away never ticks', () => {
    const { task } = byId('s5_r_t2');
    const g = taskGuide(task, 5)!;
    const s = state({ sessionNumber: 5, counts: c({ tens: 3, units: 5 }), takeAwayTrack: { taskId: task.id, held: true } });
    expect(guideTicksNow(g, task, s)).toEqual([true, false, false]);
  });

  it('a break step ticks on the board after it, with the break made by the blocks', () => {
    const { task } = byId('s3_r_t2');
    const g = taskGuide(task, 3)!;
    expect(guideTicksNow(g, task, state({ sessionNumber: 3, counts: c({ hundreds: 3, tens: 4 }) }))).toEqual([true, false, false]);
    // the final board laid by hand is not the break (REPRESENTATION_LOCKS)
    expect(guideTicksNow(g, task, state({ sessionNumber: 3, counts: c({ hundreds: 2, tens: 14 }) }))[1]).toBe(false);
    // A conversion is recorded in the column it reaches: a hundred broken into tens is the tens'.
    const broke = { ...emptyColumnConversions(), decomposed: { tens: true }, times: { composed: {}, decomposed: { tens: 1 } } } as any;
    expect(guideTicksNow(g, task, state({ sessionNumber: 3, counts: c({ hundreds: 2, tens: 14 }), conversionsByColumn: broke }))[1]).toBe(true);
  });

  // Chief review S6 (9.10.2026): the ticks are derived from the saved workspace,
  // so a refresh after the break shows the build step done as well.
  it('after the break, the build step is done too — from the board and the recorded break, with no memory of the screen', () => {
    const { task } = byId('s3_r_t2');
    const g = taskGuide(task, 3)!;
    const broke = { ...emptyColumnConversions(), decomposed: { tens: true }, times: { composed: {}, decomposed: { tens: 1 } } } as any;
    expect(guideTicksNow(g, task, state({ sessionNumber: 3, counts: c({ hundreds: 2, tens: 14 }), conversionsByColumn: broke }))).toEqual([true, true, false]);
  });

  // Chief review S5: undoing the break takes its tick away (the board is back to 3 hundreds and 4 tens).
  it('undoing the break un-ticks the break step; the build step stays', () => {
    const { task } = byId('s3_r_t2');
    const g = taskGuide(task, 3)!;
    const undone = state({ sessionNumber: 3, counts: c({ hundreds: 3, tens: 4 }) });
    expect(guideTicksNow(g, task, undone)).toEqual([true, false, false]);
  });

  // Chief re-review S-A (9.10.2026): PRD 14 §ב tasks 5–7 and 10 tick "כשבבית
  // המספרים 703 / 368 / 482 / 807" — the steps after them do not change the
  // board, so a board that is no longer N is not built.
  it('a "build N" step followed only by writing shows the board as it is now: 703 then one more ten is not built', () => {
    const { task } = byId('s1_r_words703');
    const g = taskGuide(task, 1)!;
    expect(g.steps[0].tick).toEqual({ kind: 'boardValue', value: 703 });
    expect(guideTicksNow(g, task, state({ counts: c({ hundreds: 7, units: 3 }) }))[0]).toBe(true);
    expect(guideTicksNow(g, task, state({ counts: c({ hundreds: 7, tens: 1, units: 3 }) }))[0]).toBe(false);
  });

  it('station 7\'s add-then-remove build is sticky, read from builtTrack (saved, and brought back by undo)', () => {
    for (const id of ['s7_r_t6', 's7_g_t5']) {
      const { task } = byId(id);
      const g = taskGuide(task, 7)!;
      const t = g.steps[0].tick;
      expect(t.kind === 'boardValue' && t.sticky, id).toBe(true);
      const value = t.kind === 'boardValue' ? t.value : -1;
      expect(guideTicksNow(g, task, state({ sessionNumber: 7, counts: c({ hundreds: 9 }), builtTrack: { taskId: task.id, value, held: true } }))[0], id).toBe(true);
      expect(guideTicksNow(g, task, state({ sessionNumber: 7, counts: c({ hundreds: 9 }), builtTrack: { taskId: task.id, value, held: false } }))[0], id).toBe(false);
      expect(guideTicksNow(g, task, state({ sessionNumber: 7, counts: c({ hundreds: 9 }), builtTrack: { taskId: 'other', value, held: true } }))[0], id).toBe(false);
    }
    // Nothing else is sticky: no other exercise of the banks waits on builtTrack.
    const sticky = banks().filter(({ meeting, task }) => stickyBuildValue(task, meeting) !== null).map(({ task }) => task.id);
    expect(sticky.sort()).toEqual(['s7_g_t5', 's7_r_t6']);
  });

  // PRD 14 §ב rule (3): "כשכל התיבות מולאו" — never after the units digit alone
  // (chief review B1: 53 − 18 ticked after "5" and the done box sent the child to "ממשיכים").
  it('the writing step ticks only when every box of the result row is filled', () => {
    const s5 = byId('s5_r_t2').task; // 53 − 18, two boxes
    expect(answerFilled(s5, state({ sessionNumber: 5, answerDigits: { units: '5' } }))).toBe(false);
    expect(answerFilled(s5, state({ sessionNumber: 5, answerDigits: { units: '5', tens: '3' } }))).toBe(true);
    const s6 = byId('s6_g_t1').task; // 2,045 − 1,128 = 917, four boxes
    const base = state({ sessionNumber: 6 });
    expect(answerFilled(s6, { ...base, answerDigits: { units: '7', tens: '1', hundreds: '9', thousands: '0' } })).toBe(true);
    const s5g = byId('s5_g_t1').task; // 5,432 − 2,118: "3" alone, or a gap, is not yet written
    expect(answerFilled(s5g, state({ sessionNumber: 5, answerDigits: { units: '4' } }))).toBe(false);
    expect(answerFilled(s5g, state({ sessionNumber: 5, answerDigits: { units: '4', tens: '1', thousands: '3' } }))).toBe(false);
    expect(answerFilled(s5g, state({ sessionNumber: 5, answerDigits: { units: '4', tens: '1', hundreds: '3', thousands: '3' } }))).toBe(true);
  });

  // Owner, 9.10.2026: in a subtraction of stations 3–7 the child may leave the
  // hundreds box (or any higher one) empty when the answer is shorter than the
  // row, as the verdict already accepts "_92" and "092". The tick follows: every
  // box from the units up to the highest written digit, no gap; tens and units always.
  describe('a subtraction answer shorter than its row (owner, 9.10.2026)', () => {
    const s6r = () => byId('s6_r_t3').task; // 204 − 112 = 92, three boxes
    const at6 = (answerDigits: GuideTickState['answerDigits']) => state({ sessionNumber: 6, answerDigits });

    it('204 − 112: "_92" ticks', () => {
      expect(s6r().numberA).toBe(204);
      expect(s6r().numberB).toBe(112);
      expect(answerFilled(s6r(), at6({ tens: '9', units: '2' }))).toBe(true);
    });
    it('204 − 112: "092" ticks', () => {
      expect(answerFilled(s6r(), at6({ hundreds: '0', tens: '9', units: '2' }))).toBe(true);
    });
    it('204 − 112: "9_2" does not tick — a gap', () => {
      expect(answerFilled(s6r(), at6({ hundreds: '9', units: '2' }))).toBe(false);
    });
    it('204 − 112: the units or the tens alone does not tick', () => {
      expect(answerFilled(s6r(), at6({ units: '2' }))).toBe(false);
      expect(answerFilled(s6r(), at6({ tens: '9' }))).toBe(false);
    });
    it('53 − 18 (two boxes): "5" alone does not tick (chief review B1 stays fixed)', () => {
      const s5 = byId('s5_r_t2').task;
      expect(answerFilled(s5, state({ sessionNumber: 5, answerDigits: { units: '5' } }))).toBe(false);
      expect(answerFilled(s5, state({ sessionNumber: 5, answerDigits: { tens: '5' } }))).toBe(false);
    });
    it('2,045 − 1,128 = 917 in four boxes: "_917" ticks, so does "__17" (the tick never tells the length); "_9_7" and "9_17" do not', () => {
      const s6 = byId('s6_g_t1').task;
      expect(answerFilled(s6, state({ sessionNumber: 6, answerDigits: { hundreds: '9', tens: '1', units: '7' } }))).toBe(true);
      expect(answerFilled(s6, state({ sessionNumber: 6, answerDigits: { hundreds: '9', units: '7' } }))).toBe(false);
      expect(answerFilled(s6, state({ sessionNumber: 6, answerDigits: { tens: '1', units: '7' } }))).toBe(true);
      expect(answerFilled(s6, state({ sessionNumber: 6, answerDigits: { thousands: '9', tens: '1', units: '7' } }))).toBe(false);
    });
    it('the writing step of the guide ticks for "_92"', () => {
      const task = s6r();
      const g = taskGuide(task, 6)!;
      const i = g.steps.findIndex((st) => st.tick.kind === 'fill');
      expect(i).toBeGreaterThanOrEqual(0);
      expect(guideTicksNow(g, task, at6({ tens: '9', units: '2' }))[i]).toBe(true);
    });
  });
});

describe('the instruction, one sentence per line, is the instruction', () => {
  it('joined again, the lines give back every instruction of the banks', () => {
    for (const { task } of banks()) expect(instructionLines(task.instructionHe).join(' '), task.id).toBe(task.instructionHe.replace(/\s*\n\s*/g, ' ').trim());
  });
});

/**
 * Chief re-review B-1 (9.10.2026): the tick of station 7's "בנו את המספר N"
 * must survive the add-then-remove and the typing that follows. It used to be
 * read from the undo history, which keeps 10 frames: typing the answer pushed
 * the board that held 3,400 out, the tick went, and the done box never came.
 * Driven through the real store.
 */
describe('station 7 add-then-remove, through the store: the build tick holds to the end', () => {
  const ws = () => useWorkspaceStore.getState();
  const drop = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: p, target: { kind: 'column', place: p } }); };
  const trash = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().removeBlockClick(p); };
  const ticksOf = (id: string) => {
    const task = byId(id).task;
    const g = taskGuide(task, 7)!;
    const s = ws();
    return guideTicksNow(g, task, { ...s, probeAnswer: s.probeAnswer ?? '', checklist: null } as GuideTickState);
  };
  const open = (id: string) => {
    approvePath(id.startsWith('s7_g') ? 'green_path' : 'remediation_path');
    ws().resetWorkspace();
    ws().initSession(7, false, getSessionTasks(7, id.startsWith('s7_g') ? 'green_path' : 'remediation_path').findIndex((t) => t.id === id));
  };

  it('s7_g_t5: build 3,400, add a thousand, break one, remove 6 hundreds, type 3800 — step 1 stays ticked and every tick is in', () => {
    open('s7_g_t5');
    drop('thousands', 3);
    drop('hundreds', 4);
    expect(ticksOf('s7_g_t5')[0]).toBe(true);
    drop('thousands');
    ws().splitBlockClick('thousands');
    trash('hundreds', 6);
    expect(getValue(ws().counts)).toBe(3800);
    for (const [p, d] of [['thousands', '3'], ['hundreds', '8'], ['tens', '0'], ['units', '0']] as const) ws().setAnswerDigit(p, d);
    expect(ws().undoStack.length).toBe(10); // the cap: the board that held 3,400 is gone from the history
    expect(ticksOf('s7_g_t5')).toEqual([true, false, false, true]);
  });

  it('s7_r_t6: build 340, add 2 hundreds, remove 3 tens, a slip and its correction, type 510 — still ticked; undoing back past 340 un-ticks', () => {
    open('s7_r_t6');
    drop('hundreds', 3);
    drop('tens', 4);
    drop('hundreds', 2);
    trash('tens', 3);
    drop('units');
    trash('units');
    for (const [p, d] of [['hundreds', '5'], ['tens', '1'], ['units', '9']] as const) ws().setAnswerDigit(p, d);
    ws().setAnswerDigit('units', '0');
    expect(ws().undoStack.length).toBe(10);
    expect(ticksOf('s7_r_t6')).toEqual([true, false, false, true]);
  });

  it('s7_r_t6: undoing the block that completed 340 takes the tick back (builtTrack returns with the board)', () => {
    open('s7_r_t6');
    drop('hundreds', 3);
    drop('tens', 4);
    drop('hundreds', 2);
    expect(ticksOf('s7_r_t6')[0]).toBe(true);
    ws().undo();
    ws().undo();
    ws().undo();
    expect(getValue(ws().counts)).toBe(330);
    expect(ticksOf('s7_r_t6')[0]).toBe(false);
  });

  it('the trash empties the board: the build is no longer recorded', () => {
    open('s7_r_t6');
    drop('hundreds', 3);
    drop('tens', 4);
    expect(ws().builtTrack).toMatchObject({ taskId: 's7_r_t6', value: 340, held: true });
    ws().clearBoard();
    drop('hundreds');
    expect(ws().builtTrack?.held).toBe(false);
    expect(ticksOf('s7_r_t6')[0]).toBe(false);
  });
});
