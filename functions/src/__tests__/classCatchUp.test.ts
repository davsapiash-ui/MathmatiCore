import { describe, it, expect, vi } from 'vitest';
import { buildClassCatchUpSummary, CATCHUP_EXPORT_COLUMNS, type CatchUpRecord, type CatchUpRound } from '../catchUp';
import { buildClassCsv, buildLearnerRow, readCatchUpRecords } from '../classReport';

/**
 * Catch-up time, part D2 — the class report's catch-up block and CSV columns.
 * Owner, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \ זמן נוסף
 * וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה למפגש הבא".
 */

const round = (over: Partial<CatchUpRound> = {}): CatchUpRound => ({
  action: 'reopen',
  reason: 'slow_pace',
  note: null,
  stopped_at: 'תרגיל 4 מתוך 7',
  recorded_by: 'teacher_uid',
  recorded_at: 1000,
  opened_at: 2000,
  closed_at: 3000,
  closed_by: 'teacher',
  active_minutes: 5,
  ...over,
});
const record = (n: number, rounds: Record<string, CatchUpRound>): Partial<CatchUpRecord> => ({
  student_id: n, session_number: 3, class_id: 'class_1', rounds,
});

describe('buildClassCatchUpSummary', () => {
  it('no records: an empty block, every reason counted 0', () => {
    expect(buildClassCatchUpSummary({})).toEqual({
      learners: [],
      reason_counts: { slow_pace: 0, partial_absence: 0, technical_fault: 0, content_difficulty: 0, other: 0 },
      learners_with_rounds: 0,
      total_minutes: 0,
    });
  });

  it('learners ascending; each learner counted once per reason; minutes and learners with rounds summed', () => {
    const s = buildClassCatchUpSummary({
      11: record(11, { r_1000: round({ reason: 'technical_fault', active_minutes: 7 }) }),
      4: record(4, {
        r_1000: round({ reason: 'slow_pace', active_minutes: 5 }),
        r_5000: round({ reason: 'slow_pace', recorded_at: 5000, opened_at: 6000, closed_at: 7000, active_minutes: 3, note: 'עבד לאט' }),
        r_9000: round({ action: 'continue', reason: 'content_difficulty', recorded_at: 9000, opened_at: null, closed_at: null, closed_by: null, active_minutes: null }),
      }),
      2: record(2, { r_1000: round({ action: 'continue', reason: 'slow_pace', opened_at: null, closed_at: null, closed_by: null, active_minutes: null }) }),
    });
    expect(s.learners.map((l) => l.student_number)).toEqual([2, 4, 11]);
    expect(s.reason_counts).toEqual({ slow_pace: 2, partial_absence: 0, technical_fault: 1, content_difficulty: 1, other: 0 });
    expect(s.learners_with_rounds).toBe(2);
    expect(s.total_minutes).toBe(15);
    const four = s.learners[1];
    expect(four).toEqual({
      student_number: 4,
      rounds: 2,
      minutes: 8,
      reasons: ['slow_pace', 'content_difficulty'],
      note: 'עבד לאט',
      line_he: 'קיבל זמן השלמה: 8 דקות · סיבה: עבד בקצב איטי, התקשה בתוכן · הערה: עבד לאט',
    });
    expect(s.learners[0]).toMatchObject({ rounds: 0, minutes: 0, note: null, line_he: 'לא סיים את המפגש · סיבה: עבד בקצב איטי' });
  });

  it('an open round: not yet in the minutes, the line says so', () => {
    const s = buildClassCatchUpSummary({ 6: record(6, { r_1: round({ closed_at: null, closed_by: null, active_minutes: null }) }) });
    expect(s.learners_with_rounds).toBe(1);
    expect(s.total_minutes).toBe(0);
    expect(s.learners[0].line_he).toBe('מקבל עכשיו זמן השלמה · סיבה: עבד בקצב איטי');
  });

  it('a record without a valid round, or a key that is not a learner number, is not a row', () => {
    const bad = { r_1: { ...round(), reason: 'nonsense' } } as unknown as Record<string, CatchUpRound>;
    const s = buildClassCatchUpSummary({ 3: record(3, bad), 5: null, 7: record(7, {}) });
    expect(s.learners).toEqual([]);
    expect(s.learners_with_rounds).toBe(0);
  });
});

describe('the class CSV catch-up columns', () => {
  const rowOf = (n: number) => buildLearnerRow(n, [], 7, 'green_path', null, null, 0, null, { sessionNumber: 3, allEvents: [] });
  const parse = (line: string) => line.split('","').map((c) => c.replace(/^﻿?"|"$/g, ''));

  it('appended at the END, in the export order; the earlier columns do not move', () => {
    const before = parse(buildClassCsv([rowOf(1)], []).split('\n')[0]);
    const after = parse(buildClassCsv([rowOf(1)], [], { 1: record(1, { r_1: round() }) }).split('\n')[0]);
    expect(after.slice(0, -4)).toEqual(before.slice(0, -4));
    expect(after.slice(-5)).toEqual(['chat_help_requests', ...CATCHUP_EXPORT_COLUMNS]);
    expect([...CATCHUP_EXPORT_COLUMNS]).toEqual(['catchup_rounds', 'catchup_minutes', 'catchup_reason', 'catchup_note']);
  });

  it('values per learner; a learner without a record gets 0, 0, empty, empty', () => {
    const csv = buildClassCsv([rowOf(1), rowOf(2)], [], {
      1: record(1, {
        r_1: round({ reason: 'technical_fault', active_minutes: 4, note: 'המחשב נתקע' }),
        r_2: round({ action: 'continue', reason: 'other', recorded_at: 2000, opened_at: null, closed_at: null, closed_by: null, active_minutes: null }),
      }),
    });
    const [, one, two] = csv.split('\n').map(parse);
    expect(one.slice(-4)).toEqual(['1', '4', 'technical_fault|other', 'המחשב נתקע']);
    expect(two.slice(-4)).toEqual(['0', '0', '', '']);
  });
});

describe('readCatchUpRecords', () => {
  it('reads the twelve documents of the meeting by id and keeps the ones that exist', async () => {
    const ids: string[] = [];
    const db = {
      collection: (name: string) => ({ doc: (id: string) => { ids.push(`${name}/${id}`); return id; } }),
      getAll: vi.fn(async (...refs: string[]) => refs.map((id) => ({
        exists: id === 'session_03_student_4',
        data: () => record(4, { r_1: round() }),
      }))),
    };
    const out = await readCatchUpRecords(db as never, 3);
    expect(ids).toHaveLength(12);
    expect(ids[0]).toBe('catchup_records/session_03_student_1');
    expect(Object.keys(out)).toEqual(['4']);
  });
});
