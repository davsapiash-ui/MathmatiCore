import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  computeExerciseOutcomes,
  computeToolMastery,
  isScoredMeeting,
  resolveCompulsoryTotal,
  TOOLS,
} from '../meetingMetrics';
import { aggregateClass, buildClassCsv, buildLearnerRow } from '../classReport';
import { classReportHtml, pedagogicalReportHtml } from '../reportHtml';

/**
 * PRD Module 14 §ב: "מפגש 1 הוא ארגז חול חקירתי ואינו כולל משימות חובה
 * ממוספרות, אינו מקבל ציון, ואינו מפעיל את נוסחת session_score_percent."
 *
 * Owner, 24.9.2026: meeting 1 lets the learner meet the tools and refresh what
 * meeting 2 diagnoses, so a wrong answer there is a real gap. Its reports show
 * the tools and the refresh exercises instead of a score — every path, every
 * renderer.
 */
const src = (f: string) => readFileSync(resolve(__dirname, '..', f), 'utf-8');

const ev = (exercise: string, type: string, extra: Record<string, unknown> = {}, t = 0) => ({
  session_id: 'session_1_student_student_user4',
  student_id: 4,
  exercise_id: exercise,
  event_type: type,
  details: {},
  client_timestamp: 1_000_000 + t,
  ...extra,
});

/** Learner 4 in meeting 1: dragged, trashed, decomposed, typed; never grouped and never undid. */
const learner4 = [
  ev('s1_sandbox_controlled', 'BLOCK_DRAG_COMPLETE', { column_index: 2, details: { block_value: 100, source_column_index: null } }, 1),
  ev('s1_sandbox_controlled', 'BLOCK_DRAG_COMPLETE', { column_index: 2, details: { block_value: 100, source_column_index: 2 } }, 2), // into the trash
  ev('s1_sandbox_controlled', 'PROBLEM_COMPLETE', {}, 3),
  ev('s1_t10', 'REGROUPING_SUCCESS', { column_index: 2, details: { regrouping_type: 'decomposition', duration_ms: 400 } }, 4),
  ev('s1_t10', 'DIGIT_ENTERED', { column_index: 0, details: { digit_value: 2, is_correct: false } }, 5),
  ev('s1_t10', 'DIGIT_ENTERED', { column_index: 0, details: { digit_value: 3, is_correct: true } }, 6),
  ev('s1_t10', 'PROBLEM_COMPLETE', {}, 7),
  ev('s1_t8', 'DIGIT_ENTERED', { column_index: 0, details: { digit_value: 7, is_correct: true } }, 8),
];

describe('meeting 1 is never scored (Module 14 §ב)', () => {
  it('is the one unscored meeting', () => {
    expect(isScoredMeeting(1)).toBe(false);
    for (const n of [2, 3, 4, 5, 6, 7, 8]) expect(isScoredMeeting(n)).toBe(true);
  });

  it('has no compulsory count, so no path can compute a percentage — without touching the database', async () => {
    const noDb = null as unknown as FirebaseFirestore.Firestore;
    await expect(resolveCompulsoryTotal(noDb as any, 1, 'green_path')).resolves.toBeNull();
  });

  it('the score trigger stops before scoring or recommending a path', () => {
    const t = src('sessionTrigger.ts');
    const guard = t.indexOf('if (!isScoredMeeting(sessionNum))');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(t.indexOf('computeFirstAttemptScore('));
    // Nor does a freshly created session document carry an invented 0%.
    expect(t).toContain('session_score_percent: null,');
    expect(t).not.toContain('session_score_percent: 0,');
  });

  it('the individual report builds meeting 1 without a score, a group or a tier', () => {
    const r = src('pedagogicalReport.ts');
    expect(r).toContain('const scoredMeeting = isScoredMeeting(resolvedSessionNumber);');
    expect(r).toContain('const score: number | null = !scoredMeeting');
    expect(r).toContain('const recommendationTier = score === null ? null : resolveRecommendationTier(score);');
    expect(r).toContain('meeting_kind: scoredMeeting ? "scored" : "sandbox_refresh",');
  });

  it('the research export leaves meeting 1\'s score cells empty, even from a stored document', () => {
    expect(src('exportDriveReport.ts')).toContain('session_doc_score_percent: isScoredMeeting(m) ? (sessionDoc?.session_score_percent ?? "") : "",');
  });
});

