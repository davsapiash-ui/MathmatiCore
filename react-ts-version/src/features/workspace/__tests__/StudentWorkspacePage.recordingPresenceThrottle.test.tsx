/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FakeRealtimeDatabase } from './fakeRealtimeDatabase';

/**
 * The real StudentWorkspacePage and the real teacher radar, on an in-memory
 * Realtime Database. Only the transport (firebase/*), rrweb (it needs a real
 * browser) and the speech button are replaced.
 *
 *  PRD 21: 50MB "לכל לומד לכל מפגש"; "לכל מקטע נשמרת מטא-דאטה הכוללת exercise_id".
 *  PRD 18 §ג: "זיהוי ניתוק מבוצע בצד השרת דרך מנגנון Presence Heartbeat (חלון זיהוי מרבי: 15 שניות)".
 *  PRD 18 (Strict): "Throttle client writes to maximum once per 1000ms".
 */

// Fake timers before any module loads: the app's sync service schedules its
// start with setTimeout(0) on import, and on the real clock that start used to
// land in the middle of a test (it attached the learner's record listener and
// initialised the meeting early — about 4 runs in 10 failed).
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
});
const fake = vi.hoisted(() => ({ db: null as unknown as FakeRealtimeDatabase }));
const rrweb = vi.hoisted(() => ({
  emit: null as null | ((event: unknown) => void),
  started: 0,
  stopped: 0,
}));

vi.mock('firebase/database', async () => {
  const mod = await import('./fakeRealtimeDatabase');
  return mod.firebaseDatabaseModule(() => (fake.db ??= new mod.FakeRealtimeDatabase()));
});
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  db: {},
  functions: {},
  auth: {},
  authReady: Promise.resolve(true),
  // This device's view of the server clock: its own clock plus the offset the
  // database reported (.info/serverTimeOffset).
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
vi.mock('rrweb', () => ({
  record: (options: { emit: (event: unknown) => void }) => {
    rrweb.emit = options.emit;
    rrweb.started++;
    return () => { rrweb.stopped++; };
  },
}));
vi.mock('@/presentation/design-system/UdlSpeechButton', () => ({
  UdlSpeechButton: () => null,
}));

import { FakeRealtimeDatabase as FakeDb } from './fakeRealtimeDatabase';
import { StudentWorkspacePage } from '../StudentWorkspacePage';
import { budgetBytesUsed } from '../screenRecorder';
import { useWorkspaceStore, activeExerciseId } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { resetThrottledWrites, rtdbUpdateNow, RTDB_WRITE_THROTTLE_MS } from '@/infrastructure/services/ThrottledRtdbWriter';
import { HeatmapGrid } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';
import { isHeartbeatFresh, PRESENCE_FRESH_WINDOW_MS } from '@/core/presence';
import { approvePath } from '@/test/approvedPath';

const UID = 'student_user12';
const STUDENT = `users/students/${UID}`;
const ws = () => useWorkspaceStore.getState();

const signIn = () =>
  useAuthStore.setState({
    user: { uid: UID, student_id: 12, role: 'student' },
    role: 'student',
    isAuthenticated: true,
    isStudentAuthenticated: true,
  } as any);

const openMeeting = (sessionNumber: number, startedAt: number) =>
  act(async () => {
    fake.db.set('active_class_session', { active: true, status: 'active', sessionNumber, startedAt, teacherId: 't1' });
  });

const mountMeeting = async (meeting: number) => {
  let view: ReturnType<typeof render> | null = null;
  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[`/workspace?meeting=${meeting}`]}>
        <StudentWorkspacePage />
      </MemoryRouter>
    );
  });
  return view!;
};

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
/** Lets rrweb's dynamic import and the queue's promise chains finish. */
const settle = async () => {
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await new Promise((r) => setImmediate(r));
    });
  }
};

const RECORDINGS = `recordings/${UID}`;
const recordings = () => Object.keys(fake.db.read(`${RECORDINGS}/telemetry_sessions`) ?? {});

