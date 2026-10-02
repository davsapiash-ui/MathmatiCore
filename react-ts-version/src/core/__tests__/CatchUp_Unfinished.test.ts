/**
 * Catch-up time (owner decision 2.10.2026): who started a meeting and did not
 * finish it, where they stopped, and whose reason this run still lacks.
 */
import { describe, it, expect } from 'vitest';
import { buildUnfinishedLearners, needsReason, whereStoppedHe } from '@/core/catchUpUnfinished';
import { lastRunFields, readLastClosedRun } from '@/core/classSession';
import { getSessionTasks } from '@/data/sessionTasks';
import type { CatchUpRound } from '@/core/catchUp';

const snap = (meeting: number, extra: Record<string, unknown> = {}) => ({
  sessionNumber: meeting,
  flowStatus: 'task',
  standardTaskIdx: 0,
  savedAt: 1000,
  ...extra,
});

describe('buildUnfinishedLearners', () => {
  it('lists the learners who started the meeting and did not finish it, ascending, with where they stopped', () => {
    const students = {
      student_user5: { workspaceState: snap(4, { standardTaskIdx: 3, hasInteracted: true }) },
      student_user2: { workspaceByMeeting: { m4: snap(4, { standardTaskIdx: 1 }) }, workspaceState: snap(5) },
      // finished: reached the branch choice
      student_user3: { workspaceState: snap(4, { flowStatus: 'choice_branch', standardTaskIdx: 7 }) },
      // finished: explicit mark
      student_user4: { workspaceState: snap(4, { standardTaskIdx: 2 }), completedMeetings: { m4: 123 } },
      // never started meeting 4 (a copy of another meeting only)
      student_user6: { workspaceState: snap(3, { standardTaskIdx: 2 }) },
      // started nothing: on the first exercise, nothing done
      student_user7: { workspaceState: snap(4) },
      // a learner outside 1–12 is never listed
      student_user13: { workspaceState: snap(4, { standardTaskIdx: 3 }) },
    };
    expect(buildUnfinishedLearners(students, 4)).toEqual([
      { studentNumber: 2, stoppedAtHe: 'תרגיל 2 מתוך 7' },
      { studentNumber: 5, stoppedAtHe: 'תרגיל 4 מתוך 7' },
    ]);
  });

  it('reads the alias keys too, canonical first', () => {
    const students = { student_8: { workspaceState: snap(6, { standardTaskIdx: 4 }) } };
    expect(buildUnfinishedLearners(students, 6)).toEqual([{ studentNumber: 8, stoppedAtHe: 'תרגיל 5 מתוך 7' }]);
  });

  it('meeting 8: the seven exercises done is not finishing — the reflection board is', () => {
    const students = {
      student_user1: { workspaceState: snap(8, { flowStatus: 'reflection', standardTaskIdx: 6 }) },
      student_user2: { workspaceState: snap(8, { flowStatus: 'sessionDone', standardTaskIdx: 6 }) },
    };
    expect(buildUnfinishedLearners(students, 8)).toEqual([{ studentNumber: 1, stoppedAtHe: 'לוח הרפלקציה' }]);
  });

  it('meeting 2 is not built here (the gate keeps its own list), and no meeting outside 1–8', () => {
    const students = { student_user1: { workspaceState: { sessionNumber: 2, flowStatus: 'task', qflow: { taskIdx: 3 } } } };
    expect(buildUnfinishedLearners(students, 2)).toEqual([]);
    expect(buildUnfinishedLearners(students, 0)).toEqual([]);
    expect(buildUnfinishedLearners(students, 9)).toEqual([]);
  });
});

