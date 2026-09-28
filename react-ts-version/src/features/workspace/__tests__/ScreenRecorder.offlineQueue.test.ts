import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { FakeIndexedDB, fakeKeyRange } from '@/infrastructure/__tests__/fakeIndexedDB';

/**
 * Module 21 recorder on the REAL IndexedDBQueue, running on an in-memory
 * IndexedDB. Only the Firebase transport and rrweb (which needs a browser DOM)
 * are replaced.
 *
 *  PRD 21: "מקטעים שכתיבתם נכשלה נאגרים ב-IndexedDB… חל איסור מוחלט על השלכת מקטע שנכשל"
 *  PRD 21: "ההקלטה מוגבלת ל-50MB לכל לומד לכל מפגש"
 *  PRD 21: "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id בנוסף לחותמות הזמן"
 *
 * The bug: each chunk was written with set() and queued only if set() rejected.
 * Offline the database SDK neither rejects nor keeps the write past a reload,
 * so the chunks of an offline stretch were lost.
 */

const rtdb = vi.hoisted(() => ({
  set: null as any,
  update: null as any,
  get: null as any,
  pushed: 0,
}));
const rrweb = vi.hoisted(() => ({
  emit: null as null | ((event: unknown) => void),
  started: 0,
  stopped: 0,
}));

vi.mock('@/infrastructure/firebase', () => ({
  firestore: {},
  db: {},
  functions: {},
  database: {},
  auth: { currentUser: { isAnonymous: true, getIdToken: async () => 't' }, signOut: async () => {} },
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: async () => 0,
  isServerClockKnown: () => true,
}));
vi.mock('firebase/database', async () => {
  const actual = await vi.importActual<typeof import('firebase/database')>('firebase/database');
  return {
    ref: (_db: unknown, path: string) => ({ path }),
    set: (...a: unknown[]) => rtdb.set(...a),
    update: (...a: unknown[]) => rtdb.update(...a),
    get: (...a: unknown[]) => rtdb.get(...a),
    onValue: () => () => {},
    // A key per chunk, time-ordered like the SDK's.
    push: () => ({ key: `k${String(++rtdb.pushed).padStart(4, '0')}` }),
    runTransaction: async () => ({ committed: true }),
    // The real sentinels: what the queue stores is what the SDK would get.
    serverTimestamp: actual.serverTimestamp,
    increment: actual.increment,
    onDisconnect: () => ({ set: async () => {}, update: async () => {}, cancel: async () => {} }),
    off: () => {},
  };
});
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coll: string, id: string) => ({ coll, id }),
  setDoc: async () => {},
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  getFirestore: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
  onSnapshot: () => () => {},
  updateDoc: async () => {},
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: {} }),
  getFunctions: () => ({}),
}));
vi.mock('rrweb', () => ({
  record: (options: { emit: (event: unknown) => void }) => {
    rrweb.emit = options.emit;
    rrweb.started++;
    return () => { rrweb.stopped++; };
  },
}));

const fakeIDB = new FakeIndexedDB();
const fakeWindow = Object.assign(new EventTarget(), { indexedDB: fakeIDB });

const UID = 'student_user3';
const STARTED_AT = 1_790_000_000_000;
const RECORDING = `users/students/${UID}/telemetry_sessions/session_${STARTED_AT}`;
const BUDGET = `users/students/${UID}/recorded_bytes`;

let queueModule: typeof import('@/infrastructure/services/IndexedDBQueue');
let recorder: typeof import('../screenRecorder');
let journey: typeof import('@/infrastructure/services/LearnerJourneyService');
let auth: typeof import('@/application/useAuthStore');

/** Applies the delivered writes to a plain tree, the way the database would. */
function databaseTree() {
  const tree: Record<string, any> = {};
  const at = (path: string) => {
    let node = tree;
    for (const seg of path.split('/')) node = node[seg] ??= {};
    return node;
  };
  const setAt = (path: string, value: unknown) => {
    const segs = path.split('/');
    const last = segs.pop()!;
    at(segs.join('/'))[last] = value;
  };
  for (const [r, value] of rtdb.set.mock.calls) setAt(r.path, value);
  for (const [r, fields] of rtdb.update.mock.calls) {
    for (const [k, v] of Object.entries(fields as Record<string, any>)) {
      const node = at(r.path);
      const inc = v && typeof v === 'object' && v['.sv'] && typeof v['.sv'].increment === 'number' ? v['.sv'].increment : null;
      node[k] = inc !== null ? (Number(node[k]) || 0) + inc : v;
    }
  }
  return tree;
}

const chunkWrites = () => rtdb.set.mock.calls.filter((c: any[]) => c[0].path.startsWith(`${RECORDING}/chunks/`));
const metaWrites = () => rtdb.set.mock.calls.filter((c: any[]) => c[0].path.startsWith(`${RECORDING}/metadata/`));
const budgetWrites = () => rtdb.update.mock.calls.filter((c: any[]) => c[0].path === BUDGET);

