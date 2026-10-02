// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import {
  dimmedColumns, verticalBoxes, lowestEmptyPlace, breakSources, boardOperation, DIMMED_COLUMN_FILTER,
  type ColumnFocusInput, type VerticalWork,
} from '@/core/columnFocus';
import { resultBoxCount } from '@/core/placeCues';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { VerticalAdditionTask } from '@/features/workspace/tasks/VerticalAdditionTask';
import { useWorkspaceStore, getActiveTasks, effectiveArithmetic } from '@/application/useWorkspaceStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { useAuthStore } from '@/application/useAuthStore';
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
 */

const sorted = (s: ReadonlySet<Place>) => PLACE_ORDER.filter((p) => s.has(p));
const base: ColumnFocusInput = { sessionNumber: 3, taskType: null, focusedPlace: null, focusedMemoryCircle: null };

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
    a, b, isSubtraction, boardValue: isSubtraction ? a : a + b, heldFirstNumber: isSubtraction, ...over,
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

  it('building the numbers: nothing is dimmed, whatever box the cursor is in', () => {
    // 1,245 + 328: the board holds only 1,245 so far.
    for (const focusedPlace of [null, ...PLACE_ORDER]) {
      expect(dim(4, 1245, 328, false, { focusedPlace }, { boardValue: 1245 })).toEqual([]);
      expect(dim(1, 713, 94, false, { focusedPlace }, { boardValue: 700 })).toEqual([]);
    }
    // 53 − 18: the board has not yet held 53.
    expect(dim(5, 53, 18, true, {}, { boardValue: 50, heldFirstNumber: false })).toEqual([]);
    expect(dim(1, 61, 24, true, { focusedPlace: 'units' }, { boardValue: 0, heldFirstNumber: false })).toEqual([]);
  });

  it('computing an addition: the focus column alone — the "קבצו 10" button is on it', () => {
    expect(dim(4, 1245, 328, false)).toEqual(['tens', 'hundreds', 'thousands']);
    expect(dim(4, 1245, 328, false, { answerDigits: { units: '3' } })).toEqual(['units', 'hundreds', 'thousands']);
    expect(dim(1, 713, 94, false, { focusedPlace: 'tens' })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('a column that lacks blocks: the column its break comes from stays lit', () => {
    // 53 − 18: units 3 < 8 — a ten is broken.
    expect(dim(5, 53, 18, true)).toEqual(['hundreds', 'thousands']);
    // …then the tens alone (5 − 1 = 4 ≥ 1).
    expect(dim(5, 53, 18, true, { answerDigits: { units: '5' } })).toEqual(['units', 'hundreds', 'thousands']);
    // Meeting 1, 61 − 24 and 806 − 351, the child standing in the box.
    expect(dim(1, 61, 24, true, { focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    expect(dim(1, 806, 351, true, { focusedPlace: 'tens' })).toEqual(['units', 'thousands']);
    expect(dim(1, 806, 351, true, { focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('a break through empty columns lights every column the block passes', () => {
    // 4,000 − 1,562: at the units a thousand is broken down to a ten.
    expect(dim(6, 4000, 1562, true)).toEqual([]);
    // 6,020 − 1,485: the units break a ten; the tens then break a thousand through the empty hundreds.
    expect(dim(6, 6020, 1485, true)).toEqual(['hundreds', 'thousands']);
    expect(dim(6, 6020, 1485, true, { answerDigits: { units: '5' } })).toEqual(['units']);
    // 300 − 142: one chain at the units; the tens then hold 9 and need nothing.
    expect(dim(6, 300, 142, true)).toEqual(['thousands']);
    expect(dim(6, 300, 142, true, { answerDigits: { units: '8' } })).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('a missing result digit: the lower columns the child works out on the board stay lit', () => {
    // s4_r_t7: 328 + 145, only the tens box — the units are grouped first.
    const s4 = verticalBoxes(328, 145, 473, {}, ['units', 'hundreds'], 3);
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 4, taskType: 'vertical_addition', vertical: s4, work: work(328, 145, false) }))).toEqual(['hundreds', 'thousands']);
    // s6_r_t7: 400 − 156, only the tens box — the units break a hundred through the empty tens.
    const s6 = verticalBoxes(400, 156, 244, {}, ['units', 'hundreds'], 3);
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 6, taskType: 'vertical_addition', vertical: s6, work: work(400, 156, true) }))).toEqual(['thousands']);
  });

  it('skeleton with a hidden operand: only while a box is focused, with the inverse operation’s breaks', () => {
    // s7_g_t2: 2,▢3▢ + 1,554 = 4,191 — worked as 4,191 − 1,554.
    const boxes = verticalBoxes(2637, 1554, 4191, { a: ['hundreds', 'units'] }, PLACE_ORDER);
    const w = work(2637, 1554, false, { hidden: { a: ['hundreds', 'units'] }, boardValue: 0 });
    const sk = (over: Partial<ColumnFocusInput>) =>
      sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: boxes, work: w, operandDigits: { a: {}, b: {} }, ...over }));
    expect(sk({})).toEqual([]);
    // Units: 1 < 4 — a ten of 4,191 is broken.
    expect(sk({ focusedPlace: 'units' })).toEqual(['hundreds', 'thousands']);
    // Hundreds: the tens have no box (worked on the board); 1 < 5 — a thousand is broken.
    expect(sk({ focusedPlace: 'hundreds' })).toEqual(['units']);
    // s7_g_t3: 5,▢▢▢ − 2,847 = 2,159 — added back, 2,159 + 2,847: groupings only.
    const add = verticalBoxes(5006, 2847, 2159, { a: ['hundreds', 'tens', 'units'] }, PLACE_ORDER);
    const wAdd = work(5006, 2847, true, { hidden: { a: ['hundreds', 'tens', 'units'] }, heldFirstNumber: false, boardValue: 0 });
    expect(sorted(dimmedColumns({ ...base, sessionNumber: 7, taskType: 'vertical_addition', vertical: add, work: wAdd, focusedPlace: 'tens' }))).toEqual(['units', 'hundreds', 'thousands']);
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
  const built: VerticalWork = { a: 1245, b: 328, isSubtraction: false, boardValue: 1573, heldFirstNumber: false };
  const vert = (over: Partial<ColumnFocusInput>) =>
    sorted(dimmedColumns({ ...base, sessionNumber: 4, taskType: 'vertical_addition', vertical: boxes, work: built, answerDigits: {}, ...over }));

  it('a focused result box, hidden-operand box or memory circle of place p lights p and dims the others', () => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedPlace: 'tens' })).toEqual(['units', 'hundreds', 'thousands']);
    }
    for (const sessionNumber of [3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedMemoryCircle: 'hundreds' })).toEqual(['units', 'tens', 'thousands']);
    }
    expect(vert({ taskType: 'addition_simple', focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('meetings 3–7, nothing focused: units lit when computing starts', () => {
    for (const sessionNumber of [3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber })).toEqual(['tens', 'hundreds', 'thousands']);
    }
  });

  it('the lit column moves left as soon as the box holds any digit, right or wrong', () => {
    expect(vert({ answerDigits: { units: '3' } })).toEqual(['units', 'hundreds', 'thousands']);
    expect(vert({ answerDigits: { units: '9' } })).toEqual(['units', 'hundreds', 'thousands']); // wrong digit
    expect(vert({ answerDigits: { units: '3', tens: '7' } })).toEqual(['units', 'tens', 'thousands']);
    expect(vert({ answerDigits: { units: '3', tens: '7', hundreds: '5' } })).toEqual(['units', 'tens', 'hundreds']);
    // An emptied box is empty again.
    expect(vert({ answerDigits: { units: '', tens: '7' } })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('every box filled: nothing is dimmed', () => {
    expect(vert({ answerDigits: { units: '3', tens: '7', hundreds: '5', thousands: '1' } })).toEqual([]);
  });

  it('a focused box wins over the lowest empty one', () => {
    expect(vert({ answerDigits: {}, focusedPlace: 'thousands' })).toEqual(['units', 'tens', 'hundreds']);
  });

  it('meeting 1: dimmed only while a box is focused', () => {
    expect(vert({ sessionNumber: 1 })).toEqual([]);
    expect(vert({ sessionNumber: 1, answerDigits: { units: '3' } })).toEqual([]);
    expect(vert({ sessionNumber: 1, focusedPlace: 'hundreds' })).toEqual(['units', 'tens', 'thousands']);
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

/** Every exercise in every bank (meetings 1, 3–7): no dimmed column where the child has to act. */
describe('every bank exercise', () => {
  const tasks: Array<{ t: SessionTask; session: number }> = [];
  const ids = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const t = o as SessionTask;
      if (typeof t.id === 'string' && typeof t.type === 'string') {
        const session = Number(/^s(\d)_/.exec(t.id)?.[1]);
        if (!ids.has(t.id) && [1, 3, 4, 5, 6, 7].includes(session)) {
          ids.add(t.id);
          tasks.push({ t, session });
        }
      } else Object.values(o).forEach(walk);
    }
  };
  walk(SessionTasks);
  walk(BranchTasks);
  const vertical = (t: SessionTask) => t.type === 'vertical_addition' || t.type === 'addition_simple';

  it('found every kind', () => {
    const kinds = new Set<string>(tasks.map(({ t }) => t.type));
    for (const k of ['representation', 'flexible_decomp', 'missing_element', 'small_change', 'session1_intro', 'vertical_addition', 'addition_simple']) {
      expect(kinds.has(k), k).toBe(true);
    }
  });

  it('no calculation focus outside the vertical exercises', () => {
    for (const { t, session } of tasks.filter(({ t }) => !vertical(t))) {
      for (const p of [null, ...PLACE_ORDER]) {
        expect(sorted(dimmedColumns({ ...base, sessionNumber: session, taskType: t.type, focusedPlace: p, focusedMemoryCircle: p })), t.id).toEqual([]);
      }
    }
  });

  const setup = (t: SessionTask, session: number) => {
    const { a, b, target } = effectiveArithmetic(t, false);
    const boxes = verticalBoxes(a, b, target, t.hiddenDigits, t.revealedResultDigits, resultBoxCount(session, a, b, target));
    const w: VerticalWork = { a, b, isSubtraction: t.isSubtraction === true, hidden: t.hiddenDigits, boardValue: 0, heldFirstNumber: false };
    return { a, b, boxes, w };
  };

  it('building the numbers: nothing dimmed, whatever box is focused (skeletons: while no box is focused)', () => {
    for (const { t, session } of tasks.filter(({ t }) => vertical(t))) {
      const { a, boxes, w } = setup(t, session);
      const focuses = t.hiddenDigits ? [null] : [null, ...PLACE_ORDER];
      for (const boardValue of [0, a]) {
        for (const p of focuses) {
          const dim = dimmedColumns({ ...base, sessionNumber: session, taskType: t.type, vertical: boxes, work: { ...w, boardValue }, focusedPlace: p });
          expect(sorted(dim), `${t.id} ${boardValue} ${p}`).toEqual([]);
        }
      }
    }
  });

  it('subtraction, computing: a column that lacks blocks never has the column it breaks from dimmed', () => {
    for (const { t, session } of tasks.filter(({ t }) => vertical(t) && t.isSubtraction && !t.hiddenDigits)) {
      const { a, b, boxes, w } = setup(t, session);
      // The blocks, column by column, worked out here without breakSources.
      const count: Record<Place, number> = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
      PLACE_ORDER.forEach((p, i) => (count[p] = Math.floor(a / 10 ** i) % 10));
      const typed: Partial<Record<Place, string>> = {};
      PLACE_ORDER.forEach((p, i) => {
        const take = Math.floor(b / 10 ** i) % 10;
        const lacking = count[p] < take;
        if (lacking) {
          let j = i + 1;
          while (count[PLACE_ORDER[j]] === 0) j++;
          for (let k = j; k > i; k--) { count[PLACE_ORDER[k]] -= 1; count[PLACE_ORDER[k - 1]] += 10; }
        }
        count[p] -= take;
        if (!boxes.result.includes(p)) return; // a revealed digit: covered with the column above it
        const dim = dimmedColumns({ ...base, sessionNumber: session, taskType: t.type, vertical: boxes, work: { ...w, boardValue: a, heldFirstNumber: true }, answerDigits: { ...typed }, focusedPlace: session === 1 ? p : null });
        expect(dim.has(p), `${t.id} ${p}`).toBe(false);
        if (lacking) expect(dim.has(PLACE_ORDER[i + 1]), `${t.id} ${p} breaks from ${PLACE_ORDER[i + 1]}`).toBe(false);
        typed[p] = '0';
      });
    }
  });
});

/** Every vertical exercise in every bank: verticalBoxes names exactly the inputs VerticalAdditionTask draws. */
describe('verticalBoxes matches the exercise sheet', () => {
  const all: SessionTask[] = [];
  const seen = new Set<string>();
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      const t = o as SessionTask;
      if (typeof t.id === 'string' && typeof t.type === 'string') {
        if (!seen.has(t.id) && (t.type === 'vertical_addition' || t.type === 'addition_simple')) {
          seen.add(t.id);
          all.push(t);
        }
      } else Object.values(o).forEach(walk);
    }
  };
  walk(SessionTasks);
  walk(BranchTasks);

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

  // 1,245 + 328 built: both numbers' blocks, before any grouping.
  const BUILT_1245_328 = { units: 13, tens: 6, hundreds: 5, thousands: 1 };

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

  it('meeting 4, vertical: nothing dimmed while the numbers are built; then units lit, moving left as boxes fill', () => {
    goTo(4, 's4_g_t1');
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 5, tens: 4, hundreds: 2, thousands: 1 }, focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual([]); // only 1,245 so far, the cursor in a box
    act(() => useWorkspaceStore.setState({ counts: BUILT_1245_328, focusedPlace: null } as any));
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    const tens = container.querySelector('#column-tens') as HTMLElement;
    expect(tens.style.filter).toBe('brightness(0.6)');
    // Only the brightness the PRD names; the column is not also made see-through.
    expect(tens.style.opacity).toBe('');
    expect(tens.className).not.toContain('opacity-60');
    act(() => useWorkspaceStore.setState({ answerDigits: { units: '8' } } as any));
    expect(dimmed(container)).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('meeting 1, 806 − 351: nothing dimmed while 806 is built; in the tens box the hundreds stay lit for the break', () => {
    goTo(1, 's1_r_sub806');
    useWorkspaceStore.setState({ focusedPlace: 'tens' } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 6, tens: 0, hundreds: 8, thousands: 0 } } as any));
    expect(useWorkspaceStore.getState().takeAwayTrack?.held).toBe(true);
    expect(dimmed(container)).toEqual(['units', 'thousands']);
    // Units taken away first (6 − 1): the units box dims the tens and the hundreds, which need nothing yet.
    act(() => useWorkspaceStore.setState({ counts: { units: 5, tens: 0, hundreds: 8, thousands: 0 }, focusedPlace: 'units' } as any));
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('meeting 5 green, 6,284 − 1,157, nothing focused: the units and the tens their break comes from', () => {
    useWorkspaceStore.getState().initSession(5, false);
    const idx = getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === 's5_g_t5');
    expect(idx).toBeGreaterThanOrEqual(0);
    useWorkspaceStore.setState({ standardTaskIdx: idx } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    act(() => useWorkspaceStore.setState({ counts: { units: 4, tens: 8, hundreds: 2, thousands: 6 } } as any));
    expect(dimmed(container)).toEqual(['hundreds', 'thousands']);
  });

  it('the memory circle lights its column without touching focusedPlace or activeColumnIndex', () => {
    goTo(4, 's4_g_t1');
    useWorkspaceStore.setState({ counts: BUILT_1245_328 } as any);
    // With the place-cue scaffold on, the circle is named by its column
    // (without it, meetings 3–7 name it by position — core/placeCues.ts).
    useWorkspaceStore.setState({ activeColumnIndex: 0, placeCuesShown: true } as any);
    const before = { focusedPlace: useWorkspaceStore.getState().focusedPlace, activeColumnIndex: useWorkspaceStore.getState().activeColumnIndex };
    const sheet = render(<VerticalAdditionTask numberA={1245} numberB={328} answerLength={4} />);
    const circle = sheet.getByLabelText('חלונית המרה לעשרות');
    fireEvent.focus(circle);
    expect(useBoardFocusStore.getState().focusedMemoryCircle).toBe('tens');
    const board = renderBoard();
    expect(dimmed(board.container)).toEqual(['units', 'hundreds', 'thousands']);
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
    useWorkspaceStore.setState({ counts: BUILT_1245_328 } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    for (const p of PLACE_ORDER) {
      const col = container.querySelector(`#column-${p}`) as HTMLElement;
      expect(col.style.pointerEvents).not.toBe('none');
      expect(col.className).not.toContain('pointer-events-none');
    }
  });
});
