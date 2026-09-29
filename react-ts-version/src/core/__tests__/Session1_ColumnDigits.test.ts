import { describe, it, expect } from 'vitest';
import { columnDigitsShown } from '@/core/columnDigits';
import { EMPTY_COUNTS, type PlaceCounts } from '@/core/placeValue';
import { SESSION1_TASKS } from '@/data/sessionTasks';

/**
 * Owner, 29.9.2026: the digit beside each column's name hands the child the
 * answer wherever they build, calculate or write. In station 1 it shows only in
 * steps 1–3, and in the 305 step once the board is 305.
 */
const c = (x: Partial<PlaceCounts>): PlaceCounts => ({ ...EMPTY_COUNTS, ...x });

describe('station 1: where the column digits show', () => {
  it('steps 1–3 show them', () => {
    expect(columnDigitsShown(1, 's1_sandbox_controlled', c({ units: 4 }))).toBe(true);
    expect(columnDigitsShown(1, 's1_decompose_hundred', c({ hundreds: 2, tens: 3 }))).toBe(true);
  });

  it('305: hidden while building, shown once the board is 305', () => {
    expect(columnDigitsShown(1, 's1_build_305', c({}))).toBe(false);
    expect(columnDigitsShown(1, 's1_build_305', c({ hundreds: 3 }))).toBe(false);
    expect(columnDigitsShown(1, 's1_build_305', c({ hundreds: 3, units: 5 }))).toBe(true);
    // 305 built another way still counts as 305 (the checklist asks to empty the tens)
    expect(columnDigitsShown(1, 's1_build_305', c({ hundreds: 2, tens: 10, units: 5 }))).toBe(true);
  });

  it('every other station-1 screen hides them', () => {
    const shownIds = new Set(['s1_sandbox_controlled', 's1_decompose_hundred', 's1_build_305']);
    const others = SESSION1_TASKS.map((t) => t.id).filter((id) => !shownIds.has(id));
    expect(others).toEqual(expect.arrayContaining(['s1_undo_trash', 's1_r_group26', 's1_target_347', 's1_t8', 's1_r_sub61', 's1_r_sub806']));
    for (const id of others) {
      expect(columnDigitsShown(1, id, c({ hundreds: 3, tens: 3, units: 7 }))).toBe(false);
    }
  });

  it('stations 3–7 are unchanged until each is decided', () => {
    for (const n of [3, 4, 5, 6, 7]) expect(columnDigitsShown(n, 'any', c({ units: 7 }))).toBe(true);
  });
});
