/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';

/**
 * Owner decision 11.10.2026: a read-only staff account (claim readOnly: true)
 * sees the whole dashboard and changes nothing. Every control that writes is
 * disabled — not hidden — with the title "צפייה בלבד", and a calm banner says so.
 */
const live = vi.hoisted(() => ({ students: {} as Record<string, unknown> }));

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
    if (r?.path === 'users/students') cb({ exists: () => true, val: () => live.students });
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
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({ data: { codes: { 1: '0123' } } })) }));

import { ClassManagement } from '../../ClassManagement';
import { HeatmapGrid, type AnonymousStudent } from '../HeatmapGrid';
import { TeacherApprovalGate } from '../TeacherApprovalGate';
import { TeacherGenderSetting } from '../TeacherGenderSetting';
import { ReadOnlyBanner } from '@/presentation/components/ui/ReadOnlyBanner';
import { READ_ONLY_BANNER_TEXT, READ_ONLY_TITLE, claimsAreReadOnly, useReadOnlyStaffStore } from '@/application/useIsReadOnlyStaff';
import { RESET_ACTION_HE } from '@/core/routeLabels';

const setReadOnly = (v: boolean) => useReadOnlyStaffStore.setState({ readOnly: v });

beforeEach(() => {
  live.students = {
    student_user1: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', session_score_percent: 30 },
    student_user2: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', session_score_percent: 80 },
  };
});
afterEach(() => {
  cleanup();
  setReadOnly(false);
});

describe('the claim', () => {
  it('only readOnly === true marks a read-only sign-in', () => {
    expect(claimsAreReadOnly({ role: 'teacher', readOnly: true })).toBe(true);
    expect(claimsAreReadOnly({ role: 'teacher' })).toBe(false);
    expect(claimsAreReadOnly({ role: 'admin', readOnly: 'true' })).toBe(false);
    expect(claimsAreReadOnly(null)).toBe(false);
  });
});

describe('the banner', () => {
  it('shows the calm line for a read-only sign-in', () => {
    setReadOnly(true);
    render(<ReadOnlyBanner />);
    expect(screen.getByTestId('read-only-banner').textContent).toBe(READ_ONLY_BANNER_TEXT);
    expect(READ_ONLY_BANNER_TEXT).toBe('צפייה בלבד: אפשר לראות הכול, ואי אפשר לשנות דבר.');
  });

  it('is absent for everyone else', () => {
    render(<ReadOnlyBanner />);
    expect(screen.queryByTestId('read-only-banner')).toBeNull();
  });
});

describe('class management, read-only', () => {
  it('every approve button, both switches and the reset are disabled with the title; the learner window stays open', () => {
    setReadOnly(true);
    render(<ClassManagement allStudents={[]} onDrillDown={() => {}} onOpenReport={() => {}} />);
    const row = screen.getByTestId('class-row-1');
    const approve = within(within(row).getByTestId('class-row-approve-1')).getAllByRole('button');
    expect(approve.length).toBe(2);
    for (const b of approve) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
    const switches = within(row).getAllByRole('switch');
    expect(switches.length).toBe(2);
    for (const s of switches) {
      expect((s as HTMLButtonElement).disabled).toBe(true);
      expect(s.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
    const reset = within(row).getByRole('button', { name: new RegExp(RESET_ACTION_HE.learner) });
    expect((reset as HTMLButtonElement).disabled).toBe(true);
    expect(reset.getAttribute('title')).toBe(READ_ONLY_TITLE);
    // Viewing stays: the learner window opens.
    const windowBtn = within(row).getByRole('button', { name: /חלונית הלומד/ });
    expect((windowBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('a normal teacher keeps every control', () => {
    render(<ClassManagement allStudents={[]} />);
    const row = screen.getByTestId('class-row-1');
    for (const s of within(row).getAllByRole('switch')) expect((s as HTMLButtonElement).disabled).toBe(false);
    for (const b of within(within(row).getByTestId('class-row-approve-1')).getAllByRole('button')) {
      expect((b as HTMLButtonElement).disabled).toBe(false);
    }
  });
});

describe('the gate stage, read-only', () => {
  it('the batch approve and the reopen of meeting 2 are disabled', () => {
    setReadOnly(true);
    render(
      <TeacherApprovalGate
        students={[{ studentId: 'student_user1', anonymousLabel: 'תלמיד 1', isApproved: false, recommendedPath: 'green_path' } as never]}
        onApproveAll={vi.fn()}
        unfinished={[{ studentId: 'student_user3', anonymousLabel: 'תלמיד 3', currentTask: 4 } as never]}
        onReopenMeeting2={vi.fn()}
      />
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);
    for (const b of buttons) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
  });
});

describe('the radar, read-only', () => {
  const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
    id: `student_${n}`, studentNumber: n, displayName: `תלמיד ${n}`, sessionNumber: 3, currentPath: null,
    status: 'active', hesitationSeconds: 0, errorCount: 0, enhancedSupport: false, isStruggling: false,
    isSocraticActive: false, helpRequested: false, lastAction: '', isOnline: true, ...over,
  });

  it('the quick approve and every reset in the menu are disabled; the menu itself opens', () => {
    setReadOnly(true);
    const students = [base(1, { isWaitingAtGate: true, recommendedPath: 'צמצום פערים' }), ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n))];
    render(<HeatmapGrid initialStudents={students} />);
    for (const b of screen.getAllByTestId(/^radar-approve-/)) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
    fireEvent.click(screen.getByTestId('reset-menu-button'));
    const menu = screen.getByTestId('reset-menu');
    const resets = within(menu).getAllByRole('button');
    expect(resets.length).toBe(3);
    for (const b of resets) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
      expect(b.getAttribute('title')).toBe(READ_ONLY_TITLE);
    }
  });
});

describe('the teacher-gender setting, read-only', () => {
  it('both choices are disabled', () => {
    setReadOnly(true);
    render(<TeacherGenderSetting />);
    for (const r of screen.getAllByRole('radio')) expect((r as HTMLInputElement).disabled).toBe(true);
  });
});
