import { useRef } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { radar } from '@/features/workspace/radarBus';

/**
 * תרגיל חיבור/חיסור במאונך — דף מחברת אמיתי:
 * רקע משבצות שהספרות יושבות בתוך המשבצות שלו (יישור מושלם: רוחב עמודה = משבצת),
 * בלי מסגרות סביב ספרות. סימן משמאל לשורה התחתונה, קו תוצאה עבה,
 * ותיבות התשובה באותן משבצות בדיוק — יחידות מתחת ליחידות.
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

const CELL = 64; // px — one notebook square; grid columns AND paper background share this size

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
  const carryDigits = useWorkspaceStore((s) => s.carryDigits);
  const setCarryDigit = useWorkspaceStore((s) => s.setCarryDigit);
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

  const digitCell = (d: string | null, key: string, place?: Place, extra?: React.CSSProperties) => {
    const isStriked = isSubtraction && place && carryDigits[place];
    
    return (
      <div
        key={key}
        aria-hidden="true"
        className="relative flex items-center justify-center font-mono font-black text-ws-ink leading-none"
        style={{ fontSize: CELL * 0.6, ...extra }}
      >
        {d}
        {isStriked && d && (
          <div className="absolute w-[80%] h-1 bg-red-500 rotate-[-20deg] rounded-full opacity-80 pointer-events-none" />
        )}
      </div>
    );
  };

  return (
    <div className="self-center w-full max-w-md flex flex-col items-center gap-4 bg-ws-surface rounded-3xl border border-ws-surface2 shadow-[0_10px_28px_-14px_hsl(var(--ws-shadow-warm)/0.3)] p-6">
      {/* Notebook paper: background squares EXACTLY the size of a grid column,
          so every digit sits inside a real square — like a math notebook. */}
      <div
        dir="ltr"
        role="group"
        aria-label={`תרגיל במאונך: ${numberA} ${isSubtraction ? 'פחות' : 'ועוד'} ${numberB}`}
        className="grid rounded-2xl shadow-sm"
        style={{
          gridTemplateColumns: `${CELL}px repeat(${cols}, ${CELL}px)`,
          gridTemplateRows: `${CELL}px ${CELL}px ${CELL}px ${CELL}px`,
          padding: `${CELL * 0.75}px ${CELL}px`, // 0.75 top/bottom, 1 full square left/right
          backgroundColor: 'var(--ws-surface)',
          backgroundImage:
            'linear-gradient(rgba(96,130,190,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(96,130,190,0.15) 1px, transparent 1px)',
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition: `0 ${CELL * 0.75}px`, // Shift vertical pattern to align with top padding
          border: '1px solid var(--ws-surface2)',
        }}
      >
        {/* Row 0 — Carry/Borrow inputs */}
        <div aria-hidden="true" />
        {colPlaces.map((place, j) => {
          return (
            <div key={`carry${j}`} className="flex items-end justify-center pb-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={carryDigits[place] ?? ''}
                aria-label={`חלונית המרה ל${PLACE_LABEL_HE[place]}`}
                className="rounded-md border-2 border-ws-surface2 text-center font-mono font-bold bg-ws-surface text-ws-ink focus:outline-none focus:ring-2 focus:ring-ws-accent transition-shadow"
                style={{ width: CELL * 0.6, height: CELL * 0.6, fontSize: CELL * 0.35 }}
                onChange={(e) => {
                  radar.recordAction();
                  const v = e.target.value.replace(/[^0-9]/g, '').slice(-2);
                  setCarryDigit(place, v);
                }}
              />
            </div>
          );
        })}

        {/* Row 1 — first operand (operator gutter empty) */}
        <div aria-hidden="true" />
        {digitsA.map((d, j) => digitCell(d, `a${j}`, colPlaces[j]))}

        {/* Row 2 — operator + second operand; thick result line under the digits */}
        <div
          aria-hidden="true"
          className="flex items-center justify-center font-mono font-black leading-none"
          style={{ fontSize: CELL * 0.55, color: 'hsl(var(--ws-accent))' }}
        >
          {isSubtraction ? '−' : '+'}
        </div>
        {digitsB.map((d, j) => digitCell(d, `b${j}`, undefined, { borderBottom: '4px solid hsl(var(--ws-ink))' }))}

        {/* Row 3 — answer inputs inside the same squares (units under units) */}
        <div aria-hidden="true" />
        {colPlaces.map((place, j) => {
          if (j < firstAnswerCol) return <div key={`e${j}`} aria-hidden="true" />;
          const ansIdx = j - firstAnswerCol;
          return (
            <div key={`ans${j}`} className="flex items-center justify-center">
              <input
                ref={(el) => {
                  inputsRef.current[ansIdx] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={answerDigits[place] ?? ''}
                aria-label={`ספרת ה${PLACE_LABEL_HE[place]} בתשובה`}
                className="rounded-lg border-2 text-center font-mono font-black bg-ws-surface text-ws-ink focus:outline-none focus:ring-2 focus:ring-ws-accent transition-shadow"
                style={{ width: CELL - 12, height: CELL - 12, fontSize: CELL * 0.48, borderColor: PLACE_TINT[place] }}
                onFocus={() => setFocusedPlace(place)}
                onBlur={() => setFocusedPlace(null)}
                onChange={(e) => {
                  radar.recordAction();
                  const v = e.target.value.replace(/[^0-9]/g, '').slice(-1);
                  setAnswerDigit(place, v);
                  // Advance leftward to the next-higher place (natural carrying direction).
                  if (v && ansIdx > 0) inputsRef.current[ansIdx - 1]?.focus();
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Place labels under the paper, aligned to the answer columns */}
      <div dir="ltr" className="grid" style={{ gridTemplateColumns: `${CELL}px repeat(${cols}, ${CELL}px)` }}>
        <div aria-hidden="true" />
        {colPlaces.map((place, j) =>
          j < firstAnswerCol ? (
            <div key={`l${j}`} aria-hidden="true" />
          ) : (
            <span key={`l${j}`} className="text-center text-[11px] font-bold" style={{ color: PLACE_TINT[place] }}>
              {PLACE_LABEL_HE[place]}
            </span>
          )
        )}
      </div>


    </div>
  );
}