beforeAll(() => {
  // The sync service's own start (scheduled with setTimeout(0) when it was
  // imported, under the fake timers installed on the first line) runs here,
  // before any test — never on the real clock in the middle of one.
  vi.advanceTimersByTime(0);
});

beforeEach(() => {
  vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
  fake.db ??= new FakeDb();
  fake.db.reset();
  rrweb.emit = null;
  rrweb.started = 0;
  rrweb.stopped = 0;
  resetThrottledWrites();
  // Meetings 3–8 open only on the path the gate approved (Module 26, owner
  // 28.9.2026): the learner's record carries it, as the gate writes it.
  fake.db.set(STUDENT, { teacher_gate_approved: true, routeStatus: 'APPROVED', pedagogicalPath: 'green_path' });
  // The seed is the gate's write, not the learner's: it does not count as a client write.
  fake.db.writes = [];
  // Signing in starts the real sync service for this learner (its record listener).
  signIn();
  approvePath();
  // The learner's store still holds the previous meeting (meeting 1), exactly
  // as it does when the lobby sends the child on to the next meeting.
  ws().resetWorkspace();
  ws().initSession(1, false, 0);
  useStore.setState({ firebaseLoaded: false } as any);
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

describe('Module 21 — the recording starts with the right meeting', () => {
  it('no recording before the class session\'s start stamp, none while the store holds meeting 1; then one recording, stamped with meeting 4\'s exercise', async () => {
    // The learner's record has not loaded yet: the sync service, which marks it
    // loaded, is held back, and the test says when it arrives.
    (firebaseSyncService as any).stopSync();
    useStore.setState({ firebaseLoaded: false } as any);
    await mountMeeting(4);
    await settle();
    // No class session yet: nothing records (it used to start as session_{Date.now()}).
    expect(rrweb.started).toBe(0);

    const startedAt = fake.db.serverTime();
    await openMeeting(4, startedAt);
    await settle();
    // The stamp is known, but the store still holds meeting 1: still nothing.
    expect(ws().sessionNumber).toBe(1);
    expect(rrweb.started).toBe(0);

    // The learner's record arrives: the page initialises meeting 4.
    await act(async () => { useStore.setState({ firebaseLoaded: true } as any); });
    await settle();
    expect(ws().sessionNumber).toBe(4);
    await vi.waitFor(() => expect(rrweb.started).toBe(1));

    const exercise = activeExerciseId(ws());
    expect(exercise.startsWith('s1')).toBe(false);
    act(() => { rrweb.emit!({ type: 3, timestamp: Date.now(), data: {} }); });
    await advance(2_000);
    await advance(3_000);
    await settle();

    // One recording, under the meeting's own id, and its first chunk says meeting 4.
    expect(recordings()).toEqual([`session_${startedAt}`]);
    const metadata = fake.db.read(`${RECORDINGS}/telemetry_sessions/session_${startedAt}/metadata`);
    const [first] = Object.values(metadata) as any[];
    expect(first).toMatchObject({ sessionNumber: 4, exercise_id: exercise });
    // Its bytes count against this learner's meeting-4 budget.
    expect(budgetBytesUsed(fake.db.read(`${RECORDINGS}/recorded_bytes/meeting_4`))).toBeGreaterThan(0);
  });

  it('stops on a device another device has taken over, and does not start again', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    const startedAt = fake.db.serverTime();
    await openMeeting(4, startedAt);
    await mountMeeting(4);
    await settle();
    await vi.waitFor(() => expect(rrweb.started).toBe(1));
    // This device's claim has gone out (it waits for the record's write
    // window); the other tablet comes after it.
    await advance(RTDB_WRITE_THROTTLE_MS);
    await settle();

    await act(async () => { fake.db.update(STUDENT, { active_device_id: 'dev_other_tablet' }); });
    await settle();
    expect(ws().isSupersededByOtherDevice).toBe(true);
    expect(rrweb.stopped).toBe(1);
    await advance(10_000);
    await settle();
    expect(rrweb.started).toBe(1);
  });
});

describe('Module 18 — every client write to the learner record is throttled to one per second', () => {
  /** Every write the learner's device made to the record or anything under it. */
  const recordWrites = (path = STUDENT) => fake.db.writes.filter((w) => w.path === path || w.path.startsWith(`${path}/`));
  const assertOnePerSecond = (writes: Array<{ at: number }>) => {
    for (let i = 1; i < writes.length; i++) {
      expect(writes[i].at - writes[i - 1].at, `writes ${i - 1} and ${i}`).toBeGreaterThanOrEqual(RTDB_WRITE_THROTTLE_MS);
    }
  };

  it('ten block drops in half a second: at most one write per second to the learner record — board, telemetry, sync, heartbeat together — the latest state last', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    await mountMeeting(4);
    await settle();
    expect(ws().sessionNumber).toBe(4);
    await advance(RTDB_WRITE_THROTTLE_MS);
    const before = recordWrites().length;
    const aliasBefore = recordWrites('users/students/user12').length;

    // Ten board changes in half a second. On main this made 11 writes: one per
    // drop from the telemetry live update, plus the board write.
    for (let i = 0; i < 10; i++) {
      act(() => { ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } } as any); });
      await advance(50);
    }
    expect(recordWrites().length - before).toBeLessThanOrEqual(1);

    // Through two heartbeats and the sync window.
    await advance(9_000);
    await settle();
    const writes = recordWrites().slice(before);
    expect(writes.length).toBeGreaterThan(0);
    assertOnePerSecond(recordWrites());
    // The learner's alias record (userN) is written by the same writer, on its own window.
    assertOnePerSecond(recordWrites('users/students/user12').slice(aliasBefore));
    // Nothing is lost: the record holds the board as it ended.
    expect(fake.db.read(`${STUDENT}/workspaceState/counts`)).toEqual(ws().counts);
  });

  it('a help request waits at most one window', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    await mountMeeting(4);
    await settle();
    await advance(RTDB_WRITE_THROTTLE_MS);
    // A write has just gone out: the window is busy.
    act(() => { ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } } as any); });
    await advance(100);
    const asked = Date.now();
    act(() => { ws().requestSilentHelp(); });
    await advance(RTDB_WRITE_THROTTLE_MS);
    const help = fake.db.writes.find((w) => w.path === STUDENT && w.value.helpRequested === true);
    expect(help).toBeTruthy();
    expect(help!.at - asked).toBeLessThanOrEqual(RTDB_WRITE_THROTTLE_MS);
    expect(fake.db.read(`${STUDENT}/helpRequested`)).toBe(true);
  });

  it('a board write queued before a takeover is not sent after it', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    await mountMeeting(4);
    await settle();
    await advance(RTDB_WRITE_THROTTLE_MS);
    act(() => { ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } } as any); });
    act(() => { ws().applyDrop({ source: 'palette', sourcePlace: 'tens', target: { kind: 'column', place: 'tens' } } as any); });
    const countsBefore = fake.db.read(`${STUDENT}/workspaceState/counts`);
    // Another tablet takes the learner over inside the window.
    await act(async () => { fake.db.update(STUDENT, { active_device_id: 'dev_other_tablet' }); });
    const after = fake.db.writes.length;
    await advance(3 * RTDB_WRITE_THROTTLE_MS);
    await settle();
    const late = fake.db.writes.slice(after).filter((w) => w.path === STUDENT && 'workspaceState/counts' in w.value);
    expect(late).toEqual([]);
    expect(fake.db.read(`${STUDENT}/workspaceState/counts`)).toEqual(countsBefore);
  });
});