describe('what meeting 1 measures instead', () => {
  it('tool mastery: a drag into the trash is the trash, not a drag', () => {
    const m = computeToolMastery(learner4);
    expect(m.used).toEqual({ drag: 1, decompose: 1, compose: 0, type: 3, undo: 0, trash: 1 });
    expect(m.not_used).toEqual(['compose', 'undo']);
  });

  it('tool mastery: the group button, undo and clearing the board', () => {
    const m = computeToolMastery([
      ev('x', 'REGROUPING_SUCCESS', { details: { regrouping_type: 'composition' } }),
      ev('x', 'UNDO_EXECUTED'),
      ev('x', 'BOARD_CLEARED'),
    ]);
    expect(m.used.compose).toBe(1);
    expect(m.used.undo).toBe(1);
    expect(m.used.trash).toBe(1);
  });

  it('refresh outcomes: first try, after a wrong digit, not finished', () => {
    expect(computeExerciseOutcomes(learner4)).toEqual({
      s1_sandbox_controlled: 'first_try',
      s1_t10: 'after_correction',
      s1_t8: 'incomplete',
    });
  });

  it('the class row keeps the outcome rule it had (same function now)', () => {
    const row = buildLearnerRow(4, learner4, null, 'green_path', null, null, 0, null, { sessionNumber: 1, allEvents: learner4 });
    expect(row.exercise_outcomes).toEqual(computeExerciseOutcomes(learner4));
    expect(row.tool_mastery.not_used).toEqual(['compose', 'undo']);
  });
});

describe('the meeting 1 class report', () => {
  const stored = { session_score_percent: 0, matrix_recommended_path: 'remediation_path' };
  const row4 = buildLearnerRow(4, learner4, null, 'green_path', stored, null, 0, null, { sessionNumber: 1, allEvents: learner4 });
  const row7 = buildLearnerRow(7, [ev('s1_t8', 'UNDO_EXECUTED', {}, 1)], null, 'green_path', null, null, 0, null, { sessionNumber: 1, allEvents: [] });
  const a = aggregateClass([row4, row7], new Map([[4, learner4]]), 1);

  it('no score, no tier — even when a stored document carries a number', () => {
    expect(row4.score_percent).toBeNull();
    expect(row4.recommendation_tier).toBeNull();
    expect(row4.session_doc_score_percent).toBeNull();
  });

  it('is unscored, lists nobody as "without score", and has no groups or mean', () => {
    expect(a.scored).toBe(false);
    expect(a.learners_without_score).toEqual([]);
    expect(a.score_mean).toBeNull();
    expect(Object.values(a.tiers).flat()).toEqual([]);
  });

  it('names per tool the learners who never operated it', () => {
    expect(a.tools_not_used.undo).toEqual([4]);
    expect(a.tools_not_used.drag).toEqual([7]);
  });

  it('averages active minutes over every learner with data, not over the scored ones', () => {
    // Was divided by the number of scored learners: always 0 in meeting 1.
    const withMinutes = [{ ...row4, active_minutes: 10 }, { ...row7, active_minutes: 20 }];
    expect(aggregateClass(withMinutes, new Map(), 1).active_minutes_mean).toBe(15);
  });

  it('prints the tools and the "before the diagnostic" analysis, and no score anywhere', () => {
    const html = classReportHtml({ session_number: 1, title_he: 'דוח כיתה', aggregates: a, learners: [row4, row7] });
    expect(html).toContain('שליטה בכלי המערכת לקראת האבחון');
    expect(html).toContain('ניתוח הבינה: לקראת האבחון');
    expect(html).not.toContain('ציון ממוצע');
    expect(html).not.toContain('קבוצות עבודה לפי כלל האחוזים');
    expect(html).not.toContain('על מנהל המערכת לפרסם');
  });

  it('the research CSV keeps every existing column in place and appends the tools last', () => {
    const csv = buildClassCsv([row4], a.exercises);
    const header = csv.split('\n')[0];
    expect(header.startsWith('﻿"student_id","learning_path","score_percent"')).toBe(true);
    expect(header.endsWith(TOOLS.map((t) => `"tool_${t}"`).join(','))).toBe(true);
  });

  it('a scored meeting still prints the working groups', () => {
    const scoredA = aggregateClass([row4], new Map(), 4);
    expect(scoredA.scored).toBe(true);
    const html = classReportHtml({ session_number: 4, title_he: 'דוח כיתה', aggregates: scoredA, learners: [row4] });
    expect(html).toContain('קבוצות עבודה לפי כלל האחוזים');
  });
});

