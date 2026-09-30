/**
 * @vitest-environment jsdom
 *
 * The teacher's meeting controls through the transitions of a real lesson —
 * a laptop that sleeps past the grace window, a Wi-Fi drop mid-lesson, a
 * refused activation, a second dashboard tab, a learner who raises a hand, a
 * learner who has just finished meeting 2 and has no score yet —
 * on an in-memory Realtime Database (features/workspace/__tests__/
 * fakeRealtimeDatabase.ts). Only the transport is replaced; the dashboard is
 * the real one.
 *
 * The fake behaves as the SDK does: a write is applied locally at once (every
 * listener on this page sees it) and acknowledged by the server only while the
 * page is connected; offline, the acknowledgement waits for the reconnect.
 *
 *  PRD 14 §ב0: activation is exclusively a teacher action (register item 21).
 *  PRD 14 §ב / register item 8: the 45-minute limit runs from the server start.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeRealtimeDatabase,
  /** Acknowledgements the server owes this page, released on reconnect. */
  pendingAcks: [] as Array<() => void>,
  /** The next write to this path is refused by the server (the SDK reverts it). */
  refuseNext: null as null | { path: string; err: Error },
  /** Every set / update this page made, in order. */
  appWrites: [] as Array<{ op: 'set' | 'update'; path: string; value: unknown }>,
  onDisconnectCalls: [] as Array<{ path: string; op: string }>,
}));

vi.mock('firebase/database', async () => {
  const mod = await import('@/features/workspace/__tests__/fakeRealtimeDatabase');
  const getDb = () => (h.db ??= new mod.FakeRealtimeDatabase());
  const base = mod.firebaseDatabaseModule(getDb);
  const clone = (v: unknown) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
  const write = (op: 'set' | 'update', path: string, value: any): Promise<void> => {
    const db = getDb();
    h.appWrites.push({ op, path, value: clone(value) });
    const apply = () => (op === 'set' ? db.set(path, value) : db.update(path, value));
    if (h.refuseNext && h.refuseNext.path === path) {
      const { err } = h.refuseNext;
      h.refuseNext = null;
      const before = clone(db.read(path));
      apply();
      db.set(path, before); // the server refused it: the SDK puts the old value back
      return Promise.reject(err);
    }
    apply();
    if (db.connected) return Promise.resolve();
    return new Promise<void>((resolve) => h.pendingAcks.push(resolve));
  };
  // The rules refuse a teacher's write under users/teachers (admin only), and
  // any hook may be refused: the page must never leave a rejection unhandled.
  const refused = (path: string) => path.startsWith('users/teachers') || path.startsWith('active_class_session');
  return {
    ...base,
    set: (r: { path: string }, v: unknown) => write('set', r.path, v),
    update: (r: { path: string }, v: Record<string, unknown>) => write('update', r.path, v),
    onDisconnect: (r: { path: string }) => {
      const op = (name: string) => () => {
        h.onDisconnectCalls.push({ path: r.path, op: name });
        return refused(r.path) ? Promise.reject(new Error('PERMISSION_DENIED')) : Promise.resolve();
      };
      return { set: op('set'), update: op('update'), cancel: op('cancel'), remove: op('remove') };
    },
  };
});

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
  serverNow: () => h.db.serverTime(),
  isServerClockKnown: () => true,
  fetchServerClockOffset: () => Promise.resolve(0),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn((r) => r),
  where: vi.fn(() => ({})),
  getDocs: vi.fn(() => Promise.resolve({ docs: [], forEach: () => {}, empty: true, size: 0 })),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
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
// rrweb needs a real browser; the replay is not under test here.
vi.mock('@/presentation/components/ReplayViewer', () => ({ ReplayViewer: () => null }));
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

const toasts = vi.hoisted(() => {
  const calls: Array<{ kind: string; text: string }> = [];
  const make = (kind: string) => (text: unknown) => { calls.push({ kind, text: String(text) }); return kind; };
  return { calls, toast: Object.assign(make('default'), { success: make('success'), info: make('info'), error: make('error'), warning: make('warning'), dismiss: () => {} }) };
});
vi.mock('sonner', () => ({ toast: toasts.toast, Toaster: () => null }));

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

