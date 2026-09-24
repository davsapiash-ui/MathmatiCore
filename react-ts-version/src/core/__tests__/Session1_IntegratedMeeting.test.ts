import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { useWorkspaceStore, getActiveTasks, selectCanProceed } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, getHardcodedCatalogBanks, type SessionTask } from '@/data/sessionTasks';
import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { session1Checklist } from '@/core/session1Checklist';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { SocraticEngine } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

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

  it('the server leaves out of the report exactly the tool steps of this bank', () => {
    // functions/src/meetingMetrics.ts MEETING1_TOOL_STEPS: tool steps are tool
    // mastery, not exercises (מסמך 04: "כיצד הסתיים כל תרגיל ריענון").
    const server = readFileSync(resolve(__dirname, '../../../../functions/src/meetingMetrics.ts'), 'utf-8');
    const list = server.slice(server.indexOf('export const MEETING1_TOOL_STEPS'), server.indexOf('];', server.indexOf('export const MEETING1_TOOL_STEPS')));
    const serverIds = [...list.matchAll(/"(s1_[a-z0-9_]+)"/g)].map((m) => m[1]);
    const toolSteps = SESSION1_TASKS.filter((t) => t.type === 'session1_intro').map((t) => t.id);
    expect(serverIds).toEqual(toolSteps);
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

  it('the refresh exercises and the target task say on screen what מסמך 03 §3.1 says, word for word', () => {
    // The owner added them to the document on 24.9.2026 (register ו).
    for (const id of ['s1_target_347', 's1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      for (const line of lines(task(id))) expect(DOC03, `${id}: ${line}`).toContain(line);
    }
  });

  it('step 6 names the document\'s number and actions', () => {
    const t = task('s1_target_347');
    expect(t.instructionHe.startsWith('משימת יעד מסכמת: בנו את המספר 347 בלבני דינס, פרטו עשרת אחת לעשר יחידות')).toBe(true);
    expect(t.requiredCounts).toEqual({ hundreds: 3, tens: 3, units: 17 });
    expect(t.requiresUngrouping).toBe(true);
    // the new representation is what the child finds — the card does not list it in advance
    expect(t.hideRequiredCounts).toBe(true);
  });
});

describe('what completes each introduction step', () => {
  const base = { counts: { ...EMPTY_COUNTS }, blocksAddedCount: 0, hasUngrouped: false, undoCount: 0, hasClearedBoard: false };
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

  it('step 4 shows one item; the second appears only for 305 built another way', () => {
    const standard = session1Checklist('s1_build_305', { ...base, counts: { ...EMPTY_COUNTS, hundreds: 3, units: 5 } })!;
    expect(standard.map((i) => i.done)).toEqual([true]);
    expect(session1Checklist('s1_build_305', base)!).toHaveLength(1);
  });

  it('step 6, the target task: the document\u2019s instruction clause by clause, and all three before "התקדם"', () => {
    const at = (s: Partial<typeof base> & { answerDigits?: Record<string, string> }) =>
      session1Checklist('s1_target_347', { ...base, ...s } as any)!.map((i) => i.done);
    expect(at({ counts: { ...EMPTY_COUNTS, units: 7 } })).toEqual([false, false, false]);
    expect(at({ counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 4, units: 7 }, answerDigits: { hundreds: '3', tens: '4', units: '7' } })).toEqual([true, false, true]);
    expect(at({ counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 }, hasUngrouped: true })).toEqual([true, true, false]);
    expect(at({ counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 }, hasUngrouped: true, answerDigits: { hundreds: '3', tens: '4', units: '7' } })).toEqual([true, true, true]);
  });

  it('step 4: 305 built another way shows which part is left, instead of a silent ⏳', () => {
    const items = session1Checklist('s1_build_305', { ...base, counts: { ...EMPTY_COUNTS, hundreds: 2, tens: 10, units: 5 } })!;
    expect(items.map((i) => i.done)).toEqual([true, false]);
    expect(items[1].label).toBe('הספרה אפס בלוח בית המספרים הריק מעשרות');
  });

  it('step 5: undo and pressing the trash, both', () => {
    expect(done('s1_undo_trash', { undoCount: 1 })).toBe(false);
    expect(done('s1_undo_trash', { hasClearedBoard: true })).toBe(false);
    expect(done('s1_undo_trash', { undoCount: 1, hasClearedBoard: true })).toBe(true);
  });

  it('every checklist label is the document\'s own wording', () => {
    const state = { ...base, counts: { ...EMPTY_COUNTS } };
    for (const id of ['s1_sandbox_controlled', 's1_decompose_hundred', 's1_build_305', 's1_undo_trash', 's1_target_347']) {
      for (const item of session1Checklist(id, state)!) expect(DOC03, item.label).toContain(item.label);
    }
    const other305 = session1Checklist('s1_build_305', { ...state, counts: { ...EMPTY_COUNTS, hundreds: 2, tens: 10, units: 5 } })!;
    for (const item of other305) expect(DOC03, item.label).toContain(item.label);
  });

  it('exercises have no checklist', () => {
    for (const id of ['s1_r_group26', 's1_t8', 's1_r_sub61', 's1_r_sub806']) {
      expect(session1Checklist(id, base)).toBeNull();
    }
  });
});

