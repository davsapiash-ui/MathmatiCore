/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * ניהול כיתה ומסלולים (owner, 11.10.2026). Every learner has exactly two levels and the graded mark decides
 * which: the class-management row, the radar's quick approve and the gate drawer offer only the learner's pair,
 * the recommended one marked "מומלץ". The rows sit in two sections, regular and special education.
 */

// The class-management rows read the live list; the radar tests give the grid its learners directly.
const live = vi.hoisted(() => ({ students: {} as Record<string, unknown>, feed: true }));

vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  serverNow: () => Date.now(),
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  onValue: vi.fn((r: { path?: string }, cb: (snap: unknown) => void) => {
    if (r?.path === 'users/students' && live.feed) {
      cb({ exists: () => true, val: () => live.students });
    }
    if (r?.path === 'active_class_session') {
      const val = { active: true, status: 'active', sessionNumber: 2, startedAt: Date.now() };
      cb({ exists: () => true, val: () => val });
    }
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: {} })) }));

import { ClassManagement, SUPPORT_PROFILE_WHEN_HE, CLASS_MANAGEMENT_TITLE_HE } from '../../ClassManagement';
import { HeatmapGrid, type AnonymousStudent } from '../HeatmapGrid';
import { TeacherApprovalGate } from '../TeacherApprovalGate';
import { TeacherGateApprovalDrawer } from '../TeacherGateApprovalDrawer';
import { LEARNER_GROUP_HE, RECOMMENDED_MARK_HE, ROUTE_APPROVE_HE, ROUTE_NAME_HE, TEACHER_GATE_HE } from '@/core/routeLabels';
import { RADAR_CELL_CLASSES } from '@/core/radarColor';
import type { StudentData } from '@/application/useStore';

const approveLabels = (row: HTMLElement) =>
  within(within(row).getByTestId(/^class-row-approve-/))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');

