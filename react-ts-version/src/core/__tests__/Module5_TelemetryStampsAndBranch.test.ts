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
  isUuidV4,
  newTelemetryKey,
  telemetryDocIdOf,
} from '@/infrastructure/services/telemetryStamp';
import { telemetryDocumentOf } from '@/infrastructure/services/IndexedDBQueue';
import { compareJourneyEvents, describeEvent } from '@/infrastructure/services/LearnerJourneyService';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
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

describe('Module 4: the telemetry_logs id is the idempotency_key, a UUID v4', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('a new key is crypto.randomUUID where it exists', () => {
    expect(isUuidV4(newTelemetryKey())).toBe(true);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-2222-4333-8444-555555555555' });
    expect(newTelemetryKey()).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('without randomUUID, or without crypto at all, the key is still a UUID v4', () => {
    vi.stubGlobal('crypto', { getRandomValues: (b: Uint8Array) => { b.fill(0xff); return b; } });
    expect(newTelemetryKey()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    vi.stubGlobal('crypto', undefined);
    const keys = new Set(Array.from({ length: 50 }, () => newTelemetryKey()));
    for (const k of keys) expect(isUuidV4(k)).toBe(true);
    expect(keys.size).toBe(50);
  });

  it('the client never falls back to a non-UUID key', () => {
    const svc = src('infrastructure/services/FirebaseSyncService.ts');
    expect(svc).not.toContain('`telemetry_${Date.now()}');
    expect(svc).toContain('const idempotency_key = newTelemetryKey();');
  });

  it('a UUID v4 key is its own document id; an older non-UUID key maps to a fixed UUID v4 derived from it', () => {
    const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
    expect(telemetryDocIdOf(uuid)).toBe(uuid);
    const old = 'telemetry_1700000000000_abc1234';
    const id = telemetryDocIdOf(old);
    expect(isUuidV4(id)).toBe(true);
    expect(telemetryDocIdOf(old)).toBe(id); // every retry: the same document
    expect(telemetryDocIdOf('telemetry_1700000000000_abc1235')).not.toBe(id);
    expect(isUuidV4(telemetryDocIdOf(''))).toBe(true);
  });

  it('the document written carries the id it is written under as its idempotency_key', () => {
    const id = telemetryDocIdOf('telemetry_1_x');
    const d = telemetryDocumentOf({ idempotency_key: 'telemetry_1_x', client_timestamp: 5, event_type: 'PROBLEM_LOAD', details: {} }, id);
    expect(d.idempotency_key).toBe(id);
    expect(typeof d.synced_at).toBe('number');
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

  it('choosing a branch emits it, with the branch, the 7th compulsory exercise and no column_index', () => {
    approvePath('green_path');
    ws().initSession(4, false);
    const compulsory = getActiveTasks(ws());
    expect(compulsory).toHaveLength(7);
    // The real state on the choice screen: advanceStandard sets choice_branch
    // with standardTaskIdx still on the last compulsory exercise (index 6).
    useWorkspaceStore.setState({ standardTaskIdx: 6, flowStatus: 'choice_branch' });
    emitted.length = 0;
    ws().selectBranch('challenge');
    expect(ws().selectedBranch, 'the branch was loaded').toBe('challenge');
    const branch = emitted.filter((e) => e.event_type === 'BRANCH_SELECTED');
    expect(branch).toHaveLength(1);
    expect(branch[0].details).toEqual({ branch: 'challenge' });
    expect('column_index' in branch[0]).toBe(false);
    expect(branch[0].session_id).toBe('session_4_student_student_user3');
    // Made after the 7th compulsory exercise — never the meeting's fallback id.
    expect(branch[0].exercise_id).toBe(compulsory[6].id);
    expect(branch[0].exercise_id).not.toBe('ex_4_01');
  });

  it('no branch loaded (no approved path), no event', () => {
    ws().initSession(4, false);
    useWorkspaceStore.setState({ standardTaskIdx: 6, flowStatus: 'choice_branch' });
    emitted.length = 0;
    ws().selectBranch('reinforcement');
    expect(emitted.filter((e) => e.event_type === 'BRANCH_SELECTED')).toHaveLength(0);
  });
});

describe('BRANCH_SELECTED in the teacher\'s journey table (Module 21) — the learner\'s own button words (Module 14 §ג)', () => {
  const ev = (branch: unknown) => ({
    id: 'b', timestamp: 1, sessionNumber: 4, sessionId: 's', exerciseId: 'x', eventType: 'BRANCH_SELECTED', details: { branch },
  });
  it('challenge → "אתגר", reinforcement → "חיזוק וחזרה על החומר"; never the raw token, never "מסלול"', () => {
    const c = describeEvent(ev('challenge') as any);
    const r = describeEvent(ev('reinforcement') as any);
    expect([c.label, c.detail]).toEqual(['בחירת נתיב', 'נבחר: אתגר']);
    expect([r.label, r.detail]).toEqual(['בחירת נתיב', 'נבחר: חיזוק וחזרה על החומר']);
    for (const d of [c, r]) {
      expect(`${d.label} ${d.detail}`).not.toContain('BRANCH_SELECTED');
      expect(`${d.label} ${d.detail}`).not.toContain('מסלול');
    }
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

  it('no discard in FirebaseSyncService either: no shift() past a cap, no slice/filter of the legacy queue', () => {
    const f = src('infrastructure/services/FirebaseSyncService.ts');
    expect(f).not.toMatch(/offlineTelemetryQueue\.shift\(\)/);
    expect(f).not.toContain('Dropping oldest');
    expect(f).not.toMatch(/\.slice\(-500\)/);
  });
});