const startSync = (exerciseId = () => 's4_g_t1', meeting = 4) =>
  recorder.startScreenRecorder({ uid: UID, meeting, classStartedAt: STARTED_AT, currentExerciseId: exerciseId });

/** Lets pending promises and the fake IndexedDB's microtasks run. */
async function settle(rounds = 50) {
  for (let i = 0; i < rounds; i++) {
    await vi.advanceTimersByTimeAsync(0);
    await new Promise((r) => setImmediate(r));
  }
}

/** Starts the recorder and waits until rrweb records (it first loads rrweb and reads the budget). */
async function start(exerciseId?: () => string) {
  const before = rrweb.started;
  const stop = startSync(exerciseId);
  await vi.waitFor(() => expect(rrweb.started).toBe(before + 1));
  return stop;
}

/** rrweb emits some events, then the 2-second flush turns them into one chunk. */
async function recordChunk(t: number, n = 3) {
  for (let i = 0; i < n; i++) rrweb.emit!({ type: 3, timestamp: t + i, data: { i } });
  await vi.advanceTimersByTimeAsync(recorder.RECORDING_FLUSH_INTERVAL_MS);
}

describe('Module 21 — recording chunks go through the device queue first', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.stubGlobal('IDBKeyRange', fakeKeyRange);
    vi.stubGlobal('window', fakeWindow);
    rtdb.set = vi.fn(async () => {});
    rtdb.update = vi.fn(async () => {});
    rtdb.get = vi.fn(async () => ({ val: () => null, exists: () => false }));
    queueModule = await import('@/infrastructure/services/IndexedDBQueue');
    await vi.waitFor(() => expect((queueModule.indexedDBQueue as unknown as { db: unknown }).db).not.toBeNull());
    auth = await import('@/application/useAuthStore');
    // Registers the queue's RTDB delivery (the app's own handler).
    await import('@/infrastructure/services/FirebaseSyncService');
    recorder = await import('../screenRecorder');
    journey = await import('@/infrastructure/services/LearnerJourneyService');
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    fakeWindow.dispatchEvent(new Event('online'));
    auth.useAuthStore.setState({
      user: { uid: UID, student_id: 3, role: 'student' },
      role: 'student',
      isAuthenticated: true,
      isStudentAuthenticated: true,
    } as any);
    await vi.advanceTimersByTimeAsync(0);
    await queueModule.indexedDBQueue.clearAll();
    rtdb.set.mockReset().mockImplementation(async () => {});
    rtdb.update.mockReset().mockImplementation(async () => {});
    rtdb.get.mockReset().mockImplementation(async () => ({ val: () => null, exists: () => false }));
    rrweb.emit = null;
    rrweb.started = 0;
    rrweb.stopped = 0;
    rtdb.pushed = 0;
  });

  it('offline: every chunk waits in IndexedDB; back online they arrive under the same paths and keys, in order, and replay', async () => {
    fakeWindow.dispatchEvent(new Event('offline'));
    const stop = await start();

    await recordChunk(10_000);
    await recordChunk(12_000);
    await recordChunk(14_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await settle();

    // Nothing reached the database, and nothing was dropped: all of it is on the device.
    expect(chunkWrites()).toEqual([]);
    const stored = await queueModule.indexedDBQueue.getAll();
    expect(stored.map((i) => `${i.refPath}#${i.idempotency_key}`)).toEqual([
      `${RECORDING}/chunks#k0001`, `${RECORDING}/metadata#k0001`, `${BUDGET}#k0001_bytes`,
      `${RECORDING}/chunks#k0002`, `${RECORDING}/metadata#k0002`, `${BUDGET}#k0002_bytes`,
      `${RECORDING}/chunks#k0003`, `${RECORDING}/metadata#k0003`, `${BUDGET}#k0003_bytes`,
    ]);

    fakeWindow.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect(await queueModule.indexedDBQueue.getAll()).toEqual([]), { timeout: 10_000 });

    expect(chunkWrites().map((c: any[]) => c[0].path)).toEqual([
      `${RECORDING}/chunks/k0001`, `${RECORDING}/chunks/k0002`, `${RECORDING}/chunks/k0003`,
    ]);
    expect(metaWrites().map((c: any[]) => c[0].path)).toEqual([
      `${RECORDING}/metadata/k0001`, `${RECORDING}/metadata/k0002`, `${RECORDING}/metadata/k0003`,
    ]);
    expect(metaWrites()[0][1]).toEqual({ startTime: 10_000, endTime: 10_002, sessionNumber: 4, exercise_id: 's4_g_t1', idempotency_key: 'k0001' });

    // The teacher's replay reads what arrived: one recording of meeting 4, every event.
    const tree = databaseTree();
    const node = tree.users.students[UID].telemetry_sessions;
    const [session] = journey.parseRecordingSessions(node);
    expect(session).toMatchObject({ id: `session_${STARTED_AT}`, sessionNumber: 4, chunkCount: 3 });
    expect(session.chapters).toEqual([{ exerciseId: 's4_g_t1', start: 10_000, end: 14_002 }]);
    expect(journey.parseRecordingEvents([session]).map((e) => e.timestamp)).toEqual([
      10_000, 10_001, 10_002, 12_000, 12_001, 12_002, 14_000, 14_001, 14_002,
    ]);
    // The budget of this learner in this meeting counted every byte that was queued.
    const bytes = chunkWrites().reduce((n: number, c: any[]) => n + new TextEncoder().encode(c[1].data).length, 0);
    expect(tree.users.students[UID].recorded_bytes).toEqual({ meeting_4: bytes });
    stop();
  });

  it('a chunk still waiting when the page closes is kept, and sent on the next visit', async () => {
    fakeWindow.dispatchEvent(new Event('offline'));
    const stop = await start();
    rrweb.emit!({ type: 3, timestamp: 20_000, data: {} });
    stop(); // unmount / pagehide: the buffered events are flushed, not lost
    expect(rrweb.stopped).toBe(1);
    await vi.waitFor(async () =>
      expect((await queueModule.indexedDBQueue.getAll()).map((i) => i.idempotency_key)).toEqual(['k0001', 'k0001', 'k0001_bytes'])
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await settle();
    expect(chunkWrites()).toEqual([]);
    fakeWindow.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(chunkWrites()).toHaveLength(1), { timeout: 10_000 });
  });

  it('stamps the first chunk with the exercise the learner is on', async () => {
    let exercise = 's4_g_t1';
    const stop = await start(() => exercise);
    await recordChunk(30_000);
    exercise = 's4_g_t2';
    await recordChunk(32_000);
    await vi.waitFor(() => expect(metaWrites()).toHaveLength(2), { timeout: 10_000 });
    expect(metaWrites().map((c: any[]) => c[1].exercise_id)).toEqual(['s4_g_t1', 's4_g_t2']);
    stop();
  });

  it('the 50MB budget is read per learner per meeting, and on reaching it the recording stops and is flagged', async () => {
    const cap = recorder.RECORDING_BYTE_CAP;
    rtdb.get.mockImplementation(async (r: { path: string }) =>
      r.path === `${BUDGET}/meeting_4`
        ? { val: () => cap - 50, exists: () => true }
        : { val: () => null, exists: () => false });
    const stop = await start();
    expect(rtdb.get).toHaveBeenCalledWith({ path: `${BUDGET}/meeting_4` });

    await recordChunk(40_000, 5); // well over 50 bytes
    await vi.waitFor(() => expect(rtdb.update).toHaveBeenCalledWith({ path: RECORDING }, { recording_truncated: true }), { timeout: 10_000 });
    expect(rrweb.stopped).toBe(1);
    expect(chunkWrites()).toEqual([]);
    stop();
  });

  it('a meeting whose budget is already spent does not record again, even under a new opening', async () => {
    rtdb.get.mockImplementation(async () => ({ val: () => recorder.RECORDING_BYTE_CAP, exists: () => true }));
    const stop = startSync();
    await vi.waitFor(() => expect(rtdb.get).toHaveBeenCalled());
    await settle(200);
    expect(rrweb.started).toBe(0);
    stop();
  });

  it('the budget is counted with a server-side increment, so two mounts never overwrite each other', async () => {
    const stop = await start();
    await recordChunk(50_000);
    await vi.waitFor(() => expect(budgetWrites()).toHaveLength(1), { timeout: 10_000 });
    const [[, fields]] = budgetWrites();
    expect(Object.keys(fields)).toEqual(['meeting_4']);
    expect(fields.meeting_4).toEqual({ '.sv': { increment: expect.any(Number) } });
    stop();
  });
});

