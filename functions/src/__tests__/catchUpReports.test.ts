import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { reportCatchUpOf } from '../pedagogicalReport';
import { CATCH_UP_HEADING_HE, CATCH_UP_NOTE_HE, classCatchUpSection, classReportHtml, pedagogicalReportHtml } from '../reportHtml';
import { aggregateClass } from '../classReport';
import { CATCHUP_REASON_HE, type CatchUpRound, type ClassCatchUpSummary } from '../catchUp';

/**
 * Owner decision, 2.10.2026: "המורה יקח את אותם ילדים שלא סיימו למפגש נוסף \
 * זמן נוסף וזה יתועד מה הסיבה לכך ואז אחרי שהם יישרו קו נמשיך עם כל הקבוצה
 * למפגש הבא". The personal report prints the learner's catch-up line for the
 * meeting; the class report prints a row per learner (by number) and the reasons.
 */

const round = (over: Partial<CatchUpRound>): CatchUpRound => ({
  action: 'reopen', reason: 'slow_pace', note: null, stopped_at: 'תרגיל 4 מתוך 7', recorded_by: 'uid_t', recorded_at: 1000,
  opened_at: null, closed_at: null, closed_by: null, active_minutes: null, ...over,
});
const record = (rounds: Record<string, CatchUpRound>) => ({ student_id: 3, session_number: 4, class_id: 'class_1', rounds });

const withRounds = record({
  r_1000: round({ recorded_at: 1000, opened_at: 2000, closed_at: 9000, closed_by: 'teacher', active_minutes: 7, note: 'הגיע באמצע השיעור' }),
  r_10000: round({ recorded_at: 10000, reason: 'technical_fault', opened_at: 11000, closed_at: 15000, closed_by: 'auto_45min', active_minutes: 5 }),
});
const onlyContinue = record({ r_1000: round({ action: 'continue', reason: 'content_difficulty' }) });
const openRound = record({ r_1000: round({ reason: 'partial_absence', opened_at: 2000 }) });

describe('personal report — catch_up field', () => {
  it('rounds that were opened and closed: minutes and every reason', () => {
    const c = reportCatchUpOf(withRounds)!;
    expect(c.rounds).toBe(2);
    expect(c.minutes).toBe(12);
    expect(c.hasOpenRound).toBe(false);
    expect(c.line_he).toBe(`קיבל זמן השלמה: 12 דקות · סיבה: ${CATCHUP_REASON_HE.slow_pace}, ${CATCHUP_REASON_HE.technical_fault} · הערה: הגיע באמצע השיעור`);
  });

  it('only "continue": no catch-up time, the reason is still documented', () => {
    const c = reportCatchUpOf(onlyContinue)!;
    expect(c.rounds).toBe(0);
    expect(c.line_he).toBe(`לא סיים את המפגש · סיבה: ${CATCHUP_REASON_HE.content_difficulty}`);
  });

  it('an open round: the learner is getting catch-up time now', () => {
    const c = reportCatchUpOf(openRound)!;
    expect(c.hasOpenRound).toBe(true);
    expect(c.line_he).toBe(`מקבל עכשיו זמן השלמה · סיבה: ${CATCHUP_REASON_HE.partial_absence}`);
  });

  it('no record: no field', () => {
    expect(reportCatchUpOf(null)).toBeNull();
    expect(reportCatchUpOf(undefined)).toBeNull();
    expect(reportCatchUpOf(record({}))).toBeNull();
  });

  it('the callable reads the learner\'s record of this meeting and stores the field', () => {
    const src = readFileSync(resolve(__dirname, '../pedagogicalReport.ts'), 'utf-8');
    expect(src).toContain('db.collection(CATCHUP_COLLECTION).doc(catchUpDocId(resolvedSessionNumber, clampedStudentNum)).get()');
    expect(src.match(/catch_up: catchUp,/g)?.length).toBe(2);
  });
});

