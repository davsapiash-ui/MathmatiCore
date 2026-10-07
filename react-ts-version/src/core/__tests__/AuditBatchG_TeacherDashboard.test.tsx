/**
 * @vitest-environment jsdom
 *
 * Teacher-dashboard fixes from the truth audit of 2.10.2026 (batch G):
 * the real dashboard on the in-memory Realtime Database (as
 * Module14_TeacherTransitions), plus the small components on their own.
 *
 *  - a reload or a second tab never raises "החיבור התנתק לרגע וחזר";
 *  - a meeting left open yesterday is closed once, with one reason;
 *  - a report link to a learner who is not 1–12 opens no one's report;
 *  - the learner chat blocks a message with a phone number under the box;
 *  - the chat header reads the full learner list, not the search result;
 *  - the gate's rows open the learner's report; its "approved" line no
 *    longer says the meeting is open;
 *  - a domain nobody struggles in shows 0 instead of vanishing;
 *  - the picker counts each meeting by itself (completedMeetings/m{N}).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

const h = vi.hoisted(() => ({
  db: null as unknown as FakeRealtimeDatabase,
  refuseNext: null as null | { path: string; err: Error },
  appWrites: [] as Array<{ op: 'set' | 'update'; path: string; value: any }>,
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
  deleteField: vi.fn(() => ({ __delete: true })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) })),
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
import { TeacherApprovalGate } from '@/presentation/pages/TeacherDashboard/components/TeacherApprovalGate';
import { ClusteringWidgets } from '@/presentation/pages/TeacherDashboard/components/ClusteringWidgets';
import { ClassManagement } from '@/presentation/pages/TeacherDashboard/ClassManagement';
import { buildSessionRows } from '@/core/sessionPicker';
import { useAuthStore } from '@/application/useAuthStore';
import { TEACHER_DISCONNECT_GRACE_MS } from '@/core/classSession';

const MIN = 60 * 1000;
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

function seedLearner(n: number, extra: Record<string, unknown> = {}) {
  h.db.tree.users ??= { students: {} };
  h.db.tree.users.students[`student_user${n}`] = { highestCompletedMeeting: 0, isOnline: true, lastPing: h.db.serverTime(), ...extra };
}

function renderDashboard(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<TeacherDashboard />} />
        <Route path="/dashboard/student/:id/view" element={<TeacherDashboard />} />
      </Routes>
    </MemoryRouter>
  );
}

const sessionSets = () => h.appWrites.filter((w) => w.path === 'active_class_session' && w.op === 'set');
const toastTexts = (kind: string) => toasts.calls.filter((c) => c.kind === kind).map((c) => c.text);

beforeEach(() => {
  h.db?.reset();
  h.refuseNext = null;
  h.appWrites = [];
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

describe('M-refresh-toast — a stamp this page did not cause is cleared quietly', () => {
  it('a reload with a meeting open: the stamp is cleared, the meeting stays open, no "התנתק לרגע" toast', async () => {
    h.db.tree.active_class_session = {
      active: true, status: 'active', sessionNumber: 3,
      startedAt: h.db.serverTime() - 5 * MIN,
      teacherDisconnectedAt: h.db.serverTime() - 1 * MIN, // the page that was reloaded
      teacherId: 'teacher_test_01',
    };
    renderDashboard();
    expect(await screen.findByRole('button', { name: /עצרו את המפגש/ })).toBeTruthy();
    await waitFor(() => expect(h.db.read('active_class_session/teacherDisconnectedAt')).toBeNull());
    expect(h.db.read('active_class_session')?.active).toBe(true);
    expect(toastTexts('info').some((t) => t.includes('התנתק לרגע וחזר'))).toBe(false);
  });
});

describe('meeting_control-15 / cross-8 — a meeting left open yesterday', () => {
  it('is closed by the 45-minute path only; a refused close is told once', async () => {
    h.db.tree.active_class_session = {
      active: true, status: 'active', sessionNumber: 4,
      startedAt: h.db.serverTime() - 50 * MIN,
      teacherDisconnectedAt: h.db.serverTime() - TEACHER_DISCONNECT_GRACE_MS - 5 * MIN,
      teacherId: 'teacher_test_01',
    };
    // The server refuses the close: the record stays stale on screen, and the
    // disconnect path used to close it a second time with another reason.
    h.refuseNext = { path: 'active_class_session', err: new Error('PERMISSION_DENIED') };
    renderDashboard();
    await waitFor(() => expect(sessionSets().length).toBeGreaterThan(0));
    await act(async () => { await Promise.resolve(); });

    const closes = sessionSets().filter((w) => w.value?.active === false);
    expect(closes.map((w) => w.value.endedBy)).toEqual(['auto_45min']);
    expect(toastTexts('info').filter((t) => t.includes('נסגר אוטומטית'))).toHaveLength(1);
    expect(toastTexts('info').some((t) => t.includes('מנותק יותר'))).toBe(false);
    expect(toastTexts('error')).toContain('הסגירה האוטומטית של המפגש לא נשמרה בשרת. אצל התלמידים המפגש כבר נסגר.');
  });
});

describe('M-bad-url-id — a report link names a learner of the class, or no one', () => {
  it('/dashboard/student/99/view opens no report and says so', async () => {
    seedLearner(1);
    seedLearner(12);
    renderDashboard('/dashboard/student/99/view');
    expect((await screen.findByRole('alert', {}, { timeout: 3000 })).textContent).toContain('הקישור לא מוביל לאף תלמיד בכיתה');
    expect(screen.queryByRole('heading', { name: /^תלמיד 12$/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^תלמיד 1$/ })).toBeNull();
  });

  it('/dashboard/student/7/view opens learner 7', async () => {
    seedLearner(7);
    renderDashboard('/dashboard/student/7/view');
    expect((await screen.findAllByRole('heading', { name: /^תלמיד 7$/ })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('learner chat — PII notice under the box, header from the full list', () => {
  async function openChatWith(n: number) {
    renderDashboard();
    fireEvent.click(await screen.findByRole('tab', { name: /צ'אט עם תלמידים/ }));
    const row = await screen.findByRole('button', { name: new RegExp(`^${n}\\s*תלמיד ${n}`) });
    fireEvent.click(row);
    return screen.getByPlaceholderText('הקלידו הודעה לתלמיד...') as HTMLInputElement;
  }

  it('M-pii-check-lock: a phone number shows the notice and blocks the send', async () => {
    seedLearner(3);
    const input = await openChatWith(3);
    fireEvent.change(input, { target: { value: 'תתקשרו 0501234567' } });
    expect(screen.getByRole('status').textContent).toContain('מספר טלפון');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const send = screen.getByRole('button', { name: 'שליחת ההודעה' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'תלמיד 3, כל הכבוד' } });
    expect(screen.queryByRole('status')).toBeNull();
    expect(send.disabled).toBe(false);
  });

  it('chat-11: the header keeps the open learner when the search filters the list', async () => {
    seedLearner(3);
    await openChatWith(3);
    fireEvent.change(screen.getByPlaceholderText('חפשו תלמיד לפי מספר...'), { target: { value: '9' } });
    expect(screen.getByRole('heading', { name: 'תלמיד 3' })).toBeTruthy();
    expect(screen.queryByText('student_user3')).toBeNull();
  });
});

describe('TeacherApprovalGate', () => {
  const waiting = {
    studentId: 'student_4', anonymousLabel: 'תלמיד 4', recommendedPath: 'green_path',
    isApproved: false, scoreSummary: '5/7', errorNodes: [],
  } as never;
  const approved = { ...(waiting as object), studentId: 'student_5', anonymousLabel: 'תלמיד 5', isApproved: true } as never;

  it('gate-11: a row opens the learner', () => {
    const onOpenLearner = vi.fn();
    render(<TeacherApprovalGate students={[waiting]} onApproveStudent={async () => true} onApproveAll={async () => {}} onOpenLearner={onOpenLearner} />);
    fireEvent.click(screen.getByRole('button', { name: 'תלמיד 4' }));
    expect(onOpenLearner).toHaveBeenCalledWith('student_4');
  });

  it('M-gate-opened-msg: approval does not say the meeting is open', () => {
    render(<TeacherApprovalGate students={[approved]} onApproveStudent={async () => true} onApproveAll={async () => {}} />);
    expect(screen.queryByText(/פתוח עבורם/)).toBeNull();
    expect(screen.getByText('ייכנסו כשתפתחו את המפגש לכיתה')).toBeTruthy();
  });
});

describe('clustering-4 — a domain nobody struggles in shows 0', () => {
  it('three cards, each with 0, and the filter can be toggled off', () => {
    const onFilterChange = vi.fn();
    const students = [1, 2].map((n) => ({
      studentId: `student_user${n}`, name: `תלמיד ${n}`, qMatrixResults: {},
      conceptMastery: { decimal_structure: 1, regrouping_fluency: 1, procedural_fluency: 1 },
    })) as never[];
    render(<ClusteringWidgets students={students} activeFilter="decimal_structure" onFilterChange={onFilterChange} />);
    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(3);
    for (const c of cards) expect(c.textContent).toMatch(/^0/);
    fireEvent.click(cards[0]);
    expect(onFilterChange).toHaveBeenCalledWith(null);
  });
});

describe('support-5 — the class-management tab opens the learning conditions', () => {
  it('each learner card has a button that calls onDrillDown with the canonical id', async () => {
    const onDrillDown = vi.fn();
    render(<ClassManagement allStudents={[]} onDrillDown={onDrillDown} />);
    fireEvent.click(await screen.findByRole('button', { name: 'התאמת תנאי למידה — תלמיד 5' }));
    expect(onDrillDown).toHaveBeenCalledWith('student_user5');
  });
});

describe('meeting_control-17 — the picker counts each meeting by itself', () => {
  it('a learner who missed meeting 3 and finished 4 is not counted in meeting 3', () => {
    const finished = (done: number[]) => (m: number) => done.includes(m);
    const rows = buildSessionRows([finished([1, 2, 4]), finished([1, 2, 3, 4]), 2], null);
    expect(rows[2]).toMatchObject({ sessionNumber: 3, completedCount: 1, learnerCount: 3, state: 'partial' });
    expect(rows[3]).toMatchObject({ sessionNumber: 4, completedCount: 2, state: 'partial' });
    expect(rows[0]).toMatchObject({ sessionNumber: 1, completedCount: 3, state: 'completed' });
  });

  it('the dashboard feeds it isMeetingFinished per learner', () => {
    expect(src('presentation/pages/TeacherDashboard.tsx')).toContain('(meeting: number) => isMeetingFinished(s as unknown as Record<string, unknown>, meeting)');
  });
});

describe('source: layout, dead code and wording', () => {
  const dash = src('presentation/pages/TeacherDashboard.tsx');

  it('M-banner-layout / access-9: the banner spans the page; the side menu stands still (md+) and only the page scrolls', () => {
    expect(dash).toContain('overflow-x-clip');
    expect(dash).not.toContain('overflow-x-hidden');
    // md+: the shell is the screen; the menu fills its height; main is the scroller
    // (owner, 6.10.2026: the page scrolled with the window's bar, beyond the menu).
    expect(dash).toContain('min-h-screen md:h-screen');
    expect(dash).toMatch(/<aside [^>]*md:sticky md:top-0 md:self-start md:h-full/);
    expect(dash).toContain('<main className={`flex-1 min-w-0 md:min-h-0 md:h-full overflow-y-auto');
    // The banner comes before the row that holds the menu and the page.
    expect(dash.indexOf('{loadTimedOut && (')).toBeLessThan(dash.indexOf('<div className="flex flex-col md:flex-row flex-1 min-w-0 md:min-h-0">'));
  });

  it('M-banner-text: a refused read gets its own message', () => {
    expect(dash).toContain('לחשבון שבו התחברתם אין הרשאה לנתוני הכיתה. התנתקו והתחברו שוב בחשבון המורה.');
    expect(dash).toContain('/permission[_ -]?denied/i.test(refusal)');
  });

  it('M-dead-topbar: no hideSidebar bar is left', () => {
    expect(dash).not.toContain('hideSidebar');
    expect(dash).not.toContain('Top Sub-Navigation Bar');
  });

  it('access-10 / M-projector-badge / M-drawer-stale-escape', () => {
    expect(dash).toMatch(/<div onClick=\{\(\) => handleTabChange\("heatmap"\)\}[^>]*>\s*<Logo/);
    expect(dash).toContain("window.open('/projector', 'mathmaticore_projector')");
    expect(dash).not.toContain("window.open('/projector', '_blank')");
    expect(dash).toMatch(/useDismissableOverlay<HTMLDivElement>\(\s*deadlineNotice !== null/);
    expect(dash).toMatch(/ref=\{deadlineNoticeRef\}\s*role="dialog"/);
  });

  it('M-wording / clustering-5 / chat-5 / chat-10 / M-quiet-mode', () => {
    expect(dash).not.toContain('שיעור ${sessionNum} הופעל');
    expect(dash).toContain('toast.success(`${meetingShortLabelHe(sessionNum)}: המפגש נפתח לכל תלמידי הכיתה.`)');
    expect(dash).toContain('`${meetingShortLabelHe(pendingActivationSession)}: המפגש כבר פתוח עכשיו.`');
    expect(dash).not.toContain('"שם תלמיד"');
    expect(dash.match(/emptyMessage=\{emptyGroupHe\}/g)).toHaveLength(3);
    expect(dash).not.toContain('זמין כעת לפניות ותמיכה');
    expect(dash).not.toContain('תמונה מצורפת');
    expect(dash).not.toContain('title="מתקשה"');
    expect(dash).toContain('title="שקט חזותי לתלמיד ושחזור מהלכים"');
    expect(dash).toContain('key={normalizeStudentId(floatingChatStudent.studentId)}');
    expect(dash).toContain('ref={adminMessagesScrollRef}');
    expect(dash).toContain("toast.error('ההודעות מההנהלה לא סומנו כנקראו. סגרו את החלון ופתחו אותו שוב.', { id: 'admin-mark-read-failed' })");
  });
});
