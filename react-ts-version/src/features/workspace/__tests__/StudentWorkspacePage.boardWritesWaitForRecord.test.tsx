/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FakeRealtimeDatabase } from './fakeRealtimeDatabase';

/**
 * Module 17 and the owner's ruling of 28.9.2026 (no loss of a child's work).
 *
 * The real StudentWorkspacePage and the real sync service, on the in-memory
 * Realtime Database. The page writes the board's fields into the record's
 * workspaceState (workspaceState/counts, …/answerDigits, …/flowStatus …).
 * Those writes used to go out before the learner's own meeting was on the
 * store and before the record had been read: the store's defaults of
 * meeting 1 on page load, and — without a connection — a fresh start, which
 * the database queues and layers onto the record's copy on reconnect, the
 * copy the reconnect then judges and restores.
 *
 * The transport here can hold the database back: `holding` — listeners get
 * nothing yet (no connection, or the record still on its way); `offline` —
 * writes wait in the database's own queue and are sent, in order, on
 * reconnect, as the Firebase SDK does.
 */

vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
const fake = vi.hoisted(() => ({ db: null as unknown as FakeRealtimeDatabase }));
const link = vi.hoisted(() => ({
  holding: false,
  offline: false,
  waiting: [] as Array<{ path: string; cb: (snap: any) => void; active: boolean; off?: () => void }>,
  queued: [] as Array<{ path: string; fields: Record<string, any> }>,
  /** Every update() the app made, in order, whether sent at once or queued. */
  updates: [] as Array<{ path: string; fields: Record<string, any> }>,
}));

vi.mock('firebase/database', async () => {
  const mod = await import('./fakeRealtimeDatabase');
  const base = mod.firebaseDatabaseModule(() => (fake.db ??= new mod.FakeRealtimeDatabase()));
  return {
    ...base,
    onValue: (r: { path: string }, cb: (snap: any) => void) => {
      if (!link.holding || r.path.startsWith('.info')) return base.onValue(r as any, cb);
      const w: (typeof link.waiting)[number] = { path: r.path, cb, active: true };
      link.waiting.push(w);
      return () => {
        w.active = false;
        w.off?.();
      };
    },
    update: async (r: { path: string }, fields: Record<string, any>) => {
      link.updates.push({ path: r.path, fields: JSON.parse(JSON.stringify(fields)) });
      if (link.offline) {
        link.queued.push({ path: r.path, fields });
        return;
      }
      return base.update(r as any, fields);
    },
  };
});
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  db: {},
  functions: {},
  auth: {},
  authReady: Promise.resolve(true),
  serverNow: () => Date.now() + (fake.db?.serverOffsetMs ?? 0),
  isServerClockKnown: () => true,
  fetchServerClockOffset: async () => fake.db?.serverOffsetMs ?? 0,
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: () => () => {},
  signInAnonymously: async () => ({}),
  getAuth: () => ({}),
  GoogleAuthProvider: class {},
  signInWithPopup: async () => ({}),
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  getDocs: async () => ({ docs: [], empty: true, forEach: () => {} }),
  setDoc: async () => {},
  addDoc: async () => ({}),
  updateDoc: async () => {},
  deleteDoc: async () => {},
  onSnapshot: () => () => {},
  serverTimestamp: () => ({}),
  getFirestore: () => ({}),
  Timestamp: { now: () => ({ toMillis: () => Date.now() }) },
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: () => async () => ({ data: {} }),
  getFunctions: () => ({}),
  connectFunctionsEmulator: () => {},
}));
vi.mock('rrweb', () => ({ record: () => () => {} }));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({ UdlSpeechButton: () => null }));

import { FakeRealtimeDatabase as FakeDb } from './fakeRealtimeDatabase';
import { StudentWorkspacePage, FIREBASE_RESTORE_GRACE_MS } from '../StudentWorkspacePage';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { resetThrottledWrites } from '@/infrastructure/services/ThrottledRtdbWriter';
import { WORKSPACE_SAVED_AT_KEY } from '@/core/workspaceSnapshot';

const UID = 'student_user9';
const STUDENT = `users/students/${UID}`;
const ws = () => useWorkspaceStore.getState();