describe('class management: two sections, two buttons per row', () => {
  it('an unmarked learner shows exactly the regular pair, a marked learner exactly the graded pair', () => {
    live.students = {
      student_user1: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', session_score_percent: 30 },
      student_user2: { graded_track: true, completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', session_score_percent: 80 },
    };
    render(<ClassManagement allStudents={[]} />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(CLASS_MANAGEMENT_TITLE_HE);

    const row1 = screen.getByTestId('class-row-1');
    const labels1 = approveLabels(row1);
    expect(labels1).toHaveLength(2);
    expect(labels1[0].startsWith(ROUTE_APPROVE_HE.green_path)).toBe(true);
    expect(labels1[1].startsWith(`${ROUTE_APPROVE_HE.remediation_path} (${RECOMMENDED_MARK_HE})`)).toBe(true);
    expect(labels1.every((l) => l.endsWith('— תלמיד 1'))).toBe(true);
    expect(within(row1).getAllByTestId('recommended-mark')).toHaveLength(1);

    const row2 = screen.getByTestId('class-row-2');
    const labels2 = approveLabels(row2);
    expect(labels2).toHaveLength(2);
    expect(labels2[0].startsWith(`${ROUTE_APPROVE_HE.graded_path} (${RECOMMENDED_MARK_HE})`)).toBe(true);
    expect(labels2[1].startsWith(ROUTE_APPROVE_HE.graded_foundation_path)).toBe(true);
    // Never the other pair.
    expect(labels2.some((l) => l.startsWith(ROUTE_APPROVE_HE.green_path))).toBe(false);
    expect(labels1.some((l) => l.startsWith(ROUTE_APPROVE_HE.graded_path))).toBe(false);
  });

  it('no recommendation: "טרם נקבעה", nothing marked "מומלץ", nothing pressed — the teacher chooses', () => {
    live.students = { student_user8: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL' } };
    render(<ClassManagement allStudents={[]} />);
    const row = screen.getByTestId('class-row-8');
    expect(row.textContent).toContain('טרם נקבעה');
    expect(within(row).queryByTestId('recommended-mark')).toBeNull();
    const buttons = within(within(row).getByTestId('class-row-approve-8')).getAllByRole('button') as HTMLButtonElement[];
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });

  it('the mark decides the section, and each section says how many it holds', () => {
    live.students = { student_user5: { graded_track: true }, student_user9: { graded_track: true } };
    render(<ClassManagement allStudents={[]} />);
    const regular = screen.getByTestId('class-section-regular');
    const graded = screen.getByTestId('class-section-graded');
    expect(regular.textContent).toContain(`${LEARNER_GROUP_HE.regular} (10)`);
    expect(graded.textContent).toContain(`${LEARNER_GROUP_HE.graded} (2)`);
    expect(within(graded).getByTestId('class-row-5')).toBeTruthy();
    expect(within(graded).getByTestId('class-row-9')).toBeTruthy();
    expect(within(regular).queryByTestId('class-row-5')).toBeNull();
  });

  it('the mark is locked once a path is approved; the waiting status names the stage', () => {
    live.students = {
      student_user3: { graded_track: true, teacher_gate_approved: true, routeStatus: 'APPROVED', teacher_selected_path: 'graded_path' },
      student_user4: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL' },
    };
    render(<ClassManagement allStudents={[]} />);
    const mark = screen.getByRole('switch', { name: `${ROUTE_NAME_HE.graded_path} — תלמיד 3` }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);
    expect(screen.getByTestId('class-row-4').textContent).toContain(`ממתין ב${TEACHER_GATE_HE}`);
    // The approved level's stripe on the row's edge, and the pressed button carries its name.
    expect(screen.getByTestId('class-row-stripe-3')).toBeTruthy();
    const pressed = within(screen.getByTestId('class-row-3')).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain(ROUTE_NAME_HE.graded_path);
  });

  it('the profile help is the owner\'s text, beside the column, without a modal', () => {
    live.students = {};
    render(<ClassManagement allStudents={[]} />);
    const help = screen.getByTestId('support-profile-help');
    expect(help.tagName).toBe('DETAILS');
    expect(help.closest('th')?.textContent).toContain('פרופיל תמיכה מוגבר');
    expect(help.textContent).toContain(SUPPORT_PROFILE_WHEN_HE);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the evidence button opens the gate drawer for that learner, and the learner opens the report', () => {
    live.students = { student_user6: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL' } };
    const onOpenGateEvidence = vi.fn();
    const onOpenReport = vi.fn();
    render(<ClassManagement allStudents={[]} onOpenGateEvidence={onOpenGateEvidence} onOpenReport={onOpenReport} />);
    fireEvent.click(screen.getByRole('button', { name: 'ראיות האבחון — תלמיד 6' }));
    expect(onOpenGateEvidence).toHaveBeenCalledWith('student_user6');
    // Only a learner who finished meeting 2 has evidence.
    expect(screen.queryByRole('button', { name: 'ראיות האבחון — תלמיד 7' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'תלמיד 6' }));
    expect(onOpenReport).toHaveBeenCalledWith('student_user6');
  });

  it('the whole-class part of the stage sits at the top of the merged screen', () => {
    live.students = {};
    const unfinished = [{ studentId: 'student_2', anonymousLabel: 'תלמיד 2', currentTask: 4 }];
    render(<ClassManagement allStudents={[]} gate={{ students: [], onApproveAll: vi.fn(), unfinished, onReopenMeeting2: vi.fn() }} />);
    expect(screen.getByRole('heading', { name: TEACHER_GATE_HE })).toBeTruthy();
    expect(screen.getByRole('heading', { name: `${TEACHER_GATE_HE}: תלמידים שהתחילו את המפגש ולא סיימו (1)` })).toBeTruthy();
  });
});

describe('the batch approval approves each waiting learner\'s recommendation', () => {
  it('a marked learner without a recommendation goes to the graded path; an unmarked one waits', () => {
    const onApproveAll = vi.fn().mockResolvedValue(undefined);
    const item = (n: number, over: object) => ({
      studentId: `student_${n}`, anonymousLabel: `תלמיד ${n}`, recommendedPath: null, scorePercent: null,
      isCompleted: true, isApproved: false, ...over,
    });
    render(
      <TeacherApprovalGate
        students={[
          item(1, { recommendedPath: 'graded_foundation_path', gradedTrack: true }),
          item(2, { gradedTrack: true }),
          item(3, {}),
        ] as never}
        onApproveAll={onApproveAll}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'אישור ההמלצה ל-2 מתוך 3 התלמידים הממתינים' }));
    expect(onApproveAll).toHaveBeenCalledWith({ student_1: 'graded_foundation_path', student_2: 'graded_path' });
  });
});

describe('the mark toggled after meeting 2: the recommendation follows the learner\'s current pair', () => {
  // The server wrote the recommendation when meeting 2 ended, before the mark: it belongs to the regular pair.
  const stale = { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', matrix_recommended_path: 'green_path' };

  it('the row marks the graded level on the same line of the diagnostic', () => {
    live.feed = true;
    live.students = { student_user10: { ...stale, graded_track: true }, student_user11: { ...stale, matrix_recommended_path: 'graded_foundation_path' } };
    render(<ClassManagement allStudents={[]} />);
    const marked = approveLabels(screen.getByTestId('class-row-10'));
    expect(marked[0]).toBe(`${ROUTE_APPROVE_HE.graded_path} (${RECOMMENDED_MARK_HE}) — תלמיד 10`);
    expect(screen.getByTestId('class-row-10').textContent).not.toContain(ROUTE_NAME_HE.green_path);
    // The mark removed after a graded recommendation: the regular pair, on the same line.
    const unmarked = approveLabels(screen.getByTestId('class-row-11'));
    expect(unmarked[1]).toBe(`${ROUTE_APPROVE_HE.remediation_path} (${RECOMMENDED_MARK_HE}) — תלמיד 11`);
  });

  it('the drawer preselects the mapped level and offers the current pair only', () => {
    const student = { studentId: 'student_user10', name: 'תלמיד 10', ...stale, graded_track: true } as unknown as StudentData;
    render(<TeacherGateApprovalDrawer student={student} onClose={vi.fn()} />);
    expect(screen.getByTestId('gate-drawer-recommendation').textContent).toBe(ROUTE_NAME_HE.graded_path);
    const options = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('aria-pressed')).toBe('true');
    expect(options[0].textContent).toContain(ROUTE_NAME_HE.graded_path);
    expect(screen.getByRole('button', { name: ROUTE_APPROVE_HE.graded_path })).toBeTruthy();
  });

  it('the batch never approves a path outside the learner\'s pair', () => {
    const onApproveAll = vi.fn().mockResolvedValue(undefined);
    const item = (n: number, over: object) => ({
      studentId: `student_${n}`, anonymousLabel: `תלמיד ${n}`, recommendedPath: null, scorePercent: null,
      isCompleted: true, isApproved: false, ...over,
    });
    render(
      <TeacherApprovalGate
        students={[
          item(1, { recommendedPath: 'green_path', gradedTrack: true }), // a stale reading: left waiting
          item(2, { recommendedPath: 'graded_path', gradedTrack: false }), // a stale reading: left waiting
          item(3, { recommendedPath: 'remediation_path' }),
        ] as never}
        onApproveAll={onApproveAll}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'אישור ההמלצה ל-1 מתוך 3 התלמידים הממתינים' }));
    expect(onApproveAll).toHaveBeenCalledWith({ student_3: 'remediation_path' });
  });

  it('the radar reads the recommendation with the current mark', () => {
    const src = readFileSync(resolve(__dirname, '../HeatmapGrid.tsx'), 'utf-8');
    // recommendedPathOf(data) reads data.graded_track — the mark as it is now.
    expect(src).toContain('const diagnosticPath = recommendedPathOf(data);');
    expect(src).toContain('gradedTrack: data.graded_track === true,');
  });
});

