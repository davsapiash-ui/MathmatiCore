import { ChoiceList } from './ChoiceList';
import type { SessionTask } from '@/data/sessionTasks';

/** משימת הפתיחה של מפגש 1 — שאלת חשיבה על שימור הכמות בפריטה. */
export function IntroTask({ task }: { task: SessionTask }) {
  return (
    <div className="flex flex-col gap-3 mt-2">
      {task.thoughtQuestionHe && (
        <div className="bg-ws-accentSoft/60 border border-ws-accent/25 rounded-2xl p-5">
          <p className="text-lg font-bold text-ws-ink leading-relaxed">💭 {task.thoughtQuestionHe}</p>
        </div>
      )}
      {task.choices && <ChoiceList choices={task.choices} />}
    </div>
  );
}
