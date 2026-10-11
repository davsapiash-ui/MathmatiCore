/**
 * @vitest-environment jsdom
 *
 * Round two of the teacher interface on the real dashboard (owner decision
 * 11.10.2026), on the harness of MediationDashboard_11_10: the closing
 * checklist (D), the deadline banner (C), the prepare-step line (E), the
 * after-close summary (F) and read-only accounts (H).
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


import { useReadOnlyStaffStore } from '@/application/useIsReadOnlyStaff';

const closeButton = async () => (await screen.findByText('סגרו את המפגש', {}, { timeout: 5000 })).closest('button') as HTMLButtonElement;

describe('D — one closing checklist', () => {
  it('help calls cleared in one click; the projector step; then the close and the teacher-only summary', async () => {
    openMeeting(4);
    learner(3, { helpRequested: true, isOnline: true, lastPing: h.db.serverTime(), workspaceState: { sessionNumber: 4, flowStatus: 'choice_branch', standardTaskIdx: 7, savedAt: 1 } });
    learner(6, { workspaceState: { sessionNumber: 4, flowStatus: 'choice_branch', standardTaskIdx: 7, savedAt: 1 } });
    h.db.tree.system_control = { projector_mode: { projector_mode: true, projector_mode_updated_at: 5 } };
    med.events = [{ ref: 'log_help_3', studentNumber: 3, kind: 'help_called', at: h.db.serverTime() - MIN }];
    renderDashboard();
    const close = await closeButton();
    await waitFor(() => expect(screen.getByTestId('projector-chip')).toBeTruthy());
    await act(async () => { fireEvent.click(close); });

    const list = screen.getByTestId('close-checklist');
    expect(within(list).getByTestId('close-step-help').textContent).toContain('תלמיד 3');
    expect(within(list).getByTestId('close-step-projector').textContent).toContain('מסכי התלמידים עדיין נעולים להדגמה');
    expect(within(list).getByTestId('close-step-unfinished').getAttribute('data-done')).toBe('true');
    expect(h.seq).toEqual([]);

    await act(async () => { fireEvent.click(within(list).getByTestId('close-clear-help')); });
    const clear = h.appWrites.find((w) => w.op === 'update' && w.path === 'users/students/student_user3');
    expect(clear?.value).toMatchObject({ helpRequested: false });
    // The projector record is the projector page's alone.
    expect(h.appWrites.some((w) => w.path.startsWith('system_control/projector_mode'))).toBe(false);

    await act(async () => { fireEvent.click(within(screen.getByTestId('close-checklist')).getByTestId('close-checklist-confirm')); });
    await waitFor(() => expect(h.seq).toEqual(['close:teacher']));
    const summary = await screen.findByTestId('meeting-summary');
    expect(summary.textContent).toContain('סיכום מפגש 4');
    expect(within(summary).getByTestId('meeting-summary-finished').textContent).toBe('סיימו: 2 מתוך 12');
    expect(within(summary).getByTestId('meeting-summary-help').textContent).toBe('קריאה אחת לעזרה');
    expect(screen.queryByTestId('close-checklist')).toBeNull();
  });

  it('meeting 2 always shows what the close does', async () => {
    openMeeting(2);
    renderDashboard();
    const closeBtn = await closeButton();
    await act(async () => { fireEvent.click(closeBtn); });
    expect(screen.getByTestId('close-step-unfinished').textContent).toContain('סגירת מפגש 2 משלימה את האבחון');
    expect(h.seq).toEqual([]);
  });

  it('meeting 8: "לא שלחו רפלקציה" with the mandatory reasons embedded; no close until every learner has one', async () => {
    openMeeting(8);
    learner(4, { workspaceState: { sessionNumber: 8, flowStatus: 'reflection', standardTaskIdx: 7, savedAt: 1, hasInteracted: true } });
    renderDashboard();
    await screen.findByText(/עוד לא סיים את מפגש 8/, {}, { timeout: 5000 });
    const closeBtn = await closeButton();
    await act(async () => { fireEvent.click(closeBtn); });
    const step = screen.getByTestId('close-step-unfinished');
    expect(step.textContent).toContain('לא שלחו רפלקציה');
    expect(within(step).getByTestId('catchup-row-4').textContent).toContain('לוח הרפלקציה');
    expect(screen.queryByTestId('close-checklist-confirm')).toBeNull();
    expect((within(step).getByText('המשיכו בכל זאת').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('with nothing to look at, the close goes ahead at once, as before', async () => {
    openMeeting(4);
    learner(6, { workspaceState: { sessionNumber: 4, flowStatus: 'choice_branch', standardTaskIdx: 7, savedAt: 1 } });
    renderDashboard();
    const closeBtn = await closeButton();
    await act(async () => { fireEvent.click(closeBtn); });
    await waitFor(() => expect(h.seq).toEqual(['close:teacher']));
    expect(screen.queryByTestId('close-checklist')).toBeNull();
  });
});

describe('C — the deadline notice is a banner, not a window', () => {
  it('"עברו X דקות" in the bar; one click closes it; nothing blocks the page', async () => {
    const startedAt = h.db.serverTime() - 16 * MIN;
    h.db.tree.active_class_session = { active: true, status: 'active', sessionNumber: 4, startedAt, teacherId: 'teacher_test_01' };
    try { localStorage.clear(); } catch { /* storage unavailable */ }
    renderDashboard();
    const banner = await screen.findByTestId('deadline-banner', {}, { timeout: 5000 });
    expect(banner.textContent).toContain('עברו 15 דקות');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByTestId('deadline-banner-dismiss'));
    expect(screen.queryByTestId('deadline-banner')).toBeNull();
  });
  it('the source has no blocking deadline window', () => {
    const dash = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard.tsx'), 'utf-8');
    expect(dash).not.toContain('deadlineNoticeRef');
  });
});

