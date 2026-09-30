/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  onValue: vi.fn(() => vi.fn()),
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

import { TeacherApprovalGate } from '../TeacherApprovalGate';
import { TeacherGateApprovalDrawer } from '../TeacherGateApprovalDrawer';
import { buildGateStudentItem, buildGateStudentItems, gateLearnerNumber } from '../../gateEvidence';
import { TASKS, Q_FAIL_TAG, diagnosticTaskLabelHe } from '@/core/QMatrix';
import { ROUTE_NAME_HE } from '@/core/routeLabels';
import type { StudentData } from '@/application/useStore';

/**
 * Owner decisions 29.9.2026 on "שלב החלוקה למסלולים" (PRD Module 20: the table
 * shows the matrix recommendation; register: "'טרם נקבעה' כשאין המלצה").
 * A learner who finished meeting 2 but has no recommendation yet used to be
 * shown "מסלול מומלץ: צמצום פערי קדם" in the table and green in the drawer —
 * a default colour presented as the diagnostic's result.
 */
const learner = (n: number, over: Partial<StudentData> & Record<string, unknown> = {}): StudentData => ({
  studentId: `student_user${n}`,
  classId: 'c',
  name: '',
  qMatrixResults: {} as StudentData['qMatrixResults'],
  traceData: {} as StudentData['traceData'],
  completedMeeting2: true,
  routeRecommendation: null,
  routeStatus: 'PENDING_TEACHER_APPROVAL',
  ...over,
} as StudentData);

const failedTask = TASKS[0];
const students: Record<string, StudentData> = {
  // No recommendation anywhere.
  student_user1: learner(1),
  // Recommendation only through the Firestore session-2 document.
  student_user2: learner(2, { qMatrixResults: { [failedTask.id]: Q_FAIL_TAG } as unknown as StudentData['qMatrixResults'] }),
  // Score only on the RTDB record.
  student_user3: learner(3, { session_score_percent: 71 }),
};
const docs = {
  student_2: { is_completed: true, session_score_percent: 29, matrix_recommended_path: 'remediation_path' as const, teacher_gate_approved: false },
};

beforeEach(() => {
  cleanup();
  approveTeacherGate.mockClear();
});

describe('gate evidence: one reading for the table, the drawer and the journey badge', () => {
  it('no recommendation is null, never a default path', () => {
    const one = buildGateStudentItem(1, students, docs);
    expect(one.recommendedPath).toBeNull();
    expect(one.scorePercent).toBeNull();
    expect(one.isCompleted).toBe(true);
  });

  it('the Firestore document comes first; the learner record is the fallback', () => {
    const two = buildGateStudentItem(2, students, docs);
    expect(two.recommendedPath).toBe('remediation_path');
    expect(two.scorePercent).toBe(29);
    expect(two.errorNodes).toEqual([diagnosticTaskLabelHe(failedTask)]);
    const three = buildGateStudentItem(3, students, docs);
    expect(three.recommendedPath).toBe('green_path');
    expect(three.scorePercent).toBe(71);
  });

  it('the drawer finds the learner by any id form the dashboard holds', () => {
    expect(gateLearnerNumber('student_user3')).toBe(3);
    expect(gateLearnerNumber('student_12')).toBe(12);
    expect(gateLearnerNumber('7')).toBe(7);
    expect(gateLearnerNumber('student_user13')).toBeNull();
    expect(gateLearnerNumber('')).toBeNull();
    expect(gateLearnerNumber(undefined)).toBeNull();
  });

  it('the dashboard hands the drawer the same evidence the table uses', () => {
    const dash = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');
    expect(dash).toContain('evidence={gateEvidenceFor(gateStudent.studentId)}');
    expect(dash).toContain('const n = gateLearnerNumber(studentId);');
  });

  it('only learners who finished meeting 2 are rows', () => {
    expect(buildGateStudentItems(students, docs).map((i) => i.studentId)).toEqual(['student_1', 'student_2', 'student_3']);
  });
});

