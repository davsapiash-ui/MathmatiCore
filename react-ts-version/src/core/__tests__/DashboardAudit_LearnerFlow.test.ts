import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { useWorkspaceStore, getActiveTasks, activeExerciseId, getCurrentQTask } from '@/application/useWorkspaceStore';

/**
 * ביקורת דשבורד המורה, 20.9.2026 — הצד של הלומד שמזין את מה שהמורה רואה.
 * כל בדיקה כאן היא באג ביצוע שנמצא בקריאת שני הקצוות (מי כותב, מי קורא),
 * והתיקון שלו תואם את ה-PRD.
 */
const src = (p: string) => readFileSync(resolve(__dirname, '../../', p), 'utf-8');
const store = src('application/useWorkspaceStore.ts');
const page = src('features/workspace/StudentWorkspacePage.tsx');

describe('memory circles: only column addition defines a target digit (Appendix A §3)', () => {
  beforeEach(() => useWorkspaceStore.getState().resetWorkspace());

  it('subtraction: the learner\'s regrouping note is not a wrong digit', () => {
    useWorkspaceStore.getState().initSession(5, false);
    const s = useWorkspaceStore.getState();
    const idx = getActiveTasks(s).findIndex((t) => t.isSubtraction && t.requiresUngrouping);
    expect(idx).toBeGreaterThan(-1);
    useWorkspaceStore.setState({ standardTaskIdx: idx });

    useWorkspaceStore.getState().setCarryDigit('tens', '4');

    const after = useWorkspaceStore.getState();
    expect(after.carryDigits.tens).toBe('4');
    // It used to be compared with 0: every correct note disqualified the exercise
    // from "first attempt" and inflated E in the Persistence Index.
    expect(after.hasDigitErrorInTask).toBe(false);
    expect(after.typedErrorCount).toBe(0);
  });

  it('addition: the carried digit is still judged', () => {
    useWorkspaceStore.getState().initSession(4, false);
    const s = useWorkspaceStore.getState();
    const idx = getActiveTasks(s).findIndex(
      (t) => !t.isSubtraction && typeof t.numberA === 'number' && typeof t.numberB === 'number' && (t.numberA % 10) + (t.numberB % 10) >= 10
    );
    expect(idx).toBeGreaterThan(-1);
    useWorkspaceStore.setState({ standardTaskIdx: idx });

    useWorkspaceStore.getState().setCarryDigit('tens', '1');
    expect(useWorkspaceStore.getState().hasDigitErrorInTask).toBe(false);
    useWorkspaceStore.getState().setCarryDigit('tens', '5');
    expect(useWorkspaceStore.getState().hasDigitErrorInTask).toBe(true);
  });
});

describe('every event names the exercise it belongs to', () => {
  beforeEach(() => useWorkspaceStore.getState().resetWorkspace());

  it('meeting 2 runs on the Q-matrix flow: its events carry the diagnostic task, not "ex_2_01"', () => {
    useWorkspaceStore.getState().initSession(2, false);
    const s = useWorkspaceStore.getState();
    const qTask = getCurrentQTask(s.qflow);
    expect(qTask?.id).toBeTruthy();
    expect(activeExerciseId(s)).toBe(qTask!.id);
    expect(activeExerciseId(s)).not.toBe('ex_2_01');
    // No emitter keeps its own fallback any more.
    expect(store.match(/\?\.id \|\| `ex_\$\{/g)).toBeNull();
  });

  it('the first PROBLEM_LOAD comes from the learner\'s own bank, and each exercise is loaded once', () => {
    expect(store).toContain('getActiveTasks(get())[startingTaskIdx ?? 0]');
    expect(store).not.toContain('getSessionTasks(sanitized as any)[startingTaskIdx ?? 0]');
    const advance = store.slice(store.indexOf('function advanceStandard()'), store.indexOf('function proceedQ()'));
    expect(advance).not.toContain("event_type: 'PROBLEM_LOAD'");
    expect(advance).toContain('startTask(tasks[nextIdx].id);');
  });
});

describe('the end of a meeting', () => {
  it('a correct answer with empty memory circles is recorded as a solved exercise', () => {
    const start = store.indexOf('if (!hasCarriesEntered) {');
    const branch = store.slice(start, store.indexOf('return;', start));
    expect(branch).toContain('handleSuccess(');
    expect(branch).not.toContain('advanceStandard();');
  });

  it('the meeting is complete at 7 of 7, when the choice screen appears (PRD 14 §ב1)', () => {
    const start = store.indexOf("set({ flowStatus: 'choice_branch', awaitingNext: false });");
    const block = store.slice(start, store.indexOf('return;', start));
    expect(block).toContain('syncHighestCompletedMeeting(studentId, s.sessionNumber)');
  });

  it('a finished meeting is restored as finished, not restarted at exercise 1 (PRD 14 §ג)', () => {
    expect(page).not.toContain("flowStatus !== 'sessionDone'");
    expect((page.match(/const canRestore = myData\?\.workspaceState\?\.sessionNumber === meeting && Boolean\(myData\?\.workspaceState\?\.flowStatus\);/g) || []).length).toBe(2);
  });

  it('the meeting-2 reflection is filed under meeting 2, not under meeting 8', () => {
    const reflection = src('features/workspace/ReflectionScreen.tsx');
    expect(reflection).not.toContain('session_8_student_');
    expect(reflection).toContain('session_${reflectionMeeting}_student_${studentId}');
  });
});

describe('what is saved is what the learner really reached', () => {
  beforeEach(() => useWorkspaceStore.getState().resetWorkspace());

  it('the page publishes the store\'s own meeting, and only once the store is on this meeting', () => {
    const start = page.indexOf('// Sync workspace state and vector replays continuously to Firebase RTDB');
    const effect = page.slice(start, page.indexOf('// --- RRWeb Telemetry Recording', start));
    expect(effect).toContain('if (sessionNumber !== meeting) return;');
    expect(effect).toContain("'workspaceState/sessionNumber': sessionNumber,");
    expect(effect).not.toContain("'workspaceState/sessionNumber': meeting,");
  });

  it('presence never rewrites the saved flow', () => {
    const start = page.indexOf('// --- Module 18: Live Presence Heartbeat');
    const effect = page.slice(start, page.indexOf('// PRD v7.1 Module 10', start));
    expect(effect).not.toContain("'workspaceState/");
  });

  it('a reload inside a branch task brings the branch tasks back', () => {
    useWorkspaceStore.getState().initSession(3, false);
    const compulsory = getActiveTasks(useWorkspaceStore.getState()).length;
    useWorkspaceStore.getState().restoreSession({
      sessionNumber: 3,
      flowStatus: 'task',
      standardTaskIdx: compulsory,
      selectedBranch: 'challenge',
    } as any);
    const s = useWorkspaceStore.getState();
    const task = getActiveTasks(s)[s.standardTaskIdx];
    expect(task).toBeDefined();
    expect(task.isOptionalChoiceTask).toBe(true);
    // The index only means something together with the branch, so both are saved.
    expect(src('infrastructure/services/FirebaseSyncService.ts')).toContain('selectedBranch: state.selectedBranch ?? null,');
  });
});

describe('the 45-second clock', () => {
  it('typing into operand cells or a probe answer is work, not hesitation', () => {
    const hook = src('application/useCognitiveHesitationRadar.ts');
    const start = hook.indexOf('const selectCognitiveState = (s: any) =>');
    const signature = hook.slice(start, hook.indexOf(';', start));
    expect(signature).toContain('s.operandDigits');
    expect(signature).toContain('s.probeAnswer');
  });
});
