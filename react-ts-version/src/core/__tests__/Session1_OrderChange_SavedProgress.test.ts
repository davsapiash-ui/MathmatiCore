import { continueAfterSuccess } from '@/tests/successHold';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useWorkspaceStore, getActiveTasks, SESSION1_ORDER_BEFORE_27_9, SESSION1_ORDER_BEFORE_29_9, SESSION1_ORDER_29_9_MIDDAY } from '@/application/useWorkspaceStore';
import { SESSION1_TASKS, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS } from '@/core/placeValue';
import { curriculumCatalog } from '@/infrastructure/services/CurriculumCatalogService';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

/**
 * Register decision י (owner, 27.9.2026): meeting 1 now runs the grouping
 * exercise (26) before the target task (347). The saved workspace records the
 * exercise by its place in the list and by its id. A learner who is in the
 * middle of meeting 1 when the new order reaches them — with the deploy, or
 * when the admin publishes the catalog again (Module 26) — must neither skip
 * an exercise nor do one twice. They finish the meeting in the order they
 * started it.
 *
 * On 29.9.2026 (owner) two refresh exercises were added after step 5 (368, the
 * value of a digit; 482 in words), and later the same day a third before them
 * (703 in words, a 0 in the tens). A learner whose place was counted in an
 * older, shorter order (SESSION1_ORDER_BEFORE_27_9, SESSION1_ORDER_BEFORE_29_9
 * or SESSION1_ORDER_29_9_MIDDAY) goes on in that order, and the exercises added
 * since come at its end, in today's order.
 */

const ws = () => useWorkspaceStore.getState();
const current = () => getActiveTasks(ws())[ws().standardTaskIdx]?.id;
const byId = (id: string) => SESSION1_TASKS.find((t) => t.id === id)!;
const OLD_BANK: SessionTask[] = SESSION1_ORDER_BEFORE_27_9.map(byId);
const BANK_BEFORE_29_9: SessionTask[] = SESSION1_ORDER_BEFORE_29_9.map(byId);
const BANK_29_9_MIDDAY: SessionTask[] = SESSION1_ORDER_29_9_MIDDAY.map(byId);
/** The exercises added on 29.9.2026, in today's order, which an order before 29.9 finishes with. */
const ADDED_29_9 = ['s1_r_words703', 's1_r_value368', 's1_r_words482'];
/** The exercise added later on 29.9.2026, which the midday order finishes with. */
const ADDED_29_9_LATER = ['s1_r_words703'];
const activeIds = () => getActiveTasks(ws()).map((t) => t.id);
const snapshot = () => JSON.parse(JSON.stringify((firebaseSyncService as any).getSyncableWorkspaceState()));

/** The published catalog (Module 26) serves meeting 1 in the order before 27.9.2026. */
function catalogServesOldOrder() {
  vi.spyOn(curriculumCatalog, 'getActiveBank').mockImplementation((n: number) => (n === 1 ? OLD_BANK : null));
}

/** The published catalog serves meeting 1 in the order of 27.9–29.9.2026 (nine exercises). */
function catalogServesOrderBefore29_9() {
  vi.spyOn(curriculumCatalog, 'getActiveBank').mockImplementation((n: number) => (n === 1 ? BANK_BEFORE_29_9 : null));
}

/** The published catalog serves meeting 1 in the order of midday 29.9.2026 (eleven exercises, no 703). */
function catalogServesOrder29_9Midday() {
  vi.spyOn(curriculumCatalog, 'getActiveBank').mockImplementation((n: number) => (n === 1 ? BANK_29_9_MIDDAY : null));
}

/** Solves whatever exercise is current (every exercise of meeting 1 by its id). */
function solveCurrent() {
  switch (current()) {
    case 's1_target_347': return solveTarget347();
    case 's1_r_group26': return solveGroup26();
    default: {
      // the store's own gate is not what these tests check: jump the place by one
      useWorkspaceStore.setState({ standardTaskIdx: ws().standardTaskIdx + 1 });
    }
  }
}

function solveTarget347() {
  expect(current()).toBe('s1_target_347');
  useWorkspaceStore.setState({
    counts: { ...EMPTY_COUNTS, hundreds: 3, tens: 3, units: 17 },
    hasUngrouped: true,
    // The ten broken into units, as splitBlockClick records it (audit A2-F06).
    conversionsByColumn: { composed: {}, decomposed: { units: true }, times: { decomposed: { units: 1 } } },
    answerDigits: { hundreds: '3', tens: '4', units: '7' },
  });
  ws().proceed();
  continueAfterSuccess();
}