describe('the store gate follows the checklist', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().resetWorkspace();
  });

  it('each step opens on the board מסמך 03 describes: empty, 230 for the decomposition, empty for 305', () => {
    useWorkspaceStore.getState().initSession(1, false, 0);
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS }); // "לוח הדינס ריק מלבנים"
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(1, false, 1);
    // step 2 ends on 230 ("שתי מאות ושלוש עשרות"), step 3 turns it into one hundred and 13 tens
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 2, tens: 3 });
    useWorkspaceStore.getState().splitBlockClick('hundreds');
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 1, tens: 13 });
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    expect(getActiveTasks(s)[s.standardTaskIdx].id).toBe('s1_build_305');
    expect(s.counts).toEqual({ ...EMPTY_COUNTS }); // "הלומדים גוררים שלוש מאות וחמש יחידות"
  });

  it('step 5 opens on the board step 4 built, and undo works on it at once', () => {
    useWorkspaceStore.getState().initSession(1, false, 2);
    const store = useWorkspaceStore.getState();
    for (let i = 0; i < 3; i++) store.applyDrop({ source: 'palette', sourcePlace: 'hundreds', target: { kind: 'column', place: 'hundreds' } });
    for (let i = 0; i < 5; i++) store.applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } });
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 3, units: 5 });
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    expect(getActiveTasks(s)[s.standardTaskIdx].id).toBe('s1_undo_trash');
    expect(s.counts).toEqual({ ...EMPTY_COUNTS, hundreds: 3, units: 5 });
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 3, units: 4 });
    useWorkspaceStore.getState().clearBoard();
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS });
    useWorkspaceStore.getState().proceed();
    expect(getActiveTasks(useWorkspaceStore.getState())[useWorkspaceStore.getState().standardTaskIdx].id).toBe('s1_target_347');
    // …and the target task opens on an empty board again
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS });
  });

  it('a reload in steps 1–2 keeps the blocks already dragged, and in step 5 keeps the undo history', () => {
    useWorkspaceStore.getState().initSession(1, false, 0);
    useWorkspaceStore.setState({ blocksAddedCount: 3 });
    const s1 = (firebaseSyncService as any).getSyncableWorkspaceState();
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(s1);
    expect(useWorkspaceStore.getState().blocksAddedCount).toBe(3);

    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(1, false, 3);
    const store = useWorkspaceStore.getState();
    store.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    store.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    const s5 = JSON.parse(JSON.stringify((firebaseSyncService as any).getSyncableWorkspaceState()));
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(s5);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().counts.tens).toBe(1);
    expect(useWorkspaceStore.getState().undoCount).toBe(1);
  });

  it('after a reload through the database, undo still erases the first digit typed', () => {
    // The Realtime Database drops empty objects; simulate its round trip.
    const viaDatabase = (v: any): any => {
      if (Array.isArray(v)) return v.map(viaDatabase);
      if (v && typeof v === 'object') {
        const out: Record<string, any> = {};
        for (const [k, x] of Object.entries(v)) {
          const y = viaDatabase(x);
          if (y === null || y === undefined) continue;
          if (typeof y === 'object' && !Array.isArray(y) && Object.keys(y).length === 0) continue;
          out[k] = y;
        }
        return out;
      }
      return v;
    };
    useWorkspaceStore.getState().initSession(1, false, 4);
    useWorkspaceStore.getState().setAnswerDigit('hundreds', '3');
    expect(useWorkspaceStore.getState().answerDigits.hundreds).toBe('3');
    const saved = viaDatabase(JSON.parse(JSON.stringify((firebaseSyncService as any).getSyncableWorkspaceState())));
    expect(saved.undoStack[0].answerDigits).toBeUndefined(); // the database dropped the empty input
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(saved);
    expect(useWorkspaceStore.getState().answerDigits.hundreds).toBe('3');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().answerDigits.hundreds).toBeUndefined();
  });

  it('pressing the trash on an empty board still counts; dragging one block into it does not', () => {
    useWorkspaceStore.getState().initSession(1, false, 3);
    const store = useWorkspaceStore.getState();
    store.applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } });
    store.applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'trash' } });
    expect(useWorkspaceStore.getState().hasDeletedBlock).toBe(true);
    expect(useWorkspaceStore.getState().hasClearedBoard).toBe(false);
    useWorkspaceStore.getState().clearBoard(); // the board is empty now
    expect(useWorkspaceStore.getState().hasClearedBoard).toBe(true);
  });

  it('a reload keeps what a step or a conversion was decided by', () => {
    useWorkspaceStore.getState().initSession(1, false, 4);
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 },
      hasUngrouped: true,
      hasGrouped: false,
      hasClearedBoard: true,
      blocksAddedCount: 6,
      answerDigits: { hundreds: '3', tens: '4', units: '7' },
    });
    // The in-lesson sync — the one restoreSession reads, from the database and
    // the local cache — builds its payload from this same function, and there
    // is no second copy of it to drift (the first fix of this missed exactly that).
    const sync = readFileSync(resolve(__dirname, '../../infrastructure/services/FirebaseSyncService.ts'), 'utf-8');
    expect(sync).toContain('const syncableData: Record<string, any> = this.getSyncableWorkspaceState();');
    expect(sync.split('counts: state.counts,').length - 1).toBe(1);
    const snapshot = (firebaseSyncService as any).getSyncableWorkspaceState();
    expect(snapshot).toMatchObject({ hasUngrouped: true, hasGrouped: false, hasClearedBoard: true, blocksAddedCount: 6 });
    expect(Array.isArray(snapshot.undoStack)).toBe(true);
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().restoreSession(snapshot);
    expect(useWorkspaceStore.getState().hasUngrouped).toBe(true);
    // …so the child who decomposed and reloaded is not told to decompose again
    useWorkspaceStore.getState().proceed();
    const s = useWorkspaceStore.getState();
    expect(getActiveTasks(s)[s.standardTaskIdx].id).toBe('s1_r_group26');
  });

  it('the target task: "התקדם" stays off until the ten is decomposed and the number written', () => {
    useWorkspaceStore.getState().initSession(1, false, 4);
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 4, units: 7 }, answerDigits: { hundreds: '3', tens: '4', units: '7' } });
    expect(selectCanProceed(useWorkspaceStore.getState())).toBe(false);
    useWorkspaceStore.getState().splitBlockClick('tens');
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 });
    expect(selectCanProceed(useWorkspaceStore.getState())).toBe(true);
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

  it('the grouping refresh opens with the 26 unit cubes already on the board, like task 5', () => {
    // Reached from the target task, through the normal transition…
    useWorkspaceStore.getState().initSession(1, false, 4);
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS });
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 },
      hasUngrouped: true,
      answerDigits: { hundreds: '3', tens: '4', units: '7' },
    });
    useWorkspaceStore.getState().proceed();
    const s1 = useWorkspaceStore.getState();
    expect(getActiveTasks(s1)[s1.standardTaskIdx].id).toBe('s1_r_group26');
    expect(s1.counts).toEqual({ ...EMPTY_COUNTS, units: 26 });
    // …and when the meeting resumes straight into it.
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(1, false, 5);
    expect(useWorkspaceStore.getState().counts).toEqual({ ...EMPTY_COUNTS, units: 26 });
  });

  it('a failed check on a hidden board does not name the board', () => {
    useWorkspaceStore.getState().initSession(1, false, 5);
    useWorkspaceStore.getState().proceed(); // 26 loose units, nothing grouped yet
    const sub = useWorkspaceStore.getState().feedback?.sub ?? '';
    expect(sub).not.toContain('2 עשרות');
    expect(sub).not.toContain('6 יחידות');
  });

  it('the grouping refresh asks for the grouping itself, not only its result', () => {
    useWorkspaceStore.getState().initSession(1, false, 5);
    const s0 = useWorkspaceStore.getState();
    expect(getActiveTasks(s0)[s0.standardTaskIdx].id).toBe('s1_r_group26');
    // 2 tens and 6 units dragged in directly: the board is right, the grouping never happened.
    useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, tens: 2, units: 6 }, answerDigits: { tens: '2', units: '6' } });
    useWorkspaceStore.getState().proceed();
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(5);
    expect(useWorkspaceStore.getState().feedback?.sub).toContain('כפתור הקבץ 10');
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
    // the cubes are on the board and the card does not say what they make
    expect(r.initialCounts).toEqual({ units: 26 });
    expect(r.hideRequiredCounts).toBe(true);
    expect(r.instructionHe).toContain('כמה עשרות וכמה יחידות');
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

  it('a "two different representations" task holding 15 tens is left alone', () => {
    const flex = { id: 's7_r_t7', type: 'flexible_decomp', numberA: 150 };
    const hint = SocraticEngine.analyzeLiveBoardState(flex, 'flexible_regrouping', { ...EMPTY_COUNTS, tens: 15 });
    expect(hint?.questionHe ?? '').not.toContain('הצטברו 15');
  });

  it('the backup cards are true in every state they can appear in, and give no result', () => {
    const src = readFileSync(resolve(__dirname, '../../infrastructure/services/SocraticEngine.ts'), 'utf-8');
    // the intro steps never open a card, so they carry none — and the old 305
    // card ("אפס עשרות": 305 holds 30 tens) is gone
    for (const id of ['s1_decompose_hundred', 's1_build_305', 's1_undo_trash']) expect(src).not.toContain(`'${id}': {`);
    expect(src).not.toContain('כמה עשרות יש במספר 305');
    const block = (id: string) => src.slice(src.indexOf(`'${id}': {`), src.indexOf('correctChoiceId', src.indexOf(`'${id}': {`)));
    // the subtraction cards ask how to know you are done — true just after the
    // borrow, halfway through, and at the end — and never give the answer
    for (const [id, answer] of [['s1_r_sub61', '37'], ['s1_r_sub806', '455']] as const) {
      expect(block(id)).toContain('בסך הכול');
      expect(block(id)).not.toContain(answer);
    }
    // 713 + 94: a rule true before and after the grouping, without the tens digit of 807
    expect(block('s1_t8')).toContain('מה עושים כשבטור העשרות יש 10 עשרות');
    expect(block('s1_t8')).not.toMatch(/(?<![0-9])0 עשרות|807/);
  });

  it('an addition with 12 units still gets the grouping card', () => {
    const hint = SocraticEngine.analyzeLiveBoardState(task('s1_t8'), 'regrouping_fluency', { ...EMPTY_COUNTS, hundreds: 7, units: 12 });
    expect(hint?.questionHe).toContain('הצטברו 12');
  });
});
