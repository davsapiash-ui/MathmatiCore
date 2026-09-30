import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getFailedDiagnosticTasks, getQTaskStatus, TASKS } from '@/core/QMatrix';
import { buildGateStudentItem } from '@/presentation/pages/TeacherDashboard/gateEvidence';

/**
 * PRD 14 §ב1: "שדה is_completed נקבע אך ורק לפי השלמת שבע משימות החובה או לפי
 * סגירה יזומה של המורה". Owner decision 29.9.2026: closing meeting 2 completes
 * every learner who started it; the server does it (functions/src/meeting2Close.ts)
 * on the teacher's close — and only on hers.
 */
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf-8');
const teacher = read('../../presentation/pages/TeacherDashboard.tsx');
const store = read('../../application/useStore.ts');
const server = read('../../../../functions/src/meeting2Close.ts');

describe('the teacher close carries the marker the server acts on', () => {
  it('handleEndClassSession writes closedBy: teacher', () => {
    const start = teacher.indexOf('const handleEndClassSession');
    const body = teacher.slice(start, teacher.indexOf('const handlePauseClassSession'));
    expect(body).toMatch(/set\(ref\(database, 'active_class_session'\), \{[\s\S]*?status: 'closed',[\s\S]*?closedBy: 'teacher',[\s\S]*?\}\)/);
  });

  it('a system reset closes without it, so a reset completes no one', () => {
    const resetClose = store.match(/fbSet\(ref\(database, 'active_class_session'\), \{[^}]*\}\)/g) ?? [];
    expect(resetClose.length).toBeGreaterThan(0);
    for (const w of resetClose) expect(w).not.toContain('closedBy');
  });

  it('the server listens for the same marker and the same seven tasks', () => {
    expect(server).toContain('export const TEACHER_CLOSE_MARKER = "teacher";');
    for (const t of TASKS) expect(server).toContain(`"${t.id}"`);
  });
});

describe('a task not answered at the close reads as "דרוש חיזוק"', () => {
  const notAnswered = /export const Q_NOT_ANSWERED_TAG = "([a-z_]+)";/.exec(server)?.[1] ?? '';

  it('the server tag is needs_support on every teacher screen', () => {
    expect(notAnswered).toBe('not_answered');
    expect(getQTaskStatus(notAnswered)).toBe('needs_support');
  });

  it('the approvals table shows the learner, with the unanswered tasks among those needing support', () => {
    const qMatrixResults = Object.fromEntries(TASKS.map((t, i) => [t.id, i < 3 ? 'success' : notAnswered]));
    expect(getFailedDiagnosticTasks(qMatrixResults).map((t) => t.id)).toEqual(TASKS.slice(3).map((t) => t.id));

    const item = buildGateStudentItem(
      4,
      { student_user4: { completedMeeting2: true, routeStatus: 'PENDING_TEACHER_APPROVAL', qMatrixResults } as never },
      { student_4: { is_completed: true, session_score_percent: 43, matrix_recommended_path: 'remediation_path' } },
    );
    expect(item.isCompleted).toBe(true);
    expect(item.isApproved).toBe(false);
    expect(item.scorePercent).toBe(43);
    expect(item.errorNodes).toHaveLength(4);
  });
});