function solveGroup26() {
  expect(current()).toBe('s1_r_group26');
  ws().groupColumnClick('units');
  ws().groupColumnClick('units');
  useWorkspaceStore.setState({ answerDigits: { tens: '2', units: '6' } });
  ws().proceed();
  continueAfterSuccess();
}

/** The page reloads after the deploy: the store is rebuilt from the saved workspace. */
function reloadFrom(saved: unknown) {
  ws().resetWorkspace();
  ws().restoreSession(saved);
}

beforeEach(() => ws().resetWorkspace());
afterEach(() => {
  vi.restoreAllMocks();
});

describe('the order before 27.9.2026', () => {
  it('holds the same nine exercises, with only the target task and the grouping exercise swapped', () => {
    expect([...SESSION1_ORDER_BEFORE_27_9].sort()).toEqual([...SESSION1_ORDER_BEFORE_29_9].sort());
    const next = SESSION1_ORDER_BEFORE_29_9;
    const moved = next.map((id, i) => (SESSION1_ORDER_BEFORE_27_9[i] === id ? null : id)).filter(Boolean);
    expect(moved).toEqual(['s1_r_group26', 's1_target_347']);
  });
});

describe('the order before 29.9.2026', () => {
  it('is today\'s order without the three exercises added after step 5 — nothing else moved', () => {
    const now = SESSION1_TASKS.map((t) => t.id);
    expect(now.filter((id) => !ADDED_29_9.includes(id))).toEqual([...SESSION1_ORDER_BEFORE_29_9]);
    expect(now.slice(4, 7)).toEqual(ADDED_29_9);
    for (const id of ADDED_29_9) expect(SESSION1_ORDER_BEFORE_29_9).not.toContain(id);
  });

  it('the midday order of 29.9 is today\'s order without 703 — nothing else moved', () => {
    const now = SESSION1_TASKS.map((t) => t.id);
    expect(now.filter((id) => !ADDED_29_9_LATER.includes(id))).toEqual([...SESSION1_ORDER_29_9_MIDDAY]);
    expect(now[4]).toBe('s1_r_words703');
    expect(SESSION1_ORDER_29_9_MIDDAY).not.toContain('s1_r_words703');
    // and the order before 29.9 is the midday order without 368 and 482
    expect(SESSION1_ORDER_29_9_MIDDAY.filter((id) => !ADDED_29_9.includes(id))).toEqual([...SESSION1_ORDER_BEFORE_29_9]);
  });
});

describe('a learner in the middle of meeting 1 when the new order arrives', () => {
  it('standing on the target task: finishes it, then the grouping exercise, then 713 + 94 — nothing skipped', () => {
    catalogServesOldOrder();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_27_9.indexOf('s1_target_347'));
    expect(current()).toBe('s1_target_347');
    const saved = snapshot();

    vi.restoreAllMocks(); // the new order reaches this device
    expect(getActiveTasks({ ...ws(), dynamicTasks: null } as any).map((t) => t.id)).toEqual(SESSION1_TASKS.map((t) => t.id));
    reloadFrom(saved);
    // the order the place was counted in, and the exercises added since at its end
    expect(activeIds()).toEqual([...SESSION1_ORDER_BEFORE_27_9, ...ADDED_29_9]);

    solveTarget347();
    solveGroup26();
    expect(current()).toBe('s1_t8');
  });

  it('standing on the grouping exercise, the target task already done: goes on to 713 + 94 — nothing repeated', () => {
    catalogServesOldOrder();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_27_9.indexOf('s1_target_347'));
    solveTarget347();
    expect(current()).toBe('s1_r_group26');
    const saved = snapshot();

    vi.restoreAllMocks();
    reloadFrom(saved);

    solveGroup26();
    expect(current()).toBe('s1_t8');
  });

  it('a second reload on the way keeps the same order', () => {
    catalogServesOldOrder();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_27_9.indexOf('s1_target_347'));
    const first = snapshot();
    vi.restoreAllMocks();
    reloadFrom(first);
    solveTarget347();
    reloadFrom(snapshot()); // reload again, now on the grouping exercise
    solveGroup26();
    expect(current()).toBe('s1_t8');
    reloadFrom(snapshot()); // and once more, on 713 + 94 (since 29.9.2026 not in the same place in today's order)
    expect(current()).toBe('s1_t8');
    expect(activeIds()).toEqual([...SESSION1_ORDER_BEFORE_27_9, ...ADDED_29_9]);
  });

  it('a device whose cached catalog is still the old one, restoring a place counted in a newer order of the same exercises', () => {
    // The order of 27.9–29.9.2026 against a catalog still in the order before 27.9.
    catalogServesOrderBefore29_9();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_29_9.indexOf('s1_r_group26'));
    const saved = snapshot();
    vi.restoreAllMocks();
    catalogServesOldOrder();
    reloadFrom(saved);
    solveGroup26();
    solveTarget347();
    expect(current()).toBe('s1_t8');
  });

  // A place counted in today's twelve exercises, restored on a device whose
  // cached catalog still has nine: it must not land on the old bank's place
  // (713 + 94) and skip the grouping and target tasks.
  it('a device whose cached catalog is still the old one, restoring a place counted in today\'s order', () => {
    ws().initSession(1, false, SESSION1_TASKS.findIndex((t) => t.id === 's1_r_group26'));
    const saved = snapshot();
    catalogServesOldOrder();
    reloadFrom(saved);
    solveGroup26();
    solveTarget347();
    expect(current()).toBe('s1_t8');
  });
});

