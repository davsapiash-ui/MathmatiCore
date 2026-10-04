/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** The server clock runs a minute ahead of this computer's (radar-16). */
const SERVER_AHEAD_MS = 60_000;

const rtdb = vi.hoisted(() => ({
  listeners: new Map<string, (snap: unknown) => void>(),
  values: new Map<string, unknown>(),
}));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  serverNow: () => Date.now() + 60_000,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  // Each path keeps its listener; a test pushes a value with emit().
  onValue: vi.fn((r: { path?: string }, cb: (snap: unknown) => void) => {
    const path = String(r?.path);
    rtdb.listeners.set(path, cb);
    if (rtdb.values.has(path)) {
      const val = rtdb.values.get(path);
      cb({ exists: () => val !== null, val: () => val });
    }
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));
const approveTeacherGate = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/core/teacherGate', () => ({ approveTeacherGate: (...a: unknown[]) => approveTeacherGate(...a) }));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn(), warning: vi.fn() } }));

import { HeatmapGrid, describeRadarCell, TEACHER_OFFLINE_RADAR_HE, type AnonymousStudent } from '../HeatmapGrid';
import { TeacherGateApprovalDrawer, gateApprovedToastHe, ROUTE_CARD_HE } from '../TeacherGateApprovalDrawer';
import { ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
import type { StudentData } from '@/application/useStore';

/**
 * Teacher-dashboard truth audit (2.10.2026), batch C: the radar and the gate
 * drawer. Each test fails on the code before the fix it names.
 */
function emit(path: string, val: unknown) {
  rtdb.values.set(path, val);
  const cb = rtdb.listeners.get(path);
  if (cb) act(() => cb({ exists: () => val !== null, val: () => val }));
}

const serverClock = () => Date.now() + SERVER_AHEAD_MS;

/** A connected learner's record, as the learner's client writes it. */
const liveLearner = (over: Record<string, unknown> = {}) => ({
  isOnline: true,
  lastPing: serverClock(),
  workspaceState: { sessionNumber: 3 },
  ...over,
});

const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
  id: `student_${n}`,
  studentNumber: n,
  displayName: `תלמיד ${n}`,
  sessionNumber: 3,
  currentPath: 'ירוק',
  status: 'active',
  hesitationSeconds: 0,
  errorCount: 0,
  enhancedSupport: false,
  isStruggling: false,
  isSocraticActive: false,
  helpRequested: false,
  lastAction: '',
  isOnline: true,
  ...over,
});

function tile(n: number): HTMLElement {
  return screen.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith(`תלמיד ${n}.`))!;
}

