/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * The owner's review of the teacher screens (11.10.2026):
 *  - measure 5 is recorded in the learner panel too ("בחלונית הלומד מתעדים כל אירוע לחוד", PRD Module 18);
 *  - a help call whose HELP_REQUESTED event has not arrived is not cleared: the action waits for the event;
 *  - the research export takes one meeting or all of them;
 *  - the gate band above the radar and the queue lead to the approval on the learner's tile;
 *  - the radar's colours stay the radar's on the teacher screens (PRD Module 18), and nothing on the admin
 *    screens pulses or bounces.
 */
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn(() => vi.fn()),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), onSnapshot: vi.fn(() => vi.fn()) }));
const calls = vi.hoisted(() => [] as Array<{ name: string; data: unknown }>);
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f: unknown, name: string) => async (data: unknown) => {
    calls.push({ name, data });
    return { data: { status: 'SUCCESS', files: {}, rowCounts: {} } };
  }),
}));
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: toastSuccess, error: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.mock('@/infrastructure/services/TeacherMediationService', () => ({
  subscribeMeetingMediationTelemetry: vi.fn(() => () => {}),
  subscribeMediationRecords: vi.fn(() => () => {}),
  saveMediationRecord: vi.fn(async () => null),
}));
const clearHelpRequest = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('@/infrastructure/services/HelpRequestService', () => ({ clearHelpRequest }));

import { HeatmapGrid, focusTileGateApproval, researchExportScopeHe, type AnonymousStudent } from '../HeatmapGrid';
import { MediationQueue } from '../MediationQueue';
import { StudentLearningConditionsDrawer } from '../StudentLearningConditionsDrawer';
import { useTeacherMediationStore } from '@/application/useTeacherMediationStore';
import { clockHe, type MediationEvent } from '@/core/teacherMediation';
import type { StudentData } from '@/application/useStore';

const T = new Date(2026, 9, 11, 9, 7, 0).getTime();
const card1: MediationEvent = { ref: 'log_card_1', studentNumber: 1, kind: 'radar_card_open', at: T + 60_000 };

const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
  id: `student_${n}`, studentNumber: n, displayName: `תלמיד ${n}`, sessionNumber: 4, currentPath: 'ירוק', status: 'active',
  hesitationSeconds: 0, errorCount: 0, enhancedSupport: false, isStruggling: false, isSocraticActive: false,
  helpRequested: false, isOnline: true, ...over,
});

beforeEach(() => {
  calls.length = 0;
  clearHelpRequest.mockClear();
  toastSuccess.mockClear();
  useTeacherMediationStore.setState({ meeting: 4, runStartedAt: T - 600_000, telemetryEvents: [card1], records: [], optimistic: [], expandedLearner: null, pendingAction: {} });
});
afterEach(() => {
  cleanup();
  useTeacherMediationStore.setState({ meeting: null, runStartedAt: null, telemetryEvents: [], records: [], optimistic: [], pendingAction: {} });
});

describe('measure 5 in the learner panel (PRD Module 18)', () => {
  it('"חלונית הלומד" carries "תיעוד התיווך" with this learner\'s events, after the help strip', () => {
    const student = { studentId: 'student_user1', classId: 'class_1', name: '', helpRequested: true } as unknown as StudentData;
    render(<StudentLearningConditionsDrawer student={student} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    const section = within(dialog).getByTestId('mediation-log-section');
    expect(section.textContent).toContain('תיעוד התיווך');
    expect(within(section).getByTestId('mediation-newest').textContent).toContain(`כרטיס החניכה נפתח, ${clockHe(T + 60_000)}`);
    // The help strip comes first.
    const strip = within(dialog).getByText('התלמיד ביקש עזרה');
    expect(strip.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the action queue: a call whose event has not arrived yet', () => {
  it('is not cleared; the action waits, and the question comes once the event is there', async () => {
    useTeacherMediationStore.setState({ telemetryEvents: [] });
    render(<MediationQueue learners={[{ studentNumber: 2, helpRequested: true }]} gateLearners={[]} onOpenGate={() => {}} readOnly={false} teacherId="t" />);
    const item = screen.getByTestId('queue-item');
    await act(async () => { fireEvent.click(within(item).getByTestId('queue-action-approached')); });
    expect(clearHelpRequest).not.toHaveBeenCalled();
    expect(within(item).getByTestId('queue-action-approached').getAttribute('aria-pressed')).toBe('true');
    expect(within(item).queryByTestId('queue-dataled-yes')).toBeNull();

    // The HELP_REQUESTED event arrives.
    await act(async () => {
      useTeacherMediationStore.setState({ telemetryEvents: [{ ref: 'log_help_2', studentNumber: 2, kind: 'help_called', at: T + 5_000 }] });
    });
    await waitFor(() => expect(clearHelpRequest).toHaveBeenCalledWith('student_user2'));
    expect(clearHelpRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('queue-dataled-yes')).toBeTruthy();
  });

  it('with the event there, the action clears the call at once, as before', async () => {
    useTeacherMediationStore.setState({ telemetryEvents: [{ ref: 'log_help_3', studentNumber: 3, kind: 'help_called', at: T + 5_000 }] });
    render(<MediationQueue learners={[{ studentNumber: 3, helpRequested: true }]} gateLearners={[]} onOpenGate={() => {}} readOnly={false} teacherId="t" />);
    await act(async () => { fireEvent.click(screen.getByTestId('queue-action-wrote')); });
    expect(clearHelpRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('queue-dataled-no')).toBeTruthy();
  });
});

describe('the gate leads to the approval on the learner\'s tile', () => {
  it('focusTileGateApproval: false with no gate row on screen; else the first approve button gets the focus', () => {
    expect(focusTileGateApproval(5)).toBe(false);
    const students = [base(5, { isWaitingAtGate: true, recommendedPath: 'ירוק', currentPath: null }), ...[1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n))];
    render(<HeatmapGrid initialStudents={students} />);
    expect(focusTileGateApproval(5)).toBe(true);
    expect(document.activeElement?.getAttribute('data-testid')).toBe('radar-approve-green_path-5');
  });

  it('the queue\'s gate item calls the dashboard, which focuses the tile (no approval of its own)', () => {
    const onOpenGate = vi.fn();
    render(<MediationQueue learners={[]} gateLearners={[7]} onOpenGate={onOpenGate} readOnly={false} teacherId="t" />);
    const gate = screen.getByTestId('queue-gate');
    expect(within(gate).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(gate).getByRole('button'));
    expect(onOpenGate).toHaveBeenCalledWith(7);
    const dash = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');
    expect(dash).toMatch(/const openGateForLearner = \(n: number\) => \{\s*if \(focusTileGateApproval\(n\)\) return;/);
  });
});

describe('the research export: all meetings or one', () => {
  it('a choice beside the button; the chosen meeting is sent as session_number, and the toast names the flat folder "2 נתוני מחקר"', async () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    const scope = screen.getByTestId('research-export-scope') as HTMLSelectElement;
    expect([...scope.options].map((o) => o.textContent)).toEqual(['כל המפגשים', ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `מפגש ${n}`)]);
    expect(scope.value).toBe('all');
    fireEvent.change(scope, { target: { value: '3' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /ייצוא נתוני מחקר/ })); });
    await waitFor(() => expect(calls.some((c) => c.name === 'exportResearchDataset')).toBe(true));
    expect(calls.find((c) => c.name === 'exportResearchDataset')!.data).toEqual({ class_id: 'class_1', session_number: 3 });
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('(מפגש 3)'));
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('"2 נתוני מחקר"'));
    expect(toastSuccess.mock.calls[0][0]).not.toContain('02 נתוני מחקר');
  });

  it('every meeting is "all", the server\'s whole-process scope', async () => {
    render(<HeatmapGrid initialStudents={[base(1)]} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /ייצוא נתוני מחקר/ })); });
    await waitFor(() => expect(calls.some((c) => c.name === 'exportResearchDataset')).toBe(true));
    expect(calls.find((c) => c.name === 'exportResearchDataset')!.data).toEqual({ class_id: 'class_1', session_number: 'all' });
    expect(researchExportScopeHe('all')).toBe('כל המפגשים');
  });
});

