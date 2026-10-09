/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup, screen, act, waitFor } from '@testing-library/react';

/**
 * Teacher-dashboard truth audit (4.10.2026), batch I — the learner journey and
 * the class report panel: the meeting-entry pseudo-exercise, the table that
 * follows the player, Hebrew for every row and every failure, a meeting done
 * over two days, the latest meeting opened by default, the PDF tab opened in
 * the click, meeting-1 reports stored with a score, the Drive copy, and the
 * class panel's card reasons, scaffold counters and fading gap.
 */

const h = vi.hoisted(() => ({
  recordings: null as null | ((sessions: unknown[]) => void),
  events: null as null | ((events: unknown[]) => void),
  eventsError: null as null | ((err: unknown) => void),
  meetingReport: null as unknown,
  classReport: null as unknown,
  reportUrl: 'https://storage.example/report.pdf',
}));

vi.mock('@/infrastructure/firebase', () => ({ database: {}, firestore: {}, functions: {}, authReady: Promise.resolve() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})), doc: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()), getDoc: vi.fn().mockResolvedValue({ exists: () => false, data: () => ({}) }), getDocs: vi.fn().mockResolvedValue({ forEach: () => {} }),
}));
vi.mock('firebase/database', () => ({ ref: vi.fn(() => ({})), onValue: vi.fn(() => vi.fn()) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn().mockResolvedValue({})) }));
vi.mock('@/presentation/components/ReplayViewer', () => ({ ReplayViewer: () => null }));

vi.mock('@/infrastructure/services/LearnerJourneyService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/infrastructure/services/LearnerJourneyService')>();
  return {
    ...real,
    subscribeLearnerRecordings: vi.fn((_n: number, onChange: (s: unknown[]) => void) => { h.recordings = onChange; return () => {}; }),
    subscribeLearnerTruncatedMeetings: vi.fn(() => () => {}),
    subscribeLearnerEvents: vi.fn((_n: number, onChange: (e: unknown[]) => void, onError: (err: unknown) => void) => {
      h.events = onChange; h.eventsError = onError; return () => {};
    }),
    fetchLearnerResets: vi.fn(async () => []),
    fetchLearnerCatchUpLines: vi.fn(async () => new Map()),
    fetchMeetingReports: vi.fn(async () => (h.meetingReport ? [h.meetingReport] : [])),
    fetchMeetingReportUrl: vi.fn(async () => h.reportUrl),
  };
});
vi.mock('@/infrastructure/services/ClassReportService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/infrastructure/services/ClassReportService')>();
  return { ...real, fetchClassReport: vi.fn(async () => h.classReport) };
});

import {
  chapterForChip,
  compulsoryNumbers,
  describeEvent,
  gridReturnIds,
  latestMeetingWithData,
  meetingExerciseIds,
  parseRecordingEvents,
  parseRecordingSessions,
  reportFromData,
  scrollTopToShowRow,
  truncatedMeetingsOf,
  withDaySeparators,
  withResetSeparators,
  EVENTS_READ_ERROR_HE,
  OUTDATED_MEETING1_PDF_HE,
  PDF_BLOCKED_HE,
  DRIVE_COPY_MISSING_HE,
  type JourneyEvent,
  type RecordingSession,
} from '@/infrastructure/services/LearnerJourneyService';
import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { LearnerJourney } from '../LearnerJourney';
import { ClassMeetingReportPanel, countsLineHe, scaffoldsLineHe } from '../ClassMeetingReportPanel';
import { meetingLabelHe as meetingLabel } from '@/core/stationNames';

afterEach(cleanup);
beforeEach(() => { h.recordings = null; h.events = null; h.eventsError = null; h.meetingReport = null; h.classReport = null; });

const DAY = 24 * 60 * 60 * 1000;
// Noon on a weekday, so the two days below are two local dates whatever the zone.
const T0 = new Date(2026, 9, 1, 12, 0, 0).getTime();