describe('the approvals table', () => {
  it('shows "טרם נקבעה", preselects nothing and keeps the approve button disabled until the teacher chooses', () => {
    const onApproveStudent = vi.fn().mockResolvedValue(true);
    const onApproveAll = vi.fn().mockResolvedValue(undefined);
    render(<TeacherApprovalGate students={buildGateStudentItems(students, docs)} onApproveStudent={onApproveStudent} onApproveAll={onApproveAll} />);

    const row = screen.getByText('תלמיד 1').closest('tr') as HTMLElement;
    expect(within(row).getByText('טרם נקבעה')).toBeTruthy();
    expect(within(row).queryByText(ROUTE_NAME_HE.remediation_path, { selector: 'span' })).toBeNull();
    const select = within(row).getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('');
    const approve = within(row).getByRole('button', { name: /אשרו את המסלול/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);

    fireEvent.change(select, { target: { value: 'remediation_path' } });
    expect(approve.disabled).toBe(false);
    fireEvent.click(approve);
    expect(onApproveStudent).toHaveBeenCalledWith('student_1', 'remediation_path');
  });

  it('a learner with a recommendation keeps it preselected', () => {
    render(<TeacherApprovalGate students={buildGateStudentItems(students, docs)} onApproveStudent={vi.fn()} onApproveAll={vi.fn()} />);
    const row = screen.getByText('תלמיד 2').closest('tr') as HTMLElement;
    expect((within(row).getByRole('combobox') as HTMLSelectElement).value).toBe('remediation_path');
  });

  it('the batch button leaves an undecided learner waiting and says so', () => {
    const onApproveAll = vi.fn().mockResolvedValue(undefined);
    render(<TeacherApprovalGate students={buildGateStudentItems(students, docs)} onApproveStudent={vi.fn()} onApproveAll={onApproveAll} />);
    expect(screen.getByText('לתלמיד אחד טרם נקבעה המלצה. יש לבחור עבורו מסלול בטבלה.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'אישור 2 התלמידים שנקבע להם מסלול' }));
    expect(onApproveAll).toHaveBeenCalledWith({ student_2: 'remediation_path', student_3: 'green_path' });
  });
});

describe('the approval drawer (from the learner journey)', () => {
  it('shows the matrix recommendation, the score and the tasks that need support', () => {
    render(<TeacherGateApprovalDrawer student={students.student_user2} evidence={buildGateStudentItem(2, students, docs)} onClose={vi.fn()} />);
    expect(screen.getByTestId('gate-drawer-recommendation').textContent).toBe(ROUTE_NAME_HE.remediation_path);
    expect(screen.getByTestId('gate-drawer-score').textContent).toBe('29% (7 משימות חובה)');
    expect(screen.getByTestId('gate-drawer-support').textContent).toContain(diagnosticTaskLabelHe(failedTask));
    expect(screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.remediation_path) }).getAttribute('aria-pressed')).toBe('true');
  });

  it('with no recommendation: "טרם נקבעה", nothing preselected, approve disabled until a path is chosen', () => {
    render(<TeacherGateApprovalDrawer student={students.student_user1} evidence={buildGateStudentItem(1, students, docs)} onClose={vi.fn()} />);
    expect(screen.getByTestId('gate-drawer-recommendation').textContent).toBe('טרם נקבעה');
    expect(screen.getByTestId('gate-drawer-score').textContent).toBe('טרם חושב');
    expect(screen.getByTestId('gate-drawer-support').textContent).toBe('לא נמצאו משימות הדורשות חיזוק.');
    expect(screen.getByTestId('gate-drawer-choose-hint')).toBeTruthy();
    const green = screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.green_path) });
    const remediation = screen.getByRole('button', { name: new RegExp(ROUTE_NAME_HE.remediation_path) });
    expect(green.getAttribute('aria-pressed')).toBe('false');
    expect(remediation.getAttribute('aria-pressed')).toBe('false');
    const approve = screen.getByRole('button', { name: /אשרו והפעילו/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);

    fireEvent.click(green);
    expect(approve.disabled).toBe(false);
    expect(screen.queryByTestId('gate-drawer-choose-hint')).toBeNull();
    fireEvent.click(approve);
    expect(approveTeacherGate).toHaveBeenCalledWith('student_user1', 'green_path', null);
  });
});