describe('WP6 — the soft device lock locks only for another device', () => {
  it('opened from the lobby onto a record that still names an earlier visit\'s device: this device claims the learner and is not locked', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    const startedAt = fake.db.serverTime();
    await openMeeting(4, startedAt);
    // Every page load draws a new device id, so the record always names the
    // device of an earlier visit (yesterday's, or this tab before a refresh).
    fake.db.update(STUDENT, { active_device_id: 'dev_earlier_visit' });
    fake.db.writes = [];
    // The record answers the page's listener after a round trip, as the real
    // SDK does: the presence write is queued, guarded by the lock, before then.
    fake.db.deferFirstSnapshot = true;
    // The lobby's "leaving" write goes out as the workspace opens: the record's
    // write window is busy when the page claims the learner. The claim used to
    // wait for that window, the listener saw the earlier device in the meantime
    // and locked the page, and the lock's own guard then dropped the claim —
    // "המשכתם במכשיר אחר" on the only device, through every refresh.
    await act(async () => { await rtdbUpdateNow(STUDENT, { isOnline: false, lastPing: 0 }); });
    const view = await mountMeeting(4);
    await settle();
    // Not even for the moment the claim waits for its window.
    expect(ws().isSupersededByOtherDevice).toBe(false);
    await advance(3 * RTDB_WRITE_THROTTLE_MS);
    await settle();

    expect(ws().isSupersededByOtherDevice).toBe(false);
    expect(fake.db.read(`${STUDENT}/active_device_id`)).toBe(ws().activeDeviceId);
    expect(view.container.textContent).not.toContain('המשכתם במכשיר אחר');
    // The recording was never stopped by a lock.
    await vi.waitFor(() => expect(rrweb.started).toBe(1));
    expect(rrweb.stopped).toBe(0);

    // Another device that claims the learner afterwards still locks this one.
    await act(async () => { fake.db.update(STUDENT, { active_device_id: 'dev_other_tablet' }); });
    await settle();
    expect(ws().isSupersededByOtherDevice).toBe(true);
  });
});

