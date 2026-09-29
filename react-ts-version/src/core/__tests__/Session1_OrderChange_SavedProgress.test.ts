import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useWorkspaceStore, getActiveTasks, SESSION1_ORDER_BEFORE_27_9, SESSION1_ORDER_BEFORE_29_9 } from '@/application/useWorkspaceStore';
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
 * value of a digit; 482 in words). A learner whose place was counted in an
 * older, shorter order (SESSION1_ORDER_BEFORE_27_9 or SESSION1_ORDER_BEFORE_29_9)
 * goes on in that order, and the exercises added since come at its end.
 */

const ws = () => useWorkspaceStore.getState();
const current = () => getActiveTasks(ws())[ws().standardTaskIdx]?.id;
const byId = (id: string) => SESSION1_TASKS.find((t) => t.id === id)!;
const OLD_BANK: SessionTask[] = SESSION1_ORDER_BEFORE_27_9.map(byId);
const BANK_BEFORE_29_9: SessionTask[] = SESSION1_ORDER_BEFORE_29_9.map(byId);
/** The exercises added on 29.9.2026, which an older order finishes with. */
const ADDED_29_9 = ['s1_r_value368', 's1_r_words482'];
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
    answerDigits: { hundreds: '3', tens: '4', units: '7' },
  });
  ws().proceed();
}

function solveGroup26() {
  expect(current()).toBe('s1_r_group26');
  ws().groupColumnClick('units');
  ws().groupColumnClick('units');
  useWorkspaceStore.setState({ answerDigits: { tens: '2', units: '6' } });
  ws().proceed();
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
  it('is today\'s order without the two exercises added after step 5 — nothing else moved', () => {
    const now = SESSION1_TASKS.map((t) => t.id);
    expect(now.filter((id) => !ADDED_29_9.includes(id))).toEqual([...SESSION1_ORDER_BEFORE_29_9]);
    expect(now.slice(4, 6)).toEqual(ADDED_29_9);
    for (const id of ADDED_29_9) expect(SESSION1_ORDER_BEFORE_29_9).not.toContain(id);
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

  // KNOWN GAP (29.9.2026), fails on purpose: a place counted in today's eleven
  // exercises, restored on a device whose cached catalog still has nine, lands
  // on the old bank's place (713 + 94) and skips the grouping and target tasks —
  // restoredSession1Order only follows an order whose every exercise is in the
  // bank. When this passes, drop `.fails`.
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
  it('standing on the target task in the order before 29.9: finishes that order, then 368 and 482 — nothing skipped, nothing repeated', () => {
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
  }

  it('after the last exercise of the older order come the added ones, 368 then 482', () => {
    fromSub806ToTheAddedExercises();
    expect(current()).toBe('s1_r_value368');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9);
  });

  // KNOWN GAP (29.9.2026), fails on purpose: a reload on an added exercise
  // (place 9, 368) matches no known order — the older orders have no place 9
  // and today's has 61 − 24 there — so the learner lands on 61 − 24 again and
  // never reaches 368 and 482. restoredSession1Order does not know an older
  // order with the added exercises at its end. When this passes, drop `.fails`.
  it('a reload on an added exercise keeps the order it was counted in', () => {
    fromSub806ToTheAddedExercises();
    reloadFrom(snapshot());
    expect(current()).toBe('s1_r_value368');
    expect(activeIds().slice(ws().standardTaskIdx)).toEqual(ADDED_29_9);
  });

  it('standing on step 5, the same place in both orders: goes on in today\'s order, straight to 368', () => {
    catalogServesOrderBefore29_9();
    ws().initSession(1, false, SESSION1_ORDER_BEFORE_29_9.indexOf('s1_undo_trash'));
    const saved = snapshot();
    vi.restoreAllMocks();
    reloadFrom(saved);
    expect(ws().dynamicTasks).toBeNull();
    expect(current()).toBe('s1_undo_trash');
    expect(activeIds()[ws().standardTaskIdx + 1]).toBe('s1_r_value368');
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