const ev = (i: number, over: Partial<JourneyEvent> = {}): JourneyEvent => ({
  id: `e${i}`, timestamp: T0 + i * 1000, sessionNumber: 4, sessionId: 'session_4_student_user3',
  exerciseId: 's4_g_t1', eventType: 'DIGIT_ENTERED', details: { digit_value: 3, is_correct: true }, columnIndex: 0, ...over,
});
const meeting4 = (): JourneyEvent[] => [
  ev(0, { eventType: 'SESSION_START', exerciseId: 'ex_4_01', details: { session_number: 4 } }),
  ev(1, { eventType: 'PROBLEM_LOAD', details: {} }),
  ev(2),
  ev(3, { exerciseId: 's4_g_t2' }),
];

describe('the service', () => {
  it('learner_view-1: entering the meeting (ex_N_01) is not an exercise; the real ones are numbered from 1', () => {
    const ids = meetingExerciseIds(meeting4(), [{ exerciseId: 'ex_4_01', start: T0, end: T0 + 1 }, { exerciseId: 's4_g_t3', start: T0 + 9000, end: T0 + 9999 }]);
    expect(ids).toEqual(['s4_g_t1', 's4_g_t2', 's4_g_t3']);
    expect([...compulsoryNumbers(ids).entries()]).toEqual([['s4_g_t1', 1], ['s4_g_t2', 2], ['s4_g_t3', 3]]);
    expect(compulsoryNumbers(['s4_g_reinforce_1', 's4_g_t1']).get('s4_g_reinforce_1')).toBeUndefined();
  });

  it('PRD 10 §ב: a system opening right after a system close is the grid coming back, not a new 30-second opening', () => {
    const g = (i: number, action: string, source: string) => ev(i, { eventType: 'ADAPTIVE_GRID_TOGGLED', columnIndex: undefined, details: { action, source } });
    const events = [
      g(1, 'opened', 'hesitation_30s'), // 30 seconds
      g(2, 'closed', 'hesitation_30s'), // the card folds it
      g(3, 'opened', 'hesitation_30s'), // back when the card closes
      g(4, 'closed', 'learner'), //        the X
      g(5, 'opened', 'hesitation_30s'), // a new 30-second opening
      g(6, 'closed', 'hesitation_30s'),
      ev(7, { eventType: 'SESSION_START', exerciseId: 'ex_4_01', details: { session_number: 4 } }), // a reload
      g(8, 'opened', 'hesitation_30s'),
    ];
    const returns = gridReturnIds([...events].reverse());
    expect([...returns]).toEqual(['e3']);
    const detail = (e: JourneyEvent) => describeEvent(e, { gridReturn: returns.has(e.id) }).detail;
    expect(detail(events[0])).toBe('נפתח אחרי 30 שניות של היסוס');
    expect(detail(events[2])).toBe('הלוח חזר למסך (אחרי כרטיס החניכה או תרגיל שאינו חיבור)');
    expect(detail(events[4])).toBe('נפתח אחרי 30 שניות של היסוס');
    expect(detail(events[7])).toBe('נפתח אחרי 30 שניות של היסוס');
  });

  it('learner_view-3 / reports-5: grid open and close, effort in Hebrew, a toolbox block is "added"', () => {
    const grid = (details: Record<string, unknown>) => describeEvent(ev(1, { eventType: 'ADAPTIVE_GRID_TOGGLED', details })).detail;
    expect(grid({ action: 'opened', source: 'hesitation_30s' })).toBe('נפתח אחרי 30 שניות של היסוס');
    expect(grid({ action: 'opened', source: 'learner' })).toBe('הלומד החזיר את הלוח');
    expect(grid({ action: 'closed', source: 'learner' })).toBe('הלומד סגר את הלוח');
    // PRD 10 §ב: the grid hidden without the learner closing it (the card's fold, or a non-addition exercise)
    expect(grid({ action: 'closed', source: 'hesitation_30s' })).toBe('הלוח הוסתר בלי שהלומד סגר אותו (כרטיס החניכה או תרגיל שאינו חיבור)');
    const reflection = describeEvent(ev(1, { eventType: 'REFLECTION_SUBMITTED', details: { reflection_step: 3, effort_score: 'HIGH', persistence_index: 80 } })).detail;
    expect(reflection).toBe('שלב 3 · מאמץ רב · תיקון עצמי 80%');
    expect(reflection).not.toMatch(/[A-Z]/);
    expect(describeEvent(ev(1, { eventType: 'BLOCK_DRAG_COMPLETE', columnIndex: 1, details: { block_value: 10, source_column_index: null } })).label).toBe('הוספת לבנה');
    expect(describeEvent(ev(1, { eventType: 'BLOCK_DRAG_COMPLETE', columnIndex: 1, details: { block_value: 10, source_column_index: 1 } })).label).toBe('גרירת לבנה');
    expect(describeEvent(ev(1, { eventType: 'BLOCK_DRAG_COMPLETE', columnIndex: 0, details: { block_value: 1, source_column_index: 1 } })).label).toBe('גרירת לבנה');
  });

  it('learner_view-5: a meeting worked on over two days gets a date row where each day begins', () => {
    const rows = withDaySeparators(withResetSeparators([ev(1), ev(2), ev(3, { timestamp: T0 + DAY }), ev(4, { timestamp: T0 + DAY + 1000 })], []));
    expect(rows.map((r) => r.kind)).toEqual(['day', 'event', 'event', 'day', 'event', 'event']);
    expect(withDaySeparators(withResetSeparators([ev(1), ev(2)], [])).map((r) => r.kind)).toEqual(['event', 'event']);
  });

  it('learner_view-5: the chip jumps to the chapter of the run after the reset', () => {
    const chapters = [
      { exerciseId: 's4_g_t1', start: T0, end: T0 + 5000 },
      { exerciseId: 's4_g_t1', start: T0 + DAY, end: T0 + DAY + 5000 },
    ];
    expect(chapterForChip(chapters, 's4_g_t1', null)?.start).toBe(T0);
    expect(chapterForChip(chapters, 's4_g_t1', T0 + 3 * 60 * 60 * 1000)?.start).toBe(T0 + DAY);
    // The current run has no recording of it yet: the earlier one.
    expect(chapterForChip(chapters, 's4_g_t1', T0 + 2 * DAY)?.start).toBe(T0);
    expect(chapterForChip(chapters, 's4_g_t9', null)).toBeUndefined();
  });

  it('learner_view-7: the latest meeting counts actions-only meetings too', () => {
    expect(latestMeetingWithData([8], [3])).toBe(8);
    expect(latestMeetingWithData([], [3])).toBe(3);
    expect(latestMeetingWithData([], [])).toBeNull();
  });

  it('learner_view-10: an event without a time, or a chapter without a real start, is dropped', () => {
    const session: RecordingSession = {
      id: 'session_1', sessionNumber: 4, start: T0, end: T0 + 1, chunkCount: 1, truncated: false, chapters: [],
      rawChunks: [JSON.stringify([{ type: 3, timestamp: T0 + 10 }, { type: 2 }, null, 'x', { type: 3, timestamp: 'late' }, { type: 3, timestamp: T0 + 5 }])],
    };
    expect(parseRecordingEvents([session]).map((e) => e.timestamp)).toEqual([T0 + 5, T0 + 10]);
    const parsed = parseRecordingSessions({
      session_1: { metadata: { a: { startTime: 'now', exercise_id: 's4_g_t1' }, b: { startTime: T0, endTime: T0 - 5000, exercise_id: 's4_g_t1' }, c: { startTime: 0, exercise_id: 's4_g_t2' } } },
    });
    expect(parsed[0].chapters).toEqual([{ exerciseId: 's4_g_t1', start: T0, end: T0 }]);
  });

  it('learner_view-16: the per-meeting budget flag', () => {
    expect(truncatedMeetingsOf({ meeting_2: { chunks: { a: 1 }, truncated: true }, meeting_4: { chunks: { b: 2 } }, meeting_5: { truncated: true } })).toEqual([2, 5]);
    expect(truncatedMeetingsOf(null)).toEqual([]);
  });

  it('learner_view-2: the table scrolls only when the highlighted row is out of its box', () => {
    const box = { scrollTop: 0, height: 520, headerHeight: 30 };
    expect(scrollTopToShowRow(box, { top: 100, height: 28 })).toBeNull();
    expect(scrollTopToShowRow(box, { top: 900, height: 28 })).toBe(Math.round(900 - 30 - 490 / 3));
    expect(scrollTopToShowRow({ ...box, scrollTop: 1000 }, { top: 1010, height: 28 })).toBe(Math.round(1010 - 30 - 490 / 3));
    expect(scrollTopToShowRow({ ...box, scrollTop: 1000 }, { top: 10, height: 28 })).toBe(0);
  });

  it('reports-11 / reports-13: a meeting-1 report stored with a score, and the Drive copy', () => {
    const old = reportFromData({ session_number: 1, score_percent: 71, session_id: 's' }, 's', null);
    expect(old.scorePercent).toBeNull();
    expect(old.storedPdfOutdated).toBe(true);
    const fresh = reportFromData({ session_number: 1, meeting_kind: 'sandbox_refresh', score_percent: null, tool_mastery: { used: { drag: 1 } }, drive_file_url: 'https://drive.example/x' }, 's', null);
    expect(fresh.storedPdfOutdated).toBe(false);
    expect(fresh.driveUrl).toBe('https://drive.example/x');
    // Just produced: the link is to the new PDF, whatever the stored document says.
    expect(reportFromData({ session_number: 1, score_percent: 71 }, 's', true, null, 'https://drive.example/new').storedPdfOutdated).toBe(false);
    expect(reportFromData({ session_number: 4, score_percent: 71 }, 's', null).driveUrl).toBeNull();
  });

  it('reports-6: the class panel reads the triggers, the categories and the scaffold counters in Hebrew', () => {
    expect(countsLineHe({ hesitation_45s: 6, conversion_not_performed: 2, strange: 1, repeated_errors: 0 }, { hesitation_45s: 'היסוס 45 שניות', conversion_not_performed: 'לא בוצעה המרה נדרשת' }, 'סיבה אחרת'))
      .toBe('היסוס 45 שניות: 6 · לא בוצעה המרה נדרשת: 2 · סיבה אחרת: 1');
    expect(countsLineHe({}, {}, 'x')).toBeNull();
    const r = classReportFromData({ session_number: 4, aggregates: { grid_openings_total: 3, grid_reopenings_total: 1, keyboard_lock_blocks_total: 2, help_requests_total: 4, help_withdrawals_total: 1, chat_help_requests_total: 5, place_cue_scaffolds_total: 6 } });
    expect(scaffoldsLineHe(r.scaffolds)).toBe('לוח החיבור: נפתח 3, הוחזר על ידי הלומד 1 · הקלדה לפני המרה (מקלדת נעולה): 2 · קריאות שקטות למורה: 4 (הלומדים ביטלו 1 מהן) · בקשות עזרה מהצ׳אט: 5 · פיגום בשורת התוצאה: 6');
    expect(scaffoldsLineHe(classReportFromData({ session_number: 4 }).scaffolds)).not.toContain('ביטלו');
  });

  it('reports-7: the fading gap per learner, null outside meeting 8', () => {
    const r = classReportFromData({
      session_number: 8,
      learners: [
        { student_id: 2, fading_gap: { pairs_measured: 3, accuracy_with_blocks_percent: 67, accuracy_without_blocks_percent: 100, mean_seconds_with_blocks: 40.5, mean_seconds_without_blocks: 12, guessed_exercises: ['s8_g_t1'], unpaired_exercises: [] } },
        { student_id: 3, fading_gap: null },
      ],
    });
    expect(r.learners[0].fadingGap).toEqual({ pairsMeasured: 3, accuracyWithBlocksPercent: 67, accuracyWithoutBlocksPercent: 100, meanSecondsWithBlocks: 40.5, meanSecondsWithoutBlocks: 12, guessedExercises: ['s8_g_t1'], unpairedExercises: [] });
    expect(r.learners[1].fadingGap).toBeNull();
  });
});

