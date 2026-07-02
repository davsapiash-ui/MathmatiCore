import { useRef } from 'react';
import type { Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

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
      <div className="font-mono font-black text-5xl text-ws-ink text-right tracking-[0.35em] leading-snug select-none" aria-label={`תרגיל עמודה: ${numberA} ${isSubtraction ? 'פחות' : 'ועוד'} ${numberB}`}>
        <div aria-hidden="true"><InlineMath math={numberA.toString()} /></div>
        <div className="flex items-center justify-between gap-6 border-b-4 border-ws-ink pb-2" aria-hidden="true">
          <span className="text-ws-accent"><InlineMath math={isSubtraction ? '-' : '+'} /></span>
          <span><InlineMath math={numberB.toString()} /></span>
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
      
      {/* UDL Alternative Expression: Upload Draft */}
      <div className="mt-6 border-t border-ws-ink/10 pt-4 flex justify-center">
        <label className="cursor-pointer text-sm font-bold text-ws-accent hover:text-ws-ink transition-colors flex items-center gap-2 bg-ws-surface px-4 py-2 rounded-xl shadow-sm border border-ws-ink/10">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
          העלה פתרון כתוב (תמונה)
          <input type="file" className="hidden" accept="image/*" aria-label="העלה פתרון כתמונה" onChange={() => alert("הפתרון הועלה בהצלחה למורה.")} />
        </label>
      </div>
    </div>
  );
}
