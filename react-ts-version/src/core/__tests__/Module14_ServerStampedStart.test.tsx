/**
 * @vitest-environment jsdom
 *
 * PRD Module 14 §ב: "השרת הוא מקור האמת היחיד והמוחלט עבור זמן המפגש".
 * Register item 8: a meeting closes by itself 45 minutes after activation; the
 * readers decide on `serverNow()` (register, the Module 14 §ד row).
 *
 * The teacher's dashboard wrote `active_class_session.startedAt: Date.now()` —
 * the teacher laptop's own clock. Every reader compares against the server
 * clock, so a laptop 46 minutes slow opened a meeting that was already past its
 * 45 minutes (closed at activation), and a laptop 46 minutes fast stretched it
 * to 91. Now the start is `serverTimestamp()`.
 *
 * A fake RTDB here resolves the server-timestamp placeholder with the server's
 * clock, which runs apart from the teacher's by the skew under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Hoisted with the mocks: the app's services call onValue while the imports
// below are still loading, before this file's own top-level code runs.
const { fake, serverClock, snapOf, resolveServerValues, emitSession } = vi.hoisted(() => {
  const fake = {
    /** server clock − teacher clock */
    skewMs: 0,
    /** Whether this page has read the server clock yet (firebase.ts isServerClockKnown). */
    clockKnown: true,
    clockWaiters: [] as Array<(offset: number) => void>,
    session: null as Record<string, unknown> | null,
    listeners: new Set<(snap: unknown) => void>(),
    writes: [] as Array<{ path: string; payload: unknown }>,
  };
  const serverClock = () => Date.now() + fake.skewMs;
  const snapOf = (v: unknown) => ({ exists: () => v !== null && v !== undefined, val: () => v });
  const resolveServerValues = (v: unknown): unknown => {
    if (v && typeof v === 'object' && (v as Record<string, unknown>)['.sv'] === 'timestamp') return serverClock();
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, resolveServerValues(x)]));
    }
    return v;
  };
  const emitSession = () => {
    for (const cb of fake.listeners) cb(snapOf(fake.session));
  };
  return { fake, serverClock, snapOf, resolveServerValues, emitSession };
});

const SERVER_TIMESTAMP = { '.sv': 'timestamp' };

vi.mock('@/infrastructure/firebase', () => ({
  database: { __rtdb: true },
  firestore: { __firestore: true },
  functions: { __functions: true },
  db: { __firestore: true },
  auth: {
    currentUser: {
      uid: 'teacher_test_01',
      getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'teacher' } }),
      getIdToken: vi.fn().mockResolvedValue('token_test'),
    },
  },
  authReady: Promise.resolve(),
  // The dashboard knows the server offset (main.tsx measures it at start-up).
  // As firebase.ts: the offset is 0 until the database has reported it.
  serverNow: () => Date.now() + (fake.clockKnown ? fake.skewMs : 0),
  isServerClockKnown: () => fake.clockKnown,
  fetchServerClockOffset: () =>
    fake.clockKnown ? Promise.resolve(fake.skewMs) : new Promise<number>((r) => fake.clockWaiters.push(r)),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((r: { path?: string }, cb: (snap: unknown) => void) => {
    if (r?.path === 'active_class_session') {
      fake.listeners.add(cb);
      cb(snapOf(fake.session));
      return () => fake.listeners.delete(cb);
    }
    cb(snapOf(null));
    return () => {};
  }),
  set: vi.fn((r: { path?: string }, payload: unknown) => {
    fake.writes.push({ path: r?.path ?? '', payload });
    if (r?.path === 'active_class_session') {
      fake.session = resolveServerValues(payload) as Record<string, unknown>;
      emitSession();
    }
    return Promise.resolve();
  }),
  update: vi.fn(() => Promise.resolve()),
  get: vi.fn(() => Promise.resolve(snapOf(null))),
  push: vi.fn(() => ({ key: 'k' })),
  remove: vi.fn(() => Promise.resolve()),
  onDisconnect: vi.fn(() => ({
    update: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  })),
  serverTimestamp: vi.fn(() => ({ '.sv': 'timestamp' })),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
  orderByChild: vi.fn((k) => k),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref, callback) => {
    if (typeof callback === 'function') {
      callback({ docs: [], forEach: () => {}, exists: () => false, data: () => ({}) });
    }
    return vi.fn();
  }),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  getFirestore: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => () => Promise.resolve({ data: { success: true } })),
  getFunctions: vi.fn(),
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  BarChart: ({ children }: { children: unknown }) => <div>{children as never}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
}));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

import { TeacherDashboard } from '@/presentation/pages/TeacherDashboard';
import { useAuthStore } from '@/application/useAuthStore';
import { isClassSessionLive, getSessionAutoCloseAt, readSessionStartedAt, SESSION_HARD_CAP_MS } from '@/core/classSession';

const MIN = 60 * 1000;

async function activateMeeting() {
  render(
    <MemoryRouter>
      <TeacherDashboard />
    </MemoryRouter>
  );
  const start = await screen.findByRole('button', { name: /הפעילו מפגש/ });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  const confirm = await screen.findByRole('button', { name: /אישור ופתיחת המפגש/ });
  await act(async () => { fireEvent.click(confirm); });
  await waitFor(() => expect(fake.writes.some((w) => w.path === 'active_class_session')).toBe(true));
}

/** The server clock moves on; the listener re-evaluates (as the 30s re-check would). */
function serverTimePasses(ms: number) {
  fake.skewMs += ms;
  act(() => emitSession());
}

