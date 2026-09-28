// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { calculationFocusPlace, isColumnDimmed, DIMMED_COLUMN_FILTER } from '@/core/columnFocus';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';

/**
 * דוח "האפיון מול התוכנה", 28.9.2026, שורה 3.7.
 *
 * PRD מודול 7 §א: "עמעום טורים לא פעילים (brightness: 0.6) ... בטורים שאינם
 * במוקד החישוב הנוכחי". בתרגילי מפגשים 3–7 טור היחידות נשאר מואר ושאר הטורים
 * עומעמו עד שהילד עמד בתיבה — גם בתרגיל "45 מאות", שבו טור המאות, שבו הילד
 * בונה, היה המעומעם. עכשיו: בתרגיל במאונך, הטור במוקד הוא הטור של התיבה שהילד
 * עומד בה; לפני כן אף טור אינו מעומעם. בתרגילי ייצוג ה-PRD אינו מגדיר מוקד,
 * ולכן אף טור אינו מעומעם.
 */

describe('calculationFocusPlace', () => {
  it('vertical exercise: the column of the box the child stands in', () => {
    expect(calculationFocusPlace('vertical_addition', 'tens')).toBe('tens');
    expect(calculationFocusPlace('vertical_addition', null)).toBe(null);
  });

  it('representation and two-representations exercises: no column in focus, whatever box is focused', () => {
    for (const p of PLACE_ORDER) {
      expect(calculationFocusPlace('representation', p)).toBe(null);
      expect(calculationFocusPlace('flexible_decomp', p)).toBe(null);
    }
  });

  it('no focus, nothing dimmed', () => {
    for (const p of PLACE_ORDER) expect(isColumnDimmed(p, null)).toBe(false);
  });

  it('the dimming is brightness 0.6, as the PRD says', () => {
    expect(DIMMED_COLUMN_FILTER).toBe('brightness(0.6)');
  });
});

describe('on the board', () => {
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: { uid: 'student_user12', name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useWorkspaceStore.getState().resetWorkspace();
  });

  const renderBoard = () =>
    render(
      <DndContext>
        {PLACE_ORDER.map((p) => <PlaceColumn key={p} place={p} />)}
      </DndContext>
    );
  const dimmed = (c: HTMLElement): Place[] =>
    PLACE_ORDER.filter((p) => (c.querySelector(`#column-${p}`) as HTMLElement).dataset.dimmed === 'true');

  const goTo = (session: 3 | 4, taskId: string) => {
    useWorkspaceStore.getState().initSession(session, false);
    const idx = getActiveTasks(useWorkspaceStore.getState()).findIndex((t) => t.id === taskId);
    expect(idx, taskId).toBeGreaterThanOrEqual(0);
    useWorkspaceStore.setState({ standardTaskIdx: idx } as any);
  };

  it('meeting 3, "45 מאות": no column is dimmed — before or while the child writes', () => {
    goTo(3, 's3_g_t3');
    expect(getActiveTasks(useWorkspaceStore.getState())[useWorkspaceStore.getState().standardTaskIdx].type).toBe('representation');
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual([]);
    cleanup();
    useWorkspaceStore.setState({ focusedPlace: 'thousands' } as any);
    expect(dimmed(renderBoard().container)).toEqual([]);
  });

  it('vertical exercise: nothing dimmed until the child stands in a box; then every other column is', () => {
    goTo(4, getActiveTasks({ ...useWorkspaceStore.getState(), sessionNumber: 4 } as any)[0].id);
    expect(getActiveTasks(useWorkspaceStore.getState())[useWorkspaceStore.getState().standardTaskIdx].type).toBe('vertical_addition');
    expect(dimmed(renderBoard().container)).toEqual([]);
    cleanup();
    useWorkspaceStore.setState({ focusedPlace: 'tens' } as any);
    const { container } = renderBoard();
    expect(dimmed(container)).toEqual(['units', 'hundreds', 'thousands']);
    const units = container.querySelector('#column-units') as HTMLElement;
    expect(units.style.filter).toBe('brightness(0.6)');
    // Only the brightness the PRD names; the column is not also made see-through.
    expect(units.style.opacity).not.toBe('0.6');
    expect(units.className).not.toContain('opacity-60');
  });
});