describe('Module 21 — when the recorder may run', () => {
  const ok = {
    uid: 'student_user3',
    classStartedAt: STARTED_AT,
    meeting: 4,
    storeSessionNumber: 4,
    initialized: true,
    superseded: false,
  };

  it('runs for this meeting, once its start stamp and the meeting are both known', async () => {
    const { shouldRecordScreen } = await import('../screenRecorder');
    expect(shouldRecordScreen(ok)).toBe(true);
  });

  it('not before the class session\'s server stamp — no stray session_{Date.now()} with a fresh 50MB', async () => {
    const { shouldRecordScreen } = await import('../screenRecorder');
    expect(shouldRecordScreen({ ...ok, classStartedAt: null })).toBe(false);
  });

  it('not while the store still holds another meeting (the first chunks of meeting 4 said s1_sandbox_controlled)', async () => {
    const { shouldRecordScreen } = await import('../screenRecorder');
    expect(shouldRecordScreen({ ...ok, storeSessionNumber: 1 })).toBe(false);
    expect(shouldRecordScreen({ ...ok, initialized: false })).toBe(false);
  });

  it('not on a device another device has taken over, nor without a learner', async () => {
    const { shouldRecordScreen } = await import('../screenRecorder');
    expect(shouldRecordScreen({ ...ok, superseded: true })).toBe(false);
    expect(shouldRecordScreen({ ...ok, uid: '' })).toBe(false);
  });
});
