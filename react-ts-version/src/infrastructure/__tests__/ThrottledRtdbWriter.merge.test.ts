import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * PRD 18: "Throttle client writes to maximum once per 1000ms". Every writer of
 * the learner record shares one throttled writer, so the fields of one window
 * are merged into ONE update() — which the database refuses when one key is an
 * ancestor of another ('workspaceState' beside 'workspaceState/counts').
 */
const rtdb = vi.hoisted(() => ({ update: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock('@/infrastructure/firebase', () => ({ database: {} }));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  update: (...a: unknown[]) => rtdb.update(...a),
}));

import { mergeUpdateFields, throttledRtdbUpdate, rtdbUpdateNow, resetThrottledWrites, RTDB_WRITE_THROTTLE_MS } from '@/infrastructure/services/ThrottledRtdbWriter';

/** A key that is an ancestor of another key, as update() refuses it. */
const hasAncestorConflict = (fields: Record<string, unknown>) =>
  Object.keys(fields).some((a) => Object.keys(fields).some((b) => b !== a && b.startsWith(`${a}/`)));

describe('mergeUpdateFields — two updates as one, as if sent one after the other', () => {
  it('a later child key is written into a queued node', () => {
    const merged = mergeUpdateFields({ workspaceState: { counts: { units: 1 }, flowStatus: 'task' } }, { 'workspaceState/counts': { units: 2 } });
    expect(merged).toEqual({ workspaceState: { counts: { units: 2 }, flowStatus: 'task' } });
    expect(hasAncestorConflict(merged)).toBe(false);
  });

  it('a later node replaces the queued keys beneath it', () => {
    const merged = mergeUpdateFields({ 'workspaceState/counts': { units: 2 }, lastPing: 1 }, { workspaceState: { counts: { units: 3 } } });
    expect(merged).toEqual({ lastPing: 1, workspaceState: { counts: { units: 3 } } });
  });

  it('deep paths, sentinels and plain fields', () => {
    const ts = { '.sv': 'timestamp' };
    const merged = mergeUpdateFields({ sessionState: { status: 'active' }, lastPing: ts }, { 'sessionState/error_count/x': 1, helpRequested: true });
    expect(merged).toEqual({ sessionState: { status: 'active', error_count: { x: 1 } }, lastPing: ts, helpRequested: true });
  });
});

describe('throttledRtdbUpdate / rtdbUpdateNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetThrottledWrites();
    rtdb.update.mockClear();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('one write per window, every writer merged, the latest value last', async () => {
    void throttledRtdbUpdate('users/students/s1', { 'workspaceState/counts': { units: 1 } });
    void throttledRtdbUpdate('users/students/s1', { workspaceState: { counts: { units: 1 }, flowStatus: 'task' }, lastPing: 5 });
    void throttledRtdbUpdate('users/students/s1', { 'workspaceState/counts': { units: 4 }, lastAction: 'x' });
    expect(rtdb.update).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RTDB_WRITE_THROTTLE_MS);
    expect(rtdb.update).toHaveBeenCalledTimes(2);
    const second = rtdb.update.mock.calls[1][1] as Record<string, unknown>;
    expect(second).toEqual({ workspaceState: { counts: { units: 4 }, flowStatus: 'task' }, lastPing: 5, lastAction: 'x' });
    expect(hasAncestorConflict(second)).toBe(false);
  });

  it('the guard is checked when the write is sent, not when it is queued', async () => {
    let allowed = true;
    void throttledRtdbUpdate('users/students/s2', { a: 1 });
    void throttledRtdbUpdate('users/students/s2', { b: 2 }, { guard: () => allowed });
    allowed = false; // the device was taken over inside the window
    await vi.advanceTimersByTimeAsync(RTDB_WRITE_THROTTLE_MS);
    expect(rtdb.update).toHaveBeenCalledTimes(1);
    expect(rtdb.update.mock.calls[0][1]).toEqual({ a: 1 });
  });

  it('rtdbUpdateNow sends what is pending with it, at once, so "offline" is never followed by a queued "online"', async () => {
    void throttledRtdbUpdate('users/students/s3', { isOnline: true });
    void throttledRtdbUpdate('users/students/s3', { isOnline: true, lastPing: 9 });
    void rtdbUpdateNow('users/students/s3', { isOnline: false, lastPing: 0 });
    expect(rtdb.update).toHaveBeenCalledTimes(2);
    expect(rtdb.update.mock.calls[1][1]).toEqual({ isOnline: false, lastPing: 0 });
    await vi.advanceTimersByTimeAsync(3 * RTDB_WRITE_THROTTLE_MS);
    expect(rtdb.update).toHaveBeenCalledTimes(2);
  });
});
