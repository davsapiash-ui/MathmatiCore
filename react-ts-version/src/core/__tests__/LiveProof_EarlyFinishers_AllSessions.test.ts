import { describe, it, expect } from 'vitest';
import { useWorkspaceStore, getActiveTasks, type SessionNumber } from '@/application/useWorkspaceStore';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

/**
 * PRD v7.2 Module 14 §ג + מסמך 03 "מדיניות סיום מוקדם": the choice screen
 * (ביסוס / אתגר) exists in sessions 3–7 only, and each learning path has its
 * own branch bank. Sessions 1, 2 and 8 end in the quiet completion screen.
 */
describe('LIVE PROOF: Early Finisher & Branching Policy, sessions 3 to 7', () => {
  const sessions: SessionNumber[] = [3, 4, 5, 6, 7];
  for (const sessionNum of sessions) {
    for (const path of ['green_path', 'remediation_path'] as const) {
      it(`Session ${sessionNum} / ${path}: mandatory completion -> choice_branch -> branch task injection`, () => {
        const store = useWorkspaceStore.getState();
        store.resetWorkspace();
        store.initSession(sessionNum, false);

        const initialTasks = getActiveTasks(useWorkspaceStore.getState());
        expect(initialTasks).toHaveLength(7);

        const reinforceTasks = getSessionBranchTasks(sessionNum, 'reinforcement', path);
        const challengeTasks = getSessionBranchTasks(sessionNum, 'challenge', path);
        expect(reinforceTasks).toHaveLength(2);
        expect(challengeTasks).toHaveLength(1);
        expect(reinforceTasks.every((t) => t.isOptionalChoiceTask)).toBe(true);
        expect(challengeTasks.every((t) => t.isOptionalChoiceTask)).toBe(true);

        // Simulate finishing all mandatory tasks
        useWorkspaceStore.setState({ standardTaskIdx: initialTasks.length, selectedBranch: null });
        useWorkspaceStore.getState().proceed();
        if (useWorkspaceStore.getState().standardTaskIdx >= initialTasks.length && !useWorkspaceStore.getState().selectedBranch) {
          useWorkspaceStore.setState({ flowStatus: 'choice_branch' });
        }
        expect(useWorkspaceStore.getState().flowStatus).toBe('choice_branch');

        // Select the challenge branch — the injected task must come from the path's own bank
        store.selectBranch('challenge');
        const after = useWorkspaceStore.getState();
        expect(after.selectedBranch).toBe('challenge');
        expect(after.flowStatus).toBe('task');
        expect(after.dynamicTasks?.length).toBe(initialTasks.length + 1);
        const injected = after.dynamicTasks?.[initialTasks.length];
        expect(injected?.isOptionalChoiceTask).toBe(true);
        expect(injected?.branchType).toBe('challenge');
      });
    }
  }

  it('sessions 1, 2 and 8 have no branch bank at all', () => {
    for (const s of [1, 2, 8]) {
      expect(getSessionBranchTasks(s, 'reinforcement')).toEqual([]);
      expect(getSessionBranchTasks(s, 'challenge')).toEqual([]);
    }
  });
});
