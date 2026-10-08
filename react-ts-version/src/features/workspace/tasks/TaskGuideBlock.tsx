import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceStore, selectCanProceed } from '@/application/useWorkspaceStore';
import type { SessionTask } from '@/data/sessionTasks';
import { getValue } from '@/core/placeValue';
import { session1Checklist } from '@/core/session1Checklist';
import { guideSpeechHe, guideTicksNow, ticks, type TaskGuide } from '@/core/taskGuide';
import { GuideBlock, type StepView } from './TaskZone';

/**
 * The guide of the exercise on screen (core/taskGuide.ts), with its ticks:
 * a board step, once done, stays ticked while the learner goes on (blocks
 * taken away, a block broken) — until the board is emptied. The done box
 * appears when every step that ticks has ticked and "ממשיכים" is lit, at the
 * same render (selectCanProceed), so the two never disagree.
 */
export function TaskGuideBlock({ task, guide, heading, taskKey }: { task: SessionTask; guide: TaskGuide; heading: string; taskKey: string }) {
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
      blocksAddedCount: st.blocksAddedCount,
      hasUngrouped: st.hasUngrouped,
      undoCount: st.undoCount,
      hasClearedBoard: st.hasClearedBoard,
      canProceed: selectCanProceed(st),
    }))
  );
  const checklist = session1Checklist(task.id, s);
  const now = guideTicksNow(guide, task, { ...s, checklist });

  // "Stays ticked": per exercise on screen; an empty board starts over.
  const memo = useRef<{ key: string; reached: Set<number> }>({ key: '', reached: new Set() });
  if (memo.current.key !== taskKey) memo.current = { key: taskKey, reached: new Set() };
  if (getValue(s.counts) === 0) memo.current.reached.clear();
  guide.steps.forEach((st, i) => {
    const sticky = st.tick.kind === 'boardValue' || st.tick.kind === 'boardCounts';
    if (sticky && now[i]) memo.current.reached.add(i);
  });
  const done = guide.steps.map((st, i) => now[i] || ((st.tick.kind === 'boardValue' || st.tick.kind === 'boardCounts') && memo.current.reached.has(i)));

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
  const speech = guideSpeechHe(heading, { ...guide, steps: shown.map((i) => ({ ...guide.steps[i], label: labels[i] })) }, []);

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
