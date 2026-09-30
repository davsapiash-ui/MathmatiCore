/**
 * Learner-side data and sync, audit findings of 28.9.2026:
 *  - X55: on a reload the learner record wins over this device's cached copy
 *    unless the cached copy is strictly later, compared on a stamp taken on
 *    the server's clock (serverNow), never the device's.
 *  - X13: sign-out leaves nothing of the previous learner that the next one
 *    would meet — and deletes no unsent data (owner, 28.9.2026).
 *  - X61: UNDO_EXECUTED carries column_index when the undone action was
 *    confined to one column (PRD Module 5 §ג), and only then.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sent = vi.hoisted(() => ({ events: [] as any[] }));
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return {
    ...actual,
    emitTelemetry: (e: any) => {
      sent.events.push(e);
      return Promise.resolve();
    },
  };
});
import { useWorkspaceStore, getActiveTasks, restoreUndoFrames } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { approvePath } from '@/test/approvedPath';
import { newerWorkspaceSnapshot, workspaceSavedAt, WORKSPACE_SAVED_AT_KEY } from '@/core/workspaceSnapshot';

const src = (p: string) => readFileSync(resolve(__dirname, '../../../', p), 'utf-8');
const ws = () => useWorkspaceStore.getState();

describe('X55 — the newer copy wins, and the server copy on a tie', () => {
  const at = (savedAt: number | undefined, sessionNumber = 4) => ({
    sessionNumber,
    flowStatus: 'task',
    ...(savedAt === undefined ? {} : { [WORKSPACE_SAVED_AT_KEY]: savedAt }),
  });

  it('a later server copy beats the cached one', () => {
    const server = at(2_000);
    expect(newerWorkspaceSnapshot(server, at(1_000), 4)).toBe(server);
  });

  it('a strictly later cached copy (work not sent yet) beats the server copy', () => {
    const local = at(3_000);
    expect(newerWorkspaceSnapshot(at(2_000), local, 4)).toBe(local);
  });

  it('a tie, or a copy with no stamp, goes to the server', () => {
    const server = at(2_000);
    expect(newerWorkspaceSnapshot(server, at(2_000), 4)).toBe(server);
    const unstamped = at(undefined);
    expect(newerWorkspaceSnapshot(unstamped, at(undefined), 4)).toBe(unstamped);
    // The device clock's old `updatedAt` is not a stamp.
    expect(workspaceSavedAt({ updatedAt: 9e12 } as any)).toBe(0);
  });

  it('a copy of another meeting is never restored', () => {
    const local = at(1_000);
    expect(newerWorkspaceSnapshot(at(5_000, 3), local, 4)).toBe(local);
    expect(newerWorkspaceSnapshot(at(5_000, 3), at(9_000, 5), 4)).toBeNull();
  });

  it('both copies are written with the same server-clock stamp', () => {
    // The stamp itself (server clock, never backwards on a device) is checked
    // by driving the service: OfflineReload_KeepsWork.test.ts.
    const sync = src('src/infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toMatch(/saveSessionProgressLocally\(normId, stampedPayload\)/);
    expect(sync).toMatch(/workspaceState: stampedPayload/);
  });

  it('the cached copy shown before the record arrives is replaced by a later record', () => {
    const page = src('src/features/workspace/StudentWorkspacePage.tsx');
    expect(page).toMatch(/restoredFromCacheRef\.current = \{ meeting, savedAt: workspaceSavedAt\(cached\) \}/);
    expect(page).toMatch(/workspaceSavedAt\(server\) > fromCache\.savedAt/);
    // Both initialisation paths choose by the stamp; neither prefers a copy blindly.
    expect(page.match(/newerWorkspaceSnapshot\(/g)?.length).toBe(2);
  });
});

describe('X13 — sign-out clears the previous learner, keeps unsent data', () => {
  it('the coaching card lock of one learner is not left for the next', () => {
    const auth = src('src/application/useAuthStore.ts');
    const keys = auth.slice(auth.indexOf('const clearStoredAuth'), auth.indexOf('const initial = getStoredAuth'));
    expect(keys).toContain("'mc_socratic_penalty_until'");
  });

  it('the learner records held in memory are reset, and the queue is flushed, never cleared', () => {
    const store = src('src/application/useStore.ts');
    expect(store).toMatch(/logout: \(\) => set\(\{[\s\S]{0,200}students: generateInitialStudents\(\)/);
    const auth = src('src/application/useAuthStore.ts');
    const logout = auth.slice(auth.indexOf('export function unifiedLogout'));
    expect(logout).toMatch(/indexedDBQueue\s*\.flushWithin\(/);
    expect(logout).not.toMatch(/indexedDBQueue\.clearAll\(/);
  });
});

describe('X61 — UNDO_EXECUTED names the column of a column-scoped action', () => {
  beforeEach(() => {
    ws().resetWorkspace();
    useAuthStore.setState({ user: { uid: 'student_user4', student_id: 4 } } as any);
    approvePath();
    ws().initSession(5, false);
    const idx = getActiveTasks(ws()).findIndex((t) => typeof t.numberA === 'number' && typeof t.numberB === 'number');
    useWorkspaceStore.setState({ standardTaskIdx: Math.max(0, idx) });
    sent.events.length = 0;
  });

  const lastUndo = () => [...sent.events].reverse().find((e) => e.event_type === 'UNDO_EXECUTED');

  it('undoing a typed digit carries that digit\'s column', () => {
    ws().setAnswerDigit('tens', '4');
    ws().undo();
    expect(lastUndo()?.column_index).toBe(1);
  });

  it('undoing a memory circle carries its column', () => {
    ws().setCarryDigit('hundreds', '1');
    ws().undo();
    expect(lastUndo()?.column_index).toBe(2);
  });

  it('undoing the trash reset (no column) carries none', () => {
    useWorkspaceStore.setState({ counts: { units: 3, tens: 1, hundreds: 0, thousands: 0 } } as any);
    ws().clearBoard();
    ws().undo();
    const undo = lastUndo();
    expect(undo).toBeTruthy();
    expect('column_index' in undo).toBe(false);
  });

  it('the column survives a reload of the undo stack', () => {
    const frames = restoreUndoFrames([
      { counts: { units: 1 }, actionType: 'DIGIT_ENTERED', columnIndex: 2 },
      { counts: { units: 1 }, actionType: 'BLOCK_DRAG_COMPLETE', columnIndex: 7 },
    ]);
    expect(frames[0].columnIndex).toBe(2);
    expect(frames[1].columnIndex).toBeUndefined();
  });
});
