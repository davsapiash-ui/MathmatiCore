import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { FakeIndexedDB, fakeKeyRange } from './fakeIndexedDB';
import { telemetryDocIdOf } from '@/infrastructure/services/telemetryStamp';

/**
 * Module 17 on the REAL IndexedDBQueue, running on an in-memory IndexedDB —
 * the other queue tests run it in its memory fallback. Only the Firebase
 * transport (RTDB, Firestore, Functions) is mocked.
 *
 *  PRD 17 §ב: "IndexedDB משמש כמאגר אגירה עמיד"; FIFO items.
 *  PRD 17 §ג: "מחיקה שלמה (Atomic) מ-IndexedDB רק לאחר קבלת אישור שרת (Ack)".
 *  PRD 29 §ג: "סדר FIFO קשוח".
 *  AGENTS.md invariant 2: "A failed chunk is never discarded."
 */

/**
 * Module 4: a telemetry key is a UUID v4. The tests name their events
 * ('e1', 'poison'…) and K turns a name into its UUID; the transport mock and
 * the helpers below turn a UUID back into its name, so the assertions read
 * as names. A key the tests never named is left as it is.
 */
const keyNames = new Map<string, string>();
const K = (name: string) => {
  const id = telemetryDocIdOf(name);
  keyNames.set(id, name);
  return id;
};
const nameOf = (key: unknown) => (typeof key === 'string' ? keyNames.get(key) ?? key : key);

const rtdb = {
  set: vi.fn<any[], any>(async () => {}),
  update: vi.fn<any[], any>(async () => {}),
  get: vi.fn<any[], any>(async () => ({ val: () => null, exists: () => false })),
  onValue: vi.fn<any[], any>(() => () => {}),
};
const fs = {
  setDoc: vi.fn<any[], any>(async () => {}),
  getDoc: vi.fn<any[], any>(async () => ({ exists: () => false, data: () => undefined })),
};
const callable = vi.fn<any[], any>(async () => ({ data: {} }));

vi.mock('@/infrastructure/firebase', () => ({
  firestore: { type: 'firestore' },
  db: { type: 'firestore' },
  functions: {},
  database: {},
  auth: { currentUser: { isAnonymous: true, getIdToken: async () => 't' }, signOut: async () => {} },
  authReady: Promise.resolve(true),
  serverNow: () => Date.now(),
  fetchServerClockOffset: async () => 0,
}));
vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  set: (...a: unknown[]) => rtdb.set(...a),
  update: (...a: unknown[]) => rtdb.update(...a),
  get: (...a: unknown[]) => rtdb.get(...a),
  onValue: (...a: unknown[]) => rtdb.onValue(...a),
  push: () => ({ key: 'push_key' }),
  runTransaction: async () => ({ committed: true }),
  serverTimestamp: () => Date.now(),
  onDisconnect: () => ({ set: async () => {}, update: async () => {}, cancel: async () => {} }),
  off: () => {},
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coll: string, id: string) => ({ coll, id: nameOf(id) }),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  getDoc: (...a: unknown[]) => fs.getDoc(...a),
  serverTimestamp: () => ({ __serverTimestamp: true }),
  getFirestore: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
  onSnapshot: () => () => {},
  updateDoc: async () => {},
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_f: unknown, name: string) => (payload: unknown) => callable(name, payload),
  getFunctions: () => ({}),
}));

const DB_NAME = 'mathmaticore_offline_db';
const STORE = 'offline_telemetry_queue';
const fakeIDB = new FakeIndexedDB();
const fakeWindow = Object.assign(new EventTarget(), { indexedDB: fakeIDB });

const event = (name: string, student = 3) => ({
  idempotency_key: K(name),
  client_timestamp: 1_000,
  session_id: `session_4_student_student_user${student}`,
  student_id: student,
  exercise_id: 's4_r_t1',
  event_type: 'PROBLEM_COMPLETE' as const,
  details: { total_duration_ms: 1000, undo_count: 0, error_count: 0 },
});

const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
const unreachable = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });

/** RTDB child writes under a recording path (presence writes are not queue deliveries). */
const chunkWrites = () => rtdb.set.mock.calls.filter((c) => (c[0] as { path: string }).path.includes('/telemetry_sessions/'));

/** Firestore ids written by setDoc, in call order. */
const firestoreWrites = () => fs.setDoc.mock.calls.map((c) => (c[0] as { id: string }).id);

let queue: typeof import('@/infrastructure/services/IndexedDBQueue')['indexedDBQueue'];
let queueModule: typeof import('@/infrastructure/services/IndexedDBQueue');
let auth: typeof import('@/application/useAuthStore');
let sync: typeof import('@/infrastructure/services/FirebaseSyncService');

/**
 * RTDB update() calls that are queue deliveries. The learner's presence write
 * (sign-in and sign-out, through the throttled writer of the learner record)
 * goes through the same SDK call, and is not what these tests count.
 */
const PRESENCE_FIELDS = new Set(['isOnline', 'onlineStatus', 'lastPing', 'lastActivityTimestamp', 'hasJoinedSession']);
const deliveries = () =>
  rtdb.update.mock.calls.filter((c) => !Object.keys((c[1] ?? {}) as Record<string, unknown>).every((k) => PRESENCE_FIELDS.has(k)));

const signIn = (n: number) =>
  auth.useAuthStore.setState({
    user: { uid: `student_user${n}`, student_id: n, role: 'student' },
    role: 'student',
    isAuthenticated: true,
    isStudentAuthenticated: true,
  });
const signInTeacher = () =>
  auth.useAuthStore.setState({
    user: { uid: 'teacher_t1', role: 'teacher' },
    role: 'teacher',
    isAuthenticated: true,
    isStudentAuthenticated: false,
  });
const signOutState = () =>
  auth.useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false });

const stored = async () => (await queue.getAll()).map((i) => nameOf(i.idempotency_key));

