import { TASKS as DIAGNOSTIC_TASKS } from '@/core/QMatrix';
import { getCurrentQTask } from '@/core/qmatrixFlow';
import { taskPositionLabelHe } from '@/core/taskPositionLabel';
import { getActiveTasks, selectStandardTask, type WorkspaceState } from './useWorkspaceStore';

/**
 * The exercise heading the learner reads above the instruction ("משימה 3 מתוך 7",
 * "משימת בחירה", "משימה חוזרת", "משימת היכרות") — owner, 27.9.2026.
 * The task card shows it; the chat's help messages carry it to the teacher
 * (owner, 1.10.2026), so both always name the same exercise. Null when no
 * exercise is open.
 */
export function currentTaskLabelHe(s: WorkspaceState): string | null {
  const qTask = s.sessionNumber === 2 ? getCurrentQTask(s.qflow) : null;
  const standardTask = selectStandardTask(s);
  if (!qTask && !standardTask) return null;
  const compulsory = getActiveTasks(s).filter((t) => !t.isOptionalChoiceTask);
  return taskPositionLabelHe(
    qTask
      ? {
          sessionNumber: s.sessionNumber,
          isCorrection: s.qflow.phase === 'correction',
          position: s.qflow.taskIdx + 1,
          total: DIAGNOSTIC_TASKS.length,
        }
      : {
          sessionNumber: s.sessionNumber,
          isChoice: Boolean(standardTask?.isOptionalChoiceTask),
          position: standardTask ? compulsory.findIndex((t) => t.id === standardTask.id) + 1 || null : null,
          total: compulsory.length,
        }
  );
}
