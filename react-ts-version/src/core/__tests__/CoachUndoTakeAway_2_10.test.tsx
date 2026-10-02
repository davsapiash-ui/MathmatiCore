/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Verification of the final-review fixes (2.10.2026), client side: the
 * take-away record (takeAwayTrack) moves back with the board on undo. 53 − 18
 * built, a ten thrown away, then undo run back to 30 used to read "taking
 * away has started" — "you took out too much, press undo" while each undo
 * removed more blocks. And a building slip (54 → 53) is not taking away.
 * Everything through the real store (applyDrop, removeBlockClick, clearBoard,
 * undo, its subscription and its snapshot).
 */

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
const mockStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => (key in mockStorage ? mockStorage[key] : null)),
  setItem: vi.fn((key: string, val: string) => { mockStorage[key] = String(val); }),
  removeItem: vi.fn((key: string) => { delete mockStorage[key]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); }),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: mockLocalStorage, writable: true, configurable: true });

import { useWorkspaceStore, staticCardContextFor, getActiveTasks, restoreUndoFrames, type SocraticTriggerReason } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { SocraticEngine, type SocraticHintResponse } from '@/infrastructure/services/SocraticEngine';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { SESSION1_TASKS, getSessionTasks, type SessionTask } from '@/data/sessionTasks';
import { EMPTY_COUNTS, type Place, type PlaceCounts } from '@/core/placeValue';

const bank: SessionTask[] = [...SESSION1_TASKS];
for (const m of [3, 4, 5, 6, 7, 8] as const) for (const p of ['green_path', 'remediation_path'] as const) bank.push(...getSessionTasks(m, p));
const byId = (id: string) => {
  const t = bank.find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  return t;
};
const textsOf = (h: SocraticHintResponse) => [h.questionHe, ...h.choices.flatMap((c) => [c.textHe, c.feedbackHe ?? ''])];
const ws = () => useWorkspaceStore.getState();
const flush = () => vi.advanceTimersByTimeAsync(0);

function load(meeting: number, task: SessionTask) {
  ws().resetWorkspace();
  useAuthStore.setState({ user: { uid: 'student_user1', student_id: 1, role: 'student' } } as any);
  useWorkspaceStore.setState({
    sessionNumber: meeting,
    dynamicTasks: [task],
    standardTaskIdx: 0,
    flowStatus: 'task',
    awaitingNext: false,
    openingScreenSeen: true,
    helpState: 'closed',
    currentState: 'PROBLEM_ACTIVE',
    operandDigits: { a: {}, b: {} },
  } as any);
  useBoardFocusStore.setState({ focusedMemoryCircle: null });
}
const board = (c: Partial<PlaceCounts>) => useWorkspaceStore.setState({ counts: { ...EMPTY_COUNTS, ...c } });
const drag = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().applyDrop({ source: 'palette', sourcePlace: p, target: { kind: 'column', place: p } }); };
const trash = (p: Place, n = 1) => { for (let i = 0; i < n; i++) ws().removeBlockClick(p); };
const undo = (n = 1) => { for (let i = 0; i < n; i++) ws().undo(); };
const worth = () => { const c = ws().counts; return c.thousands * 1000 + c.hundreds * 100 + c.tens * 10 + c.units; };
const ctxNow = () => {
  const task = getActiveTasks(ws())[ws().standardTaskIdx];
  return staticCardContextFor(ws(), task.id, task);
};
async function cardFor(reason: SocraticTriggerReason, place?: Place): Promise<SocraticHintResponse | null> {
  ws().openSocraticCard(reason, place);
  await flush();
  const card = ws().helpState === 'socratic' ? ws().aiSocraticHint : null;
  ws().recordSocraticAnswer(false);
  ws().closeHelp();
  return card;
}
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
  mockLocalStorage.clear();
  vi.spyOn(SocraticEngine, 'getSocraticHint').mockRejectedValue(new Error('offline'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('undo takes the take-away record back with the board', () => {
  it('53 − 18: 53 built, a ten thrown away, then undo run back to 30 — building, never "took too much"', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    trash('tens');
    expect(worth()).toBe(43);
    expect(ctxNow().blocksRemoved).toBe(true);
    undo();
    expect(worth()).toBe(53);
    expect(ws().takeAwayTrack).toMatchObject({ taskId: 's5_r_t2', held: true, started: false });
    expect(ctxNow().blocksRemoved).toBe(false);
    undo(4);
    expect(worth()).toBe(40);
    expect(ws().takeAwayTrack).toMatchObject({ held: false, started: false });
    expect(ctxNow().blocksRemoved).toBe(false);
    const at40 = (await cardFor('hesitation_45s'))!;
    expect(at40.situation).not.toMatch(/took_too_many/);
    undo();
    expect(worth()).toBe(30);
    expect(ctxNow().blocksRemoved).toBe(false);
    for (let i = 0; i < 2; i++) {
      const c = await cardFor('hesitation_45s');
      if (c) {
        expect(c.situation).not.toMatch(/took_too_many/);
        expect(textsOf(c).join(' ')).not.toContain('כפתור ביטול הפעולה');
      }
    }
    // The same card as a child who built 40 and nothing else.
    load(5, byId('s5_r_t2'));
    drag('tens', 4);
    expect((await cardFor('hesitation_45s'))!.situation).toBe(at40.situation);
  });

  it('53 − 18: built again after the undo run, then a unit thrown away — taking away again', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    trash('tens');
    undo(6);
    expect(worth()).toBe(30);
    drag('tens', 2);
    drag('units', 3);
    expect(ws().takeAwayTrack).toMatchObject({ held: true, started: false });
    trash('units');
    expect(ctxNow().blocksRemoved).toBe(true);
  });

  it('53 − 18 while taking away: an undo that stays below 53 keeps taking away', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    ws().splitBlockClick('tens');
    trash('units', 8);
    trash('tens', 1);
    undo();
    expect(worth()).toBe(45);
    expect(ctxNow().blocksRemoved).toBe(true);
  });

  it('61 − 24, too much taken: still "took too much", and one undo (still under 37) keeps it', async () => {
    load(1, byId('s1_r_sub61'));
    const t = byId('s1_r_sub61');
    board({ tens: 6, units: 1 });
    if (t.initialCounts) board(t.initialCounts as Partial<PlaceCounts>);
    ws().splitBlockClick('tens');
    trash('units', 11);
    trash('tens', 3);
    expect(worth()).toBe(20);
    expect(ctxNow().blocksRemoved).toBe(true);
    expect((await cardFor('hesitation_45s'))!.situation).toMatch(/took_too_many/);
    undo();
    expect(worth()).toBe(30);
    expect(ctxNow().blocksRemoved).toBe(true);
  });

  it('the record in the undo frames survives a reload', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    trash('tens');
    const saved = likeTheDatabase((firebaseSyncService as any).getSyncableWorkspaceState());
    const frames = restoreUndoFrames(saved.undoStack);
    expect(frames[frames.length - 1].takeAwayTrack).toEqual({ taskId: 's5_r_t2', held: true, started: false });
    expect(frames[frames.length - 2].takeAwayTrack).toEqual({ taskId: 's5_r_t2', held: false, started: false });
    useWorkspaceStore.setState({ undoStack: frames });
    undo(2);
    expect(worth()).toBe(52);
    expect(ws().takeAwayTrack).toMatchObject({ held: false, started: false });
  });
});