describe('Module 18 §ג — presence is decided on the server clock', () => {
  it('a learner whose clock is 20 s fast writes the server\'s time, and reads as connected', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    // The learner's device clock runs 20 s ahead of the server.
    fake.db.serverOffsetMs = -20_000;
    await mountMeeting(4);
    await advance(4_000); // one heartbeat
    await settle();
    const lastPing = fake.db.read(`${STUDENT}/lastPing`);
    // The stamp is the server's time — not the tablet's (Date.now() was 20 s later).
    expect(lastPing).toBe(fake.db.serverTime());
    expect(Date.now() - lastPing).toBe(20_000);
    // Any reader on the server clock sees it fresh; on raw device clocks it did not.
    expect(isHeartbeatFresh(lastPing, fake.db.serverTime())).toBe(true);
    expect(Math.abs(Date.now() - lastPing) <= PRESENCE_FRESH_WINDOW_MS).toBe(false);
  });

  for (const skew of [+20_000, -20_000]) {
    it(`the teacher's radar shows a learner online when the teacher's clock is ${skew > 0 ? '20 s fast' : '20 s slow'}`, async () => {
      // This device is the teacher's: no learner is signed in on it.
      (firebaseSyncService as any).stopSync();
      useAuthStore.setState({ user: null, role: null, isAuthenticated: false, isStudentAuthenticated: false } as any);
      // Server time now is T. The learner's heartbeat was stamped 3 s ago on the server.
      const T = Date.now();
      fake.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 4, startedAt: T - 60_000 });
      fake.db.set(STUDENT, {
        isOnline: true,
        onlineStatus: 'active',
        lastPing: T - 3_000,
        hasJoinedSession: true,
        lastAction: 'פעיל במפגש 4',
        workspaceState: { sessionNumber: 4, flowStatus: 'task' },
      });
      // The teacher's laptop clock is skewed; the database reported the offset.
      vi.setSystemTime(T + skew);
      fake.db.serverOffsetMs = -skew;

      let view: ReturnType<typeof render> | null = null;
      await act(async () => { view = render(<HeatmapGrid initialStudents={[]} />); });
      await advance(3_000); // the radar's own re-check
      const tile = view!.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith('תלמיד 12.'))!;
      expect(tile).toBeTruthy();
      expect(tile.getAttribute('data-radar-color')).not.toBe('GREY');
      expect(tile.textContent).not.toContain('יצא מהחלון');

      // And the same learner, 13 s after the last heartbeat on the server clock, is GREY.
      await advance(10_000);
      const later = view!.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith('תלמיד 12.'))!;
      expect(later.getAttribute('data-radar-color')).toBe('GREY');
    });
  }
});
