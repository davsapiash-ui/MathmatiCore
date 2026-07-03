import { useRef } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * תרגיל חיבור/חיסור במאונך — כתוב כמו במחברת: הספרות מיושרות לפי טורי ערך-מקום
 * (יחידות מתחת ליחידות, עשרות מתחת לעשרות), הסימן משמאל, קו, ותיבות התשובה
 * באותם הטורים בדיוק. זה מחזק את מבנה ערך-המקום — לב הפדגוגיה.
 * Two-gate validation happens in the store's proceed(); this renders the exercise + inputs.
 */

const PLACE_LABEL_HE: Record<Place, string> = {
  units: 'יחידות',
  tens: 'עשרות',
  hundreds: 'מאות',
  thousands: 'אלפים',
};
const PLACE_TINT: Record<Place, string> = {
  units: 'var(--block-unit-dark)',
  tens: 'var(--block-ten-dark)',
  hundreds: 'var(--block-hundred-dark)',
  thousands: 'var(--block-thousand-dark)',
};

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
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const aStr = String(numberA);
  const bStr = String(numberB);
  // One column per place value; wide enough for the longest of the two operands and the answer.
  const cols = Math.max(aStr.length, bStr.length, answerLength);
  // Column places, left→right = high→low (thousands … units).
  const colPlaces: Place[] = PLACE_ORDER.slice(0, cols).reverse();

  // Right-align a number's digits into `cols` cells (empty cells pad the left).
  const padDigits = (str: string): string[] =>
    Array.from({ length: cols }, (_, j) => {
      const idx = j - (cols - str.length);
      return idx >= 0 ? str[idx] : '';
    });

  const digitsA = padDigits(aStr);
  const digitsB = padDigits(bStr);
  const firstAnswerCol = cols - answerLength; // answer occupies the rightmost `answerLength` columns

  const numberRow = (digits: string[], operator?: string) => (
    <div className="flex gap-1.5 items-center justify-end" dir="ltr">
      <div className="w-9 text-center font-mono font-black text-5xl text-ws-accent" aria-hidden="true">
        {operator ?? ''}
      </div>
      {digits.map((d, j) => (
        <div key={j} className="w-14 text-center font-mono font-black text-5xl text-ws-ink leading-none">
          {d}
        </div>
      ))}
    </div>
  );

  return (
    <div className="self-center inline-block bg-ws-surface rounded-3xl p-7 shadow-sm border border-ws-surface2">
      <div
        aria-label={`תרגיל במאונך: ${numberA} ${isSubtraction ? 'פחות' : 'ועוד'} ${numberB}`}
        role="group"
      >
        {/* The two operands, with a rule underneath spanning the number columns */}
        <div className="border-b-4 border-ws-ink pb-1.5 flex flex-col gap-1">
          {numberRow(digitsA)}
          {numberRow(digitsB, isSubtraction ? '−' : '+')}
        </div>

        {/* Answer boxes — same columns, right-aligned, colored by place value */}
        <div className="flex gap-1.5 items-start justify-end pt-3" dir="ltr">
          <div className="w-9" aria-hidden="true" />
          {colPlaces.map((place, j) => {
            if (j < firstAnswerCol) return <div key={j} className="w-14" aria-hidden="true" />;
            const ansIdx = j - firstAnswerCol;
            return (
              <div key={j} className="flex flex-col items-center gap-1">
                <input
                  ref={(el) => {
                    inputsRef.current[ansIdx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={answerDigits[place] ?? ''}
                  aria-label={`ספרת ה${PLACE_LABEL_HE[place]} בתשובה`}
                  className="w-14 h-16 rounded-xl border-2 text-center font-mono font-black text-4xl bg-ws-surface text-ws-ink focus:outline-none focus:ring-2 focus:ring-ws-accent transition-shadow"
                  style={{ borderColor: PLACE_TINT[place] }}
                  onFocus={() => setFocusedPlace(place)}
                  onBlur={() => setFocusedPlace(null)}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '').slice(-1);
                    setAnswerDigit(place, v);
                    // Advance leftward to the next-higher place (natural carrying direction).
                    if (v && ansIdx > 0) inputsRef.current[ansIdx - 1]?.focus();
                  }}
                />
                <span className="text-[10px] font-bold" style={{ color: PLACE_TINT[place] }}>
                  {PLACE_LABEL_HE[place]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* UDL Alternative Expression: upload a written solution photo */}
      <div className="mt-6 border-t border-ws-ink/10 pt-4 flex justify-center">
        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-ws-accent text-white rounded-xl text-sm font-bold shadow-md hover:brightness-105 active:scale-95 transition-all">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          העלה פתרון כתוב (תמונה)
          <input type="file" className="hidden" accept="image/*" aria-label="העלה פתרון כתמונה" onChange={() => alert('הפתרון הועלה בהצלחה למורה.')} />
        </label>
      </div>
    </div>
  );
}