describe('Module 17 — the real queue on IndexedDB', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.stubGlobal('IDBKeyRange', fakeKeyRange);
    vi.stubGlobal('window', fakeWindow);
    queueModule = await import('@/infrastructure/services/IndexedDBQueue');
    queue = queueModule.indexedDBQueue;
    await vi.waitFor(() => expect((queue as unknown as { db: unknown }).db).not.toBeNull());
    // The rest of the app is imported as it runs under node: no window.
    vi.stubGlobal('window', undefined);
    auth = await import('@/application/useAuthStore');
    sync = await import('@/infrastructure/services/FirebaseSyncService');
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(async () => {
    fakeWindow.dispatchEvent(new Event('online'));
    signIn(3);
    await vi.advanceTimersByTimeAsync(0);
    await queue.clearAll();
    // No presence write of a previous test may land inside this one.
    (await import('@/infrastructure/services/ThrottledRtdbWriter')).resetThrottledWrites();
    for (const m of [rtdb.set, rtdb.update, rtdb.get, fs.setDoc, fs.getDoc, callable]) m.mockReset();
    rtdb.set.mockImplementation(async () => {});
    rtdb.update.mockImplementation(async () => {});
    rtdb.get.mockImplementation(async () => ({ val: () => null, exists: () => false }));
    fs.setDoc.mockImplementation(async () => {});
    fs.getDoc.mockImplementation(async () => ({ exists: () => false, data: () => undefined }));
    callable.mockImplementation(async () => ({ data: {} }));
  });

  it('runs on IndexedDB, not on the memory fallback', async () => {
    await queue.enqueue(event('e_disk'));
    expect([...fakeIDB.store(DB_NAME, STORE).records.values()].map((r) => nameOf(r.idempotency_key))).toEqual(['e_disk']);
  });

  describe('X7 — sign-out never deletes what the server has not acknowledged', () => {
    it('an offline sign-out keeps every item; another learner does not send them; the owner\'s next sign-in does', async () => {
      fakeWindow.dispatchEvent(new Event('offline'));
      await queue.enqueue(event('e_offline'));
      await queueModule.queueRecordingChunk('users/students/student_user3/telemetry_sessions/s4/chunks', 'chunk_1', '[{"t":1}]');

      auth.unifiedLogout();
      await vi.advanceTimersByTimeAsync(5000);

      // Was: flushWithin(4000) returned at once offline, then clearAll() erased both.
      expect(await stored()).toEqual(['e_offline', 'chunk_1']);
      expect((await queue.getAll()).every((i) => i.owner === 'student:3')).toBe(true);

      // Back online with learner 5 on this device: learner 3's items are not
      // sent with learner 5's claims, and do not count as learner 5's backlog.
      fakeWindow.dispatchEvent(new Event('online'));
      signIn(5);
      await vi.advanceTimersByTimeAsync(3000);
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(chunkWrites()).toEqual([]);
      expect(queue.getPendingCount()).toBe(0);
      expect(await stored()).toEqual(['e_offline', 'chunk_1']);

      // Learner 3 signs in again: delivered, in order, then deleted.
      signOutState();
      signIn(3);
      await vi.advanceTimersByTimeAsync(3000);
      expect(firestoreWrites()).toEqual(['e_offline']);
      expect(rtdb.set).toHaveBeenCalledWith(
        { path: 'users/students/student_user3/telemetry_sessions/s4/chunks/chunk_1' },
        { data: '[{"t":1}]', idempotency_key: 'chunk_1' }
      );
      expect(await stored()).toEqual([]);
    });

    it('an online sign-out sends first, and keeps only what was not acknowledged', async () => {
      await queue.enqueue(event('e_sent'));
      await queue.enqueue(event('e_refused'));
      fs.setDoc.mockImplementation(async (ref: { id: string }) => {
        if (ref.id === 'e_refused') throw unreachable();
      });

      auth.unifiedLogout();
      await vi.advanceTimersByTimeAsync(5000);

      expect(await stored()).toEqual(['e_refused']);
    });

    it('nothing is sent while nobody is signed in, and nothing is parked for it', async () => {
      signOutState();
      await vi.advanceTimersByTimeAsync(0);
      await queue.enqueue(event('e_nobody'));
      await queue.flushQueue();
      await vi.advanceTimersByTimeAsync(5000);
      expect(fs.setDoc).not.toHaveBeenCalled();
      const [item] = await queue.getAll();
      expect(item.owner).toBe('student:3'); // inferred from the event's student_id
      expect([item.retry_count, item.transient_count ?? 0]).toEqual([0, 0]);

      signIn(3);
      await vi.advanceTimersByTimeAsync(3000);
      expect(firestoreWrites()).toEqual(['e_nobody']);
    });

    it('items stored without an owner: a learner item goes to that learner, anything else only to staff', async () => {
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(800, { id: 800, payload: event('e_legacy_7', 7), idempotency_key: 'e_legacy_7', student_id: 7, timestamp: 1, retry_count: 0 });
      data.records.set(801, { id: 801, refPath: 'users/students/student_user7/telemetry_sessions/s/chunks', payload: { data: '[]', idempotency_key: 'c_legacy_7' }, idempotency_key: 'c_legacy_7', timestamp: 2, retry_count: 0 });
      data.records.set(802, { id: 802, callable: 'sendTeacherAdminMessage', payload: { client_message_id: 'tam_legacy' }, idempotency_key: 'tam_legacy', timestamp: 3, retry_count: 0 });
      data.nextKey = 803;

      await queue.flushQueue(); // learner 3 is signed in
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(chunkWrites()).toEqual([]);
      expect(callable).not.toHaveBeenCalled();

      signIn(7);
      await vi.advanceTimersByTimeAsync(3000);
      expect(firestoreWrites()).toEqual(['e_legacy_7']);
      expect(chunkWrites()).toHaveLength(1);
      expect(callable).not.toHaveBeenCalled();

      signInTeacher();
      await vi.advanceTimersByTimeAsync(3000);
      expect(callable).toHaveBeenCalledWith('sendTeacherAdminMessage', { client_message_id: 'tam_legacy' });
      expect(await stored()).toEqual([]);
      signIn(3);
    });

    it('N2 — a legacy gate mirror without an owner belongs to staff, not to the learner in its path', async () => {
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(850, { id: 850, refPath: 'users/students/student_user4', payload: { teacher_gate_approved: true, routeStatus: 'APPROVED', idempotency_key: 'gate_mirror_4_1' }, idempotency_key: 'gate_mirror_4_1', timestamp: 1, retry_count: 0 });
      data.nextKey = 851;
      expect(queueModule.inferOwner(data.records.get(850))).toBe(queueModule.ANY_STAFF_OWNER);

      signIn(4);
      await vi.advanceTimersByTimeAsync(3000);
      const mirrorWrites = () => rtdb.update.mock.calls.filter((c) => (c[1] as Record<string, unknown>)?.routeStatus === 'APPROVED');
      expect(mirrorWrites()).toEqual([]); // was: sent with learner 4's claims, and refused

      signInTeacher();
      await vi.advanceTimersByTimeAsync(3000);
      expect(rtdb.update).toHaveBeenCalledWith({ path: 'users/students/student_user4' }, { teacher_gate_approved: true, routeStatus: 'APPROVED' });
      expect(await stored()).toEqual([]);
      signIn(3);
    });

    it('no sign-out path in the app clears the queue', () => {
      const src = resolve(__dirname, '../..');
      const offenders: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) {
            if (name === '__tests__' || name === '__audit__' || name === 'node_modules') continue;
            walk(p);
          } else if (/\.(ts|tsx)$/.test(name) && !p.endsWith('IndexedDBQueue.ts')) {
            if (readFileSync(p, 'utf-8').includes('.clearAll(')) offenders.push(p);
          }
        }
      };
      walk(src);
      expect(offenders).toEqual([]);
    });
  });

  describe('X5 — a queued merge is replayed at refPath', () => {
    it('merge → update(refPath, fields) without the key; child → set(refPath/key)', async () => {
      await queue.enqueueRtdbMerge('users/students/student_user3', { lastAction: 'x', updatedAt: 5 }, 'merge_1');
      await queueModule.queueRecordingChunkMetadata('users/students/student_user3/telemetry_sessions/s4/metadata', 'chunk_9', { startTime: 1 });
      await queue.flushQueue();

      expect(rtdb.update).toHaveBeenCalledWith({ path: 'users/students/student_user3' }, { lastAction: 'x', updatedAt: 5 });
      expect(rtdb.set).toHaveBeenCalledWith(
        { path: 'users/students/student_user3/telemetry_sessions/s4/metadata/chunk_9' },
        { startTime: 1, idempotency_key: 'chunk_9' }
      );
      expect(await stored()).toEqual([]);
    });

    it('items stored by the old code as children are delivered as merges once this version loads', async () => {
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(900, { id: 900, refPath: 'users/students/student_user3/sessionState', payload: { status: 'active' }, idempotency_key: 'legacy_1', timestamp: 1, retry_count: 0 });
      data.records.set(901, { id: 901, refPath: 'users/students/student_user3', payload: { teacher_gate_approved: true, routeStatus: 'APPROVED', idempotency_key: 'gate_mirror_3_1' }, idempotency_key: 'gate_mirror_3_1', timestamp: 2, retry_count: 0 });
      data.nextKey = 902;
      await queue.flushQueue(); // learner 3: the sessionState item
      signInTeacher();
      await vi.advanceTimersByTimeAsync(0);
      await queue.flushQueue(); // the teacher: the gate mirror

      expect(deliveries()).toEqual([
        [{ path: 'users/students/student_user3/sessionState' }, { status: 'active' }],
        [{ path: 'users/students/student_user3' }, { teacher_gate_approved: true, routeStatus: 'APPROVED' }],
      ]);
      // Neither is written as a child any more (presence writes aside).
      expect(rtdb.set.mock.calls.filter((c) => /legacy_1|gate_mirror/.test((c[0] as { path: string }).path))).toEqual([]);
      signIn(3);
    });

    it('sessionState: a failed write is queued as a merge under one stable key', async () => {
      rtdb.update.mockImplementationOnce(async () => { throw denied(); });
      const state = { student_id: 'student_user3', session_number: 4, status: 'active' as const, current_path: 'green_path' as const };
      await sync.firebaseSyncService.syncSessionState('student_user3', state);

      const [item] = await queue.getAll();
      expect(item.rtdbMode).toBe('merge');
      expect(item.idempotency_key).toBe('session_state_student_user3_s4');
      await queue.flushQueue();
      expect(rtdb.update).toHaveBeenLastCalledWith({ path: 'users/students/student_user3/sessionState' }, state);
    });
  });

  describe('X6b — the "meeting finished" mark of meetings 3–8 rides the queue behind the meeting\'s telemetry', () => {
    const MARK_PATH = 'users/students/student_user3';
    const settle = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
    const markItems = async () => (await queue.getAll()).filter((i) => typeof i.completionMarkOf === 'number');
    const prepare = () => {
      const svc = sync.firebaseSyncService as unknown as { completedMarksSent: Set<string>; currentUserId: string | null };
      svc.completedMarksSent.clear();
      svc.currentUserId = 'student_user3';
    };

    it('stored after the last exercise\'s PROBLEM_COMPLETE, and delivered after it', async () => {
      prepare();
      await queue.enqueue(event('e_ex7_complete'));
      sync.firebaseSyncService.markMeetingCompleted('student_user3', 4);
      await settle();
      // Nothing written straight to the database: the mark is on the device first.
      expect(deliveries()).toEqual([]);
      const keys = await stored();
      expect(keys[0]).toBe('e_ex7_complete');
      expect(keys.slice(1).every((k) => String(k).startsWith('meeting_done_'))).toBe(true);
      expect((await markItems()).map((i) => [i.refPath, i.completionMarkOf])).toContainEqual([MARK_PATH, 4]);

      const order: string[] = [];
      fs.setDoc.mockImplementation(async (ref: { coll: string; id: string }) => { order.push(`${ref.coll}:${ref.id}`); });
      rtdb.update.mockImplementation(async (ref: { path: string }, fields: Record<string, unknown>) => {
        order.push(`rtdb:${ref.path}:${Object.keys(fields).join(',')}`);
      });
      await queue.flushQueue();
      expect(order[0]).toBe('telemetry_logs:e_ex7_complete');
      expect(order).toContain(`rtdb:${MARK_PATH}:completedMeetings/m4`);
      expect(order.indexOf(`rtdb:${MARK_PATH}:completedMeetings/m4`)).toBeGreaterThan(0);
      expect(await stored()).toEqual([]);
    });

    it('a reset of that meeting, taken up on the device, removes only its queued marks', async () => {
      prepare();
      fakeWindow.dispatchEvent(new Event('offline'));
      await queue.enqueue(event('e_m4'));
      sync.firebaseSyncService.markMeetingCompleted('student_user3', 4);
      sync.firebaseSyncService.markMeetingCompleted('student_user3', 5);
      await settle();
      expect((await markItems()).map((i) => i.completionMarkOf).sort()).toEqual([4, 5]);

      sync.firebaseSyncService.discardUnsentWorkspace(4);
      await settle();
      expect(await stored()).toContain('e_m4');
      expect((await markItems()).map((i) => i.completionMarkOf)).not.toContain(4);
      expect((await markItems()).map((i) => i.completionMarkOf)).toContain(5);
      fakeWindow.dispatchEvent(new Event('online'));
    });

    it('reconnecting before the device saw the reset: the mark waits — never written, never dropped — and the reset removes it', async () => {
      prepare();
      fakeWindow.dispatchEvent(new Event('offline'));
      await queue.enqueue(event('e_m4_last'));
      sync.firebaseSyncService.markMeetingCompleted('student_user3', 4);
      await settle();
      // The teacher reset meeting 4 meanwhile; the learner's screen has not taken it up yet.
      rtdb.get.mockImplementation(async (ref: { path: string }) => ({
        val: () => (ref.path.endsWith('/forceReload') ? true : ref.path.endsWith('/lastAction') ? 'המפגש 4 אופס ע״י המורה' : null),
        exists: () => true,
      }));
      fakeWindow.dispatchEvent(new Event('online'));
      await queue.flushQueue();
      expect(firestoreWrites()).toEqual(['e_m4_last']);
      expect(deliveries().filter((c) => 'completedMeetings/m4' in ((c[1] ?? {}) as object))).toEqual([]);
      expect((await markItems()).length).toBeGreaterThan(0);
      expect((await queue.getAll()).every((i) => !i.parked_at)).toBe(true);

      sync.firebaseSyncService.discardUnsentWorkspace(4);
      await settle();
      expect(await stored()).toEqual([]);
    });

    it('a mark whose meeting has no pending reset is delivered (another meeting\'s reset does not hold it)', async () => {
      prepare();
      rtdb.get.mockImplementation(async (ref: { path: string }) => ({
        val: () => (ref.path.endsWith('/forceReload') ? true : ref.path.endsWith('/lastAction') ? 'המפגש 3 אופס ע״י המורה' : null),
        exists: () => true,
      }));
      sync.firebaseSyncService.markMeetingCompleted('student_user3', 4);
      await settle();
      await queue.flushQueue();
      expect(deliveries().some((c) => 'completedMeetings/m4' in ((c[1] ?? {}) as object))).toBe(true);
      expect(await stored()).toEqual([]);
    });
  });

  describe('X6 — the meeting-2 completion goes through the queue, after the meeting\'s telemetry', () => {
    it('queued in FIFO order: telemetry, then the RTDB merge, then the session document', async () => {
      await queue.enqueue(event('e_last_task'));
      await sync.firebaseSyncService.syncSession2Completion('student_user3');
      // Nothing written straight to the SDKs — both are on the device first.
      expect(deliveries()).toEqual([]);
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(await stored()).toEqual(['e_last_task', 's2_done_rtdb_student_user3', 's2_done_doc_session_02_student_3']);

      const order: string[] = [];
      rtdb.update.mockImplementation(async (ref: { path: string }) => { order.push(`rtdb:${ref.path}`); });
      fs.setDoc.mockImplementation(async (ref: { coll: string; id: string }) => { order.push(`${ref.coll}:${ref.id}`); });
      await queue.flushQueue();
      expect(order).toEqual([
        'telemetry_logs:e_last_task',
        'rtdb:users/students/student_user3',
        'sessions:session_02_student_3',
      ]);
      const rtdbFields = rtdb.update.mock.calls[0][1];
      expect(rtdbFields).toMatchObject({ session_02_completed: true });
      // PRD 20 §ב: the gate mirror is staff-written only; the server writes the pending state.
      expect(rtdbFields).not.toHaveProperty('teacher_gate_approved');
      expect(rtdbFields).not.toHaveProperty('routeStatus');
      expect(rtdbFields).not.toHaveProperty('idempotency_key');
      expect(fs.setDoc.mock.calls[1][2]).toEqual({ merge: true });
    });

    it('a late replay over the teacher\'s approval does not lock the child out again', async () => {
      rtdb.get.mockImplementation(async (ref: { path: string }) => ({
        val: () => (ref.path.endsWith('/teacher_gate_approved') ? true : ref.path.endsWith('/routeStatus') ? 'APPROVED' : null),
      }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3');
      await queue.flushQueue();

      const fields = rtdb.update.mock.calls[0][1];
      expect(fields).not.toHaveProperty('teacher_gate_approved');
      expect(fields).not.toHaveProperty('routeStatus');
      expect(fields).toMatchObject({ session_02_completed: true });
    });

    it('a completion queued by an earlier version with the gate fields delivers without them, approved or not', async () => {
      const data = fakeIDB.store(DB_NAME, STORE);
      // As the previous version stored it: a merge that skipped the gate fields only over an approval.
      data.records.set(710, { id: 710, refPath: 'users/students/student_user3', rtdbMode: 'merge', skipFieldsIfGateApproved: ['teacher_gate_approved', 'routeStatus'], payload: { session_02_completed: true, teacher_gate_approved: false, routeStatus: 'PENDING_TEACHER_APPROVAL', updatedAt: 5 }, idempotency_key: 's2_done_rtdb_student_user3', timestamp: 1, retry_count: 0 });
      data.nextKey = 711;
      await queue.flushQueue();

      expect(rtdb.update.mock.calls[0][1]).toEqual({ session_02_completed: true, updatedAt: 5 });
      // No pre-read of the gate: the learner never writes it, so there is nothing to check.
      expect(rtdb.get.mock.calls.filter((c) => /teacher_gate_approved|routeStatus/.test((c[0] as { path: string }).path))).toEqual([]);
      expect(await stored()).toEqual([]);
    });
  });

  describe('A late re-send of the meeting-2 completion never overwrites the server\'s score', () => {
    // Emulator finding: the trigger scored 29% / remediation_path, the queued
    // setDoc(merge:true) then wrote 71% / green_path, and the trigger did not
    // run again. The RTDB replay did the same to the mirrored score and path.
    const scored = { is_completed: true, session_score_percent: 29, matrix_recommended_path: 'remediation_path', evaluated_at: 1234, teacher_gate_approved: false };

    it('session document already completed on the server → counts as delivered, nothing written', async () => {
      fs.getDoc.mockImplementation(async (ref: { coll: string }) => ({ exists: () => ref.coll === 'sessions', data: () => scored }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3');
      await queue.flushQueue();

      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(fs.getDoc).toHaveBeenCalledWith({ coll: 'sessions', id: 'session_02_student_3' });
      expect(await stored()).toEqual([]);
    });

    it('the RTDB item carries no score and no path — only the server writes them (owner, 29.9.2026)', async () => {
      await sync.firebaseSyncService.syncSession2Completion('student_user3');
      await queue.flushQueue();

      const fields = rtdb.update.mock.calls[0][1];
      expect(fields).not.toHaveProperty('session_score_percent');
      expect(fields).not.toHaveProperty('matrix_recommended_path');
      expect(fields).toMatchObject({ session_02_completed: true });
    });

    it('first delivery: a session document not yet completed (created by the deadline function) is written — without score, path or stamp', async () => {
      fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ is_completed: false, session_score_percent: null }) }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3');
      await queue.flushQueue();

      expect(fs.setDoc.mock.calls.map((c) => (c[0] as { coll: string }).coll)).toEqual(['sessions']);
      const written = fs.setDoc.mock.calls[0][1];
      expect(written).toMatchObject({ is_completed: true, teacher_gate_approved: false });
      // Nor the meeting's times: the server is their only source (Module 14 §ב).
      for (const field of ['session_score_percent', 'matrix_recommended_path', 'evaluated_at', 'session_start_time', 'session_deadline_time']) {
        expect(written).not.toHaveProperty(field);
      }
    });

    it('items stored by the previous version, not yet delivered: the client\'s score and path are left out, so the rules accept them', async () => {
      fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ is_completed: false, session_score_percent: null }) }));
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(700, { id: 700, refPath: 'users/students/student_user3', rtdbMode: 'merge', skipFieldsIfEvaluated: { collection: 'sessions', docId: 'session_02_student_3', fields: ['session_score_percent', 'matrix_recommended_path'] }, payload: { session_02_completed: true, session_score_percent: 71, matrix_recommended_path: 'green_path', teacher_gate_approved: false, routeStatus: 'PENDING_TEACHER_APPROVAL' }, idempotency_key: 's2_done_rtdb_student_user3', timestamp: 1, retry_count: 0 });
      data.records.set(701, { id: 701, firestoreDoc: { collection: 'sessions', docId: 'session_02_student_3', deliveredWhen: { is_completed: true } }, payload: { is_completed: true, session_score_percent: 71, matrix_recommended_path: 'green_path', teacher_gate_approved: false, session_start_time: 1000, session_deadline_time: 3601000 }, idempotency_key: 's2_done_doc_session_02_student_3', timestamp: 2, retry_count: 0 });
      data.nextKey = 702;
      await queue.flushQueue();

      // The gate fields are staff-only now (PRD 20 §ב): left out, so the rules accept the item.
      expect(rtdb.update.mock.calls[0][1]).toEqual({ session_02_completed: true });
      expect(fs.setDoc.mock.calls[0][1]).toEqual({ is_completed: true, teacher_gate_approved: false });
      expect(await stored()).toEqual([]);
    });

    it('items stored by the previous version get the same checks', async () => {
      fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => scored }));
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(700, { id: 700, refPath: 'users/students/student_user3', payload: { session_02_completed: true, session_score_percent: 71, matrix_recommended_path: 'green_path', idempotency_key: 's2_done_rtdb_student_user3' }, idempotency_key: 's2_done_rtdb_student_user3', timestamp: 1, retry_count: 0 });
      data.records.set(701, { id: 701, firestoreDoc: { collection: 'sessions', docId: 'session_02_student_3' }, payload: { is_completed: true, session_score_percent: 71 }, idempotency_key: 's2_done_doc_session_02_student_3', timestamp: 2, retry_count: 0 });
      data.nextKey = 702;
      await queue.flushQueue();

      expect(rtdb.update.mock.calls[0][1]).toEqual({ session_02_completed: true });
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(await stored()).toEqual([]);
    });
  });

  describe('X8 — a redelivered write that is already on the server counts as delivered', () => {
    it('telemetry_logs: refused retry + the document exists → Ack, deleted', async () => {
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      fs.getDoc.mockImplementation(async (ref: { coll: string; id: string }) => ({
        exists: () => ref.coll === 'telemetry_logs' && ref.id === 'e_acklost',
        data: () => ({}),
      }));
      await queue.enqueue(event('e_acklost'));
      await queue.flushQueue();
      expect(fs.getDoc).toHaveBeenCalledWith({ coll: 'telemetry_logs', id: 'e_acklost' });
      expect(await stored()).toEqual([]);
    });

    it('srl_reflections (create-only) is treated the same way', async () => {
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      fs.getDoc.mockImplementation(async (ref: { coll: string }) => ({ exists: () => ref.coll === 'srl_reflections', data: () => ({}) }));
      await queueModule.queueSRLReflection('srl_session_08_student_3', { student_id: 3, session_number: 8 });
      await queue.flushQueue();
      expect(fs.getDoc).toHaveBeenCalledWith({ coll: 'srl_reflections', id: 'srl_session_08_student_3' });
      expect(await stored()).toEqual([]);
    });

    it('a refusal with no document on the server stays queued', async () => {
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_really_refused'));
      await queue.flushQueue();
      const [item] = await queue.getAll();
      expect(nameOf(item.idempotency_key)).toBe('e_really_refused');
      expect(item.retry_count).toBe(1);
    });


    it('a failure recorded after another tab delivered the item does not bring it back', async () => {
      let fail: (e: Error) => void = () => {};
      fs.setDoc.mockImplementation(() => new Promise<void>((_r, reject) => { fail = reject; }));
      await queue.enqueue(event('e_two_tabs'));
      const pass = queue.flushQueue();
      await vi.waitFor(() => expect(fs.setDoc).toHaveBeenCalled());

      // The other tab delivered it and deleted the row.
      const data = fakeIDB.store(DB_NAME, STORE);
      for (const [k, v] of data.records) if (nameOf(v.idempotency_key) === 'e_two_tabs') data.records.delete(k);

      fail(unreachable());
      await pass;
      expect(await stored()).toEqual([]);
    });
  });

  describe('X9 — strict FIFO', () => {
    it('the pass ends at the first item that did not arrive; nothing behind it goes first', async () => {
      let e2Fails = true;
      fs.setDoc.mockImplementation(async (ref: { id: string }) => {
        if (ref.id === 'e2' && e2Fails) { e2Fails = false; throw unreachable(); }
      });
      await queue.enqueue(event('e1'));
      await queue.enqueue(event('e2'));
      await queue.enqueue(event('e3'));

      await queue.flushQueue();
      expect(firestoreWrites()).toEqual(['e1', 'e2']); // was: e1, e2, e3 — e3 overtook e2
      expect(await stored()).toEqual(['e2', 'e3']);
      expect((await queue.getAll())[0].retry_count).toBe(0); // a network failure is not a refusal

      await queue.flushQueue();
      expect(firestoreWrites()).toEqual(['e1', 'e2', 'e2', 'e3']);
      expect(await stored()).toEqual([]);
    });

    it('an item the server refuses five times is parked, never deleted, and stops blocking', async () => {
      fs.setDoc.mockImplementation(async (ref: { id: string }) => { if (ref.id === 'poison') throw denied(); });
      await queue.enqueue(event('poison'));
      await queue.enqueue(event('behind'));

      for (let i = 1; i <= 4; i++) {
        await queue.flushQueue();
        expect(firestoreWrites().filter((id) => id === 'behind')).toEqual([]);
      }
      await queue.flushQueue(); // fifth refusal: parked, and the queue moves on
      expect(firestoreWrites().filter((id) => id === 'behind')).toEqual(['behind']);
      const left = await queue.getAll();
      expect(left.map((i) => [nameOf(i.idempotency_key), i.retry_count])).toEqual([['poison', 5]]);
    });

    it('a callable that always fails with internal is parked after 20 failures; the gate mirror behind it is sent', async () => {
      // Measured before: 123 retries an hour, and the mirror behind it never left.
      signInTeacher();
      callable.mockImplementation(async () => { throw Object.assign(new Error('INTERNAL'), { code: 'functions/internal' }); });
      await queue.enqueueCallable('sendTeacherAdminMessage', { message_body: 'x', client_message_id: 'tam_1' }, 'tam_1');
      await queue.enqueueRtdbMerge('users/students/student_user3', { teacher_gate_approved: true, routeStatus: 'APPROVED' }, 'gate_mirror_3_1');

      await vi.advanceTimersByTimeAsync(0); // the sign-in's own flush
      for (let i = 0; i < 40; i++) {
        const [head] = await queue.getAll();
        if ((head.transient_count ?? 0) >= 19) break;
        expect(deliveries()).toEqual([]); // strict FIFO: each failure ends the pass
        await queue.flushQueue();
      }
      expect(deliveries()).toEqual([]);
      await queue.flushQueue(); // 20th failure: parked, and the pass moves on
      expect(rtdb.update).toHaveBeenCalledWith({ path: 'users/students/student_user3' }, { teacher_gate_approved: true, routeStatus: 'APPROVED' });
      const left = await queue.getAll();
      expect(left.map((i) => [i.idempotency_key, i.retry_count, i.transient_count])).toEqual([['tam_1', 0, 20]]);
      signIn(3);
    });
  });

  describe('N1 — an outage the browser does not report parks nothing for good', () => {
    const offlineRead = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
    const internal = () => Object.assign(new Error('INTERNAL'), { code: 'functions/internal' });

    const networkDown = () => Object.assign(new Error('UNAVAILABLE'), { code: 'functions/unavailable' });

    /**
     * Parks the teacher's message by 20 transient failures (`internal` unless
     * told otherwise); the queue is left signed in as the teacher, and the
     * function then works again.
     */
    const parkMessage = async (failure: () => Error = internal) => {
      signInTeacher();
      await vi.advanceTimersByTimeAsync(0);
      callable.mockImplementation(async () => { throw failure(); });
      await queue.enqueueCallable('sendTeacherAdminMessage', { message_body: 'x', client_message_id: 'tam_p' }, 'tam_p');
      for (let i = 0; i < 40; i++) {
        const [head] = await queue.getAll();
        if (queueModule.isParked(head)) break;
        await queue.flushQueue();
      }
      const [parked] = await queue.getAll();
      expect(parked.transient_count).toBe(20);
      callable.mockImplementation(async () => ({ data: {} }));
    };

    it('(a) a pre-read that finds the network down never parks the meeting-2 completion; the network returns without a reload → delivered', async () => {
      // The browser still says "online"; every read fails at once, as offline.
      rtdb.get.mockImplementation(async () => { throw new Error('Client is offline.'); });
      fs.getDoc.mockImplementation(async () => { throw offlineRead(); });
      await sync.firebaseSyncService.syncSession2Completion('student_user3');

      // Well past 20 attempts (the old item was parked after ~18 minutes).
      for (let i = 0; i < 40; i++) await queue.flushQueue();
      await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
      // The RTDB item has no pre-read any more (it carries no gate field, PRD
      // 20 §ב), so here only the session document waits on its pre-read.
      const waiting = await queue.getAll();
      expect(waiting.map((i) => [i.idempotency_key, i.retry_count ?? 0, i.transient_count ?? 0])).toEqual([
        ['s2_done_doc_session_02_student_3', 0, 0],
      ]);
      expect(deliveries()).toHaveLength(1);
      expect(fs.setDoc).not.toHaveBeenCalled();

      // The network comes back. No reload, no online/offline event.
      rtdb.get.mockImplementation(async () => ({ val: () => null }));
      fs.getDoc.mockImplementation(async () => ({ exists: () => false, data: () => undefined }));
      await vi.advanceTimersByTimeAsync(31_000); // the next backoff retry
      expect(deliveries()).toHaveLength(1);
      expect(fs.setDoc.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['session_02_student_3']);
      expect(await stored()).toEqual([]);
      expect(queue.getSyncState()).toBe('synced');
    });

    it('(b) the browser "online" event revives an item the NETWORK parked', async () => {
      await parkMessage(networkDown);
      expect((await queue.getAll())[0].last_failure_kind).toBe('network');
      fakeWindow.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
      await vi.waitFor(async () => expect(await stored()).toEqual([]));
      expect(callable).toHaveBeenLastCalledWith('sendTeacherAdminMessage', { message_body: 'x', client_message_id: 'tam_p' });
      signIn(3);
    });

    it('(b) a successful delivery in a later pass revives an item the NETWORK parked', async () => {
      await parkMessage(networkDown);
      await queue.enqueueRtdbMerge('users/students/student_user3', { teacher_gate_approved: true }, 'gate_mirror_3_9');
      await queue.flushQueue(); // the mirror is delivered → the parked message gets a probe
      expect(deliveries()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.waitFor(async () => expect(await stored()).toEqual([]));
      signIn(3);
    });

    it('R1 — an item that failed with internal is NOT retried because something else went through', async () => {
      await parkMessage(); // parked by internal, while the server answered
      callable.mockImplementation(async () => { throw internal(); });
      const calls = callable.mock.calls.length;
      await queue.enqueueRtdbMerge('users/students/student_user3', { teacher_gate_approved: true }, 'gate_mirror_3_8');
      await queue.flushQueue();
      await vi.advanceTimersByTimeAsync(5000);
      expect(deliveries()).toHaveLength(1);
      expect(callable.mock.calls.length).toBe(calls); // not revived by the mirror's success
      const [item] = await queue.getAll();
      expect([item.idempotency_key, item.transient_count, item.last_failure_kind]).toEqual(['tam_p', 20, 'transient']);
      signIn(3);
    });

    it('(b) the revive timer gives an item parked by internal one probe after 2 minutes', async () => {
      await parkMessage(); // the function works again from here on
      // No event, no other delivery: only the timer can send it.
      await vi.advanceTimersByTimeAsync(119_000);
      expect(await stored()).toEqual(['tam_p']);
      await vi.advanceTimersByTimeAsync(2_000);
      await vi.waitFor(async () => expect(await stored()).toEqual([]));
      signIn(3);
    });

    it('R1 — an always-internal callable at the head: after the first cycle, gate mirrors behind it go through in seconds', async () => {
      // The review: a teacher dashboard, a teacher→admin message whose function
      // always throws internal, gate mirrors queued behind it every 5 minutes
      // for 2 hours. Before: every mirror delayed up to ~8 min, over and over,
      // and the broken function called ~125 times an hour.
      signInTeacher();
      await vi.advanceTimersByTimeAsync(0);
      callable.mockImplementation(async () => { throw internal(); });
      await queue.enqueueCallable('sendTeacherAdminMessage', { message_body: 'x', client_message_id: 'tam_broken' }, 'tam_broken');

      const mirrorDelivered = (n: number) =>
        rtdb.update.mock.calls.some((c) => (c[1] as { mirror_n?: number })?.mirror_n === n);
      const slow: number[] = [];
      let callsAfterFirstCycle = 0;
      for (let n = 0; n < 24; n++) { // 24 × 5 min = 2 hours
        await queue.enqueueRtdbMerge('users/students/student_user3', { mirror_n: n }, `gate_mirror_3_r${n}`);
        if (n === 3) callsAfterFirstCycle = callable.mock.calls.length; // 15 min in: the first cycle is over
        await vi.advanceTimersByTimeAsync(3_000);
        if (n >= 3 && !mirrorDelivered(n)) slow.push(n);
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 3_000);
      }

      expect(slow).toEqual([]); // every mirror after the first cycle within 3 seconds
      expect(callsAfterFirstCycle).toBeGreaterThanOrEqual(20);
      // Probes on the backoff schedule — 2, 4, 8, 16, 32, then 60 minutes after
      // each parking — not 20 more attempts per cycle.
      const probes = callable.mock.calls.length - callsAfterFirstCycle;
      expect(probes).toBeGreaterThanOrEqual(3);
      expect(probes).toBeLessThanOrEqual(6);
      const [item] = await queue.getAll();
      expect(item.idempotency_key).toBe('tam_broken'); // kept, never deleted
      expect(item.revive_count).toBeGreaterThanOrEqual(3);
      signIn(3);
    });

    it('an item parked by real refusals waits for the next page load, as before', async () => {
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_refused_5'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();
      fs.setDoc.mockImplementation(async () => {});
      fakeWindow.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      const [item] = await queue.getAll();
      expect([nameOf(item.idempotency_key), item.retry_count]).toEqual(['e_refused_5', 5]);
    });
  });

  describe('Module 17 §ב — refused events: never deleted, parked after 5, counted for the teacher', () => {
    it('five refusals park the event, count it, and the next page load gives it a new series; the count stays until the Ack', async () => {
      const counts: number[] = [];
      const off = queue.onRefusedCountChange((n) => counts.push(n));
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_refused'));
      for (let i = 0; i < 4; i++) await queue.flushQueue();
      expect(queue.getRefusedCount()).toBe(0);
      await queue.flushQueue();
      expect(queue.getRefusedCount()).toBe(1);
      expect(counts[counts.length - 1]).toBe(1);
      let [item] = await queue.getAll();
      expect(item.refused_parked_at).toBeTypeOf('number');

      // A page load: a new series of attempts, still counted as refused.
      await (queue as unknown as { reviveParkedItems: () => Promise<void> }).reviveParkedItems();
      [item] = await queue.getAll();
      expect(item.retry_count).toBe(0);
      expect(item.refused_parked_at).toBeTypeOf('number');
      await queue.flushQueue();
      expect(fs.setDoc.mock.calls.length).toBe(6);
      expect(queue.getRefusedCount()).toBe(1);

      // The server takes it: gone, and the count goes back to 0.
      fs.setDoc.mockImplementation(async () => {});
      await (queue as unknown as { reviveParkedItems: () => Promise<void> }).reviveParkedItems();
      await queue.flushQueue();
      expect(await stored()).toEqual([]);
      expect(queue.getRefusedCount()).toBe(0);
      expect(counts[counts.length - 1]).toBe(0);
      off();
    });

    it('the delivered document carries server_received_at and device_id', async () => {
      await queue.enqueue(event('e_stamped'));
      await queue.flushQueue();
      const [, body] = fs.setDoc.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(body.server_received_at).toEqual({ __serverTimestamp: true });
      expect(typeof body.device_id).toBe('string');
      expect(typeof body.synced_at).toBe('number');
    });

    it('S2 — the count is reported after every pass for that pass\'s identity, the sign-out flush included, and again on sign-in', async () => {
      const reports: Array<[string, number]> = [];
      const off = queue.onRefusedCountForOwner((owner, n) => { reports.push([owner, n]); });
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_s2'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();
      expect(reports[reports.length - 1]).toEqual(['student:3', 1]);

      // Signed out (the auth store is cleared first), the sign-out flush sends
      // as the identity that is leaving, and the server now takes the event.
      fs.setDoc.mockImplementation(async () => {});
      await (queue as unknown as { reviveParkedItems: () => Promise<void> }).reviveParkedItems();
      signOutState();
      await vi.advanceTimersByTimeAsync(0);
      reports.length = 0;
      await queue.flushQueue('student:3');
      expect(await stored()).toEqual([]);
      expect(reports).toEqual([['student:3', 0]]);

      // The next sign-in reports 0 again, although nothing changed here.
      reports.length = 0;
      signIn(3);
      await vi.advanceTimersByTimeAsync(0);
      expect(reports.some(([o, n]) => o === 'student:3' && n === 0)).toBe(true);
      off();
    });

    it('R1 — the count goes on its own path: a guarded board write pending on a superseded device is not sent with it', async () => {
      const svc = sync.firebaseSyncService as unknown as { publishedRefused: Map<number, number> };
      svc.publishedRefused.clear();
      const writer = await import('@/infrastructure/services/ThrottledRtdbWriter');
      // A first write opens the window; the second waits in it, guarded (the
      // device is superseded by the time it would be sent).
      await writer.throttledRtdbUpdate('users/students/student_user3', { 'workspaceState/counts': { units: 1 } });
      let superseded = false;
      writer.throttledRtdbUpdate('users/students/student_user3', { 'workspaceState/counts': { units: 9 } }, { guard: () => !superseded }).catch(() => {});
      superseded = true;
      rtdb.update.mockClear();

      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_r1'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();

      const calls = rtdb.update.mock.calls.map((c) => [(c[0] as { path: string }).path, c[1]] as const);
      expect(calls.some(([p]) => p === 'users/students/student_user3/refusedEvents')).toBe(true);
      // The stale board stayed behind its guard: nothing carried it out.
      expect(calls.filter(([, v]) => 'workspaceState/counts' in ((v ?? {}) as object))).toEqual([]);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(rtdb.update.mock.calls.filter((c) => 'workspaceState/counts' in ((c[1] ?? {}) as object))).toEqual([]);
    });

    it('S2/S3 — the learner\'s device writes its own count under refusedEvents/{device_id}, and 0 removes it, also after sign-out', async () => {
      const svc = sync.firebaseSyncService as unknown as { publishedRefused: Map<number, number> };
      svc.publishedRefused.clear();
      const { getDeviceId } = await import('@/infrastructure/services/telemetryStamp');
      const field = getDeviceId();
      const countWrites = () => rtdb.update.mock.calls
        .filter((c) => (c[0] as { path: string }).path === 'users/students/student_user3/refusedEvents' && field in ((c[1] ?? {}) as object))
        .map((c) => (c[1] as Record<string, unknown>)[field]);

      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_s3'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();
      expect(countWrites()).toEqual([1]);

      // Delivered by the sign-out flush: the count goes back to nothing.
      fs.setDoc.mockImplementation(async () => {});
      await (queue as unknown as { reviveParkedItems: () => Promise<void> }).reviveParkedItems();
      signOutState();
      await vi.advanceTimersByTimeAsync(0);
      await queue.flushQueue('student:3');
      expect(countWrites()).toEqual([1, null]);
      signIn(3);
      await vi.advanceTimersByTimeAsync(0);
      expect(countWrites()).toEqual([1, null]); // unchanged: not rewritten
    });

    it('S2 — a fresh page with 0 refused removes a count this device left earlier, and writes nothing when there is none', async () => {
      const svc = sync.firebaseSyncService as unknown as { publishedRefused: Map<number, number> };
      const { getDeviceId } = await import('@/infrastructure/services/telemetryStamp');
      const field = getDeviceId();
      const countWrites = () => rtdb.update.mock.calls
        .filter((c) => (c[0] as { path: string }).path === 'users/students/student_user3/refusedEvents' && field in ((c[1] ?? {}) as object))
        .map((c) => (c[1] as Record<string, unknown>)[field]);

      svc.publishedRefused.clear();
      await queue.flushQueue();
      expect(countWrites()).toEqual([]);

      svc.publishedRefused.clear();
      rtdb.get.mockImplementation(async (r: { path: string }) =>
        r.path === `users/students/student_user3/refusedEvents/${field}` ? { val: () => 2, exists: () => true } : { val: () => null, exists: () => false });
      await queue.flushQueue();
      expect(countWrites()).toEqual([null]);
    });

    it('B1 — when the ID token changes, a refusal-parked item gets one more series in the tab, once', async () => {
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_token'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();
      let [item] = await queue.getAll();
      expect(item.retry_count).toBe(5);

      // Rules that accept it have landed; the token refresh revives it.
      fs.setDoc.mockImplementation(async () => {});
      expect(await queue.reviveRefusalParked()).toBe(1);
      await vi.waitFor(async () => expect(await stored()).toEqual([]));
      expect(queue.getRefusedCount()).toBe(0);

      // Still refused: revived once, then it waits for the next page load.
      fs.setDoc.mockImplementation(async () => { throw denied(); });
      await queue.enqueue(event('e_token2'));
      for (let i = 0; i < 5; i++) await queue.flushQueue();
      expect(await queue.reviveRefusalParked()).toBe(1);
      // The revive starts a pass of its own; each further pass waits for the one before.
      await vi.waitFor(async () => {
        await queue.flushWithin(60_000);
        expect((await queue.getAll())[0].retry_count).toBe(5);
      });
      expect(await queue.reviveRefusalParked()).toBe(0);
      [item] = await queue.getAll();
      expect([nameOf(item.idempotency_key), item.retry_count]).toEqual(['e_token2', 5]); // kept, never deleted
    });

    describe('R2 — the legacy localStorage queue moves into the real queue', () => {
      const LEGACY = 'mathmaticore_offline_queue';
      let mem: Map<string, string>;
      let failSave = false;
      const withBrowser = async (run: () => Promise<void>) => {
        vi.stubGlobal('window', fakeWindow);
        vi.stubGlobal('localStorage', {
          getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
          setItem: (k: string, v: string) => { if (failSave && k === LEGACY) throw new Error('closed'); mem.set(k, String(v)); },
          removeItem: (k: string) => { if (failSave && k === LEGACY) throw new Error('closed'); mem.delete(k); },
        });
        try { await run(); } finally {
          vi.stubGlobal('window', undefined);
          vi.unstubAllGlobals();
          vi.stubGlobal('IDBKeyRange', fakeKeyRange);
          vi.stubGlobal('window', undefined);
        }
      };
      const migrate = () => (sync.firebaseSyncService as unknown as { loadOfflineQueueFromStorage: () => Promise<void> }).loadOfflineQueueFromStorage();
      const legacy = () => [
        { refPath: 'users/students/student_user2/legacy_events', payload: { n: 1 } },
        { refPath: 'users/students/student_user2/legacy_events', payload: { n: 2 } },
        { refPath: 'users/students/student_user2/legacy_events', payload: { n: 3 }, idempotency_key: 'kept_key' },
      ];
      beforeEach(() => { mem = new Map(); failSave = false; });

      it('a run cut short and run again moves the same items under the same keys; nothing is lost', async () => {
        fakeWindow.dispatchEvent(new Event('offline')); // keep them in the queue to look at
        await withBrowser(async () => {
          mem.set(LEGACY, JSON.stringify(legacy()));
          // The keys are saved before the loop; the tab "closes" before the key is cleared.
          const realSet = (globalThis.localStorage as Storage).setItem;
          let saves = 0;
          (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem = (k, v) => {
            saves++;
            if (saves > 1) throw new Error('closed');
            realSet(k, v);
          };
          (globalThis.localStorage as unknown as { removeItem: (k: string) => void }).removeItem = () => { throw new Error('closed'); };
          await migrate();
          const first = (await queue.getAll()).map((i) => i.idempotency_key);
          expect(first).toHaveLength(3);
          expect(JSON.parse(mem.get(LEGACY)!)).toHaveLength(3); // still there: nothing removed early

          await migrate(); // the next load
          const all = (await queue.getAll()).map((i) => String(i.idempotency_key));
          expect(new Set(all).size).toBe(3); // the same three keys — the same RTDB children
          expect(new Set(all)).toEqual(new Set(first));
          expect(all).toContain('kept_key');
        });
        fakeWindow.dispatchEvent(new Event('online'));
      });

      it('two migrations at once run once; the items belong to the learner their path names, not to whoever is signed in', async () => {
        fakeWindow.dispatchEvent(new Event('offline'));
        signIn(5);
        await vi.advanceTimersByTimeAsync(0);
        await withBrowser(async () => {
          mem.set(LEGACY, JSON.stringify(legacy()));
          await Promise.all([migrate(), migrate()]);
          const items = await queue.getAll();
          expect(items).toHaveLength(3);
          expect(items.every((i) => i.owner === 'student:2')).toBe(true);
          expect(mem.has(LEGACY)).toBe(false);
        });
        signIn(3);
        fakeWindow.dispatchEvent(new Event('online'));
      });
    });

    it('reaching the capacity is logged as a fault, once; nothing is discarded', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      queueModule.resetQueueCapacityFaultForTests();
      queueModule.reportQueueCapacityFault('indexeddb', queueModule.QUEUE_CAPACITY);
      queueModule.reportQueueCapacityFault('indexeddb', queueModule.QUEUE_CAPACITY + 1);
      expect(err.mock.calls.filter((c) => String(c[0]).includes('FAULT'))).toHaveLength(1);
      err.mockRestore();
      queueModule.resetQueueCapacityFaultForTests();
    });
  });

  describe('X10 — the cloud is not green while something waits', () => {
    it('an item enqueued during a flush is counted at once', async () => {
      let ack: () => void = () => {};
      fs.setDoc.mockImplementationOnce(() => new Promise<void>((r) => { ack = r; }));
      await queue.enqueue(event('f1'));
      expect(queue.getPendingCount()).toBe(1);
      const pass = queue.flushQueue();
      await vi.waitFor(() => expect(fs.setDoc).toHaveBeenCalledTimes(1));

      await queue.enqueue(event('f2'));
      expect(queue.getPendingCount()).toBe(2); // was: counted only when the flush ended
      expect(queue.getSyncState()).toBe('pending');

      ack();
      await pass;
      expect(queue.getSyncState()).toBe('pending'); // f2 still waits
      await vi.advanceTimersByTimeAsync(2000);
      expect(firestoreWrites()).toEqual(['f1', 'f2']);
      expect(queue.getSyncState()).toBe('synced');
    });

    it('green only through a server Ack; no RTDB connection probe gates the queue', async () => {
      // A school network that blocks the RTDB websocket but lets Firestore
      // through must not stop telemetry: the Ack is the reachability proof.
      expect(rtdb.onValue.mock.calls.some((c) => (c[0] as { path: string }).path === '.info/connected')).toBe(false);
      fs.setDoc.mockImplementationOnce(async () => { throw unreachable(); });
      await queue.enqueue(event('g1'));
      await queue.flushQueue();
      expect(queue.getSyncState()).toBe('pending'); // tried, not acknowledged: not green
      await queue.flushQueue();
      expect(queue.getSyncState()).toBe('synced');
    });
  });

  describe('X14 — Module 4: the telemetry_logs id is a UUID v4, and synced_at is on every document', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const OLD_KEY = 'telemetry_1700000000000_abc1234';
    /** An event queued by an older version: a non-UUID key, and no synced_at. */
    const storeOldItem = (key = OLD_KEY, id = 1200) => {
      const data = fakeIDB.store(DB_NAME, STORE);
      data.records.set(id, {
        id,
        payload: { ...event('unused'), idempotency_key: key },
        idempotency_key: key,
        student_id: 3,
        timestamp: 1,
        retry_count: 0,
      });
      data.nextKey = id + 1;
    };

    it('a new event is sent under its own UUID v4 key, with synced_at', async () => {
      await queue.enqueue(event('e_new'));
      await queue.flushQueue();
      const [ref, body] = fs.setDoc.mock.calls[0] as [{ coll: string; id: string }, Record<string, unknown>];
      expect(ref).toEqual({ coll: 'telemetry_logs', id: 'e_new' });
      expect(body.idempotency_key).toBe(K('e_new'));
      expect(body.idempotency_key).toMatch(UUID_V4);
      expect(typeof body.synced_at).toBe('number');
      expect(fs.getDoc).not.toHaveBeenCalled(); // no pre-read for a UUID key
    });

    it('an old item with a non-UUID key and no synced_at is delivered under a UUID derived from its key', async () => {
      storeOldItem();
      await queue.flushQueue();
      expect(fs.getDoc).toHaveBeenCalledWith({ coll: 'telemetry_logs', id: OLD_KEY });
      expect(fs.setDoc).toHaveBeenCalledTimes(1);
      const [ref, body] = fs.setDoc.mock.calls[0] as [{ coll: string; id: string }, Record<string, unknown>];
      expect(ref.coll).toBe('telemetry_logs');
      expect(ref.id).toMatch(UUID_V4);
      expect(ref.id).toBe(telemetryDocIdOf(OLD_KEY));
      expect(body.idempotency_key).toBe(ref.id); // the rules require doc id == idempotency_key
      expect(typeof body.synced_at).toBe('number');
      expect(await stored()).toEqual([]);
    });

    it('every retry of an old item writes the same document: redelivery stays idempotent', async () => {
      storeOldItem();
      fs.setDoc.mockImplementationOnce(async () => { throw unreachable(); });
      await queue.flushQueue();
      expect(await stored()).toEqual([OLD_KEY]); // kept, never discarded
      await queue.flushQueue();
      const ids = fs.setDoc.mock.calls.map((c) => (c[0] as { id: string }).id);
      expect(ids).toHaveLength(2);
      expect(ids[1]).toBe(ids[0]);
      expect(await stored()).toEqual([]);
    });

    it('an old item the server already holds under its old key counts as delivered, and is not written twice', async () => {
      storeOldItem();
      fs.getDoc.mockImplementation(async (ref: { coll: string; id: string }) => ({
        exists: () => ref.coll === 'telemetry_logs' && ref.id === OLD_KEY,
        data: () => ({}),
      }));
      await queue.flushQueue();
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(await stored()).toEqual([]);
    });

    it('an old item whose pre-read the rules refuse (a learner may not read a missing document) is written under its new id', async () => {
      storeOldItem();
      fs.getDoc.mockImplementation(async () => { throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }); });
      await queue.flushQueue();
      expect(fs.setDoc).toHaveBeenCalledTimes(1);
      const ref = fs.setDoc.mock.calls[0][0] as { id: string };
      expect(ref.id).toBe(telemetryDocIdOf(OLD_KEY));
      expect(await stored()).toEqual([]);
    });

    it('an old item whose pre-read cannot reach the server stays queued for the next pass', async () => {
      storeOldItem();
      fs.getDoc.mockImplementationOnce(async () => { throw unreachable(); });
      await queue.flushQueue();
      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(await stored()).toEqual([OLD_KEY]);
      await queue.flushQueue();
      expect(fs.setDoc).toHaveBeenCalledTimes(1);
      expect(await stored()).toEqual([]);
    });
  });

  describe('X15 — Module 5 §ב: every batch read from the queue is at most 20 events and 50KB', () => {
    const bigEvent = (name: string, bytes: number) => ({ ...event(name), details: { total_duration_ms: 1000, undo_count: 0, error_count: 0, pad: 'x'.repeat(bytes) } });

    it('the batch rule: 20 items, or the next item would pass 50KB; an item never waits behind an empty batch', () => {
      const { startsNewBatch, MAX_BATCH_BYTES, MAX_BATCH_ITEMS } = queueModule;
      expect(MAX_BATCH_BYTES).toBe(50 * 1024);
      expect(MAX_BATCH_ITEMS).toBe(20);
      expect(startsNewBatch(0, 0, 10)).toBe(false);
      expect(startsNewBatch(0, 0, MAX_BATCH_BYTES + 1)).toBe(false); // alone: still read
      expect(startsNewBatch(1, 30 * 1024, 20 * 1024)).toBe(false); // exactly 50KB
      expect(startsNewBatch(1, 30 * 1024, 20 * 1024 + 1)).toBe(true);
      expect(startsNewBatch(19, 100, 100)).toBe(false);
      expect(startsNewBatch(20, 100, 100)).toBe(true);
    });

    it('queuedItemBytes is the UTF-8 size of the payload sent', () => {
      expect(queueModule.queuedItemBytes({ payload: { a: 'א' } } as never)).toBe(new TextEncoder().encode('{"a":"א"}').length);
    });

    it('three 20KB events are read as two batches, and all three are delivered in order', async () => {
      const proto = Object.getPrototypeOf((queue as unknown as { db: object }).db) as { transaction: (...a: unknown[]) => unknown };
      const countReads = async (run: () => Promise<void>) => {
        const real = proto.transaction;
        let reads = 0;
        proto.transaction = function (this: unknown, ...a: unknown[]) {
          if (a[1] === 'readonly') reads++;
          return real.apply(this, a);
        };
        try { await run(); } finally { proto.transaction = real; }
        return reads;
      };

      for (const n of ['s1', 's2', 's3']) await queue.enqueue(event(n));
      const smallReads = await countReads(() => queue.flushQueue());
      expect(firestoreWrites()).toEqual(['s1', 's2', 's3']);
      fs.setDoc.mockClear();

      for (const n of ['b1', 'b2', 'b3']) await queue.enqueue(bigEvent(n, 20 * 1024));
      const bigReads = await countReads(() => queue.flushQueue());
      expect(firestoreWrites()).toEqual(['b1', 'b2', 'b3']);
      expect(bigReads - smallReads).toBe(1); // [b1, b2] then [b3]
      expect(await stored()).toEqual([]);
    });

    it('a single event over 50KB is sent alone and reported — never silently discarded', async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await queue.enqueue(bigEvent('huge', 60 * 1024));
        await queue.enqueue(event('after_huge'));
        await queue.flushQueue();
        expect(firestoreWrites()).toEqual(['huge', 'after_huge']);
        expect(errors.mock.calls.some((c) => String(c[0]).includes(`${K('huge')} is`) && String(c[0]).includes('over the 51200-byte batch limit'))).toBe(true);
        expect(await stored()).toEqual([]);
      } finally {
        errors.mockRestore();
      }
    });
  });

  it('X12 — the 50KB trim drops activeTask\'s long texts first, not the whole payload', () => {
    const payload = {
      sessionNumber: 4,
      standardTaskIdx: 2,
      undoStack: [{ answerDigits: ['1'] }],
      conversionsByColumn: { units: 1 },
      activeTask: { id: 't1', titleHe: 'כ'.repeat(15000), instructionHe: 'ה'.repeat(15000), numberA: 354, numberB: 128, isSubtraction: false },
    };
    expect(sync.payloadByteSize(payload)).toBeGreaterThan(sync.MAX_PAYLOAD_BYTES);
    const out = sync.enforceMaxPayloadBytes(payload);
    expect(sync.payloadByteSize(out)).toBeLessThanOrEqual(sync.MAX_PAYLOAD_BYTES);
    expect(out.activeTask).toEqual({ id: 't1', numberA: 354, numberB: 128, isSubtraction: false });
    // Was: collapsed to the 8-field core, losing the undo stack and the conversions.
    expect(out.undoStack).toEqual(payload.undoStack);
    expect(out.conversionsByColumn).toEqual(payload.conversionsByColumn);
  });

  it('X13 — sign-out resets the learner records held in memory', async () => {
    const { useStore } = await import('@/application/useStore');
    useStore.setState({ students: { ...useStore.getState().students, student_user4: { ...useStore.getState().students.student_user4, highestCompletedMeeting: 6, routeStatus: 'APPROVED' } } });
    useStore.getState().logout();
    expect(useStore.getState().students.student_user4.highestCompletedMeeting).toBe(0);
    expect(useStore.getState().students.student_user4.routeStatus).toBeNull();
    expect(Object.keys(useStore.getState().students)).toHaveLength(12);
  });
});
