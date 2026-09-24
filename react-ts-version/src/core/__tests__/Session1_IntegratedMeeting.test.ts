import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getHardcodedCatalogBanks, type SessionTask } from '@/data/sessionTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { session1Checklist } from '@/core/session1Checklist';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';

/**
 * מפגש 1 (owner, 24.9.2026 — register decision ו): the six introduction steps
 * of מסמך 03 §3.1, then four refresh exercises, each mirroring one diagnostic
 * task of meeting 2 with other numbers. The steps say on screen exactly what
 * the document says; the refresh exercises share every column feature of the
 * diagnostic task they refresh, and no number with meeting 2.
 */

const DOC03 = readFileSync(resolve(__dirname, '../../../../מסמכי אפיון/מקור פדגוגי/03- אפיון מפורט לקראת פיתוח.md'), 'utf-8')
  .replace(/\\!/g, '!');
const task = (id: string) => SESSION1_TASKS.find((t) => t.id === id)!;
const diag = (id: string) => DIAGNOSTIC_TASKS.find((t) => t.id === id)!;

describe('the order of meeting 1', () => {
  it('six introduction steps of מסמך 03, then four refresh exercises', () => {
    expect(SESSION1_TASKS.map((t) => t.id)).toEqual([
      's1_sandbox_controlled', // steps 1–2
      's1_decompose_hundred', // step 3
      's1_build_305', // step 4
      's1_undo_trash', // step 5
      's1_target_347', // step 6, the target task
      's1_r_group26', // refresh ← diagnostic task 5
      's1_t8', // refresh ← diagnostic task 6
      's1_r_sub61', // refresh ← diagnostic task 3
      's1_r_sub806', // refresh ← diagnostic task 7
    ]);
  });

  it('holds no compulsory exercise (PRD Module 14 §ב)', () => {
    expect(SESSION1_TASKS.every((t) => !t.isCompulsory)).toBe(true);
  });

  it('ships in the session 1 catalog bank exactly as in code', () => {
    const bank = getHardcodedCatalogBanks().find((b) => b.id === 'session_1')!;
    expect(bank.tasks).toEqual(SESSION1_TASKS);
  });

  it('the removed typing-creates-blocks step is not back (register gap טז)', () => {
    const all = JSON.stringify(SESSION1_TASKS);
    expect(all).not.toContain('הקלידו ספרות בשורת התוצאה');
    expect(all).not.toMatch(/דו.כיווני/);
  });
});

describe('steps 1–5 say on screen what מסמך 03 §3.1 says, word for word', () => {
  const lines = (t: SessionTask) => t.instructionHe.split('\n');
  for (const id of ['s1_sandbox_controlled', 's1_decompose_hundred', 's1_build_305', 's1_undo_trash']) {
    it(id, () => {
      for (const line of lines(task(id))) expect(DOC03, line).toContain(line);
    });
  }

  it('step 6 names the document\'s number and actions', () => {
    const t = task('s1_target_347');
    expect(t.instructionHe.startsWith('משימת יעד מסכמת: בנו את המספר 347 בלבני דינס, פרטו עשרת אחת לעשר יחידות')).toBe(true);
    expect(t.requiredCounts).toEqual({ hundreds: 3, tens: 3, units: 17 });
    expect(t.requiresUngrouping).toBe(true);
  });
});

