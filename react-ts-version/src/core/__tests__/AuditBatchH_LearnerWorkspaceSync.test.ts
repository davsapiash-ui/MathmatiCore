import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Teacher-dashboard truth audit, batch H (4.10.2026): the learner workspace
 * and its sync. Each test names the finding it closes.
 */

const rtdbWrites = vi.hoisted(() => [] as Array<{ path: string; fields: Record<string, unknown> }>);
vi.mock('@/infrastructure/services/ThrottledRtdbWriter', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/ThrottledRtdbWriter');
  return {
    ...actual,
    throttledRtdbUpdate: (path: string, fields: Record<string, unknown>) => {
      rtdbWrites.push({ path, fields });
      return Promise.resolve();
    },
  };
});
const emitted = vi.hoisted(() => [] as any[]);
vi.mock('@/infrastructure/services/FirebaseSyncService', async () => {
  const actual = await vi.importActual<any>('@/infrastructure/services/FirebaseSyncService');
  return {
    ...actual,
    emitTelemetry: (e: any) => { emitted.push(e); return Promise.resolve(); },
  };
});

// The workspace store first: loaded through the sync service's own import,
// it would bind the real emitTelemetry before the mock is ready.
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { liveMistakeCount, firebaseSyncService } from '@/infrastructure/services/FirebaseSyncService';
import { syncQMatrixEvaluation } from '@/core/ExerciseValidationEngine';
import { useStore, isResetOutcomeUnknown, type StudentData } from '@/application/useStore';
import { useAuthStore } from '@/application/useAuthStore';
import { presenceLastAction } from '@/features/workspace/StudentWorkspacePage';

const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');

describe('radar: "טעויות" on the tile counts wrong answers, not undos', () => {
  it('liveMistakeCount reads the wrong submissions / wrong digits, or the failed board checks', () => {
    expect(liveMistakeCount({ consecutiveErrorCount: 0, boardCheckFailures: 0, boardCheckFailuresTaskId: null })).toBe(0);
    expect(liveMistakeCount({ consecutiveErrorCount: 3, boardCheckFailures: 0, boardCheckFailuresTaskId: null })).toBe(3);
    expect(liveMistakeCount({ consecutiveErrorCount: 1, boardCheckFailures: 2, boardCheckFailuresTaskId: 's3_r_t2' })).toBe(2);
    // Board checks of no exercise (stale counter) do not count.
    expect(liveMistakeCount({ consecutiveErrorCount: 0, boardCheckFailures: 2, boardCheckFailuresTaskId: null })).toBe(0);
    // Undos are not in it at all.
    expect(liveMistakeCount({ consecutiveErrorCount: 0, boardCheckFailures: 0, boardCheckFailuresTaskId: null, undoCount: 7 } as any)).toBe(0);
  });

  it('sessionState.error_count is written from it, not from undoCount', () => {
    const sync = src('infrastructure/services/FirebaseSyncService.ts');
    expect(sync).toContain('error_count: liveMistakeCount(state)');
    expect(sync).not.toContain('error_count: state.undoCount');
  });
});

describe('clustering: task results are not merged into conceptMastery', () => {
  it('syncQMatrixEvaluation writes the Q-matrix only', async () => {
    const qMatrix = vi.spyOn(firebaseSyncService, 'syncQMatrix').mockResolvedValue(undefined as never);
    const mastery = vi.spyOn(firebaseSyncService, 'syncConceptMastery').mockResolvedValue(undefined as never);
    await syncQMatrixEvaluation('student_user2', { task1_read_write_zero: 'success' });
    expect(qMatrix).toHaveBeenCalledTimes(1);
    expect(mastery).not.toHaveBeenCalled();
    qMatrix.mockRestore();
    mastery.mockRestore();
  });
});

