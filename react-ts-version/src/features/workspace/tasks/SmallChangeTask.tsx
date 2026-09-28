import { ChoiceList } from './ChoiceList';
import type { TaskChoice } from '@/data/sessionTasks';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

/** השינוי הקטן — תרגיל פתור נתון + שאלת בחירה סגורה (ללא חישוב מחדש). */
export function SmallChangeTask({
  givenHe,
  questionHe,
  choices,
}: {
  givenHe: string;
  questionHe: string;
  choices: TaskChoice[];
}) {
  const speechText = [questionHe, ...choices.map((c) => `${c.id}. ${c.textHe}`)].join('. ');

  return (
    <div className="flex flex-col gap-fl-6-16 mt-fl-0-8">
      <div className="self-center bg-ws-surface2/60 rounded-2xl px-8 py-fl-6-16 border border-ws-surface2">
        <span className="font-mono font-black text-fl-28-36 leading-tight text-ws-ink tabular-nums" dir="ltr">
          {givenHe}
        </span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <p className="text-fl-16-20 font-bold text-ws-ink text-center">{questionHe}</p>
        <UdlSpeechButton text={speechText} />
      </div>
      <ChoiceList choices={choices} />
    </div>
  );
}