describe('whereStoppedHe', () => {
  it('meetings 3–8: the exercise out of seven, never past the seventh', () => {
    expect(whereStoppedHe(snap(3, { standardTaskIdx: 0 }), 3)).toBe('תרגיל 1 מתוך 7');
    expect(whereStoppedHe(snap(7, { standardTaskIdx: 6 }), 7)).toBe('תרגיל 7 מתוך 7');
    expect(whereStoppedHe(snap(7, { standardTaskIdx: 12 }), 7)).toBe('תרגיל 7 מתוך 7');
  });

  it('the screens after the exercises', () => {
    expect(whereStoppedHe(snap(5, { flowStatus: 'choice_branch' }), 5)).toBe('בחירת מסלול');
    expect(whereStoppedHe(snap(8, { flowStatus: 'reflection' }), 8)).toBe('לוח הרפלקציה');
  });

  it('meeting 2 says "משימה", as the gate tab does, and names the correction round', () => {
    expect(whereStoppedHe({ sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'primary', taskIdx: 3 } }, 2)).toBe('משימה 4 מתוך 7');
    expect(whereStoppedHe({ sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'correction', correctionIdx: 1 } }, 2)).toBe('סבב התיקונים');
  });

  it('meeting 1: the tool steps first, then its exercises', () => {
    const tasks = getSessionTasks(1);
    const steps = tasks.filter((t) => t.type === 'session1_intro').length;
    expect(steps).toBeGreaterThan(0);
    expect(whereStoppedHe(snap(1, { standardTaskIdx: 1 }), 1)).toBe(`צעד 2 מתוך ${steps} בהיכרות עם הכלים`);
    expect(whereStoppedHe(snap(1, { standardTaskIdx: steps }), 1)).toBe(`תרגיל 1 מתוך ${tasks.length - steps}`);
  });

  it('no saved copy', () => {
    expect(whereStoppedHe(null, 4)).toBe('תחילת המפגש');
  });
});

describe('needsReason', () => {
  const round = (recorded_at: number): CatchUpRound => ({
    action: 'continue', reason: 'slow_pace', note: null, stopped_at: null, recorded_by: 't', recorded_at,
    opened_at: null, closed_at: null, closed_by: null, active_minutes: null,
  });

  it('no record, or only rounds of earlier runs: a reason is needed', () => {
    expect(needsReason(null, 5000)).toBe(true);
    expect(needsReason({ rounds: {} }, 5000)).toBe(true);
    expect(needsReason({ rounds: { r_1000: round(1000) } }, 5000)).toBe(true);
  });

  it('a round recorded in this run (at or after its start): asked already', () => {
    expect(needsReason({ rounds: { r_1000: round(1000), r_5000: round(5000) } }, 5000)).toBe(false);
    expect(needsReason({ rounds: { r_9000: round(9000) } }, 5000)).toBe(false);
  });
});

describe('the close records which run ended', () => {
  it('lastRunFields keeps only a meeting 1–8 and a real server stamp', () => {
    expect(lastRunFields(4, 1700)).toEqual({ lastSessionNumber: 4, lastStartedAt: 1700 });
    expect(lastRunFields(null, { '.sv': 'timestamp' })).toEqual({ lastSessionNumber: null, lastStartedAt: null });
    expect(lastRunFields(9, 0)).toEqual({ lastSessionNumber: null, lastStartedAt: null });
  });

  it('readLastClosedRun: closed records only; a close by time is marked; a reset (no fields) is none', () => {
    expect(readLastClosedRun({ active: true, sessionNumber: 4, lastSessionNumber: 3 })).toBeNull();
    expect(readLastClosedRun({ active: false, status: 'closed', sessionNumber: null })).toBeNull();
    expect(readLastClosedRun({ active: false, closedBy: 'teacher', lastSessionNumber: 4, lastStartedAt: 100 }))
      .toEqual({ meeting: 4, startedAt: 100, byTime: false });
    expect(readLastClosedRun({ active: false, endedBy: 'auto_45min', lastSessionNumber: 5, lastStartedAt: 100 }))
      .toEqual({ meeting: 5, startedAt: 100, byTime: true });
    expect(readLastClosedRun({ active: false, endedBy: 'teacher_disconnect_grace', lastSessionNumber: 5, lastStartedAt: null }))
      .toEqual({ meeting: 5, startedAt: null, byTime: true });
  });
});
