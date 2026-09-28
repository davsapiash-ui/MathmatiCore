/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { useWorkspaceStore, activeExerciseId } from '@/application/useWorkspaceStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { resetThrottledWrites, RTDB_WRITE_THROTTLE_MS } from '@/infrastructure/services/ThrottledRtdbWriter';
import { HeatmapGrid } from '@/presentation/pages/TeacherDashboard/components/HeatmapGrid';
import { isHeartbeatFresh, PRESENCE_FRESH_WINDOW_MS } from '@/core/presence';

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

const recordings = () => Object.keys(fake.db.read(`${STUDENT}/telemetry_sessions`) ?? {});
const boardWrites = () => fake.db.writesTo(STUDENT).filter((w) => w.op === 'update' && 'workspaceState/counts' in w.value);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-09-28T09:00:00Z'));
  fake.db ??= new FakeDb();
  fake.db.reset();
  rrweb.emit = null;
  rrweb.started = 0;
  rrweb.stopped = 0;
  resetThrottledWrites();
  signIn();
  // The learner's store still holds the previous meeting (meeting 1), exactly
  // as it does when the lobby sends the child on to the next meeting.
  ws().resetWorkspace();
  ws().initSession(1, false, 0);
  useStore.setState({ firebaseLoaded: false } as any);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Module 21 — the recording starts with the right meeting', () => {
  it('no recording before the class session\'s start stamp, none while the store holds meeting 1; then one recording, stamped with meeting 4\'s exercise', async () => {
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
    const metadata = fake.db.read(`${STUDENT}/telemetry_sessions/session_${startedAt}/metadata`);
    const [first] = Object.values(metadata) as any[];
    expect(first).toMatchObject({ sessionNumber: 4, exercise_id: exercise });
    // Its bytes count against this learner's meeting-4 budget.
    expect(fake.db.read(`${STUDENT}/recorded_bytes/meeting_4`)).toBeGreaterThan(0);
  });

  it('stops on a device another device has taken over, and does not start again', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    const startedAt = fake.db.serverTime();
    await openMeeting(4, startedAt);
    await mountMeeting(4);
    await settle();
    await vi.waitFor(() => expect(rrweb.started).toBe(1));

    await act(async () => { fake.db.update(STUDENT, { active_device_id: 'dev_other_tablet' }); });
    await settle();
    expect(ws().isSupersededByOtherDevice).toBe(true);
    expect(rrweb.stopped).toBe(1);
    await advance(10_000);
    await settle();
    expect(rrweb.started).toBe(1);
  });
});

describe('Module 18 — board writes are throttled to one per second', () => {
  it('rapid board changes make at most one write to the learner record per second, the latest state last', async () => {
    useStore.setState({ firebaseLoaded: true } as any);
    await mountMeeting(4);
    await settle();
    expect(ws().sessionNumber).toBe(4);
    await advance(RTDB_WRITE_THROTTLE_MS); // the mount's own first write has its window
    const before = boardWrites().length;

    // Ten board changes in half a second (the probe on main measured 5 writes in 500 ms).
    for (let i = 0; i < 10; i++) {
      act(() => { ws().applyDrop({ source: 'palette', sourcePlace: 'units', target: { kind: 'column', place: 'units' } } as any); });
      await advance(50);
    }
    const inHalfSecond = boardWrites().length - before;
    expect(inHalfSecond).toBeLessThanOrEqual(1);

    await advance(2_000);
    const writes = boardWrites().slice(before);
    expect(writes.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < writes.length; i++) {
      expect(writes[i].at - writes[i - 1].at).toBeGreaterThanOrEqual(RTDB_WRITE_THROTTLE_MS);
    }
    // Nothing is lost: the last write carries the board as it ended.
    expect(writes[writes.length - 1].value['workspaceState/counts']).toEqual(ws().counts);
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
      // Server time now is T. The learner's heartbeat was stamped 3 s ago on the server.
      const T = Date.now();
      fake.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 4, startedAt: T - 60_000 });
      fake.db.set(STUDENT, {
        isOnline: true,
        onlineStatus: 'active',
        lastPing: T - 3_000,
        hasJoinedSession: true,
        lastAction: 'פעיל/ה במפגש 4',
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
