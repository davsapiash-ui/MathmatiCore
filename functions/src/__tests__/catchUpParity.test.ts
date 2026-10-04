import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  CATCHUP_REASON_HE,
  CATCHUP_REASON_KEYS,
  CATCHUP_NOTE_MAX_LENGTH,
  CATCHUP_EXPORT_COLUMNS,
  catchUpDocId,
  catchUpExportCells,
  catchUpSummaryHe,
  summarizeCatchUpRecord,
  type CatchUpRound,
} from '../catchUp';

/**
 * Owner decision, 2.10.2026 (catch-up time): one closed list of reasons, one
 * wording, on the dashboard and in every report. The frontend file is the
 * source; this copy must stay equal to it.
 */
const fe = readFileSync(resolve(__dirname, '../../../react-ts-version/src/core/catchUp.ts'), 'utf-8').replace(/\r\n/g, '\n');

function block(start: string, end: string): string {
  const i = fe.indexOf(start);
  expect(i).toBeGreaterThan(-1);
  return fe.slice(i, fe.indexOf(end, i));
}

describe('catch-up contract: server copy equals the frontend source', () => {
  it('the reason keys, in order', () => {
    const keys = [...block('export const CATCHUP_REASON_KEYS = [', '] as const;').matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...CATCHUP_REASON_KEYS]);
  });

  it('the Hebrew labels', () => {
    const labels = Object.fromEntries(
      [...block('export const CATCHUP_REASON_HE', '};').matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]])
    );
    expect(labels).toEqual({ ...CATCHUP_REASON_HE });
  });

  it('the note cap and the collection', () => {
    expect(fe).toContain(`export const CATCHUP_NOTE_MAX_LENGTH = ${CATCHUP_NOTE_MAX_LENGTH};`);
    expect(fe).toContain("export const CATCHUP_COLLECTION = 'catchup_records';");
  });

  it('the summary sentence is built from the same words', () => {
    for (const phrase of ['לא סיים את המפגש', 'מקבל עכשיו זמן השלמה', 'קיבל זמן השלמה: ', 'דקה אחת', ' · סיבה: ', ' · הערה: ']) {
      expect(fe).toContain(phrase);
    }
  });
});

const round = (over: Partial<CatchUpRound>): CatchUpRound => ({
  action: 'reopen', reason: 'slow_pace', note: null, stopped_at: 'תרגיל 4 מתוך 7', recorded_by: 't1', recorded_at: 1000,
  opened_at: null, closed_at: null, closed_by: null, active_minutes: null, ...over,
});

describe('catch-up summary', () => {
  it('doc id is the session document spelling', () => {
    expect(catchUpDocId(3, 4)).toBe('session_03_student_4');
  });

  it('no record → null and empty export cells', () => {
    expect(summarizeCatchUpRecord(null)).toBeNull();
    expect(catchUpSummaryHe(null)).toBeNull();
    expect(catchUpExportCells(undefined)).toEqual({ catchup_rounds: 0, catchup_minutes: 0, catchup_reason: '', catchup_note: '' });
    expect([...CATCHUP_EXPORT_COLUMNS]).toEqual(['catchup_rounds', 'catchup_minutes', 'catchup_reason', 'catchup_note']);
  });

  it('a closed round: minutes and reason', () => {
    const rec = { rounds: { r_1000: round({ opened_at: 2000, closed_at: 200000, closed_by: 'teacher', active_minutes: 2 }) } };
    expect(summarizeCatchUpRecord(rec)).toEqual({ rounds: 1, minutes: 2, hasOpenRound: false, reasons: ['slow_pace'], notes: [] });
    expect(catchUpSummaryHe(summarizeCatchUpRecord(rec))).toBe('קיבל זמן השלמה: 2 דקות · סיבה: עבד בקצב איטי');
  });

  it('one minute, two reasons, a note, export cells oldest first', () => {
    const rec = {
      rounds: {
        r_3000: round({ recorded_at: 3000, reason: 'technical_fault', note: 'הטאבלט נכבה', opened_at: 4000, closed_at: 9000, active_minutes: 1 }),
        r_1000: round({ recorded_at: 1000, action: 'continue', reason: 'partial_absence' }),
      },
    };
    expect(catchUpSummaryHe(summarizeCatchUpRecord(rec))).toBe('קיבל זמן השלמה: דקה אחת · סיבה: נעדר בחלק מהשיעור, תקלה טכנית · הערה: הטאבלט נכבה');
    expect(catchUpExportCells(rec)).toEqual({ catchup_rounds: 1, catchup_minutes: 1, catchup_reason: 'partial_absence|technical_fault', catchup_note: 'הטאבלט נכבה' });
  });

  it('only "continue": did not finish; a pending reopen does not count as a round', () => {
    const rec = { rounds: { r_1: round({ action: 'continue', reason: 'content_difficulty' }), r_2: round({ recorded_at: 2000 }) } };
    expect(summarizeCatchUpRecord(rec)!.rounds).toBe(0);
    expect(catchUpSummaryHe(summarizeCatchUpRecord(rec))).toBe('לא סיים את המפגש · סיבה: התקשה בתוכן, עבד בקצב איטי');
  });

  it('an open round', () => {
    const rec = { rounds: { r_1: round({ opened_at: 5 }) } };
    expect(catchUpSummaryHe(summarizeCatchUpRecord(rec))).toBe('מקבל עכשיו זמן השלמה · סיבה: עבד בקצב איטי');
  });

  it('a round with an unknown reason is ignored', () => {
    expect(summarizeCatchUpRecord({ rounds: { r: round({ reason: 'toString' as any }) } })).toBeNull();
  });
});