describe('a learner in the middle of meeting 1 when the 29.9.2026 exercises arrive', () => {
  it('standing on the target task in the order before 29.9: finishes that order, then 703, 368 and 482 — nothing skipped, nothing repeated', () => {
    catalogServesOrderBefore29_9();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_29_9.indexOf('s1_target_347'));
    expect(current()).toBe('s1_target_347');
    const saved = snapshot();

    vi.restoreAllMocks(); // today's order reaches this device
    expect(getActiveTasks({ ...ws(), dynamicTasks: null } as any).map((t) => t.id)).toEqual(SESSION1_TASKS.map((t) => t.id));
    reloadFrom(saved);
    expect(current()).toBe('s1_target_347');
    expect(activeIds()).toEqual([...SESSION1_ORDER_BEFORE_29_9, ...ADDED_29_9]);

    const seen: string[] = [];
    while (ws().standardTaskIdx < activeIds().length) {
      seen.push(current()!);
      solveCurrent();
    }
    expect(seen).toEqual(['s1_target_347', 's1_t8', 's1_r_sub61', 's1_r_sub806', ...ADDED_29_9]);
  });

  /** A learner saved on 806 − 351 in the order before 29.9, reloaded on today's order, solves it. */
  function fromSub806ToTheAddedExercises() {
    catalogServesOrderBefore29_9();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_29_9.indexOf('s1_r_sub806'));
    const first = snapshot();
    vi.restoreAllMocks();
    reloadFrom(first);
    expect(current()).toBe('s1_r_sub806');
    // 806 − 351 solved: 4 hundreds, 5 tens, 5 units after the borrow, 455 written
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, hundreds: 4, tens: 5, units: 5 },
      hasUngrouped: true,
      answerDigits: { hundreds: '4', tens: '5', units: '5' },
    });
    ws().proceed();
    continueAfterSuccess();
  }

  it('after the last exercise of the older order come the added ones, 703, 368 then 482', () => {
    fromSub806ToTheAddedExercises();
    expect(current()).toBe('s1_r_words703');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9);
  });

  // A reload on an added exercise (place 9, 703; today's order has 713 + 94
  // there) must follow the older order with the added exercises at its end —
  // not land on 713 + 94 again and never reach 703, 368 and 482.
  it('a reload on an added exercise keeps the order it was counted in', () => {
    fromSub806ToTheAddedExercises();
    reloadFrom(snapshot());
    expect(current()).toBe('s1_r_words703');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9);
    // and once more, on 368 (place 10; today's order has 61 − 24 there)
    solveCurrent();
    reloadFrom(snapshot());
    expect(current()).toBe('s1_r_value368');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9.slice(1));
  });

  it('standing on step 5, the same place in both orders: goes on in today\'s order, straight to 703', () => {
    catalogServesOrderBefore29_9();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_29_9.indexOf('s1_undo_trash'));
    const saved = snapshot();
    vi.restoreAllMocks();
    reloadFrom(saved);
    expect(ws().dynamicTasks).toBeNull();
    expect(current()).toBe('s1_undo_trash');
    expect(activeIds()[ws().standardTaskIdx + 1]).toBe('s1_r_words703');
  });
});

