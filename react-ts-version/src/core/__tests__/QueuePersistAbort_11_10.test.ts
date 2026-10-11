// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Audit 11.10.2026: IndexedDBQueue.persist settled only on a transaction's
 * complete or error events. A transaction can abort with no error event (a full
 * storage quota at commit); enqueue then never returned and the item was in
 * neither IndexedDB nor the memory fallback. Module 17 §ב: an item is always
 * kept, so an abort keeps it in memory exactly as an error does.
 */
vi.mock('@/infrastructure/firebase', () => ({ firestore: {}, functions: {}, database: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), setDoc: vi.fn(() => Promise.resolve()), serverTimestamp: () => ({}),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: {} }))) }));

type Req = { result?: unknown; onsuccess?: (e: unknown) => void; onerror?: () => void };
let abortOnAdd = false;

function fakeIndexedDB() {
  const readReq = (result: unknown): Req => {
    const r: Req = { result };
    setTimeout(() => r.onsuccess?.({ target: r }), 0);
    return r;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    onversionchange: null as unknown,
    close: () => {},
    transaction: (_stores: string[], mode?: string) => {
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          count: () => readReq(0),
          getAll: () => readReq([]),
          openCursor: () => readReq(null),
          get: () => readReq(undefined),
          add: () => {
            setTimeout(() => (abortOnAdd ? tx.onabort?.() : tx.oncomplete?.()), 0);
            return {};
          },
          put: () => ({}),
          delete: () => ({}),
          clear: () => ({}),
        }),
      };
      if (mode !== 'readwrite') setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  return {
    open: () => {
      const req: { result: unknown; onsuccess?: (e: unknown) => void; onupgradeneeded?: (e: unknown) => void; onerror?: () => void } = { result: db };
      setTimeout(() => req.onsuccess?.({ target: req }), 0);
      return req;
    },
  };
}

describe('IndexedDBQueue: a transaction that aborts without an error event', () => {
  beforeEach(() => {
    vi.resetModules();
    abortOnAdd = false;
    Object.defineProperty(window, 'indexedDB', { value: fakeIndexedDB(), configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });

  const event = () => ({
    idempotency_key: '11111111-1111-4111-8111-111111111111',
    client_timestamp: 1_000,
    session_id: 'session_4_student_student_user3',
    student_id: 3,
    exercise_id: 's4_r_t1',
    event_type: 'PROBLEM_COMPLETE' as const,
    details: { total_duration_ms: 1000, undo_count: 0, error_count: 0 },
  });

  it('settles and keeps the item in memory (not durable)', async () => {
    abortOnAdd = true;
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    const durable = await Promise.race([
      indexedDBQueue.enqueueDurably(event()),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1500)),
    ]);
    expect(durable).toBe(false);
  });

  it('a transaction that completes is still durable', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    const durable = await Promise.race([
      indexedDBQueue.enqueueDurably(event()),
      new Promise<'hung'>((r) => setTimeout(() => r('hung'), 1500)),
    ]);
    expect(durable).toBe(true);
  });
});