describe('the meeting 1 individual report (Chromium template)', () => {
  const report = {
    title_he: 'דוח היכרות וריענון, מפגש 1',
    anonymous_student_label: 'תלמיד 4',
    session_number: 1,
    meeting_kind: 'sandbox_refresh',
    score_percent: null,
    tool_mastery: computeToolMastery(learner4),
    exercise_outcomes: computeExerciseOutcomes(learner4),
    exercise_titles: { s1_t10: 'תרגול חיסור: פריטת עשרות' },
    exercise_narratives: [],
    knowledge_gaps: [],
    teaching_recommendations: [],
  };
  const html = pedagogicalReportHtml(report);

  it('shows tools, refresh exercises and "before the diagnostic"', () => {
    expect(html).toContain('שליטה בכלי המערכת');
    expect(html).toContain('ביטול פעולה');
    expect(html).toContain('לא הופעל');
    expect(html).toContain('הופעל פעם אחת');
    expect(html).toContain('תרגול חיסור: פריטת עשרות');
    expect(html).toContain('אחרי תיקון');
    expect(html).toContain('לקראת האבחון');
  });

  it('shows no score, no group and no path', () => {
    expect(html).not.toContain('ציון שליטה');
    expect(html).not.toContain('קבוצת למידה');
    expect(html).not.toContain('מסלול מומלץ');
    expect(html).not.toContain('null%');
  });
});

describe('the AI engine is told meeting 1 has no score', () => {
  it('individual and class instructions forbid a score, a group and a path', () => {
    for (const f of ['reportAnalysis.ts', 'classReport.ts']) {
      const s = src(f);
      expect(s).toContain('אל תציין ציון, אחוז, דירוג, קבוצת עבודה או מסלול. במפגש זה אין כאלה.');
    }
    expect(src('reportAnalysis.ts')).toContain('req.recommendation_tier === null');
    expect(src('classReport.ts')).toContain('scored ? buildClassSystemInstruction() : buildSandboxClassSystemInstruction()');
  });
});

describe('the pdfkit rollback renderers print meeting 1 without throwing', () => {
  it('individual and class', async () => {
    const { createPedagogicalReportPdfBufferWithPdfkit } = await import('../pedagogicalReport');
    const { createClassReportPdfBufferWithPdfkit } = await import('../classReport');
    const individual = await createPedagogicalReportPdfBufferWithPdfkit({
      title_he: 'דוח היכרות וריענון, מפגש 1', anonymous_student_label: 'תלמיד 4', session_number: 1,
      meeting_kind: 'sandbox_refresh', score_percent: null, tool_mastery: computeToolMastery(learner4),
      exercise_outcomes: computeExerciseOutcomes(learner4), exercise_titles: {}, exercise_narratives: [],
      knowledge_gaps: [], teaching_recommendations: [],
    });
    expect(individual.subarray(0, 4).toString()).toBe('%PDF');
    const row = buildLearnerRow(4, learner4, null, 'green_path', null, null, 0, null, { sessionNumber: 1, allEvents: learner4 });
    const cls = await createClassReportPdfBufferWithPdfkit({
      title_he: 'דוח כיתה', session_number: 1, aggregates: aggregateClass([row], new Map([[4, learner4]]), 1), learners: [row],
    });
    expect(cls.subarray(0, 4).toString()).toBe('%PDF');
  }, 30000);
});
