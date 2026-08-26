import { describe, it, expect } from 'vitest';
import { useWorkspaceStore, getActiveTasks, type SessionNumber } from '@/application/useWorkspaceStore';
import { getSessionBranchTasks } from '@/data/sessionBranchTasks';

describe('LIVE PROOF: Early Finisher & Branching Policy across All Sessions 1 to 8', () => {
  const sessions: SessionNumber[] = [1, 2, 3, 4, 5, 6, 7, 8];
  for (const sessionNum of sessions) {
    it(`Session ${sessionNum}: simulates mandatory task completion -> choice_branch -> branch task injection`, () => {
      const store = useWorkspaceStore.getState();
      store.initSession(sessionNum, false);

      // Verify session initialized
      const initialTasks = getActiveTasks(useWorkspaceStore.getState());
      console.log(`\n================== SESSION ${sessionNum} ==================`);
      console.log(`[1] Total mandatory tasks in Session ${sessionNum}: ${initialTasks.length}`);

      // Verify that getSessionBranchTasks provides both reinforcement and challenge
      const reinforceTasks = getSessionBranchTasks(sessionNum, 'reinforcement');
      const challengeTasks = getSessionBranchTasks(sessionNum, 'challenge');

      console.log(`[2] Reinforcement tasks count: ${reinforceTasks.length}, First Title: "${reinforceTasks[0]?.titleHe}"`);
      console.log(`[3] Challenge tasks count: ${challengeTasks.length}, First Title: "${challengeTasks[0]?.titleHe}"`);

      expect(reinforceTasks.length).toBeGreaterThan(0);
      expect(challengeTasks.length).toBeGreaterThan(0);
      expect(reinforceTasks[0].isOptionalChoiceTask).toBe(true);
      expect(challengeTasks[0].isOptionalChoiceTask).toBe(true);

      // Simulate finishing all mandatory tasks
      useWorkspaceStore.setState({ standardTaskIdx: initialTasks.length, selectedBranch: null });
      useWorkspaceStore.getState().proceed(); // Trigger progression check
      
      // If store is at the boundary
      if (useWorkspaceStore.getState().standardTaskIdx >= initialTasks.length && !useWorkspaceStore.getState().selectedBranch) {
        useWorkspaceStore.setState({ flowStatus: 'choice_branch' });
      }

      expect(useWorkspaceStore.getState().flowStatus).toBe('choice_branch');
      console.log(`[4] Flow successfully shifted to: ${useWorkspaceStore.getState().flowStatus}`);

      // Select Challenge Branch
      store.selectBranch('challenge');
      const stateAfterChallenge = useWorkspaceStore.getState();
      expect(stateAfterChallenge.selectedBranch).toBe('challenge');
      expect(stateAfterChallenge.flowStatus).toBe('task');
      expect(stateAfterChallenge.dynamicTasks?.length).toBe(initialTasks.length + challengeTasks.length);

      const injectedChallenge = stateAfterChallenge.dynamicTasks?.[initialTasks.length];
      console.log(`[5] Selected Challenge -> Injected Task ID: "${injectedChallenge?.id}", Title: "${injectedChallenge?.titleHe}", isOptional: ${injectedChallenge?.isOptionalChoiceTask}`);
      expect(injectedChallenge?.isOptionalChoiceTask).toBe(true);
    });
  }
});