describe('the learner journey on screen', () => {
  it('learner_view-1/-5/-8: no ex_N_01 chip, numbers from 1, a date row per day, and the table grows live', async () => {
    render(<LearnerJourney studentId="student_user3" />);
    await act(async () => { h.recordings!([]); h.events!(meeting4()); });
    expect(await screen.findByRole('button', { name: /^1\. / })).toBeTruthy();
    expect(screen.queryByText(/ex_4_01/)).toBeNull();
    expect(screen.queryByText(/מס׳ זיהוי 1\b/)).toBeNull();
    expect(screen.getByRole('button', { name: /^2\. / })).toBeTruthy();
    expect(screen.queryAllByTestId('day-separator')).toHaveLength(0);
    // The learner goes on the next day: the table updates on its own, with a date row per day.
    await act(async () => { h.events!([...meeting4(), ev(9, { timestamp: T0 + DAY })]); });
    expect(screen.getByText(/5 פעולות מתועדות/)).toBeTruthy();
    expect(screen.getAllByTestId('day-separator')).toHaveLength(2);
  });

  it('learner_view-7: the recordings arrive first; the default meeting still follows the latest actions', async () => {
    render(<LearnerJourney studentId="student_user3" />);
    const rec: RecordingSession = { id: 'session_1', sessionNumber: 3, start: T0, end: T0 + 60_000, chunkCount: 1, truncated: false, chapters: [], rawChunks: [] };
    // The meeting strip's tiles (the report button also names the meeting).
    const tile = (n: number) => screen.getAllByRole('button').find((b) => b.hasAttribute('aria-pressed') && (b.getAttribute('title') ?? '').startsWith(`מפגש ${n} `))!;
    await act(async () => { h.recordings!([rec]); });
    expect(tile(3).getAttribute('aria-pressed')).toBe('true');
    await act(async () => { h.events!([ev(1, { sessionNumber: 8, sessionId: 'session_8_student_user3', exerciseId: 's8_reflection', eventType: 'REFLECTION_SUBMITTED', details: {} })]); });
    expect(tile(8).getAttribute('aria-pressed')).toBe('true');
    // The teacher's own choice holds against data that arrives later.
    fireEvent.click(tile(3));
    await act(async () => { h.events!([ev(1, { sessionNumber: 8, sessionId: 'session_8_student_user3', exerciseId: 's8_reflection', eventType: 'REFLECTION_SUBMITTED', details: {} }), ev(2, { sessionNumber: 8, sessionId: 'session_8_student_user3' })]); });
    expect(tile(3).getAttribute('aria-pressed')).toBe('true');
  });

  it('learner_view-7: an exercise chip picked before the actions arrive holds the meeting and its filter', async () => {
    render(<LearnerJourney studentId="student_user3" />);
    const tile = (n: number) => screen.getAllByRole('button').find((b) => b.hasAttribute('aria-pressed') && (b.getAttribute('title') ?? '').startsWith(`מפגש ${n} `))!;
    const rec: RecordingSession = {
      id: 'session_1', sessionNumber: 7, start: T0, end: T0 + 60_000, chunkCount: 1, truncated: false,
      chapters: [{ exerciseId: 's7_g_t1', start: T0, end: T0 + 30_000 }], rawChunks: [],
    };
    await act(async () => { h.recordings!([rec]); });
    expect(tile(7).getAttribute('aria-pressed')).toBe('true');
    // The teacher picks the exercise while the actions are still on their way.
    fireEvent.click(screen.getByRole('button', { name: /^1\. / }));
    await act(async () => {
      h.events!([
        ev(1, { sessionNumber: 7, sessionId: 'session_7_student_user3', exerciseId: 's7_g_t1' }),
        ev(2, { sessionNumber: 8, sessionId: 'session_8_student_user3', exerciseId: 's8_g_t1' }),
      ]);
    });
    // The view used to jump to meeting 8 and keep meeting 7's exercise: an empty table.
    expect(tile(7).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('אין פעולות מתועדות למפגש זה.')).toBeNull();
    // The meeting-7 row of the chosen exercise is in the table.
    expect(screen.getByText('3 בטור היחידות — נכון')).toBeTruthy();
  });

  it('learner_view-1: a help request before the first exercise (ex_N_01) is no chip either', () => {
    const ids = meetingExerciseIds([ev(1, { eventType: 'HELP_REQUESTED', exerciseId: 'ex_4_01', details: {} }), ev(2)], []);
    expect(ids).toEqual(['s4_g_t1']);
  });

  it('learner_view-9: a failed read is one Hebrew sentence and no claim that the learner has nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<LearnerJourney studentId="student_user3" />);
    await act(async () => { h.recordings!([]); h.eventsError!(new Error('Missing or insufficient permissions.')); });
    expect(screen.getByRole('alert').textContent).toBe(EVENTS_READ_ERROR_HE);
    expect(screen.queryByText(/Missing or insufficient/)).toBeNull();
    expect(screen.queryByText('עדיין אין פעולות או הקלטות לתלמיד זה.')).toBeNull();
    expect(screen.queryByText(/0 פעולות מתועדות/)).toBeNull();
    expect(screen.queryByText('אין נתונים')).toBeNull();
    warn.mockRestore();
  });

  it('reports-11 / reports-13: a meeting-1 report stored with a score offers no PDF; the Drive line is shown', async () => {
    h.meetingReport = reportFromData({ session_number: 1, score_percent: 71, session_id: 'session_1_student_user3' }, 'session_1_student_user3', null);
    render(<LearnerJourney studentId="student_user3" />);
    await act(async () => { h.recordings!([]); h.events!([ev(1, { sessionNumber: 1, sessionId: 'session_1_student_user3', exerciseId: 's1_sandbox_controlled' })]); });
    expect(await screen.findByTestId('outdated-meeting1-pdf')).toHaveProperty('textContent', OUTDATED_MEETING1_PDF_HE);
    expect(screen.queryByRole('button', { name: /פתחו PDF/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'הפיקו מחדש' })).toBeTruthy();
    expect(screen.getByTestId('learner-report-drive').textContent).toBe(DRIVE_COPY_MISSING_HE);
  });

  it('M-pdf-blocked: the tab opens in the click and gets the link after the wait; a blocked tab is said', async () => {
    h.meetingReport = reportFromData({ session_number: 4, score_percent: 71, session_id: 'session_4_student_user3', drive_file_url: 'https://drive.example/d' }, 'session_4_student_user3', null);
    const tab = { opener: {} as unknown, location: { href: '' }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    render(<LearnerJourney studentId="student_user3" />);
    await act(async () => { h.recordings!([]); h.events!(meeting4()); });
    const link = await screen.findByRole('link', { name: 'עותק בדרייב' });
    expect(link.getAttribute('href')).toBe('https://drive.example/d');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /פתחו PDF/ })); });
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.href).toBe(h.reportUrl));
    expect(tab.opener).toBeNull();

    open.mockReturnValue(null);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /פתחו PDF/ })); });
    expect(await screen.findByText(PDF_BLOCKED_HE)).toBeTruthy();
    open.mockRestore();
  });
});