describe('gate: the always-refused route-recommendation write is gone', () => {
  it('no writer on the device, in the store or in the sync', () => {
    expect(src('application/useWorkspaceStore.ts')).not.toContain('setRouteRecommendation');
    expect(src('application/useStore.ts')).not.toContain('setRouteRecommendation');
    expect(src('infrastructure/services/FirebaseSyncService.ts')).not.toContain('syncRouteRecommendation');
    expect((firebaseSyncService as unknown as Record<string, unknown>).syncRouteRecommendation).toBeUndefined();
  });
});

describe('support: saving learning conditions writes the profile once and keeps the gate status', () => {
  const learner = (over: Partial<StudentData>): StudentData => ({
    studentId: 'student_user5',
    classId: 'class_1',
    name: '',
    qMatrixResults: {} as StudentData['qMatrixResults'],
    traceData: {} as StudentData['traceData'],
    completedMeeting2: true,
    routeRecommendation: null,
    routeStatus: 'APPROVED',
    difficultyRecommendation: 'LEVEL_1',
    ...over,
  } as StudentData);

  it('applyPhysicalOverride is a local mirror: no second syncPhysicalOverride', () => {
    const sync = vi.spyOn(firebaseSyncService, 'syncPhysicalOverride').mockResolvedValue(undefined);
    useStore.setState({ students: { student_user5: learner({}) } });
    useStore.getState().applyPhysicalOverride('student_user5', {
      isASD: true,
      applyAtTaskBoundaryOnly: true,
      overrideUpdatedAt: 1,
      physicalOverride: false,
    } as any);
    expect(sync).not.toHaveBeenCalled();
    const s = useStore.getState().students.student_user5;
    expect(s.isASD).toBe(true);
    // Fields the drawer does not send keep their value.
    expect(s.routeStatus).toBe('APPROVED');
    expect(s.difficultyRecommendation).toBe('LEVEL_1');
    sync.mockRestore();
  });
});

describe('reset: a transport "internal" error is an unknown outcome, not "nothing was deleted"', () => {
  it('isResetOutcomeUnknown', () => {
    expect(isResetOutcomeUnknown('functions/internal', 'internal')).toBe(true);
    expect(isResetOutcomeUnknown('functions/internal', '')).toBe(true);
    expect(isResetOutcomeUnknown('functions/deadline-exceeded', '')).toBe(true);
    expect(isResetOutcomeUnknown('functions/unavailable', '')).toBe(true);
    // The server's own refusal, in Hebrew, says what happened.
    expect(isResetOutcomeUnknown('functions/internal', 'הגיבוי נכשל. האיפוס בוטל ולא נמחקו נתונים.')).toBe(false);
    expect(isResetOutcomeUnknown('functions/failed-precondition', 'אין מפגש פתוח')).toBe(false);
    expect(isResetOutcomeUnknown('functions/permission-denied', '')).toBe(false);
  });

  it('the reset handlers go through it', () => {
    const store = src('application/useStore.ts');
    expect(store).toContain('if (isResetOutcomeUnknown(code, serverMessage)) {');
  });
});

describe('reset: the client creates no alias records (ids 1-12 only)', () => {
  it('the full learner reset and the class reset write the canonical record only', () => {
    const store = src('application/useStore.ts');
    expect(store).not.toContain('users/students/student_${num}');
    expect(store).not.toContain('users/students/user${num}');
    expect(store).not.toContain('users/students/${num}');
    expect(store).not.toContain('users/students/student_${i}');
    expect(store).not.toContain('users/students/user${i}');
    expect(store).not.toContain('users/students/${i}');
    expect(store).toContain('users/students/${normId}`), cleanPayload');
    expect(store).toContain('users/students/student_user${i}`), cleanPayload');
  });
});