describe('a building slip is not taking away', () => {
  it('53 − 18: 54 built, one unit thrown away — 53, not taking away; one more — taking away', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 4);
    trash('units');
    expect(ws().takeAwayTrack).toMatchObject({ held: true, started: false });
    expect(ctxNow().blocksRemoved).toBe(false);
    trash('units');
    expect(ctxNow().blocksRemoved).toBe(true);
  });

  it('53 − 18: blocks put back up to 53 — taking away has not started', () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 5);
    drag('units', 3);
    trash('units', 2);
    expect(ctxNow().blocksRemoved).toBe(true);
    drag('units', 2);
    expect(ctxNow().blocksRemoved).toBe(false);
  });
});

describe('the three original repros still hold', () => {
  it('806 − 351: 9 hundreds dragged, one thrown away, 2 units added — still building', async () => {
    load(1, byId('s1_r_sub806'));
    drag('hundreds', 9);
    trash('hundreds');
    drag('units', 2);
    expect(ctxNow().blocksRemoved).toBe(false);
    for (let i = 0; i < 3; i++) {
      const c = await cardFor('hesitation_45s');
      if (c) expect(c.situation).not.toMatch(/took_too_many/);
    }
  });

  it('53 − 18: 35 built, the board cleared, 3 tens added', async () => {
    load(5, byId('s5_r_t2'));
    drag('tens', 3);
    drag('units', 5);
    ws().clearBoard();
    drag('tens', 3);
    expect(ctxNow().blocksRemoved).toBe(false);
    expect((await cardFor('hesitation_45s'))!.situation).not.toMatch(/took_too_many/);
  });

  it('806 − 351: 3 hundreds, cleared, 7 hundreds', async () => {
    load(1, byId('s1_r_sub806'));
    drag('hundreds', 3);
    ws().clearBoard();
    drag('hundreds', 7);
    expect(ctxNow().blocksRemoved).toBe(false);
    for (let i = 0; i < 3; i++) {
      const c = await cardFor('hesitation_45s');
      if (c) expect(c.situation).not.toMatch(/took_too_many/);
    }
  });
});
