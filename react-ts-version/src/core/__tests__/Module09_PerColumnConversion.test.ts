import { describe, it, expect } from 'vitest';
import { useWorkspaceStore, restoreUndoFrames } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';

/**
 * PRD Module 9 §א, מסמכים 01 ו-03: for learners on the enhanced cognitive-support
 * profile, the result-row keyboard is locked in a column that needs a
 * conversion "ומשתחררת רק עם השלמת הפעולה הפיזית בקנבס הלבנים" — column by
 * column. Two things used to open it without that:
 *   (a) a digit written in the memory circle above the column;
 *   (b) one conversion anywhere in the exercise, which opened every column.
 * The coaching trigger "a wrong digit in a column that requires a conversion,
 * before the conversion was done with the blocks" (מסמכים 01–04) had the same
 * per-exercise flaw. Both now read the same per-column record.
 */
const ws = () => useWorkspaceStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
const counts = (c: Partial<PlaceCounts>) => ({ ...EMPTY_COUNTS, ...c });

function start(opts: { session?: number; enhanced?: boolean; a: number; b: number; sub?: boolean; board?: Partial<PlaceCounts> }) {
  ws().resetWorkspace();
  useAuthStore.setState({
    user: {
      uid: 'student_user1',
      student_id: 1,
      support_profile_id: opts.enhanced === false ? null : 'enhanced_cognitive_support',
    },
  } as any);
  useWorkspaceStore.setState({
    sessionNumber: (opts.session ?? 4) as any,
    standardTaskIdx: 0,
    flowStatus: 'task',
    dynamicTasks: [
      { id: 'test_ex', type: 'vertical_addition', numberA: opts.a, numberB: opts.b, isSubtraction: opts.sub ?? false } as any,
    ],
    counts: counts(opts.board ?? {}),
  } as any);
}

const locked = (place: Place, a: number, b: number, sub = false) => ws().isColumnInputLocked(place, a, b, sub);

describe('Module 9 §א: the enhanced-support keyboard opens column by column', () => {
  it('addition 85 + 17: each carry column opens only with its own grouping, and undo takes it back', () => {
    // 8 tens 5 units + 1 ten 7 units on the board: 9 tens, 12 units.
    start({ a: 85, b: 17, board: { tens: 9, units: 12 } });
    expect(locked('units', 85, 17)).toBe(true);    // 5 + 7 = 12
    expect(locked('tens', 85, 17)).toBe(true);     // 8 + 1 + the carried 1 = 10
    expect(locked('hundreds', 85, 17)).toBe(false);

    ws().groupColumnClick('units');                 // 12 units → 1 ten + 2 units
    expect(locked('units', 85, 17)).toBe(false);
    expect(locked('tens', 85, 17)).toBe(true);     // one conversion does not open every column

    ws().groupColumnClick('tens');                  // 10 tens → 1 hundred
    expect(ws().counts).toEqual(counts({ hundreds: 1, tens: 0, units: 2 }));
    expect(locked('tens', 85, 17)).toBe(false);

    ws().undo();                                    // the tens grouping is taken back
    expect(locked('tens', 85, 17)).toBe(true);
    expect(locked('units', 85, 17)).toBe(false);
    ws().undo();                                    // and the units grouping
    expect(locked('units', 85, 17)).toBe(true);

    ws().groupColumnClick('units');                 // redone on the board: open again
    expect(locked('units', 85, 17)).toBe(false);
  });

  it('a digit in the memory circle does not open a column', () => {
    start({ a: 47, b: 28, board: { tens: 6, units: 15 } });
    ws().setCarryDigit('units', '1');
    ws().setCarryDigit('tens', '1');
    expect(locked('units', 47, 28)).toBe(true);
    ws().groupColumnClick('units');
    expect(locked('units', 47, 28)).toBe(false);
  });

  it('subtraction 403 − 128: a chained decomposition opens the tens, then the units', () => {
    start({ a: 403, b: 128, sub: true, board: { hundreds: 4, units: 3 } });
    expect(locked('units', 403, 128, true)).toBe(true);    // 3 < 8
    expect(locked('tens', 403, 128, true)).toBe(true);     // 0 − 1 < 2
    expect(locked('hundreds', 403, 128, true)).toBe(false);

    ws().splitBlockClick('hundreds');               // a hundred → 10 tens
    expect(locked('tens', 403, 128, true)).toBe(false);
    expect(locked('units', 403, 128, true)).toBe(true);

    ws().splitBlockClick('tens');                   // a ten → 10 units
    expect(ws().counts).toEqual(counts({ hundreds: 3, tens: 9, units: 13 }));
    expect(locked('units', 403, 128, true)).toBe(false);
  });

  it('subtraction opens on a decomposition into the column, by click or by a drag to the right — never on a grouping', () => {
    start({ a: 53, b: 18, sub: true, board: { tens: 5, units: 10 } });
    ws().groupColumnClick('units');                 // a grouping is not a subtraction's conversion
    expect(locked('units', 53, 18, true)).toBe(true);

    ws().applyDrop({ source: 'column', sourcePlace: 'tens', target: { kind: 'column', place: 'units' } });
    expect(locked('units', 53, 18, true)).toBe(false);
    ws().undo();                                    // the drag is undone: locked again
    expect(locked('units', 53, 18, true)).toBe(true);
  });

  it('a standard-profile learner is never locked, and sessions 2 and 8 have no lock', () => {
    start({ a: 85, b: 17, enhanced: false });
    expect(locked('units', 85, 17)).toBe(false);
    start({ a: 85, b: 17, session: 8 });
    expect(locked('units', 85, 17)).toBe(false);
  });

  it('a column already converted stays open after a reload', () => {
    start({ a: 85, b: 17, board: { tens: 9, units: 12 } });
    ws().groupColumnClick('units');
    const saved = JSON.parse(JSON.stringify({
      sessionNumber: 4,
      standardTaskIdx: 0,
      flowStatus: 'task',
      counts: ws().counts,
      conversionsByColumn: ws().conversionsByColumn,
      undoStack: ws().undoStack.map((f) => ({ ...f, hasConversions: f.conversionsByColumn !== undefined })),
    }));
    // The database drops empty objects: the frame saved before the grouping lost its empty record.
    delete saved.undoStack[0].conversionsByColumn;
    ws().restoreSession(saved);
    useWorkspaceStore.setState({
      dynamicTasks: [{ id: 'test_ex', type: 'vertical_addition', numberA: 85, numberB: 17 } as any],
    } as any);
    expect(locked('units', 85, 17)).toBe(false);
    expect(locked('tens', 85, 17)).toBe(true);
    // Undoing the grouping after the reload still takes the column back.
    expect(restoreUndoFrames(saved.undoStack)[0].conversionsByColumn).toEqual({ composed: {}, decomposed: {} });
    ws().undo();
    expect(locked('units', 85, 17)).toBe(true);
  });
});

