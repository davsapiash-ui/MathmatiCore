/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * PRD 23 §ב (v7.4):
 *  - "הפקה חוזרת יוצרת קובץ חדש ואינה דורסת את הקודם" and "דוח שהופק לפני
 *    האיפוס נשמר ומסומן 'לפני האיפוס'; דוח שמופק אחרי האיפוס הוא קובץ חדש ואינו
 *    מחליף אותו" — the journey lists every report of the meeting, newest first,
 *    and marks the ones produced before the meeting's last reset.
 *  - "הקישורים להורדתם בתוקף לשעה אחת מרגע יצירתם, כמו הקישור לדוח הלומד" —
 *    the learner report's PDF is opened through a one-hour link asked for on
 *    every opening; generation returns no link.
 *  - Drive: the flat folder "1 דוחות".
 */

const h = vi.hoisted(() => ({
  recordings: null as null | ((sessions: unknown[]) => void),
  events: null as null | ((events: unknown[]) => void),
  reports: [] as unknown[],
  resets: [] as Record<string, unknown>[],
  reportUrl: vi.fn(async (_sessionId: string, _reportId: string) => 'https://signed.example/report.pdf'),
  callableResult: {} as Record<string, unknown>,
  callableArgs: [] as Array<{ name: string; data: unknown }>,
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  whereArgs: [] as unknown[][],
}));

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})), doc: vi.fn(() => ({})), query: vi.fn(() => ({})),
  where: vi.fn((...args: unknown[]) => { h.whereArgs.push(args); return {}; }),
  onSnapshot: vi.fn(() => vi.fn()), getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }),
  getDocs: vi.fn(async () => ({ forEach: (fn: (d: { id: string; data: () => Record<string, unknown> }) => void) => h.docs.forEach((d) => fn({ id: d.id, data: () => d.data })) })),
}));
vi.mock('firebase/database', () => ({ ref: vi.fn(() => ({})), onValue: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_f: unknown, name: string) => vi.fn(async (data: unknown) => { h.callableArgs.push({ name, data }); return { data: h.callableResult }; })),
}));
vi.mock('@/presentation/components/ReplayViewer', () => ({ ReplayViewer: () => null }));

vi.mock('@/infrastructure/services/LearnerJourneyService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/infrastructure/services/LearnerJourneyService')>();
  return {
    ...real,
    subscribeLearnerRecordings: vi.fn((_n: number, onChange: (s: unknown[]) => void) => { h.recordings = onChange; return () => {}; }),
    subscribeLearnerTruncatedMeetings: vi.fn(() => () => {}),
    subscribeLearnerEvents: vi.fn((_n: number, onChange: (e: unknown[]) => void) => { h.events = onChange; return () => {}; }),
    fetchLearnerResets: vi.fn(async () => h.resets),
    fetchLearnerCatchUpLines: vi.fn(async () => new Map()),
    fetchMeetingReports: vi.fn(async () => h.reports),
    fetchMeetingReportUrl: h.reportUrl,
  };
});

import {
  fetchMeetingReports,
  fetchMeetingReportUrl,
  generateMeetingReport,
  isReportBeforeReset,
  newestReportsFirst,
  reportFromData,
  REPORT_BEFORE_RESET_LABEL_HE,
  type JourneyEvent,
} from '@/infrastructure/services/LearnerJourneyService';
import { LearnerJourney } from '../LearnerJourney';

afterEach(cleanup);
beforeEach(() => {
  h.recordings = null; h.events = null; h.reports = []; h.resets = [];
  h.reportUrl.mockClear(); h.callableResult = {}; h.callableArgs.length = 0; h.docs = []; h.whereArgs.length = 0;
});

const SESSION = 'session_4_student_user3';
const T0 = new Date(2026, 9, 1, 12, 0, 0).getTime();
const T_RESET = T0 + 60_000;

