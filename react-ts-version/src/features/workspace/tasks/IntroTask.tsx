import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { session1Checklist } from '@/core/session1Checklist';
import { Session1ChecklistCard } from './Session1ChecklistCard';

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
    <div className="flex flex-col gap-6 mt-4">
      {checklist ? (
        <Session1ChecklistCard items={checklist} />
      ) : (
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