describe('the coaching trigger "wrong digit before the conversion" is per column', () => {
  it('after the units were grouped, a wrong tens digit in 85 + 17 still opens the card', async () => {
    start({ a: 85, b: 17, enhanced: false, board: { tens: 9, units: 12 } });
    ws().groupColumnClick('units');
    ws().setAnswerDigit('tens', '1');               // 102: the tens digit is 0
    await flush();
    expect(ws().helpState).toBe('socratic');
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });

  it('stays silent in a column whose conversion the blocks already did', async () => {
    start({ a: 85, b: 17, enhanced: false, board: { tens: 9, units: 12 } });
    ws().groupColumnClick('units');
    ws().setAnswerDigit('units', '7');              // wrong, but the units were grouped
    await flush();
    expect(ws().helpState).not.toBe('socratic');
  });

  it('a memory-circle note is not a conversion with the blocks (meetings 3–7)', async () => {
    start({ a: 53, b: 18, sub: true, enhanced: false, board: { tens: 5, units: 3 } });
    ws().setCarryDigit('tens', '4');
    ws().setAnswerDigit('units', '3');              // 35: the units digit is 5
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');
  });

  it('meeting 8 has no blocks: the conversion counts once it is recorded in the memory circle (מסמך 03 §3.8)', async () => {
    // Addition: the carried 1 goes above the NEXT column.
    start({ session: 8, a: 47, b: 28, enhanced: false });
    ws().setCarryDigit('tens', '1');
    ws().setAnswerDigit('units', '4');              // 75: the units digit is 5
    await flush();
    expect(ws().helpState).not.toBe('socratic');

    // Nothing recorded: the card opens.
    start({ session: 8, a: 47, b: 28, enhanced: false });
    ws().setAnswerDigit('units', '4');
    await flush();
    expect(ws().socraticTriggerReason).toBe('conversion_not_performed');

    // Subtraction: the new digit above the next column records the decomposition.
    start({ session: 8, a: 53, b: 18, sub: true, enhanced: false });
    ws().setCarryDigit('tens', '4');
    ws().setAnswerDigit('units', '3');
    await flush();
    expect(ws().helpState).not.toBe('socratic');
  });
});
