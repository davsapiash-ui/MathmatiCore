// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { fitBlockGrid } from '@/core/blockLayout';
import { MAX_VISIBLE_BLOCKS, PLACE_ORDER, PLACE_VALUES, type Place } from '@/core/placeValue';
import { PlaceColumn } from '@/features/workspace/board/PlaceColumn';
import { COLUMN_CELLS } from '@/features/workspace/board/columnCells';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import {
  SESSION1_TASKS,
  SESSION3_GREEN_TASKS, SESSION3_REMEDIATION_TASKS,
  SESSION4_GREEN_TASKS, SESSION4_REMEDIATION_TASKS,
  SESSION5_GREEN_TASKS, SESSION5_REMEDIATION_TASKS,
  SESSION6_GREEN_TASKS, SESSION6_REMEDIATION_TASKS,
  SESSION7_GREEN_TASKS, SESSION7_REMEDIATION_TASKS,
  type SessionTask,
} from '@/data/sessionTasks';
import { SESSION_BRANCH_TASKS } from '@/data/sessionBranchTasks';

/**
 * דוח "האפיון מול התוכנה", 28.9.2026, שורות 1.16 ו-3.8.
 *
 * PRD מודול 7 §א: גרירת לבנה, פריטתה או הקבצתה "מעדכנת מיידית את הספרה בטור
 * המתאים". הספרה אישרה מה שהילד לא ראה: ב-1366×768 טור המאות הציג 6 לוחות
 * כשהספרה הייתה 8, ובתרגיל 3 של מפגש 3 במסלול הירוק (45 מאות) 5 לוחות מתחת
 * לספרה 45. עכשיו כל טור מציג את כל הלבנים שלו: הן שומרות על גודלן כל עוד
 * הן נכנסות, וכשלא — כל לבני הטור קטנות יחד בדיוק כדי להיכנס.
 */

/**
 * The space each column's blocks get (px), measured on the screen on 28.9.2026
 * with the real frontend at each laptop size, board open, meetings 1 and 3.
 * Every one of them must hold 50 blocks of every kind.
 */
const MEASURED_BLOCK_AREAS: { viewport: string; w: number; h: number }[] = [
  // Meeting 3 (four columns), with "קבץ 10" at the top of every column.
  { viewport: '1024x768', w: 88, h: 270 },
  { viewport: '1280x720', w: 120, h: 238 },
  { viewport: '1366x768', w: 131, h: 286 },
  { viewport: '1536x864', w: 152, h: 378 },
  // The same with the coaching card open beside the board — the narrowest board.
  { viewport: '1024x768 + card', w: 60, h: 144 },
  { viewport: '1280x720 + card', w: 93, h: 222 },
  { viewport: '1366x768 + card', w: 105, h: 270 },
  { viewport: '1536x864 + card', w: 120, h: 382 },
  // Meeting 1 (three columns).
  { viewport: '1024x768 m1', w: 127, h: 348 },
  { viewport: '1280x720 m1', w: 170, h: 300 },
  { viewport: '1366x768 m1', w: 184, h: 348 },
  { viewport: '1536x864 m1', w: 212, h: 440 },
];

const every = (): SessionTask[] => {
  const banks: SessionTask[][] = [
    SESSION1_TASKS,
    SESSION3_GREEN_TASKS, SESSION3_REMEDIATION_TASKS,
    SESSION4_GREEN_TASKS, SESSION4_REMEDIATION_TASKS,
    SESSION5_GREEN_TASKS, SESSION5_REMEDIATION_TASKS,
    SESSION6_GREEN_TASKS, SESSION6_REMEDIATION_TASKS,
    SESSION7_GREEN_TASKS, SESSION7_REMEDIATION_TASKS,
  ];
  for (const bySession of Object.values(SESSION_BRANCH_TASKS)) {
    for (const bank of Object.values(bySession)) {
      for (const list of Object.values(bank)) if (Array.isArray(list)) banks.push(list as SessionTask[]);
    }
  }
  return banks.flat();
};

