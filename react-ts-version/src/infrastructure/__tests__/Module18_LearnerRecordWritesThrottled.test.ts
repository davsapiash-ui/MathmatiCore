import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 18 §ב (l.759): "העדכון מבוצע ... באמצעות מאזין Firebase Realtime
 * Database על הצומת users/students, כאשר כתיבות הלקוח לצומת זה מווסתות לכל
 * היותר אחת ל-1000ms." Strict instructions: "Throttle client writes to maximum
 * once per 1000ms."
 *
 * Five writers of the learner record went around ThrottledRtdbWriter with a
 * direct update(): the Q-matrix, concept-mastery and live-metrics syncs
 * (FirebaseSyncService), the reflection board's live mirror (srlReflection),
 * and the boundary-applied adaptation (useWorkspaceStore). Each now joins the
 * record's throttled window, which merges a window's writes into one update()
 * and never drops the last one.
 */
const db = vi.hoisted(() => ({ updates: [] as Array<{ path: string; value: Record<string, unknown> }> }));
vi.mock('firebase/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/database')>();
  const noop = async () => undefined;
  return {
    ...actual,
    ref: vi.fn((_db: unknown, path = '') => ({ _path: path })),
    update: vi.fn(async (r: { _path: string }, value: Record<string, unknown>) => {
      db.updates.push({ path: r?._path, value });
    }),
    set: vi.fn(noop),
    remove: vi.fn(noop),
    get: vi.fn(async () => ({ exists: () => false, val: () => null })),
    push: vi.fn(() => ({ key: 'k', _path: 'k' })),
    onValue: vi.fn(() => () => undefined),
    onDisconnect: vi.fn(() => ({ set: noop, cancel: noop, update: noop })),
    runTransaction: vi.fn(noop),
    serverTimestamp: vi.fn(() => 0),
  };
});

import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { throttledRtdbChildUpdate, resetThrottledWrites, RTDB_WRITE_THROTTLE_MS } from '@/infrastructure/services/ThrottledRtdbWriter';
import { mirrorReflectionStep } from '@/core/srlReflection';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const RECORD = 'users/students/student_user5';

beforeEach(() => {
  vi.useFakeTimers();
  resetThrottledWrites();
  db.updates.length = 0;
});
afterEach(() => {
  resetThrottledWrites();
  vi.useRealTimers();
});

describe('PRD 18 §ב — every client write to users/students goes through the record’s throttle', () => {
  it('the Q-matrix, concept mastery and live metrics share one window: one write a second, on the record itself', async () => {
    void firebaseSyncService.syncQMatrix('student_user5', { task1_read_write_zero: 'success' } as never);
    void firebaseSyncService.syncConceptMastery('student_user5', { place_value: 80 });
    void firebaseSyncService.syncLiveSessionMetrics('student_user5', { errors: 1 });
    void firebaseSyncService.syncLiveSessionMetrics('student_user5', { errors: 2 });

    // The first went out at once; the rest wait for the window.
    expect(db.updates).toEqual([{ path: RECORD, value: { 'qMatrixResults/task1_read_write_zero': 'success' } }]);
    await vi.advanceTimersByTimeAsync(RTDB_WRITE_THROTTLE_MS - 1);
    expect(db.updates).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    // One write for the window, the last value of each field: nothing dropped.
    expect(db.updates).toHaveLength(2);
    expect(db.updates[1]).toEqual({ path: RECORD, value: { 'conceptMastery/place_value': 80, 'live_session_metrics/errors': 2 } });
    // Never a write straight to a node beneath the record.
    expect(db.updates.every((u) => u.path === RECORD)).toBe(true);
  });

  it('the reflection board’s live mirror joins the same window', async () => {
    mirrorReflectionStep('student_user5', 2);
    mirrorReflectionStep('student_user5', 3);
    expect(db.updates.map((u) => u.value.reflection_step)).toEqual([2]);
    await vi.advanceTimersByTimeAsync(RTDB_WRITE_THROTTLE_MS);
    expect(db.updates.map((u) => u.value.reflection_step)).toEqual([2, 3]);
    expect(db.updates.every((u) => u.path === RECORD)).toBe(true);
  });

  it('a child update is the same write as before: each field beneath the node, undefined values left out', async () => {
    await throttledRtdbChildUpdate(RECORD, 'conceptMastery', { a: 1, b: undefined, c: { d: undefined, e: 2 } });
    expect(db.updates).toEqual([{ path: RECORD, value: { 'conceptMastery/a': 1, 'conceptMastery/c': { e: 2 } } }]);
    await throttledRtdbChildUpdate(RECORD, 'conceptMastery', {});
    expect(db.updates).toHaveLength(1);
  });

  it('no direct update() of the learner record is left in these writers', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    for (const node of ['qMatrixResults', 'conceptMastery', 'live_session_metrics']) {
      expect(sync).not.toMatch(new RegExp(`update\\(ref\\(database, \`users/students/\\$\\{\\w+\\}/${node}\``));
      expect(sync).not.toMatch(new RegExp(`ref\\(database, \`users/students/\\$\\{studentId\\}/${node}\`\\)`));
    }
    const reflection = src('core/srlReflection.ts');
    expect(reflection).not.toMatch(/\bupdate\(ref\(/);
    expect(reflection).not.toContain("from 'firebase/database'");
    const store = src('application/useWorkspaceStore.ts');
    expect(store).not.toMatch(/\bupdate\(ref\(database/);
    expect(store).toContain('throttledRtdbUpdate(`users/students/${normId}`, { ...learnerFields, pendingAdaptation: null })');
  });
});
