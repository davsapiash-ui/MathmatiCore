// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    set: vi.fn(noop),
    update: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});
vi.mock('@/infrastructure/services/FirebaseSyncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infrastructure/services/FirebaseSyncService')>();
  return { ...actual, emitTelemetry: vi.fn(async () => undefined) };
});

import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import {
  dimmedColumns, verticalBoxes, lowestEmptyPlace, breakSources, boardOperation, heldFromNumber, DIMMED_COLUMN_FILTER,
  type ColumnFocusInput, type VerticalWork, type VerticalBoxes,
} from '@/core/columnFocus';
import { resultBoxCount } from '@/core/placeCues';
import { EMPTY_COUNTS, PLACE_ORDER, type Place, type PlaceCounts } from '@/core/placeValue';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { useWorkspaceStore, getActiveTasks, effectiveArithmetic, nextHeldFromTrack } from '@/application/useWorkspaceStore';
import { boardDimmedColumns } from '@/application/boardDimming';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { useAuthStore } from '@/application/useAuthStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { approvePath } from '@/test/approvedPath';
import * as SessionTasks from '@/data/sessionTasks';
import * as BranchTasks from '@/data/sessionBranchTasks';
import type { SessionTask } from '@/data/sessionTasks';

/**
 * PRD מודול 7 §א: "עמעום טורים לא פעילים (brightness: 0.6) ... בטורים שאינם
 * במוקד החישוב הנוכחי". ה-PRD אינו מגדיר את המוקד; בעל המוצר הכריע ב-28.9.2026
 * (מרשם, פער יט), ואחרי הבדיקה החיה של 2.10.2026 (347: הסמן בתיבת היחידות
 * עמעם את המאות והעשרות שבהן הילד עוד בונה ופורט) מסר את הכיול: טור מעומעם רק
 * כדי למקד חישוב, ולעולם לא טור שהילד צריך לפעול בו באותו רגע
 * (core/columnFocus.ts). כל סעיף בכלל ננעל כאן בבדיקה משלו.
 *
 * 7.10.2026, החלטת בעל המוצר: העמעום מופיע רק כשהילד עומד בתיבה או בעיגול
 * זיכרון. בלי פוקוס אין עמעום — כלל "התיבה הריקה הנמוכה" ניחש את הצעד הבא
 * של הילד ועמעם את הטור שבו פעל ילד שעבד בסדר אחר.
 */

const sorted = (s: ReadonlySet<Place>) => PLACE_ORDER.filter((p) => s.has(p));
const base: ColumnFocusInput = { sessionNumber: 3, taskType: null, focusedPlace: null, focusedMemoryCircle: null };
const ws = () => useWorkspaceStore.getState();

describe('exercises without a calculation focus: never dimmed', () => {
  // Representation (meetings 1, 3, 7, the choice banks), two ways, the missing
  // part, the small-change inquiry and meeting 1's tool steps: the child builds,
  // breaks and groups across columns and reads the whole board.
  it.each(['representation', 'flexible_decomp', 'missing_element', 'small_change', 'session1_intro'])('%s, whatever is focused', (taskType) => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      for (const p of [null, ...PLACE_ORDER]) {
        expect(sorted(dimmedColumns({ ...base, sessionNumber, taskType, focusedPlace: p, focusedMemoryCircle: p }))).toEqual([]);
      }
    }
  });

  it('347 (owner, 2.10.2026): the cursor in the units box dims neither the hundreds nor the tens', () => {
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 1, taskType: 'representation', focusedPlace: 'units' }))).toEqual([]);
  });
});

