import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { useWorkspaceStore, getActiveTasks, SESSION1_ORDER_BEFORE_27_9 } from '@/application/useWorkspaceStore';
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
 */

const ws = () => useWorkspaceStore.getState();
const current = () => getActiveTasks(ws())[ws().standardTaskIdx]?.id;
const byId = (id: string) => SESSION1_TASKS.find((t) => t.id === id)!;
const OLD_BANK: SessionTask[] = SESSION1_ORDER_BEFORE_27_9.map(byId);
const snapshot = () => JSON.parse(JSON.stringify((firebaseSyncService as any).getSyncableWorkspaceState()));

/** The published catalog (Module 26) serves meeting 1 in the order before 27.9.2026. */
function catalogServesOldOrder() {
  vi.spyOn(curriculumCatalog, 'getActiveBank').mockImplementation((n: number) => (n === 1 ? OLD_BANK : null));
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
    expect([...SESSION1_ORDER_BEFORE_27_9].sort()).toEqual(SESSION1_TASKS.map((t) => t.id).sort());
    const now = SESSION1_TASKS.map((t) => t.id);
    const moved = now.map((id, i) => (SESSION1_ORDER_BEFORE_27_9[i] === id ? null : id)).filter(Boolean);
    expect(moved).toEqual(['s1_r_group26', 's1_target_347']);
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
    reloadFrom(snapshot()); // and once more, on 713 + 94, where both orders agree
    expect(current()).toBe('s1_t8');
    expect(ws().dynamicTasks).toBeNull();
  });

  it('a device whose cached catalog is still the old one, restoring a place counted in the new order', () => {
    ws().initSession(1, false, SESSION1_TASKS.findIndex((t) => t.id === 's1_r_group26'));
    const saved = snapshot();
    catalogServesOldOrder();
    reloadFrom(saved);
    solveGroup26();
    solveTarget347();
    expect(current()).toBe('s1_t8');
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
