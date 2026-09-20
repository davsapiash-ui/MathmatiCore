import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * מודול 29 §ג: "ברשת פעילה, הסנכרון ל-Firestore מתבצע ברקע לפי סדר FIFO".
 * מודול 17 §ג שלב 4: פריט נמחק מהתור רק אחרי אישור שרת.
 *
 * התור רוקן רק בטעינת דף, באירוע 'online' של הדפדפן, או אחרי ניסיון שנכשל.
 * האפליקציה אינה נטענת מחדש במהלך שיעור, ולכן ברשת יציבה שום פעולה של לומד
 * לא הגיעה ל-telemetry_logs עד הביקור הבא — וההתנתקות ניקתה את התור לפני כן.
 * לומד שלחץ "התנתק" במסך "המורה סגרה את המפגש" מחק את הטלמטריה של כל המפגש:
 * מסע לומד ריק, "אין פעולות מתועדות" בדוח הכיתה, ומדדי מחקר בלי נתונים.
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

describe('the queue is sent in the background while the network is up', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDoc.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('an enqueued event reaches telemetry_logs without a page load or an "online" event', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    await indexedDBQueue.clearAll();

    await indexedDBQueue.enqueue(event('evt_a'));
    await indexedDBQueue.enqueue(event('evt_b'));
    expect(setDoc).not.toHaveBeenCalled(); // several events share one flush
    expect((await indexedDBQueue.getAll()).length).toBe(2);

    await vi.advanceTimersByTimeAsync(2000);

    expect(setDoc).toHaveBeenCalledTimes(2);
    expect((setDoc.mock.calls[0] as unknown[])[0]).toEqual({ coll: 'telemetry_logs', id: 'evt_a' }); // FIFO
    expect((setDoc.mock.calls[1] as unknown[])[0]).toEqual({ coll: 'telemetry_logs', id: 'evt_b' });
    // Deleted only after the server took it.
    expect((await indexedDBQueue.getAll()).length).toBe(0);
  });

  it('an event the server refuses stays in the queue', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    await indexedDBQueue.clearAll();
    setDoc.mockImplementationOnce(() => Promise.reject(new Error('permission-denied')));

    await indexedDBQueue.enqueue(event('evt_refused'));
    await vi.advanceTimersByTimeAsync(2000);

    expect((await indexedDBQueue.getAll()).map((i) => i.idempotency_key)).toEqual(['evt_refused']);
    await indexedDBQueue.clearAll();
  });

  it('flushWithin sends what is waiting and never waits longer than its budget', async () => {
    const { indexedDBQueue } = await import('@/infrastructure/services/IndexedDBQueue');
    await indexedDBQueue.clearAll();
    await indexedDBQueue.enqueue(event('evt_logout'));

    const done = indexedDBQueue.flushWithin(4000);
    await vi.advanceTimersByTimeAsync(10);
    await done;
    expect(setDoc).toHaveBeenCalledTimes(1);

    // A server that never answers must not hold the sign-out for ever.
    setDoc.mockImplementationOnce(() => new Promise(() => {}));
    await indexedDBQueue.enqueue(event('evt_stuck'));
    let finished = false;
    const bounded = indexedDBQueue.flushWithin(4000).then(() => { finished = true; });
    await vi.advanceTimersByTimeAsync(3999);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await bounded;
    expect(finished).toBe(true);
  });
});

describe('sign-out sends the queue before it wipes the device', () => {
  const auth = readFileSync(resolve(__dirname, '../../application/useAuthStore.ts'), 'utf-8');
  const start = auth.indexOf('export function unifiedLogout()');
  const body = auth.slice(start, auth.indexOf('export const useAuthStore', start));

  it('flush → clear → release, in that order, and never a bare clearAll', () => {
    const flush = body.indexOf('.flushWithin(LOGOUT_FLUSH_BUDGET_MS)');
    const clear = body.indexOf('indexedDBQueue.clearAll()');
    const release = body.indexOf("httpsCallable(functions, 'releaseStudentSession')");
    expect(flush).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(flush);
    // The learner's claims authorise the telemetry write, so they go last.
    expect(release).toBeGreaterThan(clear);
    expect((body.match(/indexedDBQueue\.clearAll\(\)/g) || []).length).toBe(1);
  });

  it('a new sign-in during the wait is left alone', () => {
    expect(body).toContain('if (useAuthStore.getState().isAuthenticated) return;');
  });
});

describe('a parked item gets another chance on the next page load', () => {
  const queue = readFileSync(resolve(__dirname, '../../infrastructure/services/IndexedDBQueue.ts'), 'utf-8');

  it('revives parked items before the first flush of the page', () => {
    const open = queue.indexOf('request.onsuccess = (event) => {');
    const revive = queue.indexOf('this.reviveParkedItems()', open);
    const firstFlush = queue.indexOf('this.flushQueue()', revive);
    expect(revive).toBeGreaterThan(open);
    expect(firstFlush).toBeGreaterThan(revive);
    expect(queue).toContain('cursor.update({ ...cursor.value, retry_count: 0 });');
  });
});
