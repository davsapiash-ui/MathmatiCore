import { useRef } from 'react';
import type { Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * תרגיל חיבור/חיסור במאונך — שני מחוברים + תיבות תשובה לפי טורים.
 * Two-gate validation happens in the store's proceed(); this renders the inputs.
 * Focusing an answer box drives ASD column dimming (focusedPlace).
 */
export function VerticalAdditionTask({
  numberA,
  numberB,
  isSubtraction,
  answerLength,
}: {
  numberA: number;
  numberB: number;
  isSubtraction?: boolean;
  answerLength: number;
}) {
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const setFocusedPlace = useWorkspaceStore((s) => s.setFocusedPlace);

  // Places for the answer boxes, most-significant first (LTR display order).
  const allPlaces: Place[] = ['thousands', 'hundreds', 'tens', 'units'];
  const places = allPlaces.slice(4 - answerLength);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const PLACE_TINT: Record<Place, string> = {
    units: 'var(--block-unit-dark)',
    tens: 'var(--block-ten-dark)',
    hundreds: 'var(--block-hundred-dark)',
    thousands: 'var(--block-thousand-dark)',
  };

  return (
    <div className="self-center bg-ws-surface2/50 rounded-3xl p-8 shadow-inner" dir="ltr">
      <div className="font-mono font-black text-5xl text-ws-ink text-right tracking-[0.35em] leading-snug select-none">
        <div>{numberA}</div>
        <div className="flex items-center justify-between gap-6 border-b-4 border-ws-ink pb-2">
          <span className="text-ws-accent">{isSubtraction ? '−' : '+'}</span>
          <span>{numberB}</span>
        </div>
      </div>

      {/* Answer boxes, one per place, colored by place (functional color) */}
      <div className="flex justify-end gap-2 mt-5">
        {places.map((place, i) => (
          <input
            key={place}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={answerDigits[place] ?? ''}
            aria-label={`ספרת ה${place === 'units' ? 'יחידות' : place === 'tens' ? 'עשרות' : place === 'hundreds' ? 'מאות' : 'אלפים'} בתשובה`}
            className="w-14 h-16 rounded-xl border-2 text-center font-mono font-black text-4xl bg-ws-surface focus:outline-none focus:ring-2 transition-shadow"
            style={{ borderColor: PLACE_TINT[place] }}
            onFocus={() => setFocusedPlace(place)}
            onBlur={() => setFocusedPlace(null)}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, '').slice(-1);
              setAnswerDigit(place, v);
              if (v && i < places.length - 1) inputsRef.current[i + 1]?.focus();
            }}
          />
        ))}
      </div>
    </div>
  );
}