beforeEach(() => {
  cleanup();
  rtdb.listeners.clear();
  rtdb.values.clear();
  rtdb.values.set('active_class_session', { active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() });
  toastSuccess.mockClear();
  approveTeacherGate.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the radar tile', () => {
  it('radar-3: "ביטולים" is the live meeting\'s count, not the diagnostic\'s old one', () => {
    render(<HeatmapGrid />);
    emit('users/students', {
      student_user1: liveLearner({ workspaceState: { sessionNumber: 3, undoCount: 1 }, traceData: { undo_clicks: 5 } }),
    });
    expect(tile(1).textContent).toContain('ביטולים: 1');
  });

  it('radar-6: a hesitating learner in a branch is tagged "היסוס", like the yellow tile', () => {
    render(<HeatmapGrid initialStudents={[base(1, { activeBranch: 'challenge', hesitationSeconds: 120 }), base(2, { activeBranch: 'challenge' })]} />);
    expect(tile(1).getAttribute('data-radar-color')).toBe('YELLOW');
    expect(within(tile(1)).getByTitle(/^היסוס >/)).toBeTruthy();
    expect(within(tile(1)).queryByTitle(/אתגר/)).toBeNull();
    // Without hesitation the branch tag stays.
    expect(within(tile(2)).getByTitle(/אתגר/)).toBeTruthy();
  });

  it('radar-19: a connected learner waiting at the gate in meeting 3 is GREY, not green "פעיל"', () => {
    render(<HeatmapGrid initialStudents={[base(1, { isWaitingAtGate: true, recommendedPath: 'ירוק' }), base(2)]} />);
    expect(tile(1).getAttribute('data-radar-color')).toBe('GREY');
    expect(within(tile(1)).queryByText('פעיל')).toBeNull();
    expect(within(tile(1)).getByTitle('מחובר וממתין לאישור המסלול')).toBeTruthy();
    expect(tile(1).getAttribute('aria-label')).toContain('מחובר וממתין לאישור המסלול');
    // A help call still wins (BLUE > GREY), and a learner not at the gate stays green.
    cleanup();
    render(<HeatmapGrid initialStudents={[base(1, { isWaitingAtGate: true, helpRequested: true }), base(2)]} />);
    expect(tile(1).getAttribute('data-radar-color')).toBe('BLUE');
    expect(tile(2).getAttribute('data-radar-color')).toBe('GREEN');
  });

  it('radar-7: a learner who dropped is "מנותק", never "יצא מהחלון"', () => {
    render(<HeatmapGrid />);
    emit('users/students', {
      student_user1: { isOnline: false, lastPing: 0, hasJoinedSession: true, sessionJoined: true },
    });
    expect(tile(1).textContent).not.toContain('יצא מהחלון');
    expect(within(tile(1)).getByText('מנותק')).toBeTruthy();
    expect(tile(1).getAttribute('aria-label')).toContain('לא מחובר');
  });

  it('radar-16: the hesitation seconds are counted on the server clock', () => {
    render(<HeatmapGrid />);
    emit('users/students', {
      student_user1: liveLearner({ hesitating: { hesitating: true, timestamp: serverClock() - 10_000 } }),
    });
    // 45 at the flag + 10 since; this computer's own clock would have said -5.
    expect(tile(1).textContent).toContain('היסוס: 55 שנ׳');
    const hook = readFileSync(resolve(__dirname, '../../../../../application/useCognitiveHesitationRadar.ts'), 'utf8');
    expect(hook).not.toContain('timestamp: Date.now()');
    expect(hook.match(/timestamp: serverNow\(\)/g)?.length).toBe(2);
  });

  it('M-wording: "מפגש", and the route\'s full name on the approve buttons', () => {
    rtdb.values.set('active_class_session', null);
    render(<HeatmapGrid initialStudents={[base(1, { isOnline: false }), base(2, { isWaitingAtGate: true, recommendedPath: 'ירוק' })]} />);
    expect(tile(1).textContent).toContain('אין מפגש פתוח');
    expect(tile(1).textContent).not.toContain('שיעור');
    const row = within(tile(2)).getByTestId('gate-row-student-2');
    const labels = within(row).getAllByRole('button').map((b) => b.textContent);
    expect(labels).toEqual([ROUTE_NAME_HE.green_path, ROUTE_NAME_HE.remediation_path]);
  });
});

describe('around the radar', () => {
  it('radar-10: the line above the radar promises only what the tile opens', () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    const line = screen.getByText(/לחצו על משבצת/);
    expect(line.textContent).not.toContain('הקלטות');
    expect(line.textContent).not.toContain('מסך התלמיד');
    expect(line.textContent).toContain('פרטי התלמיד');
    expect(describeRadarCell(base(1), true, 45)).not.toContain('מסך התלמיד');
  });

  it('radar-15: the legend\'s help dot breathes only while a learner is calling', () => {
    const { unmount } = render(<HeatmapGrid initialStudents={[base(1)]} />);
    expect(screen.getByTestId('legend-help-dot').className).not.toContain('animate-');
    unmount();
    render(<HeatmapGrid initialStudents={[base(1, { helpRequested: true })]} />);
    expect(screen.getByTestId('legend-help-dot').className).toContain('animate-radar-call');
  });

  it('M-teacher-offline-radar: the teacher\'s own drop is said, and the class does not turn grey', () => {
    vi.useFakeTimers();
    render(<HeatmapGrid />);
    emit('.info/connected', true);
    emit('users/students', { student_user1: liveLearner() });
    expect(tile(1).getAttribute('data-radar-color')).toBe('GREEN');
    expect(screen.queryByTestId('radar-teacher-offline')).toBeNull();

    emit('.info/connected', false);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByTestId('radar-teacher-offline').textContent).toBe(TEACHER_OFFLINE_RADAR_HE);
    expect(tile(1).getAttribute('data-radar-color')).toBe('GREEN');

    // Back online with no fresh heartbeat: now the learner really is offline.
    emit('.info/connected', true);
    act(() => { vi.advanceTimersByTime(3_000); });
    expect(screen.queryByTestId('radar-teacher-offline')).toBeNull();
    expect(tile(1).getAttribute('data-radar-color')).toBe('GREY');
  });

  it('before the first connection nothing says the teacher is offline', () => {
    render(<HeatmapGrid />);
    emit('.info/connected', false);
    expect(screen.queryByTestId('radar-teacher-offline')).toBeNull();
  });
});