import { TeacherDashboard } from '@/presentation/pages/TeacherDashboard';
import { useAuthStore } from '@/application/useAuthStore';
import { TEACHER_DISCONNECT_GRACE_MS } from '@/core/classSession';
import { ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
import { NO_RECOMMENDATION_HE } from '@/presentation/pages/TeacherDashboard/gateEvidence';

const MIN = 60 * 1000;

function setConnected(connected: boolean) {
  act(() => {
    h.db.connected = connected;
    (h.db as unknown as { notify(path: string): void }).notify('.info/connected');
    if (connected) h.pendingAcks.splice(0).forEach((ack) => ack());
  });
}

/** The server sends this page what it holds now (what the SDK does after a reconnect). */
function serverSends(path: string) {
  act(() => (h.db as unknown as { notify(path: string): void }).notify(path));
}

function openMeeting(sessionNumber: number, extra: Record<string, unknown> = {}) {
  h.db.tree.active_class_session = {
    active: true,
    status: 'active',
    sessionNumber,
    startedAt: h.db.serverTime() - 5 * MIN,
    teacherId: 'teacher_test_01',
    ...extra,
  };
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <TeacherDashboard />
    </MemoryRouter>
  );
}

const sessionWrites = () => h.appWrites.filter((w) => w.path === 'active_class_session');
const toastTexts = (kind: string) => toasts.calls.filter((c) => c.kind === kind).map((c) => c.text);

