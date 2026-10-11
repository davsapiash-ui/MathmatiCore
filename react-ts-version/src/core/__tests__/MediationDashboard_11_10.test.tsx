/**
 * @vitest-environment jsdom
 *
 * Measure 5 on the real teacher dashboard (owner, 11.10.2026), on the in-memory
 * Realtime Database harness of CatchUp_DashboardWiring: the side action queue
 * merges a learner's help call and chat, one action press clears the call and
 * the כן / לא answer writes the mediation record; the counter counts; the close
 * dialog lists what was not recorded; the projector chip; the no-scroll layout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeRealtimeDatabase,
  seq: [] as string[],
  appWrites: [] as Array<{ op: 'set' | 'update'; path: string; value: any }>,
  auth: { currentUser: null as any },
}));

vi.mock('firebase/database', async () => {
  const mod = await import('@/features/workspace/__tests__/fakeRealtimeDatabase');
  const getDb = () => (h.db ??= new mod.FakeRealtimeDatabase());
  const base = mod.firebaseDatabaseModule(getDb);
  const clone = (v: unknown) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
  const write = (op: 'set' | 'update', path: string, value: any): Promise<void> => {
    const db = getDb();
    h.appWrites.push({ op, path, value: clone(value) });
    if (path === 'active_class_session' && op === 'set') {
      h.seq.push(value?.active ? `open:${value.sessionNumber}` : `close:${value?.closedBy ?? value?.endedBy ?? 'reset'}`);
    }
    op === 'set' ? db.set(path, value) : db.update(path, value);
    return Promise.resolve();
  };
  return {
    ...base,
    set: (r: { path: string }, v: unknown) => write('set', r.path, v),
    update: (r: { path: string }, v: Record<string, unknown>) => write('update', r.path, v),
    onDisconnect: () => {
      const ok = () => Promise.resolve();
      return { set: ok, update: ok, cancel: ok, remove: ok };
    },
  };
});

vi.mock('@/infrastructure/firebase', () => ({
  database: { __rtdb: true },
  firestore: { __firestore: true },
  functions: { __functions: true },
  db: { __firestore: true },
  auth: h.auth,
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
    if (typeof callback === 'function') callback({ docs: [], forEach: () => {}, exists: () => false, data: () => ({}) });
    return vi.fn();
  }),
  deleteField: vi.fn(() => ({ __delete: true })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
  getFirestore: vi.fn(),
}));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => () => Promise.resolve({ data: { success: true } })),
  getFunctions: vi.fn(),
}));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
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
vi.mock('@/infrastructure/services/CatchUpService', () => ({
  recordCatchUpReasons: vi.fn(async () => {}),
  fetchCatchUpRecords: vi.fn(async () => ({})),
  subscribeCatchUpRecords: vi.fn((_meeting: number, cb: (r: unknown) => void) => { cb({}); return () => {}; }),
}));

// The mediation service by its contract: events of the open meeting, records, a save.
const med = vi.hoisted(() => ({
  events: [] as Array<{ ref: string; studentNumber: number; kind: string; at: number }>,
  saves: [] as Array<any>,
}));
vi.mock('@/infrastructure/services/TeacherMediationService', () => ({
  subscribeMeetingMediationTelemetry: vi.fn((_m: number, _s: number, cb: (e: unknown) => void) => { cb(med.events); return () => {}; }),
  subscribeMediationRecords: vi.fn((_m: number, cb: (r: unknown) => void) => { cb([]); return () => {}; }),
  saveMediationRecord: vi.fn(async (input: any) => {
    med.saves.push(input);
    return {
      id: 'ev_' + (input.event?.ref ?? 'self'), class_id: 'class_1', student_id: input.studentNumber, session_number: input.meeting,
      event_ref: input.event?.ref ?? null, event_time_iso: '', action: input.action, data_led: input.dataLed, note: null,
      recorded_at: Date.now() + 1000, recorded_by: 'auth_uid_google_01',
    };
  }),
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
import { useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { useChatStore } from '@/application/useChatStore';

const MIN = 60 * 1000;

function openMeeting(sessionNumber: number) {
  const startedAt = h.db.serverTime() - 5 * MIN;
  h.db.tree.active_class_session = { active: true, status: 'active', sessionNumber, startedAt, teacherId: 'teacher_test_01' };
  return startedAt;
}

function learner(n: number, over: Record<string, unknown> = {}) {
  h.db.tree.users ??= { students: {} };
  h.db.tree.users.students[`student_user${n}`] = { workspaceState: { sessionNumber: 4, flowStatus: 'task', standardTaskIdx: 1, savedAt: 1 }, ...over };
}

const renderDashboard = () => render(<MemoryRouter><TeacherDashboard /></MemoryRouter>);

beforeEach(() => {
  h.db?.reset();
  h.seq = [];
  h.appWrites = [];
  med.events = [];
  med.saves = [];
  useTeacherMediationStore.setState({ meeting: null, runStartedAt: null, telemetryEvents: [], records: [], optimistic: [], expandedLearner: null, pendingAction: {} });
  useChatStore.setState({ messages: [] } as never);
  h.auth.currentUser = {
    uid: 'auth_uid_google_01',
    getIdTokenResult: vi.fn().mockResolvedValue({ claims: { role: 'teacher' } }),
    getIdToken: vi.fn().mockResolvedValue('token_test'),
  };
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

describe('the side action queue on the radar tab', () => {
  it('merges a help call and the learner’s chat into one item; one action press clears the call; כן writes both records', async () => {
    const startedAt = openMeeting(4);
    learner(3, { helpRequested: true });
    learner(5);
    h.db.tree.chat_messages = {
      student_user3: { m1: { id: 'm1', senderId: 'student_user3', senderName: 'תלמיד 3', receiverId: 'teacher', text: 'עזרה', timestamp: startedAt + 2 * MIN, read: false } },
    };
    med.events = [
      { ref: 'log_help_3', studentNumber: 3, kind: 'help_called', at: startedAt + MIN },
      { ref: 'log_hes_5', studentNumber: 5, kind: 'radar_hesitation', at: startedAt + 3 * MIN },
    ];
    renderDashboard();
    const queue = await screen.findByTestId('mediation-queue', {}, { timeout: 5000 });
    await waitFor(() => expect(within(queue).getAllByTestId('queue-item')).toHaveLength(1), { timeout: 3000 });
    const item = within(queue).getByTestId('queue-item');
    expect(item.getAttribute('data-learner')).toBe('3');
    expect(item.getAttribute('data-kind')).toBe('help');
    // The chat message is merged into the call; the hesitation waits in the folded list.
    await waitFor(() => expect(item.textContent).toContain('1'));
    expect(within(queue).getByTestId('queue-to-record-toggle').textContent).toContain('לתיעוד (1)');

    await act(async () => { fireEvent.click(within(item).getByTestId('queue-action-approached')); });
    const clear = h.appWrites.find((w) => w.op === 'update' && w.path === 'users/students/student_user3');
    expect(clear?.value).toMatchObject({ helpRequested: false, handRaised: false, isStruggling: false });
    expect(med.saves).toEqual([]);

    await act(async () => { fireEvent.click(within(item).getByTestId('queue-dataled-yes')); });
    await waitFor(() => expect(med.saves).toHaveLength(2));
    expect(med.saves.map((s) => s.event.ref).sort()).toEqual(['chat:m1', 'log_help_3']);
    expect(med.saves.every((s) => s.action === 'approached' && s.dataLed === true && s.studentNumber === 3 && s.meeting === 4)).toBe(true);
  });

  it('the counter in the bar counts every unrecorded event of the meeting', async () => {
    const startedAt = openMeeting(4);
    learner(2);
    med.events = [
      { ref: 'a', studentNumber: 2, kind: 'radar_card_open', at: startedAt + MIN },
      { ref: 'b', studentNumber: 2, kind: 'radar_hesitation', at: startedAt + 2 * MIN },
    ];
    renderDashboard();
    const counter = await screen.findByTestId('mediation-pending-counter', {}, { timeout: 5000 });
    await waitFor(() => expect(counter.textContent).toContain('לתיעוד: 2'));
  });
});

describe('closing the meeting with unrecorded events', () => {
  it('lists them in the closing checklist (step 4), and never blocks the close', async () => {
    const startedAt = openMeeting(4);
    // Finished, so no catch-up reasons are asked after the mediation dialog.
    learner(7, { workspaceState: { sessionNumber: 4, flowStatus: 'choice_branch', standardTaskIdx: 7, savedAt: 1 } });
    med.events = [{ ref: 'log_card_7', studentNumber: 7, kind: 'radar_card_open', at: startedAt + MIN }];
    renderDashboard();
    const close = (await screen.findByText('סגרו את המפגש', {}, { timeout: 5000 })).closest('button') as HTMLButtonElement;
    await waitFor(() => expect(screen.getByTestId('mediation-pending-counter').textContent).toContain('לתיעוד: 1'));
    await act(async () => { fireEvent.click(close); });
    const dialog = screen.getByTestId('close-checklist');
    const step = within(dialog).getByTestId('close-step-mediation');
    expect(step.textContent).toContain('יש אירוע אחד שלא תועד');
    expect(within(step).getAllByTestId('mediation-close-row')).toHaveLength(1);
    expect(step.textContent).toContain('תלמיד 7 · כרטיס החניכה נפתח');
    expect(h.seq).toEqual([]);
    await act(async () => { fireEvent.click(within(dialog).getByTestId('close-checklist-confirm')); });
    await waitFor(() => expect(h.seq).toEqual(['close:teacher']));
  });
});

describe('the bar', () => {
  it('shows "מסכי התלמידים נעולים להדגמה" while the projector mode is on, and writes nothing to it', async () => {
    openMeeting(4);
    h.db.tree.system_control = { projector_mode: { projector_mode: true, projector_mode_updated_at: 5 } };
    renderDashboard();
    const chip = await screen.findByTestId('projector-chip', {}, { timeout: 5000 });
    expect(chip.textContent).toBe('מסכי התלמידים נעולים להדגמה');
    expect(chip.className).not.toMatch(/animate-/);
    expect(h.appWrites.some((w) => w.path.startsWith('system_control/projector_mode'))).toBe(false);
  });

  it('no chip while the projector mode is off', async () => {
    openMeeting(4);
    renderDashboard();
    await screen.findByText('סגרו את המפגש', {}, { timeout: 5000 });
    expect(screen.queryByTestId('projector-chip')).toBeNull();
  });
});

describe('the no-scroll layout at 1366×768 (owner, 11.10.2026)', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
  const dash = read('../../presentation/pages/TeacherDashboard.tsx');
  const heat = read('../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx');
  it('the bar is one row from md up, the page heading is gone, the radar text is a tooltip', () => {
    expect(dash).not.toContain('min-[1700px]:flex-row');
    expect(dash).toMatch(/data-testid="live-session-bar-row" className="[^"]*md:flex-row/);
    expect(dash).not.toContain('הכיתה בזמן אמת');
    expect(dash).not.toContain('12 תלמידים אנונימיים על הרדאר הפדגוגי השקט');
    expect(heat).toContain('title={RADAR_EXPLANATION_HE}');
    expect(heat).toContain('minmax(72px, 1fr)');
    expect(heat).not.toContain('min-h-[125px]');
  });
  it('the queue sits beside the grid and the floating chat never opens over it on the radar tab', () => {
    expect(dash).toContain('data-testid="radar-and-queue" className="flex flex-col lg:flex-row');
    expect(dash).toMatch(/if \(activeTab === 'heatmap' && n !== null\) \{\s*setDrawerStudentId\(null\);\s*useTeacherMediationStore\.getState\(\)\.setExpandedLearner\(n\);/);
  });
  it('nothing on the bar or the side menu pulses or bounces', () => {
    expect(dash).not.toMatch(/animate-(bounce|soft-heartbeat|radar-call)/);
  });
});



