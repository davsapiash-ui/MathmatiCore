import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore, selectCanProceed } from '@/application/useWorkspaceStore';
import type { SessionTask } from '@/data/sessionTasks';
import { session1Checklist } from '@/core/session1Checklist';
import { guideSpeechHe, guideTicksNow, ticks, type TaskGuide } from '@/core/taskGuide';
import { GuideBlock, type StepView } from './TaskZone';

/**
 * The guide of the exercise on screen (core/taskGuide.ts), with its ticks.
 * The ticks are derived from the workspace's saved state (guideTicksNow), so
 * they survive a refresh and go away when the learner undoes that step. The
 * done box appears when every step that ticks has ticked and "ממשיכים" is lit,
 * at the same render (selectCanProceed), so the two never disagree.
 */
export function TaskGuideBlock({ task, guide, positionHeading }: { task: SessionTask; guide: TaskGuide; positionHeading: string }) {
  const s = useWorkspaceStore(
    useShallow((st) => ({
      sessionNumber: st.sessionNumber,
      isASD: st.isASD,
      counts: st.counts,
      answerDigits: st.answerDigits,
      operandDigits: st.operandDigits,
      probeAnswer: st.probeAnswer,
      q3Reps: st.q3Reps,
      conversionsByColumn: st.conversionsByColumn,
      takeAwayTrack: st.takeAwayTrack,
      builtTrack: st.builtTrack,
      blocksAddedCount: st.blocksAddedCount,
      hasUngrouped: st.hasUngrouped,
      undoCount: st.undoCount,
      hasClearedBoard: st.hasClearedBoard,
      canProceed: selectCanProceed(st),
    }))
  );
  const checklist = session1Checklist(task.id, s);
  const done = guideTicksNow(guide, task, { ...s, checklist });

  // A station-1 checklist item exists only while the checklist lists it (305's second line).
  const visible = guide.steps.map((st) => st.tick.kind !== 'checklist' || Boolean(checklist?.[st.tick.index]));
  const labels = guide.steps.map((st) => (st.tick.kind === 'checklist' ? checklist?.[st.tick.index]?.label ?? '' : st.label));
  const lastDone = done.lastIndexOf(true);
  const shown = guide.steps.map((_, i) => i).filter((i) => visible[i]);
  const current = shown.find((i) => !done[i] && i > lastDone) ?? shown.find((i) => !done[i] && ticks(guide.steps[i]));
  const steps: StepView[] = shown.map((i) => {
    const st = guide.steps[i];
    const item = st.tick.kind === 'checklist' ? checklist?.[st.tick.index] : undefined;
    return {
      label: labels[i],
      subs: st.subs,
      progress: item && 'progress' in item ? item.progress : undefined,
      state: done[i] ? 'done' : i === current ? 'current' : i < lastDone ? 'passed' : 'todo',
    };
  });

  const allTicked = shown.every((i) => !ticks(guide.steps[i]) || done[i]);
  const showDone = steps.length > 0 && allTicked && s.canProceed;
  const speech = guideSpeechHe(positionHeading, { ...guide, steps: shown.map((i) => ({ ...guide.steps[i], label: labels[i] })) }, []);

  return (
    <GuideBlock
      goal={guide.goalHe}
      steps={steps}
      speech={speech}
      done={showDone}
      doneNote={guide.doneNoteHe}
      lockHeight={task.type !== 'session1_intro'}
    />
  );
}
