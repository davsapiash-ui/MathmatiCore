import { useRef } from 'react';
import { useWorkspaceStore, requiredCountsOf } from '@/application/useWorkspaceStore';
import { PLACE_ORDER, PLACE_NAMES_HE, countsEqual, describeCountsHe, type Place } from '@/core/placeValue';
import type { SessionTask } from '@/data/sessionTasks';

const CELL = 64;
const PLACE_TINT: Record<Place, string> = {
  units: 'var(--block-unit-dark)',
  tens: 'var(--block-ten-dark)',
  hundreds: 'var(--block-hundred-dark)',
  thousands: 'var(--block-thousand-dark)',
};

/**
 * מסמך 03 §3.3 — "ייצוג" task: build exactly the prescribed blocks on the board
 * (standard or non-standard), check the place-value chart, then write the
 * number in the result row. Proves conservation of quantity: the same number,
 * a different arrangement of blocks.
 */
export function RepresentationTask({ task }: { task: SessionTask }) {
  const counts = useWorkspaceStore((s) => s.counts);
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const setFocusedPlace = useWorkspaceStore((s) => s.setFocusedPlace);
  const isRepresentationInputLocked = useWorkspaceStore((s) => s.isRepresentationInputLocked);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const value = task.numberA ?? 0;
  const required = requiredCountsOf(task);
  const boardMatches = countsEqual(counts, required);
  const locked = isRepresentationInputLocked();

  // Result row: one square per digit of the number, high place on the left.
  const places: Place[] = PLACE_ORDER.slice(0, String(value).length).reverse();

  return (
    <div className="flex flex-col items-center gap-5 mt-4">
      <div className="bg-ws-accentSoft rounded-3xl px-10 py-6 border border-ws-accent/30 text-center">
        <span className="font-display font-black text-6xl text-ws-accent tabular-nums">{value.toLocaleString('he-IL')}</span>
      </div>

      <div
        className="rounded-2xl px-6 py-4 border text-center max-w-md"
        style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.45)', borderColor: 'hsl(var(--ws-blue) / 0.45)' }}
        aria-live="polite"
      >
        <p className="text-sm font-bold text-ws-soft mb-1">בנו בלוח בדיוק:</p>
        <p className="text-xl font-black text-ws-ink">{describeCountsHe(required)}</p>
        <p className={`mt-2 text-sm font-bold ${boardMatches ? 'text-ws-success' : 'text-ws-soft'}`}>
          {boardMatches ? '✓ הלוח תואם — כתבו את המספר בשורת התוצאה' : `בלוח כרגע: ${describeCountsHe(counts)}`}
        </p>
      </div>

      {/* Result row (שורת התוצאה) */}
      <div dir="ltr" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${places.length}, ${CELL}px)` }} role="group" aria-label="שורת התוצאה">
        {places.map((place, i) => (
          <div key={place} className="flex flex-col items-center gap-1">
            <input
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={answerDigits[place] ?? ''}
              readOnly={locked}
              aria-disabled={locked}
              aria-label={`ספרת ה${PLACE_NAMES_HE[place]} בשורת התוצאה`}
              className={`rounded-lg border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                locked ? 'cursor-not-allowed opacity-75' : ''
              }`}
              style={{ width: CELL - 12, height: CELL - 12, fontSize: CELL * 0.48, borderColor: PLACE_TINT[place] }}
              onFocus={() => setFocusedPlace(place)}
              onBlur={() => setFocusedPlace(null)}
              onKeyDown={(e) => {
                if (locked) e.preventDefault();
              }}
              onChange={(e) => {
                if (locked) return;
                const v = e.target.value.replace(/[^0-9]/g, '').slice(-1);
                setAnswerDigit(place, v);
                if (v && i > 0) inputsRef.current[i - 1]?.focus();
              }}
            />
            <span className="font-bold" style={{ fontSize: CELL * 0.22, color: PLACE_TINT[place] }}>
              {PLACE_NAMES_HE[place]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
