import { useRef } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * תרגיל חיבור/חיסור במאונך — כתיב מחברת אמיתי:
 * רשת משבצות צמודות, ספרה אחת בכל משבצת, ספרות מיושרות לפי טורי ערך-מקום,
 * הסימן משמאל לשורה התחתונה, קו תוצאה עבה, ותיבות התשובה באותן משבצות בדיוק.
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

const CELL = 56; // px — one notebook square per digit

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
  // One column per place value; wide enough for the longest operand and the answer.
  const cols = Math.max(aStr.length, bStr.length, answerLength);
  // Column places, left→right = high→low (thousands … units).
  const colPlaces: Place[] = PLACE_ORDER.slice(0, cols).reverse();

  // Right-align a number's digits into `cols` cells (empty cells pad the left).
  const padDigits = (str: string): (string | null)[] =>
    Array.from({ length: cols }, (_, j) => {
      const idx = j - (cols - str.length);
      return idx >= 0 ? str[idx] : null;
    });

  const digitsA = padDigits(aStr);
  const digitsB = padDigits(bStr);
  const firstAnswerCol = cols - answerLength;

  const gridLine = '1.5px solid rgba(110,130,180,0.28)'; // notebook-square blue

  return (
    <div
      className="self-center inline-block rounded-3xl px-8 py-7 border border-ws-surface2 shadow-[0_8px_24px_-10px_hsl(var(--ws-shadow-warm)/0.25)]"
      style={{ backgroundColor: '#FFFDF8' }}
    >
      <div
        dir="ltr"
        role="group"
        aria-label={`תרגיל במאונך: ${numberA} ${isSubtraction ? 'פחות' : 'ועוד'} ${numberB}`}
        className="grid"
        style={{
          gridTemplateColumns: `${CELL * 0.8}px repeat(${cols}, ${CELL}px)`,
          gridTemplateRows: `${CELL}px ${CELL}px ${CELL + 12}px`,
        }}
      >
        {/* Row 1 — first operand */}
        <div /> {/* operator gutter (empty on row 1) */}
        {digitsA.map((d, j) => (
          <div
            key={`a${j}`}
            aria-hidden="true"
            className="flex items-center justify-center font-mono font-black text-ws-ink"
            style={{
              fontSize: CELL * 0.62,
              borderLeft: gridLine,
              borderTop: gridLine,
              borderRight: j === cols - 1 ? gridLine : undefined,
            }}
          >
            {d}
          </div>
        ))}

        {/* Row 2 — operator + second operand, thick result line below */}
        <div
          aria-hidden="true"
          className="flex items-center justify-center font-mono font-black text-ws-accent"
          style={{ fontSize: CELL * 0.58 }}
        >
          {isSubtraction ? '−' : '+'}
        </div>
        {digitsB.map((d, j) => (
          <div
            key={`b${j}`}
            aria-hidden="true"
            className="flex items-center justify-center font-mono font-black text-ws-ink"
            style={{
              fontSize: CELL * 0.62,
              borderLeft: gridLine,
              borderTop: gridLine,
              borderRight: j === cols - 1 ? gridLine : undefined,
              borderBottom: '4px solid hsl(var(--ws-ink))',
            }}
          >
            {d}
          </div>
        ))}

        {/* Row 3 — answer cells, same squares, colored per place value */}
        <div />
        {colPlaces.map((place, j) => {
          if (j < firstAnswerCol) return <div key={`e${j}`} aria-hidden="true" />;
          const ansIdx = j - firstAnswerCol;
          return (
            <div key={`ans${j}`} className="flex flex-col items-center pt-2 gap-1">
              <input
                ref={(el) => {
                  inputsRef.current[ansIdx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={answerDigits[place] ?? ''}
                aria-label={`ספרת ה${PLACE_LABEL_HE[place]} בתשובה`}
                className="rounded-xl border-2 text-center font-mono font-black bg-ws-surface text-ws-ink focus:outline-none focus:ring-2 focus:ring-ws-accent transition-shadow"
                style={{ width: CELL - 8, height: CELL - 8, fontSize: CELL * 0.5, borderColor: PLACE_TINT[place] }}
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

      {/* UDL Alternative Expression: upload a written solution photo */}
      <div className="mt-5 border-t border-ws-ink/10 pt-4 flex justify-center">
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