describe('the radar: the learner\'s pair, and the level as a stripe', () => {
  beforeEach(() => { live.feed = false; });
  afterEach(() => { live.feed = true; });

  const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
    id: `student_${n}`, studentNumber: n, displayName: `תלמיד ${n}`, sessionNumber: 3, currentPath: null,
    status: 'active', hesitationSeconds: 0, errorCount: 0, enhancedSupport: false, isStruggling: false,
    isSocraticActive: false, helpRequested: false, lastAction: '', isOnline: true, ...over,
  });

  it('the tile and the strip offer only the learner\'s own two levels, the recommended one marked', () => {
    const students = [
      base(1, { isWaitingAtGate: true, recommendedPath: 'צמצום פערים' }),
      base(2, { isWaitingAtGate: true, recommendedPath: 'מדורג', gradedTrack: true }),
      ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n)),
    ];
    render(<HeatmapGrid initialStudents={students} />);
    const tile1 = screen.getByTestId('gate-row-student-1');
    expect(within(tile1).getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'radar-approve-green_path-1', 'radar-approve-remediation_path-1',
    ]);
    const tile2 = screen.getByTestId('gate-row-student-2');
    expect(within(tile2).getAllByRole('button').map((b) => b.getAttribute('data-testid'))).toEqual([
      'radar-approve-graded_path-2', 'radar-approve-graded_foundation_path-2',
    ]);
    expect(within(tile2).getByRole('button', { name: `${ROUTE_APPROVE_HE.graded_path} (${RECOMMENDED_MARK_HE}) — תלמיד 2` })).toBeTruthy();
    // Two per waiting learner, on the tile and in the strip above the grid.
    expect(screen.getAllByTestId(/^radar-approve-/)).toHaveLength(8);
  });

  it('an approved level is a stripe plus its name; the tile background stays the status colour', () => {
    const students = [base(1, { currentPath: 'יסודות' }), base(2), ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n))];
    render(<HeatmapGrid initialStudents={students} />);
    expect(screen.getByTestId('tile-stripe-1').className).toContain('bg-violet-300');
    expect(screen.getByTestId('tile-path-1').textContent).toBe(ROUTE_NAME_HE.graded_foundation_path);
    expect(screen.queryByTestId('tile-stripe-2')).toBeNull();
    const tile = (n: number) => screen.getAllByRole('button').find((el) => el.getAttribute('aria-label')?.startsWith(`תלמיד ${n}.`))!;
    const colour = tile(1).getAttribute('data-radar-color') as keyof typeof RADAR_CELL_CLASSES;
    for (const cls of RADAR_CELL_CLASSES[colour].split(' ')) expect(tile(1).className).toContain(cls);
    expect(tile(1).className).toBe(tile(2).className);
  });
});

