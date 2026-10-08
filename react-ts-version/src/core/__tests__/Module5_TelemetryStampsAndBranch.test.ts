import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

/**
 * PRD Module 5 §ב / Appendix A §3: every event carries client_timestamp, a
 * sequence_number per device and per sign-in, a random device_id, and the
 * server's server_received_at. Module 14 §ג: the branch choice is recorded as
 * BRANCH_SELECTED. Module 17 §ב: nothing in the queue is ever discarded.
 */

import {
  getDeviceId,
  nextSequenceNumber,
  resetTelemetryStampForTests,
  DEVICE_ID_STORAGE_KEY,
} from '@/infrastructure/services/telemetryStamp';
import { telemetryDocumentOf } from '@/infrastructure/services/IndexedDBQueue';
import { compareJourneyEvents } from '@/infrastructure/services/LearnerJourneyService';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { approvePath } from '@/test/approvedPath';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';

const emitted: Array<Record<string, any>> = [];

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('telemetryStamp — device_id and sequence_number', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => { m.set(k, String(v)); },
      removeItem: (k: string) => { m.delete(k); },
      clear: () => m.clear(),
    });
    resetTelemetryStampForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetTelemetryStampForTests();
  });

  it('device_id is random letters, created once and kept in this browser', () => {
    const id = getDeviceId();
    expect(id).toMatch(/^[a-z]{24}$/);
    expect(getDeviceId()).toBe(id);
    resetTelemetryStampForTests(); // a reload
    expect(getDeviceId()).toBe(id);
    expect(localStorage.getItem(DEVICE_ID_STORAGE_KEY)).toBe(id);
  });

  it('a sign-in counts 1, 2, 3 … and keeps counting across a reload; a new sign-in starts again', () => {
    expect([1, 2, 3].map(() => nextSequenceNumber('student:3@100'))).toEqual([1, 2, 3]);
    resetTelemetryStampForTests(); // a reload of the same sign-in
    expect(nextSequenceNumber('student:3@100')).toBe(4);
    expect(nextSequenceNumber('student:3@200')).toBe(1);
    expect(nextSequenceNumber('student:3@200')).toBe(2);
  });

  it('the keys survive the class reset that removes every mathmaticore_* key', () => {
    const store = src('application/useStore.ts');
    expect(store).toContain("k.startsWith('mathmaticore_')");
    const stamp = src('infrastructure/services/telemetryStamp.ts');
    expect(stamp).not.toMatch(/STORAGE_KEY = 'mathmaticore_/);
  });
});

describe('the telemetry_logs document', () => {
  it('carries synced_at, server_received_at (serverTimestamp) and the device_id; a stored server_received_at is not sent', () => {
    const d = telemetryDocumentOf({
      idempotency_key: 'k1',
      client_timestamp: 5,
      sequence_number: 7,
      device_id: 'abcdefghijkl',
      server_received_at: 123,
      event_type: 'PROBLEM_LOAD',
      details: {},
    });
    expect(d.sequence_number).toBe(7);
    expect(d.device_id).toBe('abcdefghijkl');
    expect(typeof d.synced_at).toBe('number');
    expect(d.server_received_at).not.toBe(123);
    expect(d.server_received_at).toBeTruthy();
  });

  it('an event queued before device_id existed gets this browser\'s id; its sequence_number stays absent', () => {
    const d = telemetryDocumentOf({ idempotency_key: 'k0', client_timestamp: 5, event_type: 'PROBLEM_LOAD', details: {} });
    expect(d.device_id).toBe(getDeviceId());
    expect('sequence_number' in d).toBe(false);
  });
});

describe('readers order by client_timestamp, ties by sequence_number', () => {
  it('compareJourneyEvents', () => {
    const evs = [
      { timestamp: 10, sequenceNumber: 3 },
      { timestamp: 10, sequenceNumber: 1 },
      { timestamp: 5, sequenceNumber: 9 },
      { timestamp: 10 },
    ];
    expect([...evs].sort(compareJourneyEvents)).toEqual([
      { timestamp: 5, sequenceNumber: 9 },
      { timestamp: 10 },
      { timestamp: 10, sequenceNumber: 1 },
      { timestamp: 10, sequenceNumber: 3 },
    ]);
  });
});

