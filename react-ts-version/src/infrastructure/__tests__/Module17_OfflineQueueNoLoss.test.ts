import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { FakeIndexedDB, fakeKeyRange } from './fakeIndexedDB';

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
  doc: (_db: unknown, coll: string, id: string) => ({ coll, id }),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  getDoc: (...a: unknown[]) => fs.getDoc(...a),
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

const event = (key: string, student = 3) => ({
  idempotency_key: key,
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

const stored = async () => (await queue.getAll()).map((i) => i.idempotency_key);

describe('Module 17 — the real queue on IndexedDB', () => {
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
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
    expect([...fakeIDB.store(DB_NAME, STORE).records.values()].map((r) => r.idempotency_key)).toEqual(['e_disk']);
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
      await queue.flushQueue();

      expect(rtdb.update.mock.calls).toEqual([
        [{ path: 'users/students/student_user3/sessionState' }, { status: 'active' }],
        [{ path: 'users/students/student_user3' }, { teacher_gate_approved: true, routeStatus: 'APPROVED' }],
      ]);
      expect(rtdb.set).not.toHaveBeenCalled();
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

  describe('X6 — the meeting-2 completion goes through the queue, after the meeting\'s telemetry', () => {
    it('queued in FIFO order: telemetry, then the RTDB merge, then the session document', async () => {
      await queue.enqueue(event('e_last_task'));
      await sync.firebaseSyncService.syncSession2Completion('student_user3', 71, 'green_path');
      // Nothing written straight to the SDKs — both are on the device first.
      expect(rtdb.update).not.toHaveBeenCalled();
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
      expect(rtdbFields).toMatchObject({ session_02_completed: true, teacher_gate_approved: false, routeStatus: 'PENDING_TEACHER_APPROVAL' });
      expect(rtdbFields).not.toHaveProperty('idempotency_key');
      expect(fs.setDoc.mock.calls[1][2]).toEqual({ merge: true });
    });

    it('a late replay over the teacher\'s approval does not lock the child out again', async () => {
      rtdb.get.mockImplementation(async (ref: { path: string }) => ({
        val: () => (ref.path.endsWith('/teacher_gate_approved') ? true : ref.path.endsWith('/routeStatus') ? 'APPROVED' : null),
      }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3', 71, 'green_path');
      await queue.flushQueue();

      const fields = rtdb.update.mock.calls[0][1];
      expect(fields).not.toHaveProperty('teacher_gate_approved');
      expect(fields).not.toHaveProperty('routeStatus');
      expect(fields).toMatchObject({ session_02_completed: true, session_score_percent: 71 });
    });
  });

  describe('A late re-send of the meeting-2 completion never overwrites the server\'s score', () => {
    // Emulator finding: the trigger scored 29% / remediation_path, the queued
    // setDoc(merge:true) then wrote 71% / green_path, and the trigger did not
    // run again. The RTDB replay did the same to the mirrored score and path.
    const scored = { is_completed: true, session_score_percent: 29, matrix_recommended_path: 'remediation_path', evaluated_at: 1234, teacher_gate_approved: false };

    it('session document already completed on the server → counts as delivered, nothing written', async () => {
      fs.getDoc.mockImplementation(async (ref: { coll: string }) => ({ exists: () => ref.coll === 'sessions', data: () => scored }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3', 71, 'green_path');
      await queue.flushQueue();

      expect(fs.setDoc).not.toHaveBeenCalled();
      expect(fs.getDoc).toHaveBeenCalledWith({ coll: 'sessions', id: 'session_02_student_3' });
      expect(await stored()).toEqual([]);
    });

    it('the RTDB replay leaves out the score and path once the server has evaluated', async () => {
      fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => scored }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3', 71, 'green_path');
      await queue.flushQueue();

      const fields = rtdb.update.mock.calls[0][1];
      expect(fields).not.toHaveProperty('session_score_percent');
      expect(fields).not.toHaveProperty('matrix_recommended_path');
      expect(fields).toMatchObject({ session_02_completed: true });
    });

    it('first delivery: a session document not yet completed (created by the deadline function) is written', async () => {
      fs.getDoc.mockImplementation(async () => ({ exists: () => true, data: () => ({ is_completed: false, session_score_percent: null }) }));
      await sync.firebaseSyncService.syncSession2Completion('student_user3', 71, 'green_path');
      await queue.flushQueue();

      expect(rtdb.update.mock.calls[0][1]).toMatchObject({ session_score_percent: 71, matrix_recommended_path: 'green_path' });
      expect(fs.setDoc.mock.calls.map((c) => (c[0] as { coll: string }).coll)).toEqual(['sessions']);
      expect(fs.setDoc.mock.calls[0][1]).toMatchObject({ is_completed: true, session_score_percent: 71 });
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
      expect(item.idempotency_key).toBe('e_really_refused');
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
      for (const [k, v] of data.records) if (v.idempotency_key === 'e_two_tabs') data.records.delete(k);

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
      expect(left.map((i) => [i.idempotency_key, i.retry_count])).toEqual([['poison', 5]]);
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
        expect(rtdb.update).not.toHaveBeenCalled(); // strict FIFO: each failure ends the pass
        await queue.flushQueue();
      }
      expect(rtdb.update).not.toHaveBeenCalled();
      await queue.flushQueue(); // 20th failure: parked, and the pass moves on
      expect(rtdb.update).toHaveBeenCalledWith({ path: 'users/students/student_user3' }, { teacher_gate_approved: true, routeStatus: 'APPROVED' });
      const left = await queue.getAll();
      expect(left.map((i) => [i.idempotency_key, i.retry_count, i.transient_count])).toEqual([['tam_1', 0, 20]]);
      signIn(3);
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
