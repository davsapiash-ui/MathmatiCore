/**
 * @vitest-environment jsdom
 *
 * Catch-up time on the teacher's dashboard (owner decision 2.10.2026): "המורה
 * יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן נוסף וזה יתועד מה הסיבה לכך ואז
 * אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש הבא".
 *
 * The real dashboard on the in-memory Realtime Database (as
 * Module14_TeacherTransitions). The reasons dialog (part B1) and the records
 * service (part C1) are replaced by stand-ins that keep their contracts, so
 * what is under test is the wiring: when the dialog appears, and the order of
 * the writes that follow each choice.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeRealtimeDatabase,
  /** Every class-record write and every reasons write, in order. */
  seq: [] as string[],
  appWrites: [] as Array<{ op: 'set' | 'update'; path: string; value: any }>,
  records: {} as Record<number, unknown>,
  recordCalls: [] as Array<any>,
  recordFails: false,
  dialogProps: null as any,
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
  auth: {
    currentUser: {
      uid: 'auth_uid_google_01',
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

// Part C1's service, by its contract: resolves once the rounds are written.
vi.mock('@/infrastructure/services/CatchUpService', () => ({
  recordCatchUpReasons: vi.fn(async (input: any) => {
    h.recordCalls.push(input);
    if (h.recordFails) throw new Error('PERMISSION_DENIED');
    h.seq.push(`record:${input.action}`);
  }),
  fetchCatchUpRecords: vi.fn(async () => h.records),
  subscribeCatchUpRecords: vi.fn((_meeting: number, cb: (r: unknown) => void) => {
    cb(h.records);
    return () => {};
  }),
}));

// Part B1's dialog, by its contract (props only).
vi.mock('@/presentation/pages/TeacherDashboard/components/CatchUpReasonsDialog', () => ({
  CatchUpReasonsDialog: (props: any) => {
    h.dialogProps = props;
    if (!props.isOpen) return null;
    const entries = props.learners.map((l: any) => ({ studentNumber: l.studentNumber, reason: 'slow_pace', note: null, stoppedAtHe: l.stoppedAtHe }));
    return (
      <div role="dialog" aria-label="reasons-stub">
        <button onClick={() => props.onReopen(entries)}>stub-reopen</button>
        <button onClick={() => props.onContinue(entries)}>stub-continue</button>
        <button onClick={() => props.onCancel()}>stub-cancel</button>
      </div>
    );
  },
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
import { SESSION_HARD_CAP_MS, TEACHER_DISCONNECT_GRACE_MS } from '@/core/classSession';

const MIN = 60 * 1000;
let startedAt = 0;

function openMeeting(sessionNumber: number, ageMs = 5 * MIN) {
  startedAt = h.db.serverTime() - ageMs;
  h.db.tree.active_class_session = { active: true, status: 'active', sessionNumber, startedAt, teacherId: 'teacher_test_01' };
}

/** Learner n stopped at exercise `idx` (0-based) of `meeting`. */
function learnerStoppedAt(n: number, meeting: number, idx: number) {
  h.db.tree.users ??= { students: {} };
  h.db.tree.users.students[`student_user${n}`] = {
    workspaceState: { sessionNumber: meeting, flowStatus: 'task', standardTaskIdx: idx, hasInteracted: true, savedAt: 1 },
  };
}

function learnerFinished(n: number, meeting: number) {
  h.db.tree.users ??= { students: {} };
  h.db.tree.users.students[`student_user${n}`] = {
    workspaceState: { sessionNumber: meeting, flowStatus: 'choice_branch', standardTaskIdx: 7, savedAt: 1 },
  };
}

const renderDashboard = () => render(<MemoryRouter><TeacherDashboard /></MemoryRouter>);
// By its text: a role query over the whole dashboard is slow enough to time out on a loaded machine.
const closeButton = async () => (await screen.findByText('סגרו את המפגש', {}, { timeout: 5000 })).closest('button') as HTMLButtonElement;
// Found outside act(): inside it React holds the renders the query waits for.
async function clickClose() {
  const button = await closeButton();
  await act(async () => { fireEvent.click(button); });
}
const reasonsDialog = () => screen.queryByRole('dialog', { name: 'reasons-stub' });
const lastClassWrite = () => [...h.appWrites].reverse().find((w) => w.path === 'active_class_session')?.value;

async function waitForLearners(text: RegExp) {
  await waitFor(() => expect(screen.getByText(text)).toBeTruthy(), { timeout: 2000 });
}

async function activateFromPicker(meeting: number) {
  const picker = screen.getAllByRole('combobox').find((s) => s.querySelectorAll('option').length === 8)!;
  fireEvent.change(picker, { target: { value: String(meeting) } });
  fireEvent.click(screen.getByRole('button', { name: /הפעילו מפגש/ }));
  const confirm = await screen.findByRole('button', { name: /אישור ופתיחת המפגש/ });
  await act(async () => { fireEvent.click(confirm); });
}

beforeEach(() => {
  h.db?.reset();
  h.seq = [];
  h.appWrites = [];
  h.records = {};
  h.recordCalls = [];
  h.recordFails = false;
  h.dialogProps = null;
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

describe('closing a meeting with learners who did not finish', () => {
  it('the bar lists them; the close button opens the dialog and writes nothing yet', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    learnerFinished(6, 4);
    renderDashboard();
    await waitForLearners(/תלמיד אחד עוד לא סיים את מפגש 4/);
    expect(screen.getByText('תלמיד 5 · תרגיל 4 מתוך 7')).toBeTruthy();

    await clickClose();
    expect(reasonsDialog()).toBeTruthy();
    expect(h.dialogProps).toMatchObject({ meeting: 4, trigger: 'close', nextMeeting: null, isMeeting2: false });
    expect(h.dialogProps.learners).toEqual([{ studentNumber: 5, stoppedAtHe: 'תרגיל 4 מתוך 7' }]);
    expect(h.seq).toEqual([]);
  });

  it('"המשיכו בכל זאת": the reasons, then the close as today, carrying the run that ended', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await clickClose();
    await act(async () => { fireEvent.click(screen.getByText('stub-continue')); });

    await waitFor(() => expect(h.seq).toEqual(['record:continue', 'close:teacher']));
    expect(h.recordCalls[0]).toMatchObject({ meeting: 4, action: 'continue', teacherUid: 'auth_uid_google_01' });
    // The Auth uid, not the app's display id: the rules require recorded_by == request.auth.uid.
    expect(h.recordCalls[0].teacherUid).not.toBe('teacher_test_01');
    expect(h.recordCalls[0].entries).toEqual([{ studentNumber: 5, reason: 'slow_pace', note: null, stoppedAtHe: 'תרגיל 4 מתוך 7' }]);
    expect(h.recordCalls[0].recordedAt).toBeGreaterThanOrEqual(startedAt);
    expect(lastClassWrite()).toMatchObject({ active: false, status: 'closed', closedBy: 'teacher', lastSessionNumber: 4, lastStartedAt: startedAt });
    expect(reasonsDialog()).toBeNull();
  });

  it('"פתחו שוב": the reasons (awaited), the close, then the same meeting opened again', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await clickClose();
    await act(async () => { fireEvent.click(screen.getByText('stub-reopen')); });

    await waitFor(() => expect(h.seq).toEqual(['record:reopen', 'close:teacher', 'open:4']));
    expect(h.db.read('active_class_session')).toMatchObject({ active: true, sessionNumber: 4 });
  });

  it('a failed reasons write: an error toast, nothing closed, the dialog stays', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    h.recordFails = true;
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await clickClose();
    await act(async () => { fireEvent.click(screen.getByText('stub-continue')); });

    await waitFor(() => expect(toasts.calls.some((c) => c.kind === 'error' && c.text.includes('המפגש נשאר פתוח'))).toBe(true));
    expect(h.seq).toEqual([]);
    expect(h.db.read('active_class_session')?.active).toBe(true);
    expect(reasonsDialog()).toBeTruthy();
  });

  it('cancel: nothing written, the meeting stays open', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await clickClose();
    await act(async () => { fireEvent.click(screen.getByText('stub-cancel')); });
    expect(reasonsDialog()).toBeNull();
    expect(h.seq).toEqual([]);
    expect(h.db.read('active_class_session')?.active).toBe(true);
  });

  it('no dialog when everyone who started finished', async () => {
    openMeeting(4);
    learnerFinished(6, 4);
    renderDashboard();
    await clickClose();
    await waitFor(() => expect(h.seq).toEqual(['close:teacher']));
    expect(reasonsDialog()).toBeNull();
  });

  it('no dialog for a learner whose reason this run already has; a reason from an earlier run does not count', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    learnerStoppedAt(7, 4, 1);
    const round = (at: number) => ({ action: 'reopen', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 't', recorded_at: at, opened_at: null, closed_at: null, closed_by: null, active_minutes: null });
    h.records = {
      5: { student_id: 5, session_number: 4, class_id: 'class_1', rounds: { r_1: round(startedAt + 1000) } },
      7: { student_id: 7, session_number: 4, class_id: 'class_1', rounds: { r_0: round(startedAt - 60 * MIN) } },
    };
    renderDashboard();
    await waitForLearners(/2 תלמידים עוד לא סיימו את מפגש 4/);
    await clickClose();
    expect(h.dialogProps.learners.map((l: any) => l.studentNumber)).toEqual([7]);
  });
});

describe('closes by time: no dialog then; the reasons are asked at the next opening', () => {
  it('the 45-minute close carries the run that ended and opens no dialog; the bar lists who did not finish', async () => {
    openMeeting(4, SESSION_HARD_CAP_MS + MIN);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitFor(() => expect(h.seq).toEqual(['close:auto_45min']));
    expect(lastClassWrite()).toMatchObject({ endedBy: 'auto_45min', lastSessionNumber: 4, lastStartedAt: startedAt });
    expect(lastClassWrite().closedBy).toBeUndefined();
    await waitForLearners(/תלמיד אחד לא סיים את מפגש 4/);
    expect(reasonsDialog()).toBeNull();
  });

  it('the disconnect-window close carries the run that ended, and opens no dialog', async () => {
    openMeeting(3);
    learnerStoppedAt(5, 3, 2);
    h.db.tree.active_class_session.teacherDisconnectedAt = h.db.serverTime() - TEACHER_DISCONNECT_GRACE_MS - MIN;
    renderDashboard();
    await act(async () => {
      h.db.connected = true;
      (h.db as unknown as { notify(path: string): void }).notify('.info/connected');
      (h.db as unknown as { notify(path: string): void }).notify('active_class_session');
    });
    await waitFor(() => expect(lastClassWrite()).toMatchObject({ endedBy: 'teacher_disconnect_grace', lastSessionNumber: 3, lastStartedAt: startedAt }));
    expect(reasonsDialog()).toBeNull();
  });

  it('after a close by time, opening another meeting asks first; "המשיכו בכל זאת" opens the other one', async () => {
    openMeeting(4, SESSION_HARD_CAP_MS + MIN);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/תלמיד אחד לא סיים את מפגש 4/);
    h.seq = [];

    await activateFromPicker(5);
    expect(reasonsDialog()).toBeTruthy();
    expect(h.dialogProps).toMatchObject({ meeting: 4, trigger: 'open_other', nextMeeting: 5 });
    expect(h.seq).toEqual([]);

    await act(async () => { fireEvent.click(screen.getByText('stub-continue')); });
    await waitFor(() => expect(h.seq).toEqual(['record:continue', 'open:5']));
  });

  it('after a close by time, "פתחו שוב" opens the unfinished meeting instead', async () => {
    openMeeting(4, SESSION_HARD_CAP_MS + MIN);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/תלמיד אחד לא סיים את מפגש 4/);
    h.seq = [];

    await activateFromPicker(5);
    await act(async () => { fireEvent.click(screen.getByText('stub-reopen')); });
    await waitFor(() => expect(h.seq).toEqual(['record:reopen', 'open:4']));
  });

  it('after the teacher\'s own close (reasons already given), opening the next meeting does not ask again', async () => {
    h.db.tree.active_class_session = { active: false, status: 'closed', sessionNumber: null, closedBy: 'teacher', lastSessionNumber: 4, lastStartedAt: h.db.serverTime() - 10 * MIN };
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/תלמיד אחד לא סיים את מפגש 4/);
    await activateFromPicker(5);
    await waitFor(() => expect(h.seq).toEqual(['open:5']));
    expect(reasonsDialog()).toBeNull();
  });
});