describe('E — the prepare step', () => {
  it('no meeting open, station 3–7 picked: the demonstration comes first', async () => {
    learner(9);
    renderDashboard();
    const picker = await screen.findByDisplayValue(/מפגש 1/, {}, { timeout: 5000 });
    expect(screen.queryByTestId('prepare-reminder')).toBeNull();
    fireEvent.change(picker, { target: { value: '5' } });
    expect(screen.getByTestId('prepare-reminder').textContent).toBe('מפגש 5: קודם מדגימים במקרן, ואחרי ההדגמה מפעילים את המפגש.');
    fireEvent.change(picker, { target: { value: '8' } });
    expect(screen.queryByTestId('prepare-reminder')).toBeNull();
  });
});

describe('H — a read-only account sees the bar, and cannot close', () => {
  it('the close is disabled', async () => {
    openMeeting(4);
    useReadOnlyStaffStore.setState({ readOnly: true } as never);
    try {
      renderDashboard();
      expect((await closeButton()).disabled).toBe(true);
    } finally {
      useReadOnlyStaffStore.setState({ readOnly: false } as never);
    }
  });
});

describe('the layout per screen size (owner, 11.10.2026; measured in a browser at 768×1024, 1366×768, 1600×900 and 1920×1080)', () => {
  const dash = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard.tsx'), 'utf-8');
  const heat = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/HeatmapGrid.tsx'), 'utf-8');
  it('queue 320 / 360 / 400px beside the radar from 1024px; a bottom sheet below it', () => {
    expect(dash).toContain('lg:w-80 min-[1440px]:w-[22.5rem] min-[1920px]:w-[25rem]');
    expect(dash).toContain('max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0');
    expect(dash).toContain("queueSheetOpen ? '' : 'max-lg:hidden'");
  });
  it('fluid gaps, four columns that fill the width, rows that share the free height, metrics inline when the tile has room', () => {
    // One grid for both groups (owner, 11.10.2026, round three): the rows split the height left under the bar.
    expect(heat).toContain('grid grid-cols-4 gap-x-[clamp(10px,1.1vw,24px)] gap-y-[clamp(8px,0.9vw,20px)] w-full flex-1 min-h-0');
    expect(heat).toContain('auto repeat(${Math.ceil(n / 4)}, minmax(72px, 1fr))');
    expect(heat).toContain("${roomyTiles ? 'flex' : 'hidden'}");
    expect(dash).toContain('data-testid="radar-and-queue" className="flex flex-col lg:flex-row items-start lg:items-stretch');
    expect(dash).toContain('lg:min-h-0 lg:self-stretch');
    expect(heat).not.toContain('max-w-4xl mx-auto w-full mb-1.5');
  });
  it('the bar button opens and closes the sheet', async () => {
    openMeeting(4);
    learner(9);
    renderDashboard();
    const toggle = await screen.findByTestId('queue-sheet-toggle', {}, { timeout: 5000 });
    const column = screen.getByTestId('radar-side-column');
    expect(column.getAttribute('data-sheet-open')).toBeNull();
    fireEvent.click(toggle);
    expect(column.getAttribute('data-sheet-open')).toBe('true');
    expect(within(column).getByTestId('radar-legend')).toBeTruthy();
  });
});
