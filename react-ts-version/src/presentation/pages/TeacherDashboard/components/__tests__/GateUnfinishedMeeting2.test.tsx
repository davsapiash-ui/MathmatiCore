/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { TeacherApprovalGate } from '../TeacherApprovalGate';
import { buildUnfinishedMeeting2Item, buildUnfinishedMeeting2Items } from '../../gateEvidence';
import { meetingShortLabelHe } from '@/core/stationNames';
import type { StudentData } from '@/application/useStore';

/**
 * Owner decision, 2.10.2026: a meeting 2 closed by time (the 45-minute cap or
 * the teacher-disconnect window) completes no one and keeps everything — "ומקסימום
 * המורה תוכל לתת להם זמן לסיים מהמקום שהם נמצאים". The learners who started and
 * did not finish used to be in no list: not at the gate, and stuck before
 * meeting 3 with nothing telling the teacher. They are now listed at "שלב
 * החלוקה למסלולים", with one action that opens meeting 2 again.
 */
const learner = (n: number, over: Record<string, unknown> = {}): StudentData => ({
  studentId: `student_user${n}`,
  classId: 'c',
  name: '',
  qMatrixResults: {} as StudentData['qMatrixResults'],
  traceData: {} as StudentData['traceData'],
  completedMeeting2: false,
  routeRecommendation: null,
  routeStatus: null,
  ...over,
} as StudentData);

const inMeeting2 = (taskIdx: number) => ({
  workspaceState: { sessionNumber: 2, flowStatus: 'playing', qflow: { taskIdx, phase: 'primary' } },
});

afterEach(cleanup);

describe('who started meeting 2 and did not finish', () => {
  const students: Record<string, StudentData> = {
    student_user1: learner(1, { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', ...inMeeting2(6) }), // finished
    student_user2: learner(2, inMeeting2(3)),            // stopped on task 4
    student_user3: learner(3, inMeeting2(0)),            // entered, answered nothing
    student_user4: learner(4),                           // reset / never started: no saved meeting-2 work
    student_user5: learner(5, { workspaceState: { sessionNumber: 1, flowStatus: 'playing' } }), // still in meeting 1
  };

  it('lists the learners whose saved work is meeting 2 and who are not completed, with the task they were on', () => {
    expect(buildUnfinishedMeeting2Items(students, {})).toEqual([
      { studentId: 'student_2', anonymousLabel: 'תלמיד 2', currentTask: 4 },
      { studentId: 'student_3', anonymousLabel: 'תלמיד 3', currentTask: 1 },
    ]);
  });

  it('a learner the teacher\'s close completed (session document) is at the gate, not here', () => {
    expect(buildUnfinishedMeeting2Item(2, students, { student_2: { is_completed: true } })).toBeNull();
  });
});

describe('the gate tab shows them, with the reopen action', () => {
  const unfinished = [{ studentId: 'student_2', anonymousLabel: 'תלמיד 2', currentTask: 4 }];
  const base = { students: [], onApproveStudent: vi.fn(), onApproveAll: vi.fn(), unfinished };

  it('meeting 2 closed: the list, what was kept, and one button that opens meeting 2 again', () => {
    const onReopenMeeting2 = vi.fn();
    render(<TeacherApprovalGate {...base} isMeeting2Open={false} onReopenMeeting2={onReopenMeeting2} />);
    expect(screen.getByRole('heading', { name: 'תלמידים שהתחילו את המפגש ולא סיימו (1)' })).toBeTruthy();
    expect(screen.getByText(meetingShortLabelHe(2))).toBeTruthy();
    expect(screen.getByText(/מי שסיים את כל המשימות, או שכבר אישרתם לו מסלול, לא יעשה את המפגש שוב/)).toBeTruthy();
    expect(screen.getByText('תלמיד 2 · עצר במשימה 4 מתוך 7')).toBeTruthy();
    expect(screen.getByText(/וכל מה שעשו נשמר/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `פתחו שוב את ${meetingShortLabelHe(2)}` }));
    expect(onReopenMeeting2).toHaveBeenCalledTimes(1);
  });

  it('meeting 2 open: they are still working, and there is nothing to reopen', () => {
    render(<TeacherApprovalGate {...base} isMeeting2Open onReopenMeeting2={vi.fn()} />);
    expect(screen.getByText(/המפגש פתוח עכשיו, והם עדיין עובדים/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /פתחו שוב/ })).toBeNull();
  });

  it('nobody unfinished: no section', () => {
    render(<TeacherApprovalGate {...base} unfinished={[]} />);
    expect(screen.queryByText(/ולא סיימו/)).toBeNull();
  });
});

describe('the dashboard', () => {
  const dash = readFileSync(resolve(__dirname, '../../../TeacherDashboard.tsx'), 'utf-8');

  it('counts them on the tab once meeting 2 is closed, and reopens through the activation window', () => {
    expect(dash).toContain('buildUnfinishedMeeting2Items(students, firestoreSession2Docs)');
    expect(dash).toContain('(isMeeting2Open ? 0 : unfinishedMeeting2.length)');
    expect(dash).toMatch(/onReopenMeeting2=\{\(\) => \{[\s\S]{0,300}setPendingActivationSession\(2\);/);
  });

  it('the 45-minute close of meeting 2 tells the teacher where they are', () => {
    expect(dash).toContain('מי שלא סיים מופיע בלשונית "${TEACHER_GATE_HE}", ושם אפשר לפתוח שוב את המפגש לכיתה.');
    // Read before the close is written: the SDK raises our own set() on the
    // listener at once, and the record is then the closed one (seen live).
    const read = dash.indexOf('const closedMeeting = Number(lastVal.sessionNumber);');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(dash.indexOf("endedBy: 'auto_45min'"));
    expect(dash).toContain('closedMeeting === 2');
  });
});