const digit = (n: number, p: Place) => Math.floor(Math.abs(n) / PLACE_VALUES[p]) % 10;

/** The most blocks an exercise can ask a column to hold. */
function mostBlocksAsked(task: SessionTask, place: Place): number {
  const listed = Math.max(task.requiredCounts?.[place] ?? 0, task.initialCounts?.[place] ?? 0);
  const a = task.numberA ?? 0;
  const b = task.numberB ?? 0;
  if (task.type === 'vertical_addition' || task.type === 'addition_simple') {
    // Addition: both addends built, plus one block grouped in from the right.
    // Subtraction: the minuend's digit plus ten blocks decomposed from the column
    // on its left (the thousands column has none).
    const fromLeft = place === 'thousands' ? 0 : 10;
    return Math.max(listed, task.isSubtraction ? digit(a, place) + fromLeft : digit(a, place) + digit(b, place) + 1);
  }
  if (task.type === 'flexible_decomp') {
    // Any representation of the number is allowed — as many of this place as it holds.
    return Math.max(listed, Math.floor(a / PLACE_VALUES[place]));
  }
  return listed;
}

describe('the blocks an exercise can ask for all fit the column', () => {
  it('no exercise in meetings 1 and 3–7 (both tracks, reinforcement and challenge) asks a column for more than a column holds, except flexible ones the cap bounds', () => {
    const tasks = every();
    expect(tasks.length).toBeGreaterThan(80);
    const most: Record<Place, number> = { units: 0, tens: 0, hundreds: 0, thousands: 0 };
    for (const t of tasks) for (const p of PLACE_ORDER) {
      const asked = mostBlocksAsked(t, p);
      if (t.type !== 'flexible_decomp') expect(asked, `${t.id} ${p}`).toBeLessThanOrEqual(MAX_VISIBLE_BLOCKS);
      most[p] = Math.max(most[p], Math.min(asked, MAX_VISIBLE_BLOCKS));
    }
    // מסמך 03 §3.3 ex. 3 asks for 45 hundreds and 45 tens; the two-representations
    // exercises (2,100 … 4,200) can fill the tens and units columns to the cap.
    // So the layout is built for the cap, 50, in every column.
    console.info('most blocks an exercise can ask per column:', JSON.stringify(most));
    expect(most.hundreds).toBe(45);
    expect(most.tens).toBe(MAX_VISIBLE_BLOCKS);
  });

  it('the requested counts of the audited exercises', () => {
    const t = every();
    expect(t.find((x) => x.id === 's3_g_t3')?.requiredCounts).toEqual({ hundreds: 45 });
    expect(t.find((x) => x.id === 's3_r_t3')?.requiredCounts).toEqual({ tens: 45 });
  });
});

describe('fitBlockGrid', () => {
  it('keeps the drawn size while the blocks fit', () => {
    const f = fitBlockGrid(3, COLUMN_CELLS.hundreds, { w: 200, h: 400 });
    expect(f.scale).toBe(1);
    expect(f.block).toEqual({ w: 82, h: 48 });
  });

  it('shrinks all blocks of the column together, just enough, when they do not fit', () => {
    const f = fitBlockGrid(45, COLUMN_CELLS.hundreds, { w: 120, h: 380 });
    expect(f.scale).toBeLessThan(1);
    expect(f.perRow * f.cell.w).toBeLessThanOrEqual(120);
    expect(f.rows * f.cell.h).toBeLessThanOrEqual(380);
    expect(f.perRow * f.rows).toBeGreaterThanOrEqual(45);
    // Just enough: the same blocks in a column a little smaller no longer fit at this size.
    const tighter = fitBlockGrid(45, COLUMN_CELLS.hundreds, { w: 120, h: f.rows * f.cell.h - 1 });
    expect(tighter.scale).toBeLessThan(f.scale);
  });

  it('empty column: nothing to lay out', () => {
    expect(fitBlockGrid(0, COLUMN_CELLS.units, { w: 100, h: 100 }).rows).toBe(0);
  });

  for (const place of PLACE_ORDER) {
    it(`50 ${place} fit every measured laptop column, and never grow past the drawn size`, () => {
      for (const area of MEASURED_BLOCK_AREAS) {
        for (let n = 1; n <= MAX_VISIBLE_BLOCKS; n++) {
          const f = fitBlockGrid(n, COLUMN_CELLS[place], area);
          expect(f.scale, `${area.viewport} n=${n}`).toBeLessThanOrEqual(1);
          expect(f.perRow * f.cell.w, `${area.viewport} n=${n} width`).toBeLessThanOrEqual(area.w);
          expect(f.rows * f.cell.h, `${area.viewport} n=${n} height`).toBeLessThanOrEqual(area.h);
          expect(f.perRow * f.rows, `${area.viewport} n=${n} slots`).toBeGreaterThanOrEqual(n);
        }
      }
    });
  }
});