describe('learner record: never users/students/<staff uid>', () => {
  beforeEach(() => {
    rtdbWrites.length = 0;
  });

  it('a staff account on the learner screen writes no help call to a record of its own uid', () => {
    useAuthStore.setState({ user: { uid: 'AbC123googleUid', email: 't@example.com' } } as any);
    useWorkspaceStore.setState({ hasRequestedBasicHelp: false, isSupersededByOtherDevice: false } as any);
    useWorkspaceStore.getState().requestSilentHelp();
    expect(rtdbWrites.filter((w) => w.path.startsWith('users/students/'))).toEqual([]);
    expect(useWorkspaceStore.getState().hasRequestedBasicHelp).toBe(false);
  });

  it('a learner writes the call to the canonical record', () => {
    useAuthStore.setState({ user: { uid: 'student_user7', student_id: 7 } } as any);
    useWorkspaceStore.setState({ hasRequestedBasicHelp: false, isSupersededByOtherDevice: false, helpRequestCount: 0 } as any);
    useWorkspaceStore.getState().requestSilentHelp();
    const helpWrites = rtdbWrites.filter((w) => 'helpRequested' in w.fields || w.path.includes('/helpHistory/'));
    expect(helpWrites.map((w) => w.path)).toEqual([
      'users/students/student_user7',
      expect.stringMatching(/^users\/students\/student_user7\/helpHistory\/help_\d+$/),
    ]);
  });
});

describe('learner journey: a carry-circle digit says where it was typed (PRD Module 21)', () => {
  beforeEach(() => {
    emitted.length = 0;
    useAuthStore.setState({ user: { uid: 'student_user7', student_id: 7 } } as any);
    useWorkspaceStore.setState({ sessionNumber: 4, carryDigits: {}, answerDigits: {}, isSupersededByOtherDevice: false } as any);
  });

  it('DIGIT_ENTERED and DIGIT_DELETED from the circle carry input_target carry_circle', () => {
    useWorkspaceStore.getState().setCarryDigit('tens', '1');
    useWorkspaceStore.getState().setCarryDigit('tens', '');
    const types = emitted.map((e) => e.event_type);
    expect(types).toEqual(['DIGIT_ENTERED', 'DIGIT_DELETED']);
    expect(emitted[0].details.input_target).toBe('carry_circle');
    expect(emitted[1].details.input_target).toBe('carry_circle');
  });

  it('a result-row digit carries no marker', () => {
    useWorkspaceStore.getState().setAnswerDigit('tens', '1');
    const entered = emitted.find((e) => e.event_type === 'DIGIT_ENTERED');
    expect(entered).toBeDefined();
    expect(entered.details.input_target).toBeUndefined();
  });
});

describe('workspace page: presence, waiting screens, recorder', () => {
  const page = src('features/workspace/StudentWorkspacePage.tsx');

  it('gate: a learner waiting with no approved path is not "פעיל במפגש N"', () => {
    expect(presenceLastAction(3, false)).toBe('פעיל במפגש 3');
    expect(presenceLastAction(3, true)).toBe('ממתין לאישור המסלול לפני מפגש 3');
    expect(page).toContain('waitingWithoutMeetingRef.current = pendingApproval && !isInitialized;');
    expect(page).not.toContain('lastAction: `פעיל במפגש ${meeting}`');
  });

  it('support: quiet mode does not restart the presence heartbeat', () => {
    const start = page.indexOf('// --- Module 18: Live Presence Heartbeat');
    const end = page.indexOf('// PRD v7.1 Module 10: Load adaptive addition grid', start);
    const effect = page.slice(start, end);
    expect(effect).toContain('}, [normUid, meeting]);');
    expect(effect).not.toContain('isASDMode]);');
  });

  it('meeting control: the waiting screen after initialisation carries the class-state screens', () => {
    const start = page.indexOf('if (pendingApproval) {');
    const block = page.slice(start, page.indexOf('</>;', start) + 4);
    expect(block).toContain('<Meeting2WaitingScreen onApproved={() => setPendingApproval(false)} /><CornerCloudSyncStatus />{classStateOverlays}');
    expect(block).toContain('<><TeacherWillOpenWaitingScreen />{classStateOverlays}</>');
  });

  it('learner view: the recorder gate knows the class session\'s meeting', () => {
    expect(page).toContain('classSessionNumber,');
    const gate = page.slice(page.indexOf('const recordScreen = shouldRecordScreen({'), page.indexOf('});', page.indexOf('const recordScreen = shouldRecordScreen({')));
    expect(gate).toContain('classSessionNumber');
  });
});
