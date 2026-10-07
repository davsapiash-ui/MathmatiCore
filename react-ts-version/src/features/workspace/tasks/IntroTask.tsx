import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { session1Checklist } from '@/core/session1Checklist';

/** משימת הפתיחה של מפגש 1 — שאלת חשיבה או משימת חקר בארגז החול. */
export function IntroTask({ task }: { task: SessionTask }) {
  const counts = useWorkspaceStore((s) => s.counts);
  const blocksAddedCount = useWorkspaceStore((s) => s.blocksAddedCount);
  const hasUngrouped = useWorkspaceStore((s) => s.hasUngrouped);
  const undoCount = useWorkspaceStore((s) => s.undoCount);
  const hasClearedBoard = useWorkspaceStore((s) => s.hasClearedBoard);

  // UDL: the densest text on screen gets audio too — question + all choices in one read.
  const speechText = [task.thoughtQuestionHe, ...(task.choices ?? []).map((c) => `${c.id}. ${c.textHe}`)]
    .filter(Boolean)
    .join('. ');

  // Meeting 1 tool steps (מסמך 03 §3.1): a checklist the learner ticks off by
  // acting — the same rule the store applies to "התקדם".
  const checklist = session1Checklist(task.id, { counts, blocksAddedCount, hasUngrouped, undoCount, hasClearedBoard });

  return (
    <div className="flex flex-col gap-fl-8-24 mt-fl-2-16 flex-1 min-h-0 overflow-y-auto" data-testid="checklist-area">
      {/* The automatic ✓ checklist of the tool steps is gone (owner,
          7.10.2026): it repeated the instruction, and a tick the system gives
          on "לחצו ↺" is not the child's judgement. The instruction's numbered
          steps (TaskCard) are the checklist; the store's "התקדם" gate still
          reads session1Checklist. */}
      {checklist ? null : (
        <>
          {task.thoughtQuestionHe && (
            <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5 flex items-start gap-3">
              <p className="text-lg font-bold text-ws-ink leading-relaxed flex-1">💭 {task.thoughtQuestionHe}</p>
              <UdlSpeechButton text={speechText} />
            </div>
          )}
          {task.choices && <ChoiceList choices={task.choices} />}
        </>
      )}
    </div>
  );
}