const autoCloseWrites = () =>
  fake.writes.filter((w) => w.path === 'active_class_session' && (w.payload as { endedBy?: string }).endedBy === 'auto_45min');

describe('Module 14 §ב — the meeting start comes from the server clock', () => {
  beforeEach(() => {
    fake.session = null;
    fake.clockKnown = true;
    fake.clockWaiters = [];
    fake.listeners.clear();
    fake.writes = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAuthStore.setState({
      user: { uid: 'teacher_test_01', email: 'teacher@mathmaticore.local', role: 'teacher', displayName: 'מורה' } as never,
      role: 'teacher',
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  for (const [label, skew] of [
    ['a teacher laptop 46 minutes slow', 46 * MIN],
    ['a teacher laptop 46 minutes fast', -46 * MIN],
  ] as const) {
    it(`${label}: active on activation, closed 45 minutes after the server start`, async () => {
      fake.skewMs = skew;
      await activateMeeting();

      // The write carries the server-timestamp placeholder, not the laptop's clock.
      const opening = fake.writes.find((w) => w.path === 'active_class_session')!;
      expect((opening.payload as { startedAt: unknown }).startedAt).toEqual(SERVER_TIMESTAMP);
      const serverStart = fake.session!.startedAt as number;
      expect(Math.abs(serverStart - serverClock())).toBeLessThan(5000);

      // Open on activation: the pause control is there and nothing closed it.
      expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
      expect(autoCloseWrites()).toHaveLength(0);
      expect(isClassSessionLive(fake.session, serverClock())).toBe(true);

      // 44 minutes on the server clock: still open.
      serverTimePasses(44 * MIN);
      expect(autoCloseWrites()).toHaveLength(0);
      expect(screen.queryByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();

      // 45 minutes after the server start: closed, once, by the teacher's client.
      serverTimePasses(1 * MIN + 1000);
      await waitFor(() => expect(autoCloseWrites()).toHaveLength(1));
      expect(serverClock() - serverStart).toBeGreaterThanOrEqual(SESSION_HARD_CAP_MS);
      expect(serverClock() - serverStart).toBeLessThan(SESSION_HARD_CAP_MS + 10_000);
    });
  }
});

describe('the teacher side reads the server clock before it decides any time limit', () => {
  beforeEach(() => {
    fake.session = null;
    fake.listeners.clear();
    fake.writes = [];
    fake.clockWaiters = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAuthStore.setState({
      user: { uid: 'teacher_test_01', email: 'teacher@mathmaticore.local', role: 'teacher', displayName: 'מורה' } as never,
      role: 'teacher',
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('a laptop 50 minutes fast, clock not read yet: the meeting stays open and no close is written; once read, it closes on time', async () => {
    fake.skewMs = -50 * MIN;
    fake.clockKnown = false;
    await activateMeeting();

    // On this laptop's own clock the server start is already 50 minutes old.
    // No time limit is decided before the server clock is read.
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
    act(() => emitSession());
    expect(autoCloseWrites()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();

    // The handshake arrives: the real offset.
    await act(async () => {
      fake.clockKnown = true;
      fake.clockWaiters.splice(0).forEach((r) => r(fake.skewMs));
    });
    expect(autoCloseWrites()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();

    const serverStart = fake.session!.startedAt as number;
    serverTimePasses(45 * MIN + 1000);
    await waitFor(() => expect(autoCloseWrites()).toHaveLength(1));
    expect(serverClock() - serverStart).toBeLessThan(SESSION_HARD_CAP_MS + 10_000);
  });
});

describe('readers tolerate the placeholder until the server value arrives', () => {
  it('a placeholder start is "no start yet": open, with no auto-close time', () => {
    const pending = { active: true, status: 'active' as const, sessionNumber: 3, startedAt: SERVER_TIMESTAMP };
    expect(readSessionStartedAt(pending)).toBeNull();
    expect(getSessionAutoCloseAt(pending)).toBeNull();
    expect(isClassSessionLive(pending, Date.now())).toBe(true);
  });

  it('a server start closes the meeting at start + 45 minutes', () => {
    const start = 1_790_000_000_000;
    const rec = { active: true, startedAt: start };
    expect(readSessionStartedAt(rec)).toBe(start);
    expect(isClassSessionLive(rec, start + SESSION_HARD_CAP_MS - 1)).toBe(true);
    expect(isClassSessionLive(rec, start + SESSION_HARD_CAP_MS)).toBe(false);
  });
});

describe('a stalled Firestore does not trap the teacher in the activation window', () => {
  beforeEach(() => {
    fake.session = null;
    fake.skewMs = 0;
    fake.clockKnown = true;
    fake.clockWaiters = [];
    fake.listeners.clear();
    fake.writes = [];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useAuthStore.setState({
      user: { uid: 'teacher_test_01', email: 'teacher@mathmaticore.local', role: 'teacher', displayName: 'מורה' } as never,
      role: 'teacher',
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('commit() that never settles: the meeting opens, the window closes, and "עצרו את המפגש" is reachable', async () => {
    // A school network that blocks firestore.googleapis.com: the batch neither
    // resolves nor rejects. The class mirror is still written (queued by the SDK).
    const { writeBatch } = await import('firebase/firestore');
    const commit = vi.fn(() => new Promise<void>(() => {}));
    vi.mocked(writeBatch).mockImplementation(() => ({ set: vi.fn(), commit }) as never);

    await activateMeeting();

    expect(commit).toHaveBeenCalledTimes(1);
    // The activation window closes: it used to stay open on its spinner with
    // "ביטול" disabled until the teacher reloaded.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'ביטול' })).toBeNull();
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
  });
});
