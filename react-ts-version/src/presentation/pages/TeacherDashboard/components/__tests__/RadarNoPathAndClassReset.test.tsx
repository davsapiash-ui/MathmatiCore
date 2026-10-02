/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

/**
 * Live reset audit, 2.10.2026.
 *
 * C2 — after a meeting-2 reset, a full learner reset or a system reset the
 *      radar tile said "המסלול הירוק" of a learner with no path at all. Owner,
 *      28.9.2026: never green by default. The tile now shows the path the gate
 *      approved, by the learner client's own rule, and no path tag without one.
 * C3 — "איפוס המפגש לכיתה" (register deviation 20) is disabled while no class
 *      meeting is open, by the same liveness rule as the rest of the app, and
 *      its tooltip says why.
 */

const meeting = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));

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
    if (r?.path === 'active_class_session') {
      const val = meeting.value;
      cb({ exists: () => val !== null, val: () => val });
    }
    return vi.fn();
  }),
  update: vi.fn().mockResolvedValue(undefined),
  query: vi.fn((r) => r),
  limitToLast: vi.fn((n) => n),
}));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(() => ({})), onSnapshot: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));

import { HeatmapGrid, radarCurrentPathOf, type AnonymousStudent } from '../HeatmapGrid';

const base = (n: number, over: Partial<AnonymousStudent> = {}): AnonymousStudent => ({
  id: `student_${n}`,
  studentNumber: n,
  displayName: `תלמיד ${n}`,
  sessionNumber: 3,
  currentPath: null,
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

const OPEN = () => ({ active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() });

beforeEach(() => {
  meeting.value = OPEN();
});

describe('C2 — the radar names a path only when the gate approved one', () => {
  it('radarCurrentPathOf: no path on a record without an approval, also after a reset', () => {
    expect(radarCurrentPathOf(null)).toBeNull();
    expect(radarCurrentPathOf({})).toBeNull();
    // What a meeting-2 reset leaves behind (buildActiveSessionResetValues).
    expect(radarCurrentPathOf({ pedagogicalPath: null, teacher_selected_path: null, teacher_gate_approved: false, routeRecommendation: 'YELLOW' })).toBeNull();
    // A stale selection without the approval opens nothing.
    expect(radarCurrentPathOf({ teacher_selected_path: 'green_path', teacher_gate_approved: false })).toBeNull();
  });

  it('radarCurrentPathOf: the approved path, from either field the gate writes', () => {
    expect(radarCurrentPathOf({ pedagogicalPath: 'green_path' })).toBe('ירוק');
    expect(radarCurrentPathOf({ pedagogicalPath: 'remediation_path' })).toBe('צמצום פערים');
    expect(radarCurrentPathOf({ teacher_selected_path: 'remediation_path', teacher_gate_approved: true })).toBe('צמצום פערים');
  });

  it('the tile of a learner with no path shows no path tag; an approved one shows its route', () => {
    const students = [base(1), base(2, { currentPath: 'ירוק' }), base(3, { currentPath: 'צמצום פערים' }), ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n, { isOnline: false }))];
    render(<HeatmapGrid initialStudents={students} />);
    expect(within(tile(1)).queryByTestId('tile-path-1')).toBeNull();
    expect(tile(1).textContent).not.toContain('המסלול הירוק');
    expect(within(tile(2)).getByTestId('tile-path-2').textContent).toBe('המסלול הירוק');
    expect(within(tile(3)).getByTestId('tile-path-3').textContent).toBe('מסלול צמצום פערי קדם');
  });

  it('the learner\'s detail panel says the path is not set yet, not green', () => {
    const students = [base(1), ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => base(n, { isOnline: false }))];
    render(<HeatmapGrid initialStudents={students} />);
    fireEvent.click(tile(1));
    expect(screen.getByTestId('detail-current-path').textContent).toBe('עדיין לא נקבע');
  });
});

describe('C3 — the whole-class meeting reset needs an open meeting', () => {
  const students = Array.from({ length: 12 }, (_, i) => base(i + 1, { isOnline: false }));

  it('no meeting open: disabled, and the tooltip says why', () => {
    meeting.value = null;
    render(<HeatmapGrid initialStudents={students} />);
    const button = screen.getByTestId('class-session-reset-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('אין מפגש פתוח לכיתה. אפשר לאפס את המפגש לכל הכיתה רק כשמפגש פתוח.');
  });

  it('a meeting the teacher closed, or one past the teacher-disconnect grace, counts as not open', () => {
    meeting.value = { active: false, status: 'closed', sessionNumber: null };
    const { unmount } = render(<HeatmapGrid initialStudents={students} />);
    expect((screen.getByTestId('class-session-reset-button') as HTMLButtonElement).disabled).toBe(true);
    unmount();
    meeting.value = { ...OPEN(), teacherDisconnectedAt: Date.now() - 60 * 60 * 1000 };
    render(<HeatmapGrid initialStudents={students} />);
    expect((screen.getByTestId('class-session-reset-button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('a meeting open: enabled, with the usual tooltip', () => {
    render(<HeatmapGrid initialStudents={students} />);
    const button = screen.getByTestId('class-session-reset-button') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.title).toBe('מחזיר את כל 12 התלמידים לתחילת המפגש הפתוח. העבודה במפגשים האחרים נשמרת');
  });
});