describe('the gate drawer shows the learner\'s two options', () => {
  const learner = (over: Record<string, unknown>) => ({ studentId: 'student_user7', name: 'תלמיד 7', ...over }) as unknown as StudentData;

  it('a marked learner: the graded pair only', () => {
    render(<TeacherGateApprovalDrawer student={learner({ graded_track: true, session_score_percent: 30 })} onClose={vi.fn()} />);
    const options = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(options.map((b) => b.textContent)).toEqual([
      expect.stringContaining(ROUTE_NAME_HE.graded_path),
      expect.stringContaining(ROUTE_NAME_HE.graded_foundation_path),
    ]);
    expect(options[1].textContent).toContain(RECOMMENDED_MARK_HE);
    expect(screen.queryByRole('button', { name: new RegExp(ROUTE_NAME_HE.green_path) })).toBeNull();
  });

  it('an unmarked learner: the regular pair only', () => {
    render(<TeacherGateApprovalDrawer student={learner({ session_score_percent: 80 })} onClose={vi.fn()} />);
    const options = screen.getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toContain(ROUTE_NAME_HE.green_path);
    expect(options[0].textContent).toContain(RECOMMENDED_MARK_HE);
    expect(options[1].textContent).toContain(ROUTE_NAME_HE.remediation_path);
  });
});
