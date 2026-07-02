import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { getValue } from '@/core/placeValue';

/**
 * פירוק והרכבה גמישים — בונים את המספר בלוח, "הוסף ייצוג", ואז דרך שנייה שונה.
 * Validation of "does the board equal the target" happens in store.addRepresentation
 * (with the socratic-mentor mismatch message); two distinct reps are checked at proceed.
 */
export function FlexibleDecompTask({ targetNumber }: { targetNumber: number }) {
  const q3Reps = useWorkspaceStore((s) => s.q3Reps);
  const addRepresentation = useWorkspaceStore((s) => s.addRepresentation);
  const done = q3Reps.length >= 2;

  return (
    <div className="flex flex-col items-center gap-5 mt-4">
      <div className="bg-ws-accentSoft rounded-3xl px-10 py-6 border border-ws-accent/30 text-center">
        <span className="font-display font-black text-6xl text-ws-accent tabular-nums">{targetNumber.toLocaleString('he-IL')}</span>
      </div>

      {/* Recorded representations */}
      {q3Reps.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center" aria-live="polite">
          {q3Reps.map((rep, i) => (
            <span
              key={i}
              className="px-4 py-2 rounded-full bg-green-50 border border-ws-success text-ws-success font-bold text-sm"
            >
              ✓ ייצוג {i + 1}: {getValue(rep).toLocaleString('he-IL')}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={addRepresentation}
        disabled={done}
        className={`h-12 px-8 rounded-full font-display font-extrabold text-lg shadow-md transition-all ${
          done
            ? 'bg-ws-success text-white cursor-default'
            : 'bg-ws-accent text-white hover:brightness-105 active:scale-95'
        }`}
      >
        {done ? '✓✓ שני ייצוגים נרשמו' : `+ הוסף ייצוג (${q3Reps.length + 1}/2)`}
      </button>
    </div>
  );
}