beforeEach(() => {
  h.db?.reset();
  h.pendingAcks = [];
  h.refuseNext = null;
  h.appWrites = [];
  h.onDisconnectCalls = [];
  toasts.calls.length = 0;
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

describe('PRD 14 §ב0 — a laptop that wakes after the grace window does not reopen the meeting', () => {
  it('a stamp older than the window: the record is closed as the teacher closes it, and the dashboard shows it closed', async () => {
    openMeeting(3);
    renderDashboard();
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();

    // The lid closes. The server stamps the disconnect; this page hears nothing.
    setConnected(false);
    h.db.tree.active_class_session.teacherDisconnectedAt = h.db.serverTime() - TEACHER_DISCONNECT_GRACE_MS - 5 * MIN;

    // Twenty minutes later the laptop wakes and the server sends its record.
    setConnected(true);
    serverSends('active_class_session');

    await waitFor(() => expect(h.db.read('active_class_session')?.active).toBe(false));
    const rec = h.db.read('active_class_session');
    expect(rec).toMatchObject({ active: false, status: 'closed', sessionNumber: null, endedBy: 'teacher_disconnect_grace' });
    expect(typeof rec.endedAt).toBe('number');
    await waitFor(() => expect(screen.queryByRole('button', { name: /עצרו את המפגש/ })).toBeNull());
    expect(screen.queryByRole('button', { name: /סגרו את המפגש/ })).toBeNull();
    expect(toastTexts('info').some((t) => t.includes('ולכן המפגש נסגר אצל התלמידים'))).toBe(true);
  });

  it('a stamp within the window: cleared, the meeting stays open, and the teacher is told', async () => {
    openMeeting(3);
    renderDashboard();
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();

    setConnected(false);
    h.db.tree.active_class_session.teacherDisconnectedAt = h.db.serverTime() - 2 * MIN;
    setConnected(true);
    serverSends('active_class_session');

    await waitFor(() => expect(h.db.read('active_class_session/teacherDisconnectedAt')).toBeNull());
    expect(h.db.read('active_class_session')?.active).toBe(true);
    expect(screen.getByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
    expect(toastTexts('info').some((t) => t.includes('התנתק לרגע וחזר'))).toBe(true);
  });
});

describe('no connection: the controls never hang on a write that waits for the network', () => {
  it('activation offline: the window closes, one short notice, no success toast; the write goes out on reconnect', async () => {
    renderDashboard();
    const start = await screen.findByRole('button', { name: /הפעילו מפגש/ });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    setConnected(false);

    fireEvent.click(start);
    const confirm = await screen.findByRole('button', { name: /אישור ופתיחת המפגש/ });
    await act(async () => { fireEvent.click(confirm); });

    // It used to spin here, "ביטול" disabled, until the network came back.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(toastTexts('info')).toContain('אין חיבור לאינטרנט. המפגש ייפתח כשהחיבור יחזור.');
    expect(toastTexts('success')).toEqual([]);
    // The local event already shows the meeting open.
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
    expect(h.pendingAcks.length).toBeGreaterThan(0);

    // Back online: the queued write is acknowledged, nothing is refused.
    setConnected(true);
    await act(async () => {});
    expect(toastTexts('error')).toEqual([]);
    expect(h.db.read('active_class_session')).toMatchObject({ active: true, sessionNumber: 1 });
  });

  it('pause and close offline: the buttons are released at once, each with its own notice', async () => {
    openMeeting(4);
    renderDashboard();
    const pause = await screen.findByRole('button', { name: /עצרו את המפגש/ });
    setConnected(false);

    await act(async () => { fireEvent.click(pause); });
    const resume = await screen.findByRole('button', { name: /המשיכו את המפגש/ });
    // isUpdatingSession used to stay true until the reconnect.
    await waitFor(() => expect((resume as HTMLButtonElement).disabled).toBe(false));
    expect(toastTexts('info')).toContain('אין חיבור לאינטרנט. המפגש יושהה כשהחיבור יחזור.');

    await act(async () => { fireEvent.click(resume); });
    await waitFor(() => expect(toastTexts('info')).toContain('אין חיבור לאינטרנט. המפגש ימשיך כשהחיבור יחזור.'));
    const close = await screen.findByRole('button', { name: /סגרו את המפגש/ });
    await waitFor(() => expect((close as HTMLButtonElement).disabled).toBe(false));

    await act(async () => { fireEvent.click(close); });
    await waitFor(() => expect(screen.queryByRole('button', { name: /סגרו את המפגש/ })).toBeNull());
    expect(toastTexts('info')).toContain('אין חיבור לאינטרנט. המפגש ייסגר כשהחיבור יחזור.');
    expect(toastTexts('success')).toEqual([]);

    setConnected(true);
    await act(async () => {});
    expect(h.db.read('active_class_session')).toMatchObject({ active: false, status: 'closed' });
  });
});

describe('teacher presence: no write the rules refuse, no unhandled rejection', () => {
  it('nothing is written under users/teachers, and every refused hook is handled', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      openMeeting(3);
      renderDashboard();
      await screen.findByRole('button', { name: /עצרו את המפגש/ });
      setConnected(false);
      setConnected(true);
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

      expect(h.appWrites.filter((w) => w.path.startsWith('users/teachers'))).toEqual([]);
      expect(h.onDisconnectCalls.filter((c) => c.path.startsWith('users/teachers'))).toEqual([]);
      // The grace-window hooks are still armed on each connect.
      expect(h.onDisconnectCalls.filter((c) => c.path === 'active_class_session/teacherDisconnectedAt' && c.op === 'set').length).toBeGreaterThanOrEqual(2);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});

describe('a refused activation leaves the meeting that is open on screen', () => {
  it('opening 6 is refused while 4 is open: pause and close for 4 stay', async () => {
    openMeeting(4);
    renderDashboard();
    await screen.findByRole('button', { name: /עצרו את המפגש/ });

    fireEvent.change(screen.getByDisplayValue(/פעיל כעת/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /הפעילו מפגש/ }));
    const confirm = await screen.findByRole('button', { name: /אישור ופתיחת המפגש/ });
    h.refuseNext = { path: 'active_class_session', err: Object.assign(new Error('PERMISSION_DENIED: refused'), { code: 'PERMISSION_DENIED' }) };
    await act(async () => { fireEvent.click(confirm); });

    await waitFor(() => expect(toastTexts('error').length).toBe(1));
    expect(h.db.read('active_class_session')).toMatchObject({ active: true, sessionNumber: 4 });
    // It used to show "no meeting" for up to 30 seconds.
    expect(screen.getByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /סגרו את המפגש/ })).toBeTruthy();
    expect(screen.getByText('מפגש 4 פתוח כעת עבור התלמידים בכיתה.')).toBeTruthy();
  });
});

describe('two dashboard tabs: a window for a meeting already open elsewhere', () => {
  it('meeting 5 opened in the other tab: this tab\'s window for 5 closes without writing', async () => {
    renderDashboard();
    const start = await screen.findByRole('button', { name: /הפעילו מפגש/ });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.change(screen.getByDisplayValue(/מפגש 1/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /הפעילו מפגש/ }));
    await screen.findByRole('button', { name: /אישור ופתיחת המפגש/ });

    // The other tab opens 5 (its write reaches this page through the server).
    const otherStart = h.db.serverTime() - 2 * MIN;
    act(() => {
      h.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 5, startedAt: otherStart, teacherId: 'teacher_test_01' });
    });

    // The window used to stay open, and confirming it restarted the 45 minutes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(sessionWrites()).toEqual([]);
    expect(h.db.read('active_class_session/startedAt')).toBe(otherStart);
  });
});