const ev = (i: number, over: Partial<JourneyEvent> = {}): JourneyEvent => ({
  id: `e${i}`, timestamp: T0 + i * 1000, sessionNumber: 4, sessionId: SESSION,
  exerciseId: 's4_g_t1', eventType: 'DIGIT_ENTERED', details: { digit_value: 3, is_correct: true }, columnIndex: 0, ...over,
});
const meeting4 = (): JourneyEvent[] => [
  ev(0, { eventType: 'SESSION_START', exerciseId: 'ex_4_01', details: { session_number: 4 } }),
  ev(1, { eventType: 'PROBLEM_LOAD', details: {} }),
  ev(2),
  // After the reset: the learner answered again.
  ev(120),
];
const resetOfMeeting4 = {
  reset_level: 'single_student', reset_scope: 'active_session', session_number: 4, affected_student_ids: [3],
  backup_status: 'success', deletion_status: 'completed', performed_at: T_RESET, reset_reason: 'technical_fault', class_id: 'class_1',
};
const stored = (generatedAt: number, score: number) =>
  reportFromData({ report_id: `rep_${SESSION}_${generatedAt}`, session_id: SESSION, session_number: 4, score_percent: score, generated_at: generatedAt }, SESSION);

describe('the service', () => {
  it('a report produced before the last reset of its meeting is "לפני האיפוס"; one after it is not', () => {
    expect(REPORT_BEFORE_RESET_LABEL_HE).toBe('לפני האיפוס');
    expect(isReportBeforeReset({ generatedAt: T_RESET - 1 }, [{ at: T_RESET }])).toBe(true);
    expect(isReportBeforeReset({ generatedAt: T_RESET + 1 }, [{ at: T_RESET }])).toBe(false);
    expect(isReportBeforeReset({ generatedAt: T_RESET - 1 }, [])).toBe(false);
    // Two resets: before the last one counts.
    expect(isReportBeforeReset({ generatedAt: T_RESET + 1 }, [{ at: T_RESET }, { at: T_RESET + 10 }])).toBe(true);
    expect(isReportBeforeReset({ generatedAt: null }, [{ at: T_RESET }])).toBe(false);
  });

  it('newest first', () => {
    const list = newestReportsFirst([stored(1, 10), stored(3, 30), stored(2, 20)]);
    expect(list.map((r) => r.generatedAt)).toEqual([3, 2, 1]);
  });

  it('reads every report of the meeting — the generations and the old single document — newest first, by the class', async () => {
    h.docs = [
      { id: `rep_${SESSION}`, data: { session_id: SESSION, class_id: 'class_1', session_number: 4, generated_at: 100 } },
      { id: `rep_${SESSION}_300`, data: { report_id: `rep_${SESSION}_300`, session_id: SESSION, class_id: 'class_1', session_number: 4, generated_at: 300 } },
      { id: `rep_${SESSION}_200`, data: { report_id: `rep_${SESSION}_200`, session_id: SESSION, class_id: 'class_1', session_number: 4, generated_at: 200 } },
    ];
    // The page below uses a stand-in; this is the real reader.
    const real = await vi.importActual<typeof import('@/infrastructure/services/LearnerJourneyService')>('@/infrastructure/services/LearnerJourneyService');
    expect(fetchMeetingReports).not.toBe(real.fetchMeetingReports);
    const list = await real.fetchMeetingReports(SESSION);
    expect(list.map((r) => r.reportId)).toEqual([`rep_${SESSION}_300`, `rep_${SESSION}_200`, `rep_${SESSION}`]);
    expect(h.whereArgs).toContainEqual(['class_id', '==', 'class_1']);
    expect(h.whereArgs).toContainEqual(['session_id', '==', SESSION]);
  });

  it('a generated report carries no link and is not "failed" for want of one; its id is the new generation', async () => {
    h.callableResult = {
      status: 'SUCCESS', pdf_stored: true, downloadUrl: null, reportId: `rep_${SESSION}_500`,
      report: { report_id: `rep_${SESSION}_500`, session_id: SESSION, session_number: 4, score_percent: 71, generated_at: 500 },
    };
    const r = await generateMeetingReport({ studentNum: 3, sessionNumber: 4, sessionId: SESSION });
    expect(r.pdfFailureMessage).toBeNull();
    expect(r.reportId).toBe(`rep_${SESSION}_500`);
    expect(r).not.toHaveProperty('downloadUrl');
  });

  it('a PDF the server could not store is said so', async () => {
    h.callableResult = { status: 'DEGRADED_JSON_ONLY', pdf_stored: false, downloadUrl: null, reportId: null, report: { session_id: SESSION, session_number: 4, generated_at: 500 } };
    const r = await generateMeetingReport({ studentNum: 3, sessionNumber: 4, sessionId: SESSION });
    expect(r.pdfFailureMessage).not.toBeNull();
  });
});