describe('M-drawer-stale-escape: the learner window', () => {
  it('follows the live list, and Escape closes it', async () => {
    render(<HeatmapGrid />);
    emit('users/students', { student_user1: liveLearner() });
    fireEvent.click(tile(1));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByTestId('detail-current-path').textContent).toBe('עדיין לא נקבע');
    expect(dialog.textContent).toContain('מפגש 3 מתוך 8');

    emit('users/students', {
      student_user1: liveLearner({
        workspaceState: { sessionNumber: 4 },
        teacher_gate_approved: true,
        pedagogicalPath: 'remediation_path',
        teacher_selected_path: 'remediation_path',
        routeStatus: 'APPROVED',
      }),
    });
    expect(dialog.textContent).toContain('מפגש 4 מתוך 8');
    expect(within(dialog).getByTestId('detail-current-path').textContent).toBe(ROUTE_NAME_HE.remediation_path);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('detail-current-path')).toBeNull());
  });
});

describe('M-gate-opened-msg: what an approval says', () => {
  it('says the learner was approved, not that meeting 3 opened', () => {
    expect(gateApprovedToastHe(4, 'green_path')).toBe(`✓ ${TEACHER_GATE_HE}: תלמיד 4 אושר למסלול הירוק.`);
    expect(gateApprovedToastHe(4, 'remediation_path')).toBe(`✓ ${TEACHER_GATE_HE}: תלמיד 4 אושר למסלול צמצום פערי קדם.`);
  });

  it('the radar\'s quick approval uses it', async () => {
    render(<HeatmapGrid initialStudents={[base(2, { isWaitingAtGate: true, recommendedPath: 'ירוק' })]} />);
    const row = within(tile(2)).getByTestId('gate-row-student-2');
    await act(async () => { fireEvent.click(within(row).getAllByRole('button')[0]); });
    expect(toastSuccess).toHaveBeenCalledWith(gateApprovedToastHe('2', 'green_path'));
    expect(String(toastSuccess.mock.calls[0][0])).not.toContain('נפתח');
  });
});

describe('the gate drawer', () => {
  const learner = (over: Record<string, unknown> = {}): StudentData => ({
    studentId: 'student_user5',
    classId: 'c',
    name: '',
    qMatrixResults: {} as StudentData['qMatrixResults'],
    traceData: {} as StudentData['traceData'],
    completedMeeting2: true,
    routeStatus: 'PENDING_TEACHER_APPROVAL',
    ...over,
  } as StudentData);
  const approved = learner({ routeStatus: 'APPROVED', teacher_gate_approved: true, pedagogicalPath: 'green_path' });

  it('gate-8: an approved learner is shown as approved, with nothing to approve again', () => {
    render(<TeacherGateApprovalDrawer student={approved} onClose={vi.fn()} />);
    expect(screen.getByTestId('gate-drawer-state').textContent).toBe('המסלול אושר');
    expect(screen.queryByText('ממתין להחלטתכם')).toBeNull();
    expect(screen.getByText(`המסלול שאושר: ${ROUTE_NAME_HE.green_path}`)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /אשרו והפעילו/ })).toBeNull();
    const save = screen.getByRole('button', { name: 'המסלול כבר אושר' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('gate-8: choosing the other path offers a change, and saves it', async () => {
    render(<TeacherGateApprovalDrawer student={approved} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.remediation_path) }));
    const change = screen.getByRole('button', { name: 'שנו את המסלול' }) as HTMLButtonElement;
    expect(change.disabled).toBe(false);
    await act(async () => { fireEvent.click(change); });
    expect(approveTeacherGate).toHaveBeenCalledWith('student_user5', 'remediation_path', null);
    expect(toastSuccess).toHaveBeenCalledWith(gateApprovedToastHe('5', 'remediation_path'));
  });

  it('gate-8: a learner not yet approved still waits for the decision', () => {
    render(<TeacherGateApprovalDrawer student={learner()} onClose={vi.fn()} />);
    expect(screen.getByTestId('gate-drawer-state').textContent).toBe('ממתין להחלטתכם');
    expect(screen.getByRole('button', { name: /אשרו והפעילו/ })).toBeTruthy();
  });

  it('gate-9: the cards give each route\'s range (PRD Module 26), without peer teaching', () => {
    render(<TeacherGateApprovalDrawer student={learner()} onClose={vi.fn()} />);
    const green = screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.green_path) });
    const remediation = screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.remediation_path) });
    expect(green.textContent).toContain(ROUTE_CARD_HE.green_path);
    expect(green.textContent).toContain('10,000');
    expect(green.textContent).not.toContain('תלת-ספרתיים');
    expect(remediation.textContent).toContain(ROUTE_CARD_HE.remediation_path);
    expect(remediation.textContent).toContain('1,000');
    expect(remediation.textContent).not.toContain('עמיתים');
  });
});