describe('BRANCH_SELECTED (Module 14 §ג, Appendix A §3)', () => {
  const ws = () => useWorkspaceStore.getState();
  afterEach(() => { vi.restoreAllMocks(); });

  beforeEach(() => {
    emitted.length = 0;
    vi.spyOn(firebaseSyncService, 'emitTelemetry').mockImplementation(async (e: any) => { emitted.push(e); return null; });
    useAuthStore.setState({ user: { uid: 'student_user3', student_id: 3 } as any, role: 'student', isAuthenticated: true });
    useStore.setState({ students: {} as any });
    ws().resetWorkspace();
  });

  it('choosing a branch emits it, with the branch and without column_index', () => {
    approvePath('green_path');
    ws().initSession(4, false);
    useWorkspaceStore.setState({ standardTaskIdx: 7, flowStatus: 'choice_branch' });
    emitted.length = 0;
    ws().selectBranch('challenge');
    expect(ws().selectedBranch, 'the branch was loaded').toBe('challenge');
    const branch = emitted.filter((e) => e.event_type === 'BRANCH_SELECTED');
    expect(branch).toHaveLength(1);
    expect(branch[0].details).toEqual({ branch: 'challenge' });
    expect('column_index' in branch[0]).toBe(false);
    expect(branch[0].session_id).toBe('session_4_student_student_user3');
  });

  it('no branch loaded (no approved path), no event', () => {
    ws().initSession(4, false);
    useWorkspaceStore.setState({ standardTaskIdx: 7, flowStatus: 'choice_branch' });
    emitted.length = 0;
    ws().selectBranch('reinforcement');
    expect(emitted.filter((e) => e.event_type === 'BRANCH_SELECTED')).toHaveLength(0);
  });
});

describe('Module 17 §ב: sign-out, role switch and expiry keep the queue and the curriculum cache', () => {
  it('no app code clears the offline queue or deletes the curriculum cache', () => {
    const root = resolve(__dirname, '../..');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          if (['__tests__', '__audit__', 'node_modules', 'test', 'tests'].includes(name)) continue;
          walk(p);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const s = readFileSync(p, 'utf-8');
          if (/deleteDatabase\(/.test(s)) offenders.push(`${p}: deleteDatabase`);
          if (!p.endsWith('IndexedDBQueue.ts') && s.includes('.clearAll(')) offenders.push(`${p}: clearAll`);
          if (!p.endsWith('CurriculumCatalogService.ts') && s.includes('mathmaticore_curriculum')) offenders.push(`${p}: curriculum db`);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    // The catalog service itself never clears or deletes its banks.
    const catalog = src('infrastructure/services/CurriculumCatalogService.ts');
    expect(catalog).not.toMatch(/\.clear\(\)|\.delete\(/);
  });

  it('the one sign-out path (manual, 8-hour limit, inactivity expiry, role switch) flushes and never clears', () => {
    const auth = src('application/useAuthStore.ts');
    const start = auth.indexOf('clearStoredAuth();\n  const firebaseUser');
    expect(start).toBeGreaterThan(-1);
    const body = auth.slice(start, start + 3000);
    expect(body).toContain('indexedDBQueue\n        .flushWithin(');
    expect(body).not.toContain('clearAll');
  });

  it('no queue capacity discard: no shift() on the memory fallback, no cursor delete at the cap', () => {
    const q = src('infrastructure/services/IndexedDBQueue.ts');
    expect(q).not.toMatch(/memoryFallback\.shift\(\)/);
    expect(q).not.toContain('MAX_MEMORY_FALLBACK');
    expect(q).toContain('reportQueueCapacityFault(');
  });
});
