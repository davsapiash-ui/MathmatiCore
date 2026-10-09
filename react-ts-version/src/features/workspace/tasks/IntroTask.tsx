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

  // Meeting 1 tool steps: their checklist is drawn by the task zone's guide
  // (TaskGuideBlock, under the goal), so this body has nothing more to show.
  const checklist = session1Checklist(task.id, { counts, blocksAddedCount, hasUngrouped, undoCount, hasClearedBoard });
  if (checklist) return null;

  return (
    <div className="flex flex-col gap-fl-8-24 mt-fl-2-16 flex-1 min-h-0 overflow-y-auto" data-testid="checklist-area">
      {task.thoughtQuestionHe && (
            <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5 flex items-start gap-3">
              <p className="text-lg font-bold text-ws-ink leading-relaxed flex-1">{task.thoughtQuestionHe}</p>
              <UdlSpeechButton text={speechText} />
            </div>
          )}
      {task.choices && <ChoiceList choices={task.choices} />}
    </div>
  );
}
