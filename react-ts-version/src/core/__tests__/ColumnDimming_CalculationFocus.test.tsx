// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { dimmedColumns, verticalBoxes, lowestEmptyPlace, DIMMED_COLUMN_FILTER, type ColumnFocusInput } from '@/core/columnFocus';
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
 * (מרשם, פער יט). כל סעיף בהכרעה ננעל כאן בבדיקה משלו.
 */

const sorted = (s: ReadonlySet<Place>) => PLACE_ORDER.filter((p) => s.has(p));
const base: ColumnFocusInput = { sessionNumber: 3, taskType: null, focusedPlace: null, focusedMemoryCircle: null };

describe('representation exercises', () => {
  const rep = (value: number, focusedPlace: Place | null, sessionNumber = 3) =>
    sorted(dimmedColumns({ ...base, sessionNumber, taskType: 'representation', representationValue: value, focusedPlace }));

  it('no result-row box focused: nothing is dimmed', () => {
    expect(rep(4500, null)).toEqual([]);
    expect(rep(347, null, 1)).toEqual([]);
  });

  it('box of place p: p and every lower place stay lit, only higher places are dimmed', () => {
    expect(rep(4500, 'units')).toEqual(['tens', 'hundreds', 'thousands']);
    expect(rep(4500, 'tens')).toEqual(['hundreds', 'thousands']);
    expect(rep(4500, 'hundreds')).toEqual(['thousands']);
    expect(rep(340, 'tens')).toEqual(['hundreds', 'thousands']);
    expect(rep(347, 'units', 1)).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('the highest box of the result row: nothing is dimmed', () => {
    expect(rep(4500, 'thousands')).toEqual([]);
    expect(rep(340, 'hundreds')).toEqual([]); // the board's thousands column stays lit too
    expect(rep(26, 'tens', 1)).toEqual([]);
  });

  it('the memory circle store is ignored (a representation has none)', () => {
    expect(sorted(dimmedColumns({ ...base, taskType: 'representation', representationValue: 4500, focusedMemoryCircle: 'units' }))).toEqual([]);
  });
});

describe('flexible_decomp and missing_element', () => {
  it('never dimmed, whatever is focused', () => {
    for (const taskType of ['flexible_decomp', 'missing_element']) {
      for (const sessionNumber of [1, 3, 7]) {
        for (const p of [null, ...PLACE_ORDER]) {
          expect(sorted(dimmedColumns({ ...base, sessionNumber, taskType, focusedPlace: p, focusedMemoryCircle: p }))).toEqual([]);
        }
      }
    }
  });
});

describe('vertical exercises', () => {
  // 1,245 + 328 = 1,573: four result boxes.
  const boxes = verticalBoxes(1245, 328, 1573);
  const vert = (over: Partial<ColumnFocusInput>) =>
    sorted(dimmedColumns({ ...base, sessionNumber: 4, taskType: 'vertical_addition', vertical: boxes, answerDigits: {}, ...over }));

  it('a focused result box, hidden-operand box or memory circle of place p lights p and dims the others', () => {
    for (const sessionNumber of [1, 3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedPlace: 'tens' })).toEqual(['units', 'hundreds', 'thousands']);
    }
    for (const sessionNumber of [3, 4, 5, 6, 7]) {
      expect(vert({ sessionNumber, focusedMemoryCircle: 'hundreds' })).toEqual(['units', 'tens', 'thousands']);
    }
    expect(vert({ taskType: 'addition_simple', focusedPlace: 'units' })).toEqual(['tens', 'hundreds', 'thousands']);
  });

  it('meetings 3–7, nothing focused: units lit when the exercise opens', () => {
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

  it('skeleton: the lowest empty box, result or hidden operand', () => {
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

  it('meeting 3, "45 מאות": nothing dimmed until a box is focused; the hundreds box dims only the thousands', () => {
    goTo(3, 's3_g_t3');
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    expect(dimmed(renderBoard().container)).toEqual([]);
    cleanup();
    useWorkspaceStore.setState({ focusedPlace: 'hundreds' } as any);
    expect(dimmed(renderBoard().container)).toEqual(['thousands']);
    cleanup();
    useWorkspaceStore.setState({ focusedPlace: 'thousands' } as any);
    expect(dimmed(renderBoard().container)).toEqual([]);
  });

  it('meeting 4, vertical: units lit when the exercise opens; the column moves left as boxes fill', () => {
    goTo(4, 's4_g_t1');
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual(['tens', 'hundreds', 'thousands']);
    const tens = container.querySelector('#column-tens') as HTMLElement;
    expect(tens.style.filter).toBe('brightness(0.6)');
    // Only the brightness the PRD names; the column is not also made see-through.
    expect(tens.style.opacity).toBe('');
    expect(tens.className).not.toContain('opacity-60');
    act(() => useWorkspaceStore.setState({ answerDigits: { units: '8' } } as any));
    expect(dimmed(container)).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('meeting 1, vertical: nothing dimmed until a box is focused', () => {
    goTo(1, 's1_r_sub806');
    expect(dimmed(renderBoard().container)).toEqual([]);
    cleanup();
    useWorkspaceStore.setState({ focusedPlace: 'tens' } as any);
    expect(dimmed(renderBoard().container)).toEqual(['units', 'hundreds', 'thousands']);
  });

  it('the memory circle lights its column without touching focusedPlace or activeColumnIndex', () => {
    goTo(4, 's4_g_t1');
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
    const { container } = renderBoard();
    for (const p of PLACE_ORDER) {
      const col = container.querySelector(`#column-${p}`) as HTMLElement;
      expect(col.style.pointerEvents).not.toBe('none');
      expect(col.className).not.toContain('pointer-events-none');
    }
  });
});
