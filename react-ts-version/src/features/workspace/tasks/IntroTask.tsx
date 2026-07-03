import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { HourglassTimer } from './HourglassTimer';

/** משימת הפתיחה של מפגש 1 — שאלת חשיבה על שימור הכמות בפריטה. */
export function IntroTask({ task }: { task: SessionTask }) {
  // UDL: the densest text on screen gets audio too — question + all choices in one read.
  const speechText = [task.thoughtQuestionHe, ...(task.choices ?? []).map((c) => `${c.id}. ${c.textHe}`)]
    .filter(Boolean)
    .join('. ');

  return (
    <div className="flex flex-col gap-3 mt-2">
      {task.id === 's1_sandbox' && (
        <HourglassTimer initialMinutes={3} />
      )}
      {task.thoughtQuestionHe && (
        <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5 flex items-start gap-3">
          <p className="text-lg font-bold text-ws-ink leading-relaxed flex-1">💭 {task.thoughtQuestionHe}</p>
          <UdlSpeechButton text={speechText} />
        </div>
      )}
      {task.choices && <ChoiceList choices={task.choices} />}
    </div>
  );
}