describe('what completes each introduction step', () => {
  const base = { counts: { ...EMPTY_COUNTS }, blocksAddedCount: 0, hasUngrouped: false, undoCount: 0, hasDeletedBlock: false };
  const done = (id: string, s: Partial<typeof base>) => session1Checklist(id, { ...base, ...s })!.every((i) => i.done);

  it('steps 1–2: five dragged blocks', () => {
    expect(done('s1_sandbox_controlled', { blocksAddedCount: 4 })).toBe(false);
    expect(done('s1_sandbox_controlled', { blocksAddedCount: 5 })).toBe(true);
  });

  it('step 3: a block decomposed', () => {
    expect(done('s1_decompose_hundred', { blocksAddedCount: 3 })).toBe(false);
    expect(done('s1_decompose_hundred', { hasUngrouped: true })).toBe(true);
  });

  it('step 4: exactly 305 on the board — three hundreds, five units, no tens', () => {
    expect(done('s1_build_305', { counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 0, units: 5 } })).toBe(true);
    expect(done('s1_build_305', { counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 5 } })).toBe(false);
    expect(done('s1_build_305', { counts: { ...EMPTY_COUNTS, hundreds: 2, tens: 10, units: 5 } })).toBe(false);
  });

  it('step 5: undo and the trash, both', () => {
    expect(done('s1_undo_trash', { undoCount: 1 })).toBe(false);
    expect(done('s1_undo_trash', { hasDeletedBlock: true })).toBe(false);
    expect(done('s1_undo_trash', { undoCount: 1, hasDeletedBlock: true })).toBe(true);
  });

  it('exercises have no checklist', () => {
    for (const id of ['s1_target_347', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      expect(session1Checklist(id, base)).toBeNull();
    }
  });
});

describe('the store gate follows the checklist', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  it('step 5 cannot proceed on undo alone, and proceeds after the trash', () => {
    useWorkspaceStore.getState().initSession(1, false, 3);
    const s0 = useWorkspaceStore.getState();
    expect(getActiveTasks(s0)[s0.standardTaskIdx].id).toBe('s1_undo_trash');
    const store = useWorkspaceStore.getState();
    store.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    store.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().undoCount).toBe(1);
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(3);
    useWorkspaceStore.getState().clearBoard();
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(4);
  });

  it('the grouping refresh asks for the grouping itself, not only its result', () => {
    useWorkspaceStore.getState().initSession(1, false, 5);
    const s0 = useWorkspaceStore.getState();
    expect(getActiveTasks(s0)[s0.standardTaskIdx].id).toBe('s1_r_group26');
    // 2 tens and 6 units dragged in directly: the board is right, the grouping never happened.
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, tens: 2, units: 6 }, answerDigits: { tens: '2', units: '6' } });
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(5);
    expect(useWorkspaceStore.getState().feedback?.sub).toContain('הקבץ (10)');
    // Grouped from loose units: accepted.
    useWorkspaceStore.setState({ hasGrouped: true });
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(6);
  });
});

/** Column features of a two-operand exercise, units first. */
function columns(a: number, b: number, isSubtraction: boolean) {
  const digit = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
  const width = String(Math.max(a, b)).length;
  const conversions: boolean[] = [];
  let carry = 0;
  for (let i = 0; i < width; i++) {
    if (isSubtraction) {
      const need = digit(a, i) - carry < digit(b, i);
      conversions.push(need);
      carry = need ? 1 : 0;
    } else {
      const sum = digit(a, i) + digit(b, i) + carry;
      conversions.push(sum >= 10);
      carry = sum >= 10 ? 1 : 0;
    }
  }
  const result = isSubtraction ? a - b : a + b;
  return {
    digits: [String(a).length, String(b).length],
    conversions,
    minuendZeros: [0, 1, 2].map((i) => i < String(a).length && digit(a, i) === 0),
    resultDigits: String(result).length,
    resultZeros: [0, 1, 2].map((i) => i < String(result).length && digit(result, i) === 0),
  };
}