const mountMeeting = async (meeting: number) => {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/workspace?meeting=${meeting}`]}>
        <StudentWorkspacePage />
      </MemoryRouter>
    );
  });
};
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await new Promise((r) => setImmediate(r));
    });
  }
};

/** The page is loaded with no copy of the meeting on the device and the record not (yet) read. */
async function loadPage(meeting: number, mode: 'offline' | 'record still loading') {
  link.holding = true;
  link.offline = mode === 'offline';
  fake.db.connected = mode !== 'offline';
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true);
  useStore.setState({ students: {} as any, firebaseLoaded: false } as any);
  // Signing in starts the real sync for this learner: its record listener now waits.
  useAuthStore.setState({
    user: { uid: UID, student_id: 9, role: 'student' },
    role: 'student',
    isAuthenticated: true,
    isStudentAuthenticated: true,
  } as any);
  await mountMeeting(meeting);
  await settle();
}

/** The connection comes back (or the record arrives): queued writes go out first, then listeners get the record. */
async function recordArrives() {
  await act(async () => {
    link.holding = false;
    link.offline = false;
    fake.db.connected = true;
    for (const q of link.queued.splice(0)) fake.db.update(q.path, q.fields);
    for (const w of link.waiting.splice(0)) if (w.active) w.off = fake.db.onValue(w.path, w.cb);
  });
  await settle();
}

/** update() calls to the learner's record that wrote any workspaceState field. */
const workspaceFieldWrites = () =>
  link.updates.filter(
    (u) => u.path === STUDENT && Object.keys(u.fields).some((k) => k === 'workspaceState' || k.startsWith('workspaceState/'))
  );

beforeAll(() => {
  vi.advanceTimersByTime(0);
});

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-29T09:00:00Z'));
  fake.db ??= new FakeDb();
  fake.db.reset();
  link.holding = false;
  link.offline = false;
  link.waiting.length = 0;
  link.queued.length = 0;
  link.updates.length = 0;
  resetThrottledWrites();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  (firebaseSyncService as any).stopSync();
  resetThrottledWrites();
  useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false } as any);
});

afterAll(() => {
  vi.useRealTimers();
});

describe('Module 17 — the page writes no board to the record before the record is read and the meeting is the learner\'s', () => {
  it('meeting 2, offline, no copy on the device: the fresh start after the grace time writes no workspace field', async () => {
    await loadPage(2, 'offline');
    await advance(FIREBASE_RESTORE_GRACE_MS + 1_000);
    await settle();
    expect(ws().sessionNumber, 'the page started meeting 2 afresh').toBe(2);
    expect(ws().workspaceInitializedFor?.restoredSavedAt).toBeNull();

    act(() => { ws().setAnswerDigit('units', '7'); });
    await advance(3_000);
    await settle();
    expect(workspaceFieldWrites()).toEqual([]);
  });

  it("meeting 2, offline fresh start, then reconnect: the record's copy comes back untouched, and the board is written from then on", async () => {
    // The record: meeting 2, task 4, a 5 typed there.
    const recordCopy = {
      sessionNumber: 2,
      flowStatus: 'task',
      standardTaskIdx: 0,
      qflow: { taskIdx: 3, phase: 'primary', subphase: 'subtask', failedTasks: [], correctionIdx: 0, results: {} },
      counts: { units: 0, tens: 0, hundreds: 0, thousands: 0 },
      answerDigits: { units: '5' },
      hasInteracted: true,
      openingScreenSeen: true,
      [WORKSPACE_SAVED_AT_KEY]: Date.now() - 60_000,
    };
    await loadPage(2, 'offline');
    fake.db.set(STUDENT, { workspaceState: recordCopy });
    await advance(FIREBASE_RESTORE_GRACE_MS + 1_000);
    await settle();
    act(() => { ws().setAnswerDigit('units', '7'); });
    await advance(3_000);

    await recordArrives();
    expect(ws().qflow.taskIdx, "the record's task is back on screen").toBe(3);
    expect(ws().answerDigits.units, "the record's digit, not the fresh start's").toBe('5');
    await advance(3_000);
    await settle();
    expect(fake.db.read(`${STUDENT}/workspaceState/answerDigits/units`)).toBe('5');
    expect(fake.db.read(`${STUDENT}/workspaceState/qflow/taskIdx`)).toBe(3);

    // With the record read and the meeting the learner's, the page's board
    // write goes out again (its lastAction is its own; its workspace fields
    // are merged with the sync's in the one throttled write).
    const before = link.updates.length;
    act(() => { ws().setAnswerDigit('tens', '4'); });
    await advance(3_000);
    await settle();
    const after = link.updates.slice(before).filter((u) => u.path === STUDENT);
    expect(after.some((u) => u.fields.lastAction === 'פעילות בבית המספרים במפגש 2'), "the page's board write").toBe(true);
    expect(fake.db.read(`${STUDENT}/workspaceState/answerDigits`)).toMatchObject({ units: '5', tens: '4' });
  });

  for (const mode of ['offline', 'record still loading'] as const) {
    it(`meeting 1 with the store at its defaults (${mode}): no workspace field before the record, and a finished meeting stays finished`, async () => {
      const finished = {
        sessionNumber: 1,
        flowStatus: 'sessionDone',
        standardTaskIdx: 6,
        counts: { units: 3, tens: 2, hundreds: 0, thousands: 0 },
        answerDigits: {},
        hasInteracted: true,
        [WORKSPACE_SAVED_AT_KEY]: Date.now() - 60_000,
      };
      await loadPage(1, mode);
      fake.db.set(STUDENT, { workspaceState: finished });
      // On mount the store already says meeting 1 (its default): nothing is written.
      expect(workspaceFieldWrites()).toEqual([]);
      await advance(FIREBASE_RESTORE_GRACE_MS + 1_000);
      await settle();
      expect(ws().sessionNumber).toBe(1);
      expect(workspaceFieldWrites()).toEqual([]);

      await recordArrives();
      await advance(3_000);
      await settle();
      expect(ws().flowStatus, 'the finished meeting is restored as finished').toBe('sessionDone');
      expect(fake.db.read(`${STUDENT}/workspaceState/flowStatus`)).toBe('sessionDone');
      expect(fake.db.read(`${STUDENT}/workspaceState/counts`)).toMatchObject({ units: 3, tens: 2 });
    });
  }
});