describe('opening another meeting while one is open', () => {
  it('asks first; "המשיכו בכל זאת" switches to the other meeting as today', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await activateFromPicker(6);
    expect(h.dialogProps).toMatchObject({ meeting: 4, trigger: 'open_other', nextMeeting: 6 });
    await act(async () => { fireEvent.click(screen.getByText('stub-continue')); });
    await waitFor(() => expect(h.seq).toEqual(['record:continue', 'open:6']));
  });

  it('"פתחו שוב": the open meeting is closed and opened again (a new run), not the other one', async () => {
    openMeeting(4);
    learnerStoppedAt(5, 4, 3);
    renderDashboard();
    await waitForLearners(/עוד לא סיים את מפגש 4/);
    await activateFromPicker(6);
    await act(async () => { fireEvent.click(screen.getByText('stub-reopen')); });
    await waitFor(() => expect(h.seq).toEqual(['record:reopen', 'close:teacher', 'open:4']));
  });
});

describe('meeting 2 keeps its own list; the dialog documents it', () => {
  it('closing meeting 2 asks about the learners the gate lists, with "משימה"', async () => {
    openMeeting(2);
    h.db.tree.users = { students: { student_user3: { workspaceState: { sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'primary', taskIdx: 2 }, savedAt: 1 } } } };
    renderDashboard();
    await waitForLearners(/תלמיד אחד עוד לא סיים את מפגש 2/);
    await clickClose();
    expect(h.dialogProps).toMatchObject({ meeting: 2, trigger: 'close', isMeeting2: true });
    expect(h.dialogProps.learners).toEqual([{ studentNumber: 3, stoppedAtHe: 'משימה 3 מתוך 7' }]);
    await act(async () => { fireEvent.click(screen.getByText('stub-continue')); });
    await waitFor(() => expect(h.seq).toEqual(['record:continue', 'close:teacher']));
  });

  it('"פתחו שוב" in meeting 2: a new run in place, never the teacher\'s close (which would complete the learners)', async () => {
    openMeeting(2);
    h.db.tree.users = { students: { student_user3: { workspaceState: { sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'primary', taskIdx: 2 }, savedAt: 1 } } } };
    renderDashboard();
    await waitForLearners(/תלמיד אחד עוד לא סיים את מפגש 2/);
    await clickClose();
    await act(async () => { fireEvent.click(screen.getByText('stub-reopen')); });
    await waitFor(() => expect(h.seq).toEqual(['record:reopen', 'open:2']));
    expect(h.seq).not.toContain('close:teacher');
    expect(h.db.read('active_class_session')).toMatchObject({ active: true, sessionNumber: 2 });
  });
});