describe('the one-hour link', () => {
  it('names the report it opens', async () => {
    const real = await vi.importActual<typeof import('@/infrastructure/services/LearnerJourneyService')>('@/infrastructure/services/LearnerJourneyService');
    h.callableResult = { status: 'SUCCESS', downloadUrl: 'https://signed.example/x.pdf' };
    await expect(real.fetchMeetingReportUrl(SESSION, `rep_${SESSION}_200`)).resolves.toBe('https://signed.example/x.pdf');
    expect(h.callableArgs).toContainEqual({ name: 'getPedagogicalReportDownloadUrl', data: { sessionId: SESSION, reportId: `rep_${SESSION}_200` } });
    // The mocked export stands in for it in the page below.
    expect(fetchMeetingReportUrl).toBe(h.reportUrl);
  });
});

describe('the learner journey keeps every report of the meeting', () => {
  it('lists them newest first, marks the one before the reset, and opens the chosen one through a fresh link', async () => {
    const before = stored(T_RESET - 5_000, 43);
    const after = stored(T_RESET + 200_000, 71);
    h.reports = [after, before];
    h.resets = [resetOfMeeting4];
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    try {
      render(<LearnerJourney studentId="student_user3" />);
      await act(async () => { h.recordings!([]); h.events!(meeting4()); });

      const list = await screen.findByTestId('meeting-report-list');
      const buttons = within(list).getAllByRole('button');
      expect(buttons).toHaveLength(2);
      expect(buttons[0].textContent).not.toContain(REPORT_BEFORE_RESET_LABEL_HE);
      expect(buttons[1].textContent).toContain(REPORT_BEFORE_RESET_LABEL_HE);
      // The newest is shown, and it is not marked.
      expect(screen.getByText('71%')).toBeTruthy();
      expect(screen.queryByTestId('report-before-reset')).toBeNull();

      await act(async () => { fireEvent.click(buttons[1]); });
      expect(screen.getByText('43%')).toBeTruthy();
      expect(screen.getByTestId('report-before-reset').textContent).toBe(REPORT_BEFORE_RESET_LABEL_HE);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /פתחו PDF/ })); });
      await waitFor(() => expect(tab.location.href).toBe('https://signed.example/report.pdf'));
      expect(h.reportUrl).toHaveBeenCalledWith(SESSION, before.reportId);
    } finally {
      open.mockRestore();
    }
  });

  it('one report: no list', async () => {
    h.reports = [stored(T0 + 200_000, 71)];
    render(<LearnerJourney studentId="student_user3" />);
    await act(async () => { h.recordings!([]); h.events!(meeting4()); });
    await screen.findByText('71%');
    expect(screen.queryByTestId('meeting-report-list')).toBeNull();
  });
});

describe('the class report names the Drive folder of PRD 23 §ב', () => {
  it('"1 דוחות", not an old folder name', () => {
    const panel = readFileSync(resolve(__dirname, '../ClassMeetingReportPanel.tsx'), 'utf-8');
    expect(panel).not.toContain('05 דוחות');
    expect(panel.match(/תיקייה "1 דוחות"/g)).toHaveLength(2);
  });
});