describe('vertical exercises: never a column the child has to act in', () => {
  const work = (a: number, b: number, isSubtraction: boolean, over: Partial<VerticalWork> = {}): VerticalWork => ({
    a, b, isSubtraction, boardValue: isSubtraction ? a : a + b, heldFrom: isSubtraction, ...over,
  });
  const dim = (sessionNumber: number, a: number, b: number, isSubtraction: boolean, over: Partial<ColumnFocusInput> = {}, w: Partial<VerticalWork> = {}) => {
    const target = isSubtraction ? a - b : a + b;
    return sorted(dimmedColumns({
      ...base,
      sessionNumber,
      taskType: 'vertical_addition',
      vertical: verticalBoxes(a, b, target, {}, [], resultBoxCount(sessionNumber, a, b, target)),
      work: work(a, b, isSubtraction, w),
      answerDigits: {},
      ...over,
    }));
  };

  it('building the numbers: nothing is dimmed, whatever box or circle the cursor is in', () => {
    for (const p of [null, ...PLACE_ORDER]) {
      // 1,245 + 328: the board holds only 1,245 so far.
      expect(dim(4, 1245, 328, false, { focusedPlace: p }, { boardValue: 1245 })).toEqual([]);
      expect(dim(4, 1245, 328, false, { focusedMemoryCircle: p }, { boardValue: 1245 })).toEqual([]);
      expect(dim(1, 713, 94, false, { focusedPlace: p }, { boardValue: 700 })).toEqual([]);
      // 53 − 18: the board has not yet held 53.
      expect(dim(5, 53, 18, true, { focusedPlace: p }, { boardValue: 50, heldFrom: false })).toEqual([]);
      expect(dim(5, 53, 18, true, { focusedMemoryCircle: p }, { boardValue: 50, heldFrom: false })).toEqual([]);
      expect(dim(1, 61, 24, true, { focusedPlace: p }, { boardValue: 0, heldFrom: false })).toEqual([]);
    }
  });

  it('skeletons are built against the board work, a box focused or not', () => {
    // s7_g_t3: 5,▢▢▢ − 2,847 = 2,159, added back: 2,159 + 2,847 — building until the board is worth 5,006.
    const add = verticalBoxes(5006, 2847, 2159, { a: ['hundreds', 'tens', 'units'] }, PLACE_ORDER);
    const hiddenAdd = { a: ['hundreds', 'tens', 'units'] as Place[] };
    for (const boardValue of [0, 2000, 2159, 4159, 4999]) {
      for (const p of [null, ...PLACE_ORDER]) {
        const w = work(5006, 2847, true, { hidden: hiddenAdd, boardValue, heldFrom: false });
        expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: add, work: w, focusedPlace: p })), `${boardValue} ${p}`).toEqual([]);
        expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: add, work: w, focusedMemoryCircle: p })), `${boardValue} ${p}`).toEqual([]);
      }
    }
    const built = work(5006, 2847, true, { hidden: hiddenAdd, boardValue: 5006, heldFrom: false });
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: add, work: built, focusedPlace: 'tens', operandDigits: { a: { units: '6' }, b: {} } }))).toEqual(['units', 'hundreds', 'thousands']);
    // s7_g_t2: 2,▢3▢ + 1,554 = 4,191, worked as 4,191 − 1,554 — building until the board has held 4,191.
    const sub = verticalBoxes(2637, 1554, 4191, { a: ['hundreds', 'units'] }, PLACE_ORDER);
    const hiddenSub = { a: ['hundreds', 'units'] as Place[] };
    expect(heldFromNumber({ a: 2637, b: 1554, isSubtraction: false, hidden: hiddenSub })).toBe(4191);
    expect(heldFromNumber({ a: 5006, b: 2847, isSubtraction: true, hidden: hiddenAdd })).toBe(null); // an addition on the board
    expect(heldFromNumber({ a: 53, b: 18, isSubtraction: true })).toBe(null); // the first number: takeAwayTrack
    for (const p of [null, ...PLACE_ORDER]) {
      const w = work(2637, 1554, false, { hidden: hiddenSub, boardValue: 4100, heldFrom: false });
      expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: sub, work: w, focusedPlace: p }))).toEqual([]);
    }
    const held = work(2637, 1554, false, { hidden: hiddenSub, boardValue: 3000, heldFrom: true });
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: sub, work: held, focusedPlace: 'units' }))).toEqual(['hundreds', 'thousands']);
  });

  it('computing, nothing focused: nothing is dimmed, whatever the child does next (owner, 7.10.2026)', () => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      expect(dim(sessionNumber, 1245, 328, false)).toEqual([]);
      expect(dim(sessionNumber, 1245, 328, false, { answerDigits: { units: '3' } })).toEqual([]);
      expect(dim(sessionNumber, 53, 18, true)).toEqual([]);
      expect(dim(sessionNumber, 6020, 1485, true, { answerDigits: { units: '5' } })).toEqual([]);
    }
    // 358 + 267, the units grouped: the ten lands in the tens column, which is not dimmed.
    expect(dim(4, 358, 267, false, {}, { counts: { units: 5, tens: 12, hundreds: 5 } })).toEqual([]);
    // 57 − 23, the tens taken away first: the child acts in a lit column.
    expect(dim(5, 57, 23, true, {}, { boardValue: 37, counts: { units: 7, tens: 3 } })).toEqual([]);
  });

  it('computing an addition: the focus column alone — the "קבצו 10" button is on it', () => {
    expect(dim(4, 1245, 328, false, { focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
    expect(dim(4, 1245, 328, false, { focusedPlace: 'tens', answerDigits: { units: '3' } })).toEqual(['units', 'hundreds', 'thousands']);
    expect(dim(1, 713, 94, false, { focusedPlace: 'tens', answerDigits: { units: '7' } })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('a box focused above an empty lower box: every place from that box up to the focus stays lit', () => {
    // 1,245 + 328, the cursor in the tens box before the units.
    expect(dim(4, 1245, 328, false, { focusedPlace: 'tens' })).toEqual(['hundreds', 'thousands']);
    expect(dim(4, 1245, 328, false, { focusedPlace: 'thousands', answerDigits: { units: '3' } })).toEqual(['units']);
    // 53 − 18: the tens box before the units — the units, and the tens their break comes from.
    expect(dim(5, 53, 18, true, { focusedPlace: 'tens' })).toEqual(['hundreds', 'thousands']);
    expect(dim(5, 53, 18, true, { focusedPlace: 'tens', answerDigits: { units: '5' } })).toEqual(['units', 'hundreds', 'thousands']);
    // Meeting 1, 61 − 24.
    expect(dim(1, 61, 24, true, { focusedPlace: 'tens' })).toEqual(['hundreds', 'thousands']);
    expect(dim(1, 61, 24, true, { focusedPlace: 'tens', answerDigits: { units: '7' } })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('an addition: a lower column still holding ten blocks or more stays lit (its grouping carries into the focus)', () => {
    const typed = { answerDigits: { units: '3' } };
    expect(dim(4, 1245, 328, false, { ...typed, focusedPlace: 'tens' }, { counts: { units: 13, tens: 6, hundreds: 5, thousands: 1 } })).toEqual(['hundreds', 'thousands']);
    expect(dim(4, 1245, 328, false, { ...typed, focusedPlace: 'tens' }, { counts: { units: 3, tens: 7, hundreds: 5, thousands: 1 } })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('a column that lacks blocks: the column its break comes from stays lit', () => {
    // 53 − 18: units 3 < 8 — a ten is broken.
    expect(dim(5, 53, 18, true, { focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    // …then the tens alone (5 − 1 = 4 ≥ 1).
    expect(dim(5, 53, 18, true, { focusedPlace: 'tens', answerDigits: { units: '5' } })).toEqual(['units', 'hundreds', 'thousands']);
    // Meeting 1, 61 − 24 and 806 − 351, the child standing in the box.
    expect(dim(1, 61, 24, true, { focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    expect(dim(1, 806, 351, true, { focusedPlace: 'tens', answerDigits: { units: '5' } })).toEqual(['units', 'thousands']);
    expect(dim(1, 806, 351, true, { focusedPlace: 'tens' })).toEqual(['thousands']); // the units box still empty
    expect(dim(1, 806, 351, true, { focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('a break through empty columns lights every column the block passes', () => {
    // 4,000 − 1,562: at the units a thousand is broken down to a ten.
    expect(dim(6, 4000, 1562, true, { focusedPlace: 'units' })).toEqual([]);
    // 6,020 − 1,485: the units break a ten; the tens then break a thousand through the empty hundreds.
    expect(dim(6, 6020, 1485, true, { focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    expect(dim(6, 6020, 1485, true, { focusedPlace: 'tens', answerDigits: { units: '5' } })).toEqual(['units']);
    // 300 − 142: one chain at the units; the tens then hold 9 and need nothing.
    expect(dim(6, 300, 142, true, { focusedPlace: 'units' })).toEqual(['thousands']);
    expect(dim(6, 300, 142, true, { focusedPlace: 'tens', answerDigits: { units: '8' } })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('a memory circle in a break chain lights the whole chain', () => {
    // 4,000 − 1,562, the thousands circle: the units lack blocks, the break passes tens and hundreds.
    for (const answerDigits of [{}, { units: '8' }, { units: '8', tens: '3' }, { units: '8', tens: '3', hundreds: '4' }]) {
      expect(dim(6, 4000, 1562, true, { focusedMemoryCircle: 'thousands', answerDigits }), JSON.stringify(answerDigits)).toEqual([]);
      expect(dim(6, 4000, 1562, true, { focusedMemoryCircle: 'hundreds', answerDigits }), JSON.stringify(answerDigits)).toEqual([]);
    }
    // The thousands result box, the lower digits written: the chain is done — the thousands alone.
    expect(dim(6, 4000, 1562, true, { focusedPlace: 'thousands', answerDigits: { units: '8', tens: '3', hundreds: '4' } })).toEqual(['units', 'tens', 'hundreds']);
    // 53 − 18, the tens circle: the units too, even after the units digit.
    expect(dim(5, 53, 18, true, { focusedMemoryCircle: 'tens', answerDigits: { units: '5' } })).toEqual(['hundreds', 'thousands']);
    // …but not the tens result box once the units are written.
    expect(dim(5, 53, 18, true, { focusedPlace: 'tens', answerDigits: { units: '5' } })).toEqual(['units', 'hundreds', 'thousands']);
    // 6,020 − 1,485, the hundreds circle: it only passes the tens' break — the tens, hundreds and thousands.
    expect(dim(6, 6020, 1485, true, { focusedMemoryCircle: 'hundreds', answerDigits: { units: '5', tens: '3' } })).toEqual(['units']);
  });

  it('a missing result digit: the lower columns the child works out on the board stay lit', () => {
    // s4_r_t7: 328 + 145, only the tens box — the units are grouped first.
    const s4 = verticalBoxes(328, 145, 473, {}, ['units', 'hundreds'], 3);
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 4, taskType: 'vertical_addition', vertical: s4, work: work(328, 145, false), focusedPlace: 'tens' }))).toEqual(['hundreds', 'thousands']);
    // s6_r_t7: 400 − 156, only the tens box — the units break a hundred through the empty tens.
    const s6 = verticalBoxes(400, 156, 244, {}, ['units', 'hundreds'], 3);
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 6, taskType: 'vertical_addition', vertical: s6, work: work(400, 156, true), focusedPlace: 'tens' }))).toEqual(['thousands']);
  });

  it('skeleton with a hidden operand, computing: only while a box is focused, with the inverse operation’s breaks', () => {
    // s7_g_t2: 2,▢3▢ + 1,554 = 4,191 — worked as 4,191 − 1,554.
    const boxes = verticalBoxes(2637, 1554, 4191, { a: ['hundreds', 'units'] }, PLACE_ORDER);
    const w = work(2637, 1554, false, { hidden: { a: ['hundreds', 'units'] }, boardValue: 4191, heldFrom: true });
    const sk = (over: Partial<ColumnFocusInput>) =>
      sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: boxes, work: w, operandDigits: { a: {}, b: {} }, ...over }));
    expect(sk({})).toEqual([]);
    // Units: 1 < 4 — a ten of 4,191 is broken.
    expect(sk({ focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    // Hundreds, the units box still empty: everything from the units up, and the thousand its break comes from.
    expect(sk({ focusedPlace: 'hundreds' })).toEqual([]);
    // Hundreds, the units written: the tens have no box (worked on the board); 1 < 5 — a thousand is broken.
    expect(sk({ focusedPlace: 'hundreds', operandDigits: { a: { units: '7' }, b: {} } })).toEqual(['units']);
  });

  it('breakSources and boardOperation', () => {
    expect(breakSources(806, 351)).toEqual(new Map([['tens', ['hundreds']]]));
    expect(breakSources(4000, 1562)).toEqual(new Map([['units', ['tens', 'hundreds', 'thousands']]]));
    expect(breakSources(6020, 1485)).toEqual(new Map([['units', ['tens']], ['tens', ['hundreds', 'thousands']]]));
    expect(breakSources(5879, 2431)).toEqual(new Map()); // no column lacks blocks
    expect(boardOperation(work(314, 254, false, { hidden: { a: ['units'] } }))).toEqual({ from: 568, other: 254, subtract: true });
    expect(boardOperation(work(442, 128, true, { hidden: { a: ['tens'] } }))).toEqual({ from: 314, other: 128, subtract: false });
    expect(boardOperation(work(53, 18, true))).toEqual({ from: 53, other: 18, subtract: true });
  });
});

describe('vertical exercises: the focus column (computing, an addition without breaks)', () => {
  // 1,245 + 328 = 1,573: four result boxes; both numbers are on the board.
  const boxes = verticalBoxes(1245, 328, 1573);
  const built: VerticalWork = { a: 1245, b: 328, isSubtraction: false, boardValue: 1573, heldFrom: false };
  const vert = (over: Partial<ColumnFocusInput>) =>
    sorted(dimmedColumns({ ...base, sessionNumber: 4, taskType: 'vertical_addition', vertical: boxes, work: built, answerDigits: {}, ...over }));

  it('a focused result box, hidden-operand box or memory circle of place p lights p and dims the others', () => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedPlace: 'tens', answerDigits: { units: '3' } })).toEqual(['units', 'hundreds', 'thousands']);
    }
    for (const sessionNumber of [3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedMemoryCircle: 'hundreds', answerDigits: { units: '3', tens: '7' } })).toEqual(['units', 'tens', 'thousands']);
    }
    expect(vert({ taskType: 'addition_simple', focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('nothing focused: nothing is dimmed in any meeting, whatever is typed (owner, 7.10.2026)', () => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      for (const answerDigits of [{}, { units: '3' }, { units: '9' }, { units: '3', tens: '7' }, { units: '', tens: '7' }]) {
        expect(vert({ sessionNumber, answerDigits })).toEqual([]);
      }
    }
  });

  it('every box filled: nothing is dimmed', () => {
    expect(vert({ answerDigits: { units: '3', tens: '7', hundreds: '5', thousands: '1' } })).toEqual([]);
  });

  it('a focused box above the lowest empty one lights the places between them', () => {
    expect(vert({ answerDigits: {}, focusedPlace: 'thousands' })).toEqual([]);
    expect(vert({ answerDigits: { units: '3' }, focusedPlace: 'thousands' })).toEqual(['units']);
    expect(vert({ answerDigits: { units: '3', tens: '7' }, focusedPlace: 'thousands' })).toEqual(['units', 'tens']);
    // Below the lowest empty box: the focus alone.
    expect(vert({ answerDigits: { units: '3', tens: '7' }, focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('meeting 1: dimmed only while a box is focused', () => {
    expect(vert({ sessionNumber: 1 })).toEqual([]);
    expect(vert({ sessionNumber: 1, answerDigits: { units: '3' } })).toEqual([]);
    expect(vert({ sessionNumber: 1, focusedPlace: 'hundreds' })).toEqual(['thousands']);
    expect(vert({ sessionNumber: 1, focusedPlace: 'hundreds', answerDigits: { units: '3', tens: '7' } })).toEqual(['units', 'tens', 'thousands']);
    // As on main, the memory circle dims nothing in meeting 1.
    expect(vert({ sessionNumber: 1, focusedMemoryCircle: 'thousands' })).toEqual([]);
  });

  it('lowestEmptyPlace: the lowest empty box, result or hidden operand', () => {
    // s6_r_t7: 400 − 156 = 244, units and hundreds of the result revealed → the tens box.
    const s6 = verticalBoxes(400, 156, 244, {}, ['units', 'hundreds']);
    expect(s6).toEqual({ result: ['tens'], operandA: [], operandB: [] });
    expect(lowestEmptyPlace(s6, {})).toBe('tens');
    // s7_g_t2: 2,637 − 1,554 → every result digit revealed, a's hundreds and units hidden.
    const s7 = verticalBoxes(2637, 1554, 1083, { a: ['hundreds', 'units'] }, PLACE_ORDER);
    expect(lowestEmptyPlace(s7, {}, { a: {}, b: {} })).toBe('units');
    expect(lowestEmptyPlace(s7, {}, { a: { units: '7' }, b: {} })).toBe('hundreds');
    expect(lowestEmptyPlace(s7, {}, { a: { units: '7', hundreds: '6' }, b: {} })).toBe(null);
    // A result box and a hidden operand at the same place: the place stays lit until both hold a digit.
    const mixed = verticalBoxes(442, 128, 314, { a: ['units'] }, []);
    expect(lowestEmptyPlace(mixed, { units: '4' }, { a: {}, b: {} })).toBe('units');
    expect(lowestEmptyPlace(mixed, { units: '4' }, { a: { units: '2' }, b: {} })).toBe('tens');
  });

  it('the dimming is brightness 0.6, as the PRD says', () => {
    expect(DIMMED_COLUMN_FILTER).toBe('brightness(0.6)');
  });
});

/* ------------------------------------------------------------------------- */
/* Every exercise in every bank (meetings 1, 3–7, main and branch).          */
/* ------------------------------------------------------------------------- */

const bankTasks: Array<{ t: SessionTask; session: number }> = [];
{
  const ids = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const t = o as SessionTask;
      if (typeof t.id === 'string' && typeof t.type === 'string') {
        const session = Number(/^s(\d)_/.exec(t.id)?.[1]);
        if (!ids.has(t.id) && [1, 3, 4, 5, 6, 7].includes(session)) {
          ids.add(t.id);
          bankTasks.push({ t, session });
        }
      } else Object.values(o).forEach(walk);
    }
  };
  walk(SessionTasks);
  walk(BranchTasks);
}
const isVertical = (t: SessionTask) => t.type === 'vertical_addition' || t.type === 'addition_simple';

describe('every bank exercise', () => {
  it('found every kind', () => {
    const kinds = new Set<string>(bankTasks.map(({ t }) => t.type));
    for (const k of ['representation', 'flexible_decomp', 'missing_element', 'small_change', 'session1_intro', 'vertical_addition', 'addition_simple']) {
      expect(kinds.has(k), k).toBe(true);
    }
  });

  it('no calculation focus outside the vertical exercises', () => {
    for (const { t, session } of bankTasks.filter(({ t }) => !isVertical(t))) {
      for (const p of [null, ...PLACE_ORDER]) {
        expect(sorted(dimmedColumns({ ...base, sessionNumber: session, taskType: t.type, focusedPlace: p, focusedMemoryCircle: p })), t.id).toEqual([]);
      }
    }
  });
});

/**
 * Every vertical exercise (meetings 1, 3–7, main and branch, the numbers as
 * they are and the ASD numbers) × every stage, through the real store and the
 * selector the board reads (boardDimmedColumns): the board built block column
 * by block column in two orders, then computed column by column, with every
 * box and memory circle focused and with nothing focused. What the child has
 * to act in is worked out here on its own — not with breakSources or
 * boardOperation:
 *  - building: every column;
 *  - computing, focus at place q: q, and every lower place not finished (no
 *    box of its own, or its box still empty), each with its break chain in a
 *    subtraction on the board;
 *  - a memory circle at q: also every column whose break passes q, and that
 *    break's whole chain (the circle records it, the column's digit written
 *    or not).
 * None of these may be dimmed — and the computing stage must still dim.
 */
describe('every vertical exercise × every stage, through the store', () => {
  type Op = { from: number; other: number; subtract: boolean };
  const digit = (n: number, i: number) => Math.floor(n / 10 ** i) % 10;
  const countsOf = (n: number): PlaceCounts => ({ units: digit(n, 0), tens: digit(n, 1), hundreds: digit(n, 2), thousands: digit(n, 3) });
  const worth = (c: PlaceCounts) => c.units + 10 * c.tens + 100 * c.hundreds + 1000 * c.thousands;
  // The board work, written out again: a hidden first number is found by the inverse operation.
  const opOf = (t: SessionTask, a: number, b: number): Op => {
    const r = t.isSubtraction ? a - b : a + b;
    if (t.hiddenDigits?.a?.length) return { from: r, other: b, subtract: !t.isSubtraction };
    if (t.hiddenDigits?.b?.length) return t.isSubtraction ? { from: a, other: r, subtract: true } : { from: r, other: a, subtract: true };
    return { from: a, other: b, subtract: t.isSubtraction === true };
  };
  /** The board as the child builds it: one column at a time, in the given order (states before the work starts). */
  const buildingBoards = (op: Op, order: Place[]): PlaceCounts[] => {
    const c: PlaceCounts = { ...EMPTY_COUNTS };
    const out: PlaceCounts[] = [];
    const add = (n: number) => order.forEach((p) => {
      const d = digit(n, PLACE_ORDER.indexOf(p));
      if (d) { c[p] += d; out.push({ ...c }); }
    });
    add(op.from);
    if (!op.subtract) add(op.other);
    out.pop(); // the last one is the board the work starts from
    return out;
  };
  /** The board after each column is computed, and each column's break chain. */
  const compute = (op: Op) => {
    const c: PlaceCounts = op.subtract ? countsOf(op.from) : (() => {
      const f = countsOf(op.from), o = countsOf(op.other);
      return { units: f.units + o.units, tens: f.tens + o.tens, hundreds: f.hundreds + o.hundreds, thousands: f.thousands + o.thousands };
    })();
    const boards: PlaceCounts[] = [{ ...c }];
    const chain: Partial<Record<Place, Place[]>> = {};
    PLACE_ORDER.forEach((p, i) => {
      if (op.subtract) {
        const need = digit(op.other, i);
        if (c[p] < need) {
          let j = i + 1;
          while (c[PLACE_ORDER[j]] === 0) j++;
          chain[p] = PLACE_ORDER.slice(i + 1, j + 1);
          for (let k = j; k > i; k--) { c[PLACE_ORDER[k]] -= 1; c[PLACE_ORDER[k - 1]] += 10; }
        }
        c[p] -= need;
      } else if (c[p] >= 10 && i < 3) {
        c[p] -= 10;
        c[PLACE_ORDER[i + 1]] += 1;
      }
      boards.push({ ...c });
    });
    return { boards, chain };
  };

  const variants: Array<{ t: SessionTask; session: number; isASD: boolean; label: string }> = [];
  {
    const vertical = bankTasks.filter(({ t }) => isVertical(t));
    for (const v of vertical) for (const isASD of [false, true]) variants.push({ ...v, isASD, label: `${v.t.id}${isASD ? ' ASD' : ''}` });
    // No bank exercise carries ASD numbers today (the catalog may): each plain
    // exercise once more with the numbers of another of its kind as ASD numbers,
    // so a selector or record that read numberA instead would show.
    const plain = vertical.filter(({ t }) => !t.hiddenDigits && !t.revealedResultDigits);
    plain.forEach(({ t, session }, i) => {
      const other = plain.slice(i + 1).concat(plain.slice(0, i)).find(({ t: u }) => u.isSubtraction === t.isSubtraction && u.numberA !== t.numberA);
      if (!other) return;
      variants.push({ t: { ...t, asdNumberA: other.t.numberA, asdNumberB: other.t.numberB }, session, isASD: true, label: `${t.id} ASD=${other.t.id}` });
    });
  }

  // The store as the other tests find it.
  let before: ReturnType<typeof ws>;
  beforeAll(() => { before = ws(); });
  afterAll(() => useWorkspaceStore.setState(before, true));

  const loadTask = (t: SessionTask, session: number, isASD: boolean) => {
    useWorkspaceStore.setState({
      sessionNumber: session, isASD, dynamicTasks: [t], standardTaskIdx: 0,
      counts: { ...EMPTY_COUNTS }, focusedPlace: null, answerDigits: {}, operandDigits: { a: {}, b: {} },
      takeAwayTrack: null, heldFromTrack: null,
    } as any);
  };

  it('0 states where a column the child has to act in is dimmed; dimming present while computing', () => {
    let states = 0;
    let building = 0;
    let computing = 0;
    let computingDimmed = 0;
    const violations: string[] = [];
    const neverDims: string[] = [];
    for (const { t, session, isASD, label } of variants) {
      const { a, b, target } = effectiveArithmetic(t, isASD);
      const boxes: VerticalBoxes = verticalBoxes(a, b, target, t.hiddenDigits, t.revealedResultDigits, resultBoxCount(session, a, b, target));
      const boxed = (p: Place) => boxes.result.includes(p) || boxes.operandA.includes(p) || boxes.operandB.includes(p);
      const op = opOf(t, a, b);
      const boxFocuses = PLACE_ORDER.filter(boxed);
      const circles: Place[] = session === 1 ? [] : PLACE_ORDER;
      const focuses: Array<{ box: Place | null; circle: Place | null }> = [
        { box: null, circle: null },
        ...boxFocuses.map((p) => ({ box: p, circle: null })),
        ...circles.map((p) => ({ box: null, circle: p })),
      ];
      const dimNow = (k: number, f: { box: Place | null; circle: Place | null }) => {
        const answerDigits: Partial<Record<Place, string>> = {};
        const operandDigits = { a: {} as Partial<Record<Place, string>>, b: {} as Partial<Record<Place, string>> };
        PLACE_ORDER.slice(0, k).forEach((p) => {
          if (boxes.result.includes(p)) answerDigits[p] = '0';
          if (boxes.operandA.includes(p)) operandDigits.a[p] = '0';
          if (boxes.operandB.includes(p)) operandDigits.b[p] = '0';
        });
        return boardDimmedColumns({ ...ws(), focusedPlace: f.box, answerDigits, operandDigits }, f.circle);
      };

      for (const order of [PLACE_ORDER, [...PLACE_ORDER].reverse()]) {
        loadTask(t, session, isASD);
        // Building: nothing dimmed, whatever is focused.
        for (const c of buildingBoards(op, order)) {
          useWorkspaceStore.setState({ counts: c });
          for (const f of focuses) {
            states++; building++;
            const d = sorted(dimNow(0, f));
            if (d.length) violations.push(`${label} building ${worth(c)} ${JSON.stringify(f)} → ${d}`);
          }
        }
        // Computing, column by column.
        const { boards, chain } = compute(op);
        let dimmedHere = false;
        boards.forEach((c, k) => {
          useWorkspaceStore.setState({ counts: c });
          const done = (p: Place) => boxed(p) && PLACE_ORDER.indexOf(p) < k;
          const involved = (p: Place): Place[] => (op.subtract ? [p, ...(chain[p] ?? [])] : [p]);
          const forFocus = (q: Place) => {
            const s = new Set<Place>();
            for (const p of PLACE_ORDER.slice(0, PLACE_ORDER.indexOf(q) + 1)) if (p === q || !done(p)) involved(p).forEach((x) => s.add(x));
            return s;
          };
          for (const f of focuses) {
            states++; computing++;
            let needed = new Set<Place>();
            if (f.box) needed = forFocus(f.box);
            else if (f.circle) {
              needed = forFocus(f.circle);
              // The circle records a break: the whole chain, its digit written or not.
              for (const p of PLACE_ORDER) if (chain[p]?.includes(f.circle)) involved(p).forEach((x) => needed.add(x));
            }
            const d = dimNow(k, f);
            // Owner, 7.10.2026: no box or circle, no dimming.
            if (!f.box && !f.circle && d.size) violations.push(`${label} computing k=${k} nothing focused → dims ${sorted(d)}`);
            if (d.size) { computingDimmed++; dimmedHere = true; }
            const wrong = PLACE_ORDER.filter((p) => needed.has(p) && d.has(p));
            if (wrong.length) violations.push(`${label} computing k=${k} ${JSON.stringify(f)} → dims ${wrong}`);
          }
        });
        if (!dimmedHere) neverDims.push(label);
      }
    }
    if (process.env.DIMMING_PROBE) {
      console.log(JSON.stringify({ variants: variants.length, states, building, computing, computingDimmed, violations: violations.length, neverDims }, null, 1));
    }
    expect(variants.length).toBeGreaterThan(100);
    // Main and branch banks, every meeting with vertical exercises.
    for (const id of ['s1_r_sub806', 's4_g_t1', 's5_r_t7', 's6_g_t3', 's7_g_t3', 's7_r_reinforce_1', 's7_g_challenge_1']) {
      expect(variants.some(({ t }) => t.id === id), id).toBe(true);
    }
    expect(violations).toEqual([]);
    expect(neverDims).toEqual([]);
    expect(computingDimmed).toBeGreaterThan(computing / 3);
  });
});

/** Every vertical exercise in every bank: verticalBoxes names exactly the inputs VerticalAdditionTask draws. */
describe('verticalBoxes matches the exercise sheet', () => {
  const all = bankTasks.map(({ t }) => t).filter(isVertical);
  const LABEL: Record<string, Place> = { יחידות: 'units', עשרות: 'tens', מאות: 'hundreds', אלפים: 'thousands' };
  const placesIn = (c: HTMLElement, re: RegExp): Place[] =>
    PLACE_ORDER.filter((p) =>
      Array.from(c.querySelectorAll('input')).some((i) => {
        const m = (i.getAttribute('aria-label') ?? '').match(re);
        return m !== null && LABEL[m[1]] === p;
      })
    );

  it('found the skeletons', () => {
    expect(all.length).toBeGreaterThan(50);
    expect(all.some((t) => t.hiddenDigits?.a?.length)).toBe(true);
  });

  it.each([false, true])('isASD=%s', (isASD) => {
    for (const t of all) {
      cleanup();
      const { a, b, target } = effectiveArithmetic(t, isASD);
      const revealed: Partial<Record<Place, string>> = {};
      for (const p of t.revealedResultDigits ?? []) revealed[p] = '0';
      const { container } = render(
        <VerticalAdditionTask
          numberA={a}
          numberB={b}
          isSubtraction={t.isSubtraction}
          answerLength={String(Math.abs(target)).length}
          hiddenA={t.hiddenDigits?.a}
          hiddenB={t.hiddenDigits?.b}
          revealedResult={revealed}
        />
      );
      const boxes = verticalBoxes(a, b, target, t.hiddenDigits, t.revealedResultDigits);
      expect(placesIn(container, /^ספרת ה(\S+) בתשובה$/), t.id).toEqual(boxes.result);
      expect(placesIn(container, /^ספרת ה(\S+) החסרה במספר הראשון$/), t.id).toEqual(boxes.operandA);
      expect(placesIn(container, /^ספרת ה(\S+) החסרה במספר השני$/), t.id).toEqual(boxes.operandB);
    }
  });
});

describe('on the board', () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: { uid: 'student_user12', name: 'user12' } as any, role: 'student', isAuthenticated: true });
    approvePath(); // the s3_g_ / s4_g_ exercises are on the approved green path (Module 26)
    useWorkspaceStore.getState().resetWorkspace();
    useBoardFocusStore.setState({ focusedMemoryCircle: null });
  });

  const renderBoard = () =>
    render(
      <DndContext>
        {PLACE_ORDER.map((p) => <PlaceColumn key={p} place={p} />)}
      </DndContext>
    );
  const dimmed = (c: HTMLElement): Place[] =>
    PLACE_ORDER.filter((p) => (c.querySelector(`#column-${p}`) as HTMLElement).dataset.dimmed === 'true');

  const goTo = (session: 1 | 3 | 4, taskId: string) => {
    useWorkspaceStore.getState().initSession(session, false);
    const idx = getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === taskId);
    expect(idx, taskId).toBeGreaterThanOrEqual(0);
    useWorkspaceStore.setState({ standardTaskIdx: idx } as any);
  };

  // 1,245 + 328 built: both numbers' blocks, before any grouping; and after the units are grouped.
  const BUILT_1245_328 = { units: 13, tens: 6, hundreds: 5, thousands: 1 };
  const UNITS_GROUPED = { units: 3, tens: 7, hundreds: 5, thousands: 1 };

  it('meeting 1, 347 (owner, 2.10.2026): the cursor in a result box dims nothing', () => {
    goTo(1, 's1_target_347');
    for (const focusedPlace of [null, 'units', 'tens', 'hundreds'] as const) {
      useWorkspaceStore.setState({ counts: { units: 7, tens: 4, hundreds: 3, thousands: 0 }, focusedPlace } as any);
      expect(dimmed(renderBoard().container), String(focusedPlace)).toEqual([]);
      cleanup();
    }
  });

  it('meeting 3, "45 מאות": nothing dimmed, whatever box is focused', () => {
    goTo(3, 's3_g_t3');
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    for (const focusedPlace of [null, 'units', 'tens', 'hundreds', 'thousands'] as const) {
      useWorkspaceStore.setState({ focusedPlace } as any);
      expect(dimmed(renderBoard().container), String(focusedPlace)).toEqual([]);
      cleanup();
    }
  });

  it('meeting 4, vertical: nothing dimmed while the numbers are built or nothing is focused; the box the child stands in lights its column', () => {
    goTo(4, 's4_g_t1');
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 5, tens: 4, hundreds: 2, thousands: 1 }, focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual([]); // only 1,245 so far, the cursor in a box
    act(() => useWorkspaceStore.setState({ counts: BUILT_1245_328, focusedPlace: null } as any));
    expect(dimmed(container)).toEqual([]); // built, but the child is in no box
    act(() => useWorkspaceStore.setState({ focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    const tens = container.querySelector('#column-tens') as HTMLElement;
    expect(tens.style.filter).toBe('brightness(0.6)');
    // Only the brightness the PRD names; the column is not also made see-through.
    expect(tens.style.opacity).toBe('');
    expect(tens.className).not.toContain('opacity-60');
    // The units digit typed before the units were grouped, the cursor on to the tens: the units stay lit.
    act(() => useWorkspaceStore.setState({ answerDigits: { units: '3' }, focusedPlace: 'tens' } as any));
    expect(dimmed(container)).toEqual(['hundreds', 'thousands']);
    act(() => useWorkspaceStore.setState({ counts: UNITS_GROUPED } as any));
    expect(dimmed(container)).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('meeting 1, 806 − 351: nothing dimmed while 806 is built; in the tens box the hundreds stay lit for the break', () => {
    goTo(1, 's1_r_sub806');
    useWorkspaceStore.setState({ focusedPlace: 'tens' } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 6, tens: 0, hundreds: 8, thousands: 0 } } as any));
    expect(useWorkspaceStore.getState().takeAwayTrack?.held).toBe(true);
    // The units box still empty: the units with the tens and the hundreds.
    expect(dimmed(container)).toEqual(['thousands']);
    // Units taken away first (6 − 1): the units box dims the tens and the hundreds, which need nothing yet.
    act(() => useWorkspaceStore.setState({ counts: { units: 5, tens: 0, hundreds: 8, thousands: 0 }, focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    act(() => useWorkspaceStore.setState({ answerDigits: { units: '5' }, focusedPlace: 'tens' } as any));
    expect(dimmed(container)).toEqual(['units', 'thousands']);
  });

  it('meeting 5 green, 6,284 − 1,157, in the units box: the units and the tens their break comes from', () => {
    useWorkspaceStore.getState().initSession(5, false);
    const idx = getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === 's5_g_t5');
    expect(idx).toBeGreaterThanOrEqual(0);
    useWorkspaceStore.setState({ standardTaskIdx: idx } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 4, tens: 8, hundreds: 2, thousands: 6 } } as any));
    expect(dimmed(container)).toEqual([]); // nothing focused
    act(() => useWorkspaceStore.setState({ focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual(['hundreds', 'thousands']);
  });

  it('the memory circle lights its column without touching focusedPlace or activeColumnIndex', () => {
    goTo(4, 's4_g_t1');
    useWorkspaceStore.setState({ counts: UNITS_GROUPED, answerDigits: { units: '3' } } as any);
    // With the place-cue scaffold on, the circle is named by its column
    // (without it, meetings 3–7 name it by position — core/placeCues.ts).
    useWorkspaceStore.setState({ activeColumnIndex: 0, placeCuesShown: true } as any);
    const before = { focusedPlace: useWorkspaceStore.getState().focusedPlace, activeColumnIndex: useWorkspaceStore.getState().activeColumnIndex };
    const sheet = render(<VerticalAdditionTask numberA={1245} numberB={328} answerLength={4} />);
    const circle = sheet.getByLabelText('עיגול הזיכרון של טור העשרות');
    fireEvent.focus(circle);
    expect(useBoardFocusStore.getState().focusedMemoryCircle).toBe('tens');
    const board = renderBoard();
    expect(dimmed(board.container)).toEqual(['units', 'hundreds', 'thousands']);
    // The units box emptied again: the circle's column depends on it.
    act(() => useWorkspaceStore.setState({ answerDigits: {} } as any));
    expect(dimmed(board.container)).toEqual(['hundreds', 'thousands']);
    expect({ focusedPlace: useWorkspaceStore.getState().focusedPlace, activeColumnIndex: useWorkspaceStore.getState().activeColumnIndex }).toEqual(before);
    fireEvent.blur(circle);
    expect(useBoardFocusStore.getState().focusedMemoryCircle).toBe(null);
    // Unmounting while focused (the next exercise) clears it too.
    fireEvent.focus(circle);
    sheet.unmount();
    expect(useBoardFocusStore.getState().focusedMemoryCircle).toBe(null);
  });

  it('dimming leaves every column clickable and droppable (no pointer-events lock)', () => {
    goTo(4, 's4_g_t1');
    useWorkspaceStore.setState({ counts: BUILT_1245_328, focusedPlace: 'units' } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    for (const p of PLACE_ORDER) {
      const col = container.querySelector(`#column-${p}`) as HTMLElement;
      expect(col.style.pointerEvents).not.toBe('none');
      expect(col.className).not.toContain('pointer-events-none');
    }
  });
});

/**
 * Whether the board has held the number the work starts from — takeAwayTrack
 * (the first number) and heldFromTrack (view only: a skeleton's result) —
 * through the real store: drags, the trash, undo, the next exercise, a reload.
 */
describe('held, through the store', () => {
  const byId = (id: string) => {
    const t = bankTasks.find(({ t: x }) => x.id === id)?.t;
    if (!t) throw new Error(`no task ${id}`);
    return t;
  };
  const load = (meeting: number, task: SessionTask, isASD = false) => {
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
    useWorkspaceStore.setState({
      sessionNumber: meeting, isASD, dynamicTasks: [task], standardTaskIdx: 0, flowStatus: 'task', awaitingNext: false,
      openingScreenSeen: true, helpState: 'closed', currentState: 'PROBLEM_ACTIVE', operandDigits: { a: {}, b: {} },
    } as any);
    useBoardFocusStore.setState({ focusedMemoryCircle: null });
  };
  const drag = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: p, target: { kind: 'column', place: p } }); };
  const trash = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().removeBlockClick(p); };
  const undo = (n = 1) => { for (let i = 0; i < n; i++) ws().undo(); };
  const worthNow = () => { const c = ws().counts; return c.thousands * 1000 + c.hundreds * 100 + c.tens * 10 + c.units; };
  const dims = (focusedPlace: Place | null, circle: Place | null = null) => sorted(boardDimmedColumns({ ...ws(), focusedPlace }, circle));
  const likeTheDatabase = (value: unknown): any => {
    const prune = (v: unknown): unknown => {
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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('nextHeldFromTrack: held once the board is worth the number, until the board is emptied or the exercise changes', () => {
    expect(nextHeldFromTrack(null, 't', 568, 500)).toEqual({ taskId: 't', held: false });
    expect(nextHeldFromTrack({ taskId: 't', held: false }, 't', 568, 568)).toEqual({ taskId: 't', held: true });
    expect(nextHeldFromTrack({ taskId: 't', held: true }, 't', 568, 314)).toEqual({ taskId: 't', held: true });
    expect(nextHeldFromTrack({ taskId: 't', held: true }, 't', 568, 0)).toEqual({ taskId: 't', held: false });
    expect(nextHeldFromTrack({ taskId: 't', held: true }, 'u', 568, 314)).toEqual({ taskId: 'u', held: false });
    expect(nextHeldFromTrack(undefined, 't', 568, 568)).toEqual({ taskId: 't', held: true });
  });

  it('53 − 18: building, held, taking away, undo past the first number, the trash', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    expect(dims('units')).toEqual([]); // building
    drag('units', 3);
    expect(ws().takeAwayTrack).toMatchObject({ held: true });
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    ws().splitBlockClick('tens');
    trash('units', 8);
    expect(dims('units')).toEqual(['hundreds', 'thousands']); // taking away: still held
    undo(2);
    expect(worthNow()).toBe(47);
    expect(dims('units')).toEqual(['hundreds', 'thousands']); // undo below 53 while taking away keeps it
    undo(8); // the cap: ten frames back
    expect(ws().counts).toMatchObject({ tens: 5, units: 2 });
    expect(ws().takeAwayTrack).toMatchObject({ held: false });
    expect(dims('units')).toEqual([]); // back before 53 was built: building again
    drag('units');
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    ws().clearBoard();
    expect(ws().takeAwayTrack).toMatchObject({ held: false });
    expect(dims('units')).toEqual([]);
  });

  it('a null or undefined record: building, nothing dimmed, nothing thrown', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    for (const takeAwayTrack of [null, undefined]) {
      useWorkspaceStore.setState({ takeAwayTrack } as any);
      expect(dims('units')).toEqual([]);
      expect(dims(null, 'tens')).toEqual([]);
    }
    load(7, byId('s7_g_t2'));
    useWorkspaceStore.setState({ counts: { thousands: 4, hundreds: 1, tens: 9, units: 1 } });
    for (const heldFromTrack of [null, undefined]) {
      useWorkspaceStore.setState({ heldFromTrack } as any);
      expect(dims('units')).toEqual([]);
    }
  });

  it('a skeleton, 2,▢3▢ + 1,554 = 4,191 (worked as 4,191 − 1,554): heldFromTrack, never takeAwayTrack', () => {
    load(7, byId('s7_g_t2'));
    drag('thousands', 4);
    drag('hundreds', 1);
    drag('tens', 9);
    expect(dims('units')).toEqual([]); // 4,190: still building
    drag('units', 1);
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: true });
    expect(ws().takeAwayTrack).toBe(null); // an addition exercise: the cards' record is not touched
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    ws().splitBlockClick('tens');
    trash('units', 4);
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    undo(5);
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: true }); // back at 4,191
    undo();
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: false }); // 4,190
    expect(dims('units')).toEqual([]);
    drag('units');
    ws().clearBoard();
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: false });
  });

  it('a subtraction skeleton, 5,▢▢▢ − 2,847 = 2,159 (added back): building until the board is worth 5,006', () => {
    load(7, byId('s7_g_t3'));
    drag('thousands', 2); drag('hundreds', 1); drag('tens', 5); drag('units', 9);
    expect(dims('tens')).toEqual([]); // 2,159
    drag('thousands', 2); drag('hundreds', 8); drag('tens', 4); drag('units', 6);
    expect(dims('tens')).toEqual([]); // 5,005
    drag('units');
    expect(dims('tens')).toEqual(['hundreds', 'thousands']); // 5,006: the units box still empty
    expect(ws().heldFromTrack).toBe(null);
  });

  it('the next exercise starts over; a reload keeps the record, and undo after it too', () => {
    const svc = firebaseSyncService as any;
    ws().resetWorkspace();
    approvePath('green_path');
    ws().initSession(7, false, 0);
    const idx = getActiveTasks(ws()).findIndex((t) => t.id === 's7_g_t2');
    expect(idx).toBeGreaterThanOrEqual(0);
    ws().initSession(7, false, idx);
    useWorkspaceStore.setState({ flowStatus: 'task', awaitingNext: false, helpState: 'closed' } as any);
    drag('thousands', 4); drag('hundreds', 1); drag('tens', 9); drag('units', 1);
    ws().splitBlockClick('tens');
    trash('units', 4);
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    const saved = likeTheDatabase(svc.getSyncableWorkspaceState());
    expect(saved.heldFromTrack).toEqual({ taskId: 's7_g_t2', held: true });
    ws().resetWorkspace();
    approvePath('green_path');
    ws().restoreSession(saved);
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: true });
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
    undo(6);
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: false }); // the frame saved before 4,191
    expect(dims('units')).toEqual([]);
    // Held again, then the next exercise: nothing carried over.
    drag('units');
    expect(ws().heldFromTrack).toEqual({ taskId: 's7_g_t2', held: true });
    ws().initSession(7, false, idx + 1);
    expect(ws().heldFromTrack?.held ?? false).toBe(false);
    expect(ws().takeAwayTrack?.held ?? false).toBe(false);
    for (const p of PLACE_ORDER) expect(dims(p)).toEqual([]);
  });

  it('the ASD numbers: the record and the dimming follow them', () => {
    // 53 − 18 with the ASD numbers of 61 − 24 (test numbers, not a bank exercise).
    const t = { ...byId('s5_r_t2'), asdNumberA: 61, asdNumberB: 24 };
    load(5, t, true);
    drag('tens', 5);
    drag('units', 3);
    expect(ws().takeAwayTrack).toMatchObject({ held: false }); // 53 is not the ASD first number
    expect(dims('units')).toEqual([]);
    trash('tens', 5);
    trash('units', 3);
    drag('tens', 6);
    drag('units', 1);
    expect(ws().takeAwayTrack).toMatchObject({ held: true });
    expect(dims('units')).toEqual(['hundreds', 'thousands']);
  });
});
