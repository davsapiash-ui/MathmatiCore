import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useStore, type StudentData } from '@/application/useStore';
import { firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { isDiagnosticPrimaryRound } from '@/core/workspaceSnapshot';

if (typeof window === 'undefined') {
  (globalThis as any).window = { location: { hostname: 'localhost' } };
}
if (typeof navigator === 'undefined') {
  (globalThis as any).navigator = { onLine: true };
}

/**
 * Meeting 2 opened again (owner decision 2.10.2026) is for the learners who
 * did not finish. A learner the teacher's close completed part-way, whose
 * path the teacher has already approved, does not go back into the
 * diagnostic, and no learner write ever takes an approved gate back to
 * 'PENDING' (review of PR #207).
 */
const learner = (over: Partial<StudentData>): StudentData => ({
  studentId: 'student_user4',
  classId: 'class_1',
  name: '',
  qMatrixResults: {} as StudentData['qMatrixResults'],
  traceData: {} as StudentData['traceData'],
  completedMeeting2: true,
  routeRecommendation: null,
  routeStatus: 'PENDING_TEACHER_APPROVAL',
  ...over,
} as StudentData);

describe('an approved gate is never taken back by the learner\'s completion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The learner's device no longer writes a route recommendation at all
  // (audit 4.10.2026, gate: the write was refused by the rules every time and
  // the teacher's path comes from the server), so there is no learner write
  // that could set routeStatus 'PENDING'.
  it('the learner device has no route-recommendation writer', () => {
    useStore.setState({ students: { student_user4: learner({ routeStatus: 'APPROVED', teacher_gate_approved: true }) } });
    expect((useStore.getState() as unknown as Record<string, unknown>).setRouteRecommendation).toBeUndefined();
    expect((firebaseSyncService as unknown as Record<string, unknown>).syncRouteRecommendation).toBeUndefined();
    expect(useStore.getState().students.student_user4.routeStatus).toBe('APPROVED');
  });
});

describe('which meeting-2 state is a diagnostic stopped part-way', () => {
  it('the primary round, before the seventh answer', () => {
    expect(isDiagnosticPrimaryRound({ sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'primary', taskIdx: 3 } })).toBe(true);
    expect(isDiagnosticPrimaryRound({ sessionNumber: 2, flowStatus: 'task' })).toBe(true);
  });

  it('not the correction round, not the end, not another meeting, not nothing', () => {
    expect(isDiagnosticPrimaryRound({ sessionNumber: 2, flowStatus: 'task', qflow: { phase: 'correction' } })).toBe(false);
    expect(isDiagnosticPrimaryRound({ sessionNumber: 2, flowStatus: 'sessionDone', qflow: { phase: 'primary' } })).toBe(false);
    expect(isDiagnosticPrimaryRound({ sessionNumber: 3, flowStatus: 'task' })).toBe(false);
    expect(isDiagnosticPrimaryRound(null)).toBe(false);
  });
});

describe('the learner\'s screen', () => {
  const page = readFileSync(resolve(__dirname, '../../features/workspace/StudentWorkspacePage.tsx'), 'utf-8');

  it('an approved learner completed part-way waits instead of going back into the diagnostic', () => {
    const def = page.indexOf('meeting === 2 && !isTeacherOrAdmin && completedMeeting2 && isGateApproved &&');
    expect(def).toBeGreaterThan(-1);
    expect(page.slice(def, def + 200)).toContain('isDiagnosticPrimaryRound({ sessionNumber, flowStatus, qflow: { phase: qflowPhase } })');
    // One boolean for the screen and for the radar (Meeting2Reopen_ApprovedWaitNoHesitation.test.tsx).
    const overlay = page.indexOf('const isOverlayActive =');
    expect(page.slice(overlay, overlay + 400)).toContain('waitingAfterApproval ||');
    const guard = page.indexOf('if (waitingAfterApproval) {');
    expect(page.slice(guard, guard + 120)).toContain('<TeacherWillOpenWaitingScreen />');
    // Before any screen of the running meeting is drawn.
    expect(guard).toBeLessThan(page.indexOf("if (flowStatus === 'choice_branch' && !closedStationFinished)"));
  });
});