describe('the radar tile', () => {
  it('the level tag at every width; the level stripe also while the learner is offline', () => {
    render(<HeatmapGrid initialStudents={[base(1), base(2, { isOnline: false, currentPath: 'צמצום פערים' })]} />);
    const tag = screen.getByTestId('tile-path-1');
    expect(tag.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(tag.className).toContain('truncate');
    expect(tag.getAttribute('title')).toBe(tag.textContent);
    expect(screen.getByTestId('tile-stripe-2')).toBeTruthy();
  });
});

describe('the radar\'s colours are the radar\'s (PRD Module 18); the admin screens are still', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');

  it('unread counters, the close button, the resets and the approve buttons use violet or stone, not red, rose, sky or green', () => {
    const dash = read('../../../TeacherDashboard.tsx');
    expect(dash).toContain('data-testid="live-bar-unread" className="min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-violet-700');
    expect(dash).not.toMatch(/unreadStudentsCount > 0 && \(\s*<span className=\{`shrink-0 bg-rose/);
    expect(dash).toContain('<span className="hidden lg:inline whitespace-nowrap">הודעות מתלמידים</span>');
    for (const p of ['../CloseMeetingChecklist.tsx', '../../ClassManagement.tsx', '../StudentLearningConditionsDrawer.tsx', '../TeacherGateApprovalDrawer.tsx', '../ResetConfirmationModal.tsx']) {
      expect(read(p)).not.toMatch(/\b(?:bg|text|border)-(?:rose|red|sky)-\d/);
    }
    const heat = read('../HeatmapGrid.tsx');
    expect(heat).not.toMatch(/bar: 'bg-(?:sky|rose)-/);
    const colours = read('../../../../../core/routeColors.ts');
    // Green stays the green path's tag (its stripe, dot and chip); its approve buttons are violet.
    expect(colours).toMatch(/green_path: \{[^}]*chip: '[^']*emerald[^}]*buttonOn: 'bg-violet-700[^}]*buttonOff: 'bg-white text-violet-900/);
    expect(colours).not.toMatch(/button(?:On|Off): '[^']*emerald/);
  });

  it('a read-only account gets the same toasts (they only point to the queue)', () => {
    const dash = read('../../../TeacherDashboard.tsx');
    expect(dash).toContain("if (activeTab === 'heatmap' || added.length === 0) return;");
    expect(dash).not.toContain("if (readOnly || activeTab === 'heatmap' || added.length === 0) return;");
  });

  it('no pulse, ping or bounce on the admin chat and the admin wizard', () => {
    for (const p of ['../../../admin/AdminChatView.tsx', '../../../admin/AdminWizardModal.tsx']) {
      expect(read(p)).not.toMatch(/animate-(?:pulse|ping|bounce)/);
    }
  });

  it('"פרטים מזהים", never "(Zero PII)", on the admin screens', () => {
    expect(read('../../../admin/AdminChatView.tsx')).toContain("toast.success(\"ההודעה נשלחה אחרי בדיקת פרטים מזהים.\")");
    expect(read('../../../admin/AdminSupportHubView.tsx')).not.toContain('(Zero PII) בצד השרת');
  });
});
