/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act, waitFor } from '@testing-library/react';
import type { FakeRealtimeDatabase } from '@/features/workspace/__tests__/fakeRealtimeDatabase';

/**
 * What the teacher's screens keep when she switches — meeting, learner, or the
 * meeting the class has open. Each switch used to carry the previous choice's
 * data into the new one.
 */

const h = vi.hoisted(() => ({ db: null as unknown as FakeRealtimeDatabase }));

vi.mock('firebase/database', async () => {
  const mod = await import('@/features/workspace/__tests__/fakeRealtimeDatabase');
  return mod.firebaseDatabaseModule(() => (h.db ??= new mod.FakeRealtimeDatabase()));
});
vi.mock('@/infrastructure/firebase', () => ({
  database: {},
  firestore: {},
  functions: {},
  auth: { currentUser: null },
  db: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
  isServerClockKnown: () => true,
  fetchServerClockOffset: () => Promise.resolve(0),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
  getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
}));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));
vi.mock('@/presentation/components/ReplayViewer', () => ({ ReplayViewer: () => null }));

const reports = vi.hoisted(() => ({
  generateClass: [] as Array<{ session: number; resolve: (r: unknown) => void }>,
  learnerEvents: {} as Record<number, Promise<unknown[]>>,
  generateMeeting: [] as Array<{ studentNum: number; sessionNumber: number; sessionId: string }>,
}));

vi.mock('@/infrastructure/services/ClassReportService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/infrastructure/services/ClassReportService')>();
  return {
    ...real,
    fetchClassReport: vi.fn(() => Promise.reject(Object.assign(new Error('missing'), { code: 'not-found' }))),
    generateClassReport: vi.fn(
      (session: number) => new Promise((resolve) => reports.generateClass.push({ session, resolve }))
    ),
  };
});

vi.mock('@/infrastructure/services/LearnerJourneyService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/infrastructure/services/LearnerJourneyService')>();
  return {
    ...real,
    subscribeLearnerRecordings: vi.fn(() => () => {}),
    fetchLearnerEvents: vi.fn((studentNum: number) => reports.learnerEvents[studentNum] ?? new Promise(() => {})),
    fetchMeetingReport: vi.fn(() => Promise.resolve(null)),
    generateMeetingReport: vi.fn(async (p: { studentNum: number; sessionNumber: number; sessionId: string }) => {
      reports.generateMeeting.push(p);
      return new Promise(() => {});
    }),
  };
});

import { ClassMeetingReportPanel } from '../ClassMeetingReportPanel';
import { LearnerJourney } from '../LearnerJourney';
import { HeatmapGrid } from '../HeatmapGrid';
import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { meetingLabelHe, meetingShortLabelHe } from '@/core/stationNames';

afterEach(() => {
  cleanup();
  reports.generateClass = [];
  reports.learnerEvents = {};
  reports.generateMeeting = [];
});

describe('class report: a report is shown under the meeting it was made for', () => {
  it('while meeting 2 is being generated, the meeting cannot be switched, and the result lands under 2', async () => {
    render(<ClassMeetingReportPanel />);
    const generate = await screen.findByRole('button', { name: 'הפיקו דוח כיתה למפגש 2' });
    await waitFor(() => expect((generate as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { fireEvent.click(generate); });
    expect(reports.generateClass.map((g) => g.session)).toEqual([2]);

    // The teacher clicks meeting 3 while the server works.
    const three = screen.getByRole('button', { name: meetingLabelHe(3) });
    await act(async () => { fireEvent.click(three); });
    expect(three.getAttribute('aria-pressed')).toBe('false');
    // Still generating: no second run can start.
    expect(screen.getByRole('button', { name: /מעבד את כל פעולות המפגש/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'הפיקו דוח כיתה למפגש 3' })).toBeNull();

    await act(async () => {
      reports.generateClass[0].resolve(classReportFromData({ session_number: 2, generated_at: Date.now() }));
    });
    expect(screen.getByRole('button', { name: meetingLabelHe(2) }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'הפיקו מחדש' })).toBeTruthy();
  });
});

describe('learner journey: a switch of learner starts clean', () => {
  it('learner 3 → learner 5: no events, meeting or report button of learner 3 remain', async () => {
    const ev = (i: number) => ({
      id: `e${i}`, timestamp: 1_790_000_000_000 + i, sessionNumber: 4, sessionId: 'session_4_student_user3',
      exerciseId: 's4_g_t1', eventType: 'digit_input', details: {},
    });
    reports.learnerEvents[3] = Promise.resolve([ev(1), ev(2)]);
    // Learner 5's events are still on their way.
    const { rerender } = render(<LearnerJourney studentId="student_user3" />);
    expect(await screen.findByRole('button', { name: 'הפיקו דוח למפגש 4' })).toBeTruthy();
    expect(screen.getByText(/2 פעולות מתועדות/)).toBeTruthy();

    rerender(<LearnerJourney studentId="student_user5" />);
    expect(screen.getByText('מסע הלמידה של תלמיד 5')).toBeTruthy();
    // Learner 3's decision table and "הפיקו" used to stay, and the server got
    // learner 5's number with learner 3's session id.
    expect(screen.getByText(/0 פעולות מתועדות/)).toBeTruthy();
    const stale = screen.queryByRole('button', { name: 'הפיקו דוח למפגש 4' }) as HTMLButtonElement | null;
    if (stale && !stale.disabled) await act(async () => { fireEvent.click(stale); });
    expect(reports.generateMeeting.filter((p) => p.studentNum === 5 && p.sessionId.includes('student_user3'))).toEqual([]);
    expect(stale === null || stale.disabled).toBe(true);
  });
});

describe('radar: a direct switch of the open meeting reaches the tiles', () => {
  it('3 → 5: a learner with no meeting number of their own shows 5', async () => {
    h.db?.reset();
    render(<HeatmapGrid />);
    act(() => {
      h.db.set('users/students/student_user2', { isOnline: true, onlineStatus: 'active', lastPing: Date.now(), workspaceState: {} });
      h.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 3, startedAt: Date.now() });
    });
    await waitFor(() => expect(screen.getAllByText(meetingShortLabelHe(3)).length).toBeGreaterThan(0));

    act(() => {
      h.db.set('active_class_session', { active: true, status: 'active', sessionNumber: 5, startedAt: Date.now() });
      h.db.update('users/students/student_user2', { lastPing: Date.now() });
    });
    // It used to keep "מפגש 3": isClassSessionActive never changed, so the
    // subscription kept the number it started with.
    await waitFor(() => expect(screen.getAllByText(meetingShortLabelHe(5)).length).toBeGreaterThan(0));
    expect(screen.queryAllByText(meetingShortLabelHe(3))).toEqual([]);
  });
});
