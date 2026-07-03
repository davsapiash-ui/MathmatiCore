import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import type { TaskChoice } from '@/data/sessionTasks';

/** רשימת בחירה סגורה — radiogroup עם אות מזהה, מצב נבחר ברור. */
export function ChoiceList({ choices, promptHe }: { choices: TaskChoice[]; promptHe?: string }) {
  const selected = useWorkspaceStore((s) => s.selectedChoiceId);
  const selectChoice = useWorkspaceStore((s) => s.selectChoice);

  return (
    <div role="radiogroup" aria-label={promptHe ?? 'בחרו את התשובה הנכונה'} className="flex flex-col gap-3 mt-4">
      {promptHe && <p className="font-bold text-ws-ink">{promptHe}</p>}
      {choices.map((choice) => {
        const isSelected = selected === choice.id;
        return (
          <button
            key={choice.id}
            role="radio"
            aria-checked={isSelected}
            onClick={() => selectChoice(choice.id)}
            className={`text-right p-4 rounded-2xl border-2 transition-all font-medium leading-relaxed flex items-start gap-3 ${
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
            <span className="text-ws-ink pt-1.5 flex-1">{choice.textHe}</span>
            {isSelected && (
              <span aria-hidden="true" className="shrink-0 text-ws-accent text-xl font-black pt-1">✓</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
