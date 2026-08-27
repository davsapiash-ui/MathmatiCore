import { describe, it, expect } from 'vitest';
import { getSessionTasks, SESSIONS_BY_PATH } from '@/data/sessionTasks';
import { useWorkspaceStore, selectStandardTask } from '@/application/useWorkspaceStore';

describe('Module 26: מודול קטלוג תוכנית הלימודים (Canonical PRD v7.0)', () => {
  it('provides two separate task banks for sessions 3 through 7', () => {
    for (let session = 3; session <= 7; session++) {
      const greenTasks = getSessionTasks(session as any, 'green_path');
      const remediationTasks = getSessionTasks(session as any, 'remediation_path');

      expect(greenTasks).toBeDefined();
      expect(remediationTasks).toBeDefined();
      expect(greenTasks.length).toBeGreaterThanOrEqual(7);
      expect(remediationTasks.length).toBeGreaterThanOrEqual(7);

      // Verify the task banks are distinct
      expect(greenTasks[0].id).not.toBe(remediationTasks[0].id);
    }
  });

  it('bounds remediation_path numbers to 1,000 in Sessions 3 to 7', () => {
    for (let session = 3; session <= 7; session++) {
      const tasks = getSessionTasks(session as any, 'remediation_path');
      tasks.forEach((t) => {
        if (t.numberA !== undefined) {
          expect(t.numberA).toBeLessThanOrEqual(1000);
        }
        if (t.numberB !== undefined) {
          expect(t.numberB).toBeLessThanOrEqual(1000);
        }
        if (t.targetValue !== undefined) {
          expect(t.targetValue).toBeLessThanOrEqual(1000);
        }
      });
    }
  });

  it('includes 4-digit numbers up to 10,000 in green_path', () => {
    let hasFourDigitTask = false;
    for (let session = 3; session <= 7; session++) {
      const tasks = getSessionTasks(session as any, 'green_path');
      tasks.forEach((t) => {
        if ((t.numberA && t.numberA > 1000) || (t.targetValue && t.targetValue > 1000)) {
          hasFourDigitTask = true;
        }
        if (t.numberA !== undefined) expect(t.numberA).toBeLessThanOrEqual(10000);
        if (t.numberB !== undefined) expect(t.numberB).toBeLessThanOrEqual(10000);
      });
    }
    expect(hasFourDigitTask).toBe(true);
  });

  it('provides 7 compulsory assessment tasks for Session 8', () => {
    const s8Tasks = getSessionTasks(8 as any);
    expect(s8Tasks).toBeDefined();
    expect(s8Tasks.length).toBe(7);
    s8Tasks.forEach((t) => {
      expect(t.isCompulsory).toBe(true);
    });
  });

  it('guarantees catalog/task updates only mutate pending tasks, preserving currently active exercise', () => {
    useWorkspaceStore.getState().resetWorkspace();
    useWorkspaceStore.getState().initSession(3, false);

    const initialActive = selectStandardTask(useWorkspaceStore.getState());
    expect(initialActive).toBeDefined();

    // Student is active on task index 0
    expect(useWorkspaceStore.getState().standardTaskIdx).toBe(0);

    const replacementTasks: any = [
      { id: 'mutated_0', titleHe: 'Mutated 0', instructionHe: 'Do not overwrite active' },
      { id: 'mutated_1', titleHe: 'Mutated 1', instructionHe: 'Pending task' },
    ];

    useWorkspaceStore.getState().setAITasks(replacementTasks);

    // Active task at index 0 remains unmutated
    const currentActiveAfterUpdate = selectStandardTask(useWorkspaceStore.getState());
    expect(currentActiveAfterUpdate?.id).toBe(initialActive?.id);
    expect(currentActiveAfterUpdate?.id).not.toBe('mutated_0');

    // Pending task at index 1 receives the update
    const allTasks = useWorkspaceStore.getState().aiTasks;
    expect(allTasks?.[1]?.id).toBe('mutated_1');
  });
});
