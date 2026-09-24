import { describe, it, expect, vi } from 'vitest';

vi.mock('@/infrastructure/firebase', () => ({
  firestore: {},
  functions: {},
  database: {},
  auth: {},
  authReady: Promise.resolve(),
  serverNow: () => Date.now(),
}));

import { classReportFromData } from '@/infrastructure/services/ClassReportService';
import { reportFromData, describeEvent } from '@/infrastructure/services/LearnerJourneyService';
import { buildSessionCatalog } from '@/presentation/pages/admin/AdminCurriculumView';

/**
 * PRD Module 14 §ב: meeting 1 "אינו מקבל ציון". The teacher's screens show its
 * tools and refresh exercises instead — and never read a missing score as 0%,
 * including on a report stored before the server stopped computing one.
 */
describe('meeting 1 on the teacher dashboard', () => {
  it('the individual report has no score and carries the tools and refresh outcomes', () => {
    const r = reportFromData({
      session_number: 1,
      meeting_kind: 'sandbox_refresh',
      score_percent: null,
      tool_mastery: { used: { drag: 3, decompose: 0, compose: 1, type: 4, undo: 0, trash: 1 }, not_used: ['decompose', 'undo'] },
      exercise_outcomes: { s1_t8: 'after_correction' },
      exercise_titles: { s1_t8: 'חיבור במאונך עם המרה מעל מאה' },
    }, 'session_1_student_4', null);
    expect(r.scorePercent).toBeNull();
    expect(r.sandbox?.outdated).toBe(false);
    expect(r.sandbox?.toolsNotUsed).toEqual(['פירוק לבנה (פריטה)', 'ביטול פעולה']);
    expect(r.sandbox?.refresh).toEqual([{ title: 'חיבור במאונך עם המרה מעל מאה', outcomeHe: 'אחרי תיקון' }]);
  });

  it('a meeting 1 report stored with a score is still shown without one, marked for regeneration', () => {
    const r = reportFromData({ session_number: 1, score_percent: 67, routing_label_he: 'שיח עמיתים' }, 'session_1_student_4', null);
    expect(r.scorePercent).toBeNull();
    expect(r.sandbox?.outdated).toBe(true);
  });

  it('a scored meeting without a number reads null, not 0%', () => {
    const r = reportFromData({ session_number: 4 }, 'session_4_student_4', null);
    expect(r.scorePercent).toBeNull();
    expect(r.sandbox).toBeNull();
    expect(reportFromData({ session_number: 4, score_percent: 57 }, 's', null).scorePercent).toBe(57);
  });

  it('the class report is unscored and lists who never used each tool', () => {
    const c = classReportFromData({
      session_number: 1,
      aggregates: { scored: false, tools_not_used: { drag: [], decompose: [3], compose: [3, 9], type: [], undo: [1, 3, 9], trash: [] } },
    });
    expect(c.scored).toBe(false);
    expect(c.toolsNotUsed.find((t) => t.label === 'ביטול פעולה')?.learners).toEqual([1, 3, 9]);
  });

  it('an old meeting 1 class report is unscored too', () => {
    expect(classReportFromData({ session_number: 1, aggregates: {} }).scored).toBe(false);
    expect(classReportFromData({ session_number: 5, aggregates: {} }).scored).toBe(true);
  });

  it('the teacher timeline reads a press on an empty board as such, not as "0 לבנים ירדו"', () => {
    const ev = (blocks: number) => describeEvent({ eventType: 'BOARD_CLEARED', details: { blocks_removed: blocks } } as any).detail;
    expect(ev(0)).toBe('לחיצה על פח האשפה כשהלוח כבר היה ריק');
    expect(ev(7)).toBe('7 לבנים ירדו מהלוח בבת אחת');
  });

  it('the admin catalog calls meeting 1 refresh exercises, not compulsory tasks', () => {
    const catalog = buildSessionCatalog();
    expect(catalog.find((i) => i.sessionId === 1)?.unscored).toBe(true);
    expect(catalog.filter((i) => i.sessionId !== 1).every((i) => !i.unscored)).toBe(true);
  });
});