describe('each refresh exercise mirrors its diagnostic task, column for column', () => {
  it('s1_r_group26 ← task 5: loose units, two groupings into tens, units left over', () => {
    const r = task('s1_r_group26');
    const d = diag('task5_units_to_tens');
    expect(r.requiredCounts).toEqual({ tens: 2, units: 6 });
    expect(d.expectedBlocks).toEqual({ tens: 2, units: 5 });
    expect(r.numberA).toBe(26);
    expect(r.requiresGrouping).toBe(true);
    expect(r.instructionHe).toContain('26 קוביות יחידה');
  });

  it('s1_t8 ← task 6 (713 + 94 vs 124 + 85)', () => {
    const r = task('s1_t8');
    const d = diag('task6_vertical_addition');
    expect(columns(r.numberA!, r.numberB!, false)).toEqual(columns(d.numberA!, d.numberB!, false));
  });

  it('s1_r_sub61 ← task 3 (61 − 24 vs 42 − 15)', () => {
    const r = task('s1_r_sub61');
    const d = diag('task3_subtraction_regrouping');
    expect(r.correctAnswer).toBe(37);
    expect(columns(r.numberA!, r.numberB!, true)).toEqual(columns(d.numberA!, d.numberB!, true));
    expect(columns(61, 24, true).conversions).toEqual([true, false]);
  });

  it('s1_r_sub806 ← task 7 (806 − 351 vs 405 − 132)', () => {
    const r = task('s1_r_sub806');
    const d = diag('task7_subtraction_zero_tens');
    expect(r.correctAnswer).toBe(455);
    expect(columns(r.numberA!, r.numberB!, true)).toEqual(columns(d.numberA!, d.numberB!, true));
    // spelled out: no borrow in the units, a borrow into the empty tens, none in the hundreds
    expect(columns(806, 351, true).conversions).toEqual([false, true, false]);
    expect(columns(806, 351, true).minuendZeros).toEqual([false, true, false]);
  });

  it('each carries the name of the skill it refreshes', () => {
    expect(task('s1_r_group26').titleHe).toBe(diag('task5_units_to_tens').titleHe);
    expect(task('s1_t8').titleHe).toBe(diag('task6_vertical_addition').titleHe);
    expect(task('s1_r_sub61').titleHe).toBe(diag('task3_subtraction_regrouping').titleHe);
    expect(task('s1_r_sub806').titleHe).toBe(diag('task7_subtraction_zero_tens').titleHe);
  });

  it('no number of meeting 1 appears in meeting 2 — tasks, answers or backward probes', () => {
    const seen = new Set<number>();
    for (const t of DIAGNOSTIC_TASKS) {
      for (const v of [t.number, t.numberA, t.numberB, t.correctAnswer]) if (typeof v === 'number') seen.add(v);
      const bd = t.backwardDiagnosis;
      for (const v of [bd?.probeA, bd?.probeB, bd?.probeAnswer]) if (typeof v === 'number') seen.add(v);
    }
    for (const t of SESSION1_TASKS) {
      for (const v of [t.numberA, t.numberB, t.correctAnswer]) {
        if (typeof v === 'number') expect(seen.has(v), `${t.id}: ${v} appears in meeting 2`).toBe(false);
      }
    }
  });
});

describe('the live card never asks to undo the step the exercise asks for', () => {
  it('347 as 3 hundreds, 3 tens and 17 units: no "group the units" card', () => {
    const hint = SocraticEngine.analyzeLiveBoardState(task('s1_target_347'), 'flexible_regrouping', { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 });
    expect(hint?.questionHe ?? '').not.toContain('הצטברו 17');
  });

  it('61 − 24 after the borrow (5 tens, 11 units): no "group the units" card', () => {
    const hint = SocraticEngine.analyzeLiveBoardState(task('s1_r_sub61'), 'subtraction_regrouping', { ...EMPTY_COUNTS, tens: 5, units: 11 });
    expect(hint?.questionHe ?? '').not.toContain('הצטברו 11');
  });

  it('a meeting 3 representation that holds 13 tens is left alone too', () => {
    const s3 = { id: 's3_r_t2', type: 'representation', numberA: 340, requiredCounts: { hundreds: 2, tens: 14 } };
    const hint = SocraticEngine.analyzeLiveBoardState(s3, 'flexible_regrouping', { ...EMPTY_COUNTS, hundreds: 2, tens: 14 });
    expect(hint?.questionHe ?? '').not.toContain('הצטברו 14');
  });

  it('26 loose units in the grouping refresh still get the grouping card', () => {
    const hint = SocraticEngine.analyzeLiveBoardState(task('s1_r_group26'), 'flexible_regrouping', { ...EMPTY_COUNTS, units: 26 });
    expect(hint?.questionHe).toContain('הצטברו 26');
  });

  it('an addition with 12 units still gets the grouping card', () => {
    const hint = SocraticEngine.analyzeLiveBoardState(task('s1_t8'), 'regrouping_fluency', { ...EMPTY_COUNTS, hundreds: 7, units: 12 });
    expect(hint?.questionHe).toContain('הצטברו 12');
  });
});