describe('personal report HTML', () => {
  it('prints the line in the card, scored meeting and meeting 1 alike', () => {
    const line = reportCatchUpOf(withRounds)!.line_he;
    expect(pedagogicalReportHtml({ session_number: 4, catch_up: reportCatchUpOf(withRounds) })).toContain(line);
    expect(pedagogicalReportHtml({ meeting_kind: 'sandbox_refresh', session_number: 1, catch_up: reportCatchUpOf(onlyContinue) }))
      .toContain(reportCatchUpOf(onlyContinue)!.line_he);
  });

  it('prints nothing without a record (and on reports stored before it existed)', () => {
    const html = pedagogicalReportHtml({ session_number: 4, catch_up: null });
    expect(html).not.toContain('זמן השלמה');
    expect(html).not.toContain('class="wide catch-up"');
  });

  it('escapes the teacher\'s note', () => {
    const c = reportCatchUpOf(record({ r_1: round({ action: 'continue', note: '<b>x</b>' }) }));
    const html = pedagogicalReportHtml({ session_number: 4, catch_up: c });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).not.toContain('<b>x</b>');
  });
});

describe('class report HTML — catch-up block', () => {
  const summary: ClassCatchUpSummary = {
    learners: [
      { student_number: 3, rounds: 2, minutes: 12, reasons: ['slow_pace', 'technical_fault'], note: 'הגיע באמצע השיעור', line_he: 'x' },
      { student_number: 9, rounds: 0, minutes: 0, reasons: ['slow_pace'], note: null, line_he: 'y' },
    ],
    reason_counts: { slow_pace: 2, partial_absence: 0, technical_fault: 1, content_difficulty: 0, other: 0 },
    learners_with_rounds: 1,
    total_minutes: 12,
  };

  it('a row per learner by number, the reasons summary and the totals', () => {
    const html = classCatchUpSection(summary, `4ד. ${CATCH_UP_HEADING_HE}`);
    expect(html).toContain(`4ד. ${CATCH_UP_HEADING_HE}`);
    expect(html).toContain(CATCH_UP_NOTE_HE);
    expect(html).toContain('<td class="label">תלמיד 3</td>');
    expect(html).toContain('<td class="label">תלמיד 9</td>');
    expect(html).toContain(`${CATCHUP_REASON_HE.slow_pace}, ${CATCHUP_REASON_HE.technical_fault}`);
    expect(html).toContain(`<li><b>${CATCHUP_REASON_HE.slow_pace}:</b> 2 תלמידים</li>`);
    expect(html).toContain(`<li><b>${CATCHUP_REASON_HE.technical_fault}:</b> תלמיד אחד</li>`);
    expect(html).not.toContain(CATCHUP_REASON_HE.partial_absence);
    expect(html).toContain('<b>קיבלו זמן השלמה:</b> תלמיד אחד, 12 דקות בסך הכול');
  });

  it('only "continue" in the class: no totals line, the reasons still printed', () => {
    const html = classCatchUpSection({ ...summary, learners: [summary.learners[1]], learners_with_rounds: 0, total_minutes: 0 }, 'h');
    expect(html).not.toContain('קיבלו זמן השלמה');
    expect(html).toContain(CATCHUP_REASON_HE.slow_pace);
  });

  it('is printed in the class report, and absent without a block', () => {
    const a = aggregateClass([], new Map());
    expect(classReportHtml({ session_number: 4, aggregates: a, learners: [], catch_up: summary })).toContain(`4ד. ${CATCH_UP_HEADING_HE}`);
    expect(classReportHtml({ session_number: 1, aggregates: { ...a, scored: false }, learners: [], catch_up: summary })).toContain(`4ד. ${CATCH_UP_HEADING_HE}`);
    expect(classReportHtml({ session_number: 4, aggregates: a, learners: [] })).not.toContain(CATCH_UP_HEADING_HE);
    expect(classCatchUpSection({ ...summary, learners: [] }, 'h')).toBe('');
  });
});