describe('the column renders every block, at the fitted size', () => {
  const box = { w: 118, h: 360 };
  const originalRO = globalThis.ResizeObserver;
  let restore: (() => void) | null = null;
  beforeAll(() => {
    // jsdom has no layout: the blocks area reports the measured size.
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const ch = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return box.w; } });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return box.h; } });
    (globalThis as any).ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
    restore = () => {
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw);
      if (ch) Object.defineProperty(HTMLElement.prototype, 'clientHeight', ch);
      (globalThis as any).ResizeObserver = originalRO;
    };
  });
  afterAll(() => restore?.());
  beforeEach(() => {
    cleanup();
    useAuthStore.setState({ user: { uid: 'student_user12', name: 'user12' } as any, role: 'student', isAuthenticated: true });
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(3, false);
  });

  it('45 hundreds: 45 flats on the screen, all inside the column', () => {
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    const { container } = render(<DndContext><PlaceColumn place="hundreds" /></DndContext>);
    const blocks = container.querySelectorAll('[id^="column-hundreds-"][role="button"]');
    expect(blocks.length).toBe(45);
    const f = fitBlockGrid(45, COLUMN_CELLS.hundreds, box);
    expect(f.rows * f.cell.h).toBeLessThanOrEqual(box.h);
    const first = blocks[0] as HTMLElement;
    expect(Number(first.dataset.blockW)).toBe(f.block.w);
    expect(Number(first.dataset.blockH)).toBe(f.block.h);
    // The cell is exactly the computed size: no line box adds height under the
    // block (measured on screen: 26px cells where 15px were computed).
    expect(first.style.display).toBe('flex');
    expect(first.style.height).toBe(`${f.block.h}px`);
    expect(first.style.padding).toBe(`${f.pad}px`);
    // Nothing in the column scrolls or clips a block away.
    const zone = container.querySelector('#column-hundreds-dropzone') as HTMLElement;
    expect(zone.className).not.toMatch(/overflow-y-auto|no-scrollbar/);
  });

  it('a block stays a button that splits on click at its new size', () => {
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    const { container } = render(<DndContext><PlaceColumn place="hundreds" /></DndContext>);
    (container.querySelector('#column-hundreds-0') as HTMLElement).click();
    expect(useWorkspaceStore.getState().counts.hundreds).toBe(44);
    expect(useWorkspaceStore.getState().counts.tens).toBe(10);
  });

  it('the digit sits beside the column name, not pinned over it', () => {
    useWorkspaceStore.setState({ counts: { units: 0, tens: 0, hundreds: 45, thousands: 0 } } as any);
    const { container } = render(<DndContext><PlaceColumn place="hundreds" /></DndContext>);
    const badge = Array.from(container.querySelectorAll('span[aria-hidden="true"]')).find((e) => e.textContent === '45') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.className).not.toMatch(/\babsolute\b/);
  });
});