describe('core/recommendedPath.ts: no score yet, no colour (live finding, 28.9.2026)', () => {
  // A learner who has just finished meeting 2: completed, but the score has not
  // reached the teacher yet ("סיום ראשוני — ממתין לחישוב מדדים").
  const justFinished = () => {
    h.db.tree.users = { students: { student_user7: { completedMeeting2: true, highestCompletedMeeting: 2, isOnline: false } } };
  };
  const tab = (name: string) => screen.getAllByRole('tab').find((t) => (t.textContent ?? '').trim().startsWith(name))!;

  it('the gate: no path recommended or preselected, approval waits for a choice', async () => {
    justFinished();
    renderDashboard();
    await waitFor(() => expect(tab(TEACHER_GATE_HE).textContent).toContain('1'), { timeout: 2000 });
    fireEvent.click(tab(TEACHER_GATE_HE));

    const row = (await screen.findByText('תלמיד 7')).closest('tr')!;
    // It used to read מסלול צמצום פערי קדם here, preselected, for a learner
    // who had answered everything correctly.
    expect(within(row).getByText(NO_RECOMMENDATION_HE)).toBeTruthy();
    const select = within(row).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    const approve = within(row).getByRole('button', { name: /אשרו את המסלול/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect((screen.getByRole('button', { name: /אישור 0 התלמידים שנקבע להם מסלול/ }) as HTMLButtonElement).disabled).toBe(true);

    // The teacher chooses: now it can be approved.
    fireEvent.change(select, { target: { value: 'green_path' } });
    expect(approve.disabled).toBe(false);
  });

  it('the reports tab: the badge names no route and has no colour', async () => {
    justFinished();
    renderDashboard();
    await screen.findAllByRole('tab', {}, { timeout: 2000 });
    fireEvent.click(tab('דוחות אבחון אישיים'));
    fireEvent.click(await screen.findByRole('button', { name: 'תלמיד 7' }, { timeout: 2000 }));

    const badge = await screen.findByText(`מסלול מומלץ: ${NO_RECOMMENDATION_HE}`);
    // It used to fall through to "מסלול מומלץ: המסלול הירוק", in green.
    expect(badge.className).not.toMatch(/emerald|amber/);
    expect(screen.queryByText(`מסלול מומלץ: ${ROUTE_NAME_HE.green_path}`)).toBeNull();
    expect(screen.queryByText(`מסלול מומלץ: ${ROUTE_NAME_HE.remediation_path}`)).toBeNull();
  });
});

describe('the learner drawer shows the learner as they are now', () => {
  it('"סמנו כטופל" removes the banner, and a hand raised while it is open appears', async () => {
    h.db.tree.users = {
      students: {
        student_user3: {
          isOnline: true,
          onlineStatus: 'active',
          lastPing: h.db.serverTime(),
          helpRequested: true,
          handRaised: true,
          helpCallCount: 1,
        },
      },
    };
    renderDashboard();

    const tile = await waitFor(() => {
      const el = screen.getAllByRole('button').find((b) => b.getAttribute('aria-label')?.startsWith('תלמיד 3.'));
      expect(el).toBeTruthy();
      return el!;
    });
    fireEvent.click(tile);
    // allStudents fills after the dashboard's 300 ms debounce.
    await new Promise((r) => setTimeout(r, 350));
    fireEvent.click(await screen.findByRole('button', { name: 'מעבר לניתוח מעמיק' }));

    const drawer = await screen.findByRole('dialog', { name: /התאמת תנאי למידה — תלמיד 3/ });
    expect(within(drawer).getByText(/התלמיד ביקש עזרה/)).toBeTruthy();

    await act(async () => { fireEvent.click(within(drawer).getByRole('button', { name: /סמנו כטופל/ })); });
    await waitFor(() => expect(screen.queryByText(/התלמיד ביקש עזרה/)).toBeNull(), { timeout: 2000 });

    // The learner raises a hand again while the drawer is open.
    act(() => h.db.update('users/students/student_user3', { helpRequested: true, helpCallCount: 2 }));
    await waitFor(() => expect(screen.getByText(/התלמיד ביקש עזרה \(2 קריאות תועדו\)/)).toBeTruthy(), { timeout: 2000 });
  });
});