describe('a learner in the middle of meeting 1 when 703 arrives (later on 29.9.2026)', () => {
  it('standing on the target task in the midday order: finishes that order, then 703 at the end — nothing skipped, nothing repeated', () => {
    catalogServesOrder29_9Midday();
    ws().initSession(1, false, SESSION1_ORDER_29_9_MIDDAY.indexOf('s1_target_347'));
    expect(current()).toBe('s1_target_347');
    const saved = snapshot();

    vi.restoreAllMocks(); // today's order reaches this device
    expect(getActiveTasks({ ...ws(), dynamicTasks: null } as any).map((t) => t.id)).toEqual(SESSION1_TASKS.map((t) => t.id));
    reloadFrom(saved);
    // place 7 is the grouping exercise in today's order: the learner stays on the target task
    expect(current()).toBe('s1_target_347');
    expect(activeIds()).toEqual([...SESSION1_ORDER_29_9_MIDDAY, ...ADDED_29_9_LATER]);

    const seen: string[] = [];
    while (ws().standardTaskIdx < activeIds().length) {
      const before = ws().standardTaskIdx;
      seen.push(current()!);
      solveCurrent();
      expect(ws().standardTaskIdx, `stuck on ${seen[seen.length - 1]}`).toBeGreaterThan(before);
    }
    expect(seen).toEqual(['s1_target_347', 's1_t8', 's1_r_sub61', 's1_r_sub806', 's1_r_words703']);
    // with what came before the reload: every exercise of today's meeting 1, each exactly once
    const all = [...SESSION1_ORDER_29_9_MIDDAY.slice(0, SESSION1_ORDER_29_9_MIDDAY.indexOf('s1_target_347')), ...seen];
    expect(all.sort()).toEqual(SESSION1_TASKS.map((t) => t.id).sort());
  });

  it('standing on 806 − 351 in the midday order: solves it, then 703; a reload on 703 keeps it', () => {
    catalogServesOrder29_9Midday();
    ws().initSession(1, false, SESSION1_ORDER_29_9_MIDDAY.indexOf('s1_r_sub806'));
    const first = snapshot();
    vi.restoreAllMocks();
    reloadFrom(first);
    expect(current()).toBe('s1_r_sub806');
    useWorkspaceStore.setState({
      counts: { ...EMPTY_COUNTS, hundreds: 4, tens: 5, units: 5 },
      hasUngrouped: true,
      answerDigits: { hundreds: '4', tens: '5', units: '5' },
    });
    ws().proceed();
    continueAfterSuccess();
    expect(current()).toBe('s1_r_words703');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9_LATER);
    // place 11: 806 − 351 in today's order — the reload must not send the learner back to it
    reloadFrom(snapshot());
    expect(current()).toBe('s1_r_words703');
    expect(activeIds()).toEqual([...SESSION1_ORDER_29_9_MIDDAY, ...ADDED_29_9_LATER]);
  });

  it('standing on step 5, the same place in both orders: goes on in today\'s order, straight to 703', () => {
    catalogServesOrder29_9Midday();
    ws().initSession(1, false, SESSION1_ORDER_29_9_MIDDAY.indexOf('s1_undo_trash'));
    const saved = snapshot();
    vi.restoreAllMocks();
    reloadFrom(saved);
    expect(ws().dynamicTasks).toBeNull();
    expect(current()).toBe('s1_undo_trash');
    expect(activeIds()[ws().standardTaskIdx + 1]).toBe('s1_r_words703');
  });
});

describe('nothing changes where the saved place and the bank agree', () => {
  it('a snapshot of the new order restored on the new order', () => {
    ws().initSession(1, false, SESSION1_TASKS.findIndex((t) => t.id === 's1_target_347'));
    reloadFrom(snapshot());
    expect(ws().dynamicTasks).toBeNull();
    expect(current()).toBe('s1_target_347');
  });

  it('the steps before the swap (1–5) are in the same place in both orders', () => {
    for (let i = 0; i < 4; i++) expect(SESSION1_ORDER_BEFORE_27_9[i]).toBe(SESSION1_TASKS[i].id);
    catalogServesOldOrder();
    ws().initSession(1, false, 2); // 305
    const saved = snapshot();
    vi.restoreAllMocks();
    reloadFrom(saved);
    expect(ws().dynamicTasks).toBeNull();
    expect(current()).toBe('s1_build_305');
  });

  it('other meetings are not touched', () => {
    ws().initSession(4, false, 3);
    const id = current();
    reloadFrom(snapshot());
    expect(current()).toBe(id);
    expect(ws().dynamicTasks).toBeNull();
  });
});
