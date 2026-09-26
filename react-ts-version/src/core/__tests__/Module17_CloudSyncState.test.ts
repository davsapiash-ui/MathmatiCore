import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD Module 17 §ד: "אופליין = אייקון ענן אפור… אונליין מסונכרן = ענן ירוק".
 * The cloud followed navigator.onLine, so it turned green the moment the
 * network came back while what was saved offline still sat in the queue.
 * The queue now reports its own sync state and the cloud follows it.
 */
const setDoc = vi.fn(() => Promise.resolve());

vi.mock('@/infrastructure/firebase', () => ({ firestore: {}, functions: {}, database: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ coll, id })),
  setDoc: (...args: unknown[]) => setDoc(...(args as [])),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: {} }))) }));

const event = (key: string) => ({
  idempotency_key: key,
  client_timestamp: 1_000,
  session_id: 'session_4_student_student_user3',
  student_id: 3,
  exercise_id: 's4_r_t1',
  event_type: 'PROBLEM_COMPLETE' as const,
  details: { total_duration_ms: 1000, undo_count: 0, error_count: 0 },
});

// A window that fires online/offline, without IndexedDB (the queue then keeps items in memory).
const fakeWindow = new EventTarget();

describe('Module 17 §ד: the cloud is green only when the queue has been delivered', () => {
  beforeAll(() => {
    vi.stubGlobal('window', fakeWindow);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('offline → grey; back online with a backlog → still not green; delivered → green', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    await indexedDBQueue.clearAll();
    setDoc.mockClear();
    const states: string[] = [];
    const stop = indexedDBQueue.onSyncStateChange((s) => states.push(s));
    expect(indexedDBQueue.getSyncState()).toBe('synced');

    fakeWindow.dispatchEvent(new Event('offline'));
    expect(indexedDBQueue.getSyncState()).toBe('offline');

    await indexedDBQueue.enqueue(event('evt_offline_1'));
    await indexedDBQueue.enqueue(event('evt_offline_2'));
    expect(indexedDBQueue.getPendingCount()).toBe(2);

    // The server is slow to acknowledge: the connection is back, the backlog is not.
    let ack: () => void = () => {};
    setDoc.mockImplementationOnce(() => new Promise<void>((r) => { ack = r; }));
    fakeWindow.dispatchEvent(new Event('online'));
    expect(indexedDBQueue.getSyncState()).toBe('pending');
    await vi.waitFor(() => expect(setDoc).toHaveBeenCalledTimes(1));
    expect(indexedDBQueue.getSyncState()).toBe('pending'); // sent, not yet acknowledged

    ack();
    await vi.waitFor(() => expect(indexedDBQueue.getSyncState()).toBe('synced'));
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(states).toEqual(['synced', 'offline', 'pending', 'synced']);
    stop();
  });

  it('online, but the server refuses what was queued → not green until it is delivered', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    fakeWindow.dispatchEvent(new Event('online'));
    await indexedDBQueue.clearAll();
    setDoc.mockImplementationOnce(() => Promise.reject(new Error('unavailable')));

    await indexedDBQueue.enqueue(event('evt_refused'));
    await indexedDBQueue.flushQueue();
    expect(indexedDBQueue.getSyncState()).toBe('pending');

    await indexedDBQueue.flushQueue();
    expect(indexedDBQueue.getSyncState()).toBe('synced');
  });

  it('the top bar reads the queue, not the browser flag', () => {
    const topbar = readFileSync(resolve(__dirname, '../../features/workspace/WorkspaceTopbar.tsx'), 'utf-8');
    expect(topbar).toContain('indexedDBQueue.onSyncStateChange');
    expect(topbar).not.toContain('navigator.onLine');
    expect(topbar).toMatch(/syncState === 'synced' \?/);
  });
});