describe('the class report panel on screen', () => {
  it('reports-6 / reports-7: card reasons, error categories, scaffold counters and the meeting-8 fading gap', async () => {
    h.classReport = classReportFromData({
      session_number: 8,
      generated_at: T0,
      aggregates: {
        socratic_cards_total: 8, socratic_triggers: { hesitation_45s: 6, conversion_not_performed: 2 }, error_categories: { conceptual: 5, calculation: 3 },
        grid_openings_total: 3, grid_reopenings_total: 1, keyboard_lock_blocks_total: 2, help_requests_total: 4, help_withdrawals_total: 0, chat_help_requests_total: 5, place_cue_scaffolds_total: 6,
      },
      learners: [{ student_id: 2, fading_gap: { pairs_measured: 3, accuracy_with_blocks_percent: 67, accuracy_without_blocks_percent: 100, mean_seconds_with_blocks: 40.5, mean_seconds_without_blocks: 12, guessed_exercises: [], unpaired_exercises: ['s8_x'] } }],
    });
    render(<ClassMeetingReportPanel />);
    fireEvent.click(await screen.findByRole('button', { name: meetingLabel(8) }));
    await screen.findByRole('button', { name: 'הפיקו מחדש' });
    fireEvent.click(screen.getByRole('button', { name: /הציגו פירוט כיתתי מלא/ }));
    const cards = screen.getByTestId('class-cards-scaffolds').textContent ?? '';
    expect(cards).toContain('היסוס 45 שניות: 6');
    expect(cards).toContain('לא בוצעה המרה נדרשת: 2');
    expect(cards).toContain('טעות בהבנת ערך המקום: 5');
    expect(cards).toContain('בקשות עזרה מהצ׳אט: 5');
    expect(cards).not.toMatch(/hesitation|conceptual/);
    const fading = screen.getByTestId('class-fading-gap').textContent ?? '';
    expect(fading).toContain('פער הדעיכה');
    expect(fading).toContain('67%');
    expect(fading).toContain('40.5 שנ׳');
    expect(fading).toContain('מתחת ל-15 שנ׳');
  });

  it('PRD 23 §ב: measure 1 is "ציון ניסיון ראשון (מדד 1)" in the class report too — the mean and the table column', async () => {
    h.classReport = classReportFromData({
      session_number: 4,
      generated_at: T0,
      aggregates: { scored: true, score_mean: 57, score_median: 57, score_min: 43, score_max: 71 },
      learners: [{ student_id: 2, score_percent: 71 }, { student_id: 3, score_percent: 43 }],
    });
    render(<ClassMeetingReportPanel />);
    fireEvent.click(await screen.findByRole('button', { name: meetingLabel(4) }));
    await screen.findByRole('button', { name: 'הפיקו מחדש' });
    fireEvent.click(screen.getByRole('button', { name: /הציגו פירוט כיתתי מלא/ }));
    expect(screen.getByText('ממוצע ציון ניסיון ראשון (מדד 1)')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'ציון ניסיון ראשון (מדד 1)' })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'ציון' })).toBeNull();
    expect(screen.queryByText('הצלחה ממוצעת בניסיון ראשון')).toBeNull();
  });

  it('reports-7: no fading-gap table when no learner has one', async () => {
    h.classReport = classReportFromData({ session_number: 4, generated_at: T0, learners: [{ student_id: 2 }] });
    render(<ClassMeetingReportPanel />);
    fireEvent.click(await screen.findByRole('button', { name: meetingLabel(4) }));
    await screen.findByRole('button', { name: 'הפיקו מחדש' });
    expect(screen.queryByTestId('class-fading-gap')).toBeNull();
    expect(screen.getByTestId('class-cards-scaffolds').textContent).toContain('לא נפתח אף כרטיס');
  });
});
