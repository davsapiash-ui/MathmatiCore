import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { CATCHUP_REASON_HE, type CatchUpRound } from '@/core/catchUp';

/**
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \
 * זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה
 * למפגש הבא". The learner journey shows, per meeting, the catch-up line read
 * straight from catchup_records/{session_0N_student_K}.
 */

const docs = new Map<string, unknown>();
const failing = new Set<string>();
vi.mock('@/infrastructure/firebase', () => ({
  database: {}, functions: {}, firestore: {}, authReady: Promise.resolve(true),
}));
vi.mock('firebase/database', () => ({ ref: vi.fn(), onValue: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), getDocs: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}` })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    if (failing.has(ref.path)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
    const data = docs.get(ref.path);
    return { exists: () => data !== undefined, data: () => data };
  }),
}));

const { catchUpLineHe, fetchLearnerCatchUpLines } = await import('@/infrastructure/services/LearnerJourneyService');

const round = (over: Partial<CatchUpRound>): CatchUpRound => ({
  action: 'reopen', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 'uid_t', recorded_at: 1000,
  opened_at: null, closed_at: null, closed_by: null, active_minutes: null, ...over,
});
const record = (n: number, rounds: Record<string, CatchUpRound>) => ({ student_id: 5, session_number: n, class_id: 'class_1', rounds });

describe('catchUpLineHe', () => {
  it('rounds opened and closed: the minutes and the reasons', () => {
    expect(catchUpLineHe(record(4, {
      r_1: round({ opened_at: 2, closed_at: 9, active_minutes: 1 }),
      r_2: round({ recorded_at: 2000, reason: 'technical_fault', opened_at: 20, closed_at: 90, active_minutes: 3 }),
    }))).toBe(`קיבל זמן השלמה: 4 דקות · סיבה: ${CATCHUP_REASON_HE.slow_pace}, ${CATCHUP_REASON_HE.technical_fault}`);
  });
  it('only "continue": documented, no catch-up time', () => {
    expect(catchUpLineHe(record(4, { r_1: round({ action: 'continue', reason: 'other', note: 'עזר לחבר' }) })))
      .toBe(`לא סיים את המפגש · סיבה: ${CATCHUP_REASON_HE.other} · הערה: עזר לחבר`);
  });
  it('an open round', () => {
    expect(catchUpLineHe(record(4, { r_1: round({ opened_at: 2 }) }))).toBe(`מקבל עכשיו זמן השלמה · סיבה: ${CATCHUP_REASON_HE.slow_pace}`);
  });
  it('no record', () => {
    expect(catchUpLineHe(null)).toBeNull();
    expect(catchUpLineHe(record(4, {}))).toBeNull();
  });
});

describe('fetchLearnerCatchUpLines', () => {
  beforeEach(() => { docs.clear(); failing.clear(); });

  it('reads each meeting by catchUpDocId and keeps only meetings with a record', async () => {
    docs.set('catchup_records/session_03_student_5', record(3, { r_1: round({ action: 'continue' }) }));
    docs.set('catchup_records/session_07_student_5', record(7, { r_1: round({ opened_at: 2 }) }));
    docs.set('catchup_records/session_04_student_6', record(4, { r_1: round({ action: 'continue' }) }));
    const lines = await fetchLearnerCatchUpLines(5);
    expect([...lines.keys()]).toEqual([3, 7]);
    expect(lines.get(3)).toContain('לא סיים את המפגש');
    expect(lines.get(7)).toContain('מקבל עכשיו זמן השלמה');
  });

  it('a record that cannot be read leaves that meeting without a line, never fails the journey', async () => {
    docs.set('catchup_records/session_02_student_5', record(2, { r_1: round({ action: 'continue' }) }));
    failing.add('catchup_records/session_05_student_5');
    const lines = await fetchLearnerCatchUpLines(5);
    expect([...lines.keys()]).toEqual([2]);
  });

  it('no record at all: an empty map', async () => {
    expect((await fetchLearnerCatchUpLines(5)).size).toBe(0);
  });
});

describe('LearnerJourney screen', () => {
  const journey = readFileSync(resolve(__dirname, '../../presentation/pages/TeacherDashboard/components/LearnerJourney.tsx'), 'utf-8');
  it('reads the lines per learner and shows the selected meeting\'s line', () => {
    expect(journey).toContain('fetchLearnerCatchUpLines(studentNum)');
    expect(journey).toContain('catchUpLines.get(selectedSession)');
    expect(journey).toContain('data-testid="journey-catch-up-line"');
  });
});
