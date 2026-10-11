import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { TaskChoice } from '@/data/sessionTasks';
import { MathText } from './MathText';

/** רשימת בחירה סגורה — radiogroup עם אות מזהה, מצב נבחר ברור. */
export function ChoiceList({ choices, promptHe }: { choices: TaskChoice[]; promptHe?: string }) {
  const selected = useWorkspaceStore((s) => s.selectedChoiceId);
  const selectChoice = useWorkspaceStore((s) => s.selectChoice);

  return (
    <div role="radiogroup" aria-label={promptHe ?? 'בחרו את התשובה הנכונה'} className="flex flex-col gap-fl-6-12 mt-fl-4-16">
      {promptHe && <p className="font-bold text-ws-ink">{promptHe}</p>}
      {choices.map((choice) => {
        const isSelected = selected === choice.id;
        return (
          <button
            key={choice.id}
            role="radio"
            aria-checked={isSelected}
            onClick={() => selectChoice(choice.id)}
            className={`text-right px-4 py-fl-6-16 rounded-2xl border-2 transition-all font-medium leading-relaxed flex items-start gap-3 ${
              isSelected
                ? 'border-ws-accent bg-ws-accentSoft shadow-[0_8px_20px_-8px_hsl(var(--ws-accent)/0.5)] scale-[1.01]'
                : 'border-ws-surface2 bg-ws-surface hover:border-ws-accent/50 hover:bg-ws-accentSoft/40 hover:-translate-y-0.5 hover:shadow-md'
            }`}
          >
            <span
              className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-base transition-all ${
                isSelected ? 'ws-btn-primary rotate-[-4deg]' : 'bg-ws-bg border border-ws-surface2 text-ws-soft'
              }`}
            >
              {choice.id}
            </span>
            <span className="text-ws-ink pt-1.5 flex-1 leading-snug"><MathText text={choice.textHe} /></span>
            {/* A neutral "selected" mark, never a tick: the choice is not checked here, and a ✓ on a
                wrong option read as "correct" on the projector (owner, 11.10.2026). */}
            <span
              aria-hidden="true"
              className={`shrink-0 mt-2 w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-ws-accent' : 'border-ws-surface2'}`}
            >
              {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-ws-accent" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
