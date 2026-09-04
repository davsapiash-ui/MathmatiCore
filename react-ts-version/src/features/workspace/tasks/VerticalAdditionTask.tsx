import { useRef, useEffect, useState } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';

/**
 * תרגיל חיבור/חיסור במאונך — דף מחברת אמיתי:
 * רקע משבצות שהספרות יושבות בתוך המשבצות שלו (יישור מושלם: רוחב עמודה = משבצת),
 * בלי מסגרות סביב ספרות. סימן משמאל לשורה התחתונה, קו תוצאה עבה,
 * ותיבות התשובה באותן משבצות בדיוק — יחידות מתחת ליחידות.
 * 
 * [Developer Instruction: Implement conditional column keyboard locking in worksheet addition steps 
 * during dynamic exchange operations, while keeping memory circles active for working memory relief.]
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
  hiddenA = [],
  hiddenB = [],
  revealedResult = {},
}: {
  numberA: number;
  numberB: number;
  isSubtraction?: boolean;
  answerLength: number;
  /** Skeleton exercise (מסמך 03): operand digits the learner discovers and types instead of reading. */
  hiddenA?: Place[];
  hiddenB?: Place[];
  /** Skeleton exercise: result digits given up-front, shown fixed instead of as inputs. */
  revealedResult?: Partial<Record<Place, string>>;
}) {
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const operandDigits = useWorkspaceStore((s) => s.operandDigits);
  const setOperandDigit = useWorkspaceStore((s) => s.setOperandDigit);
  const carryDigits = useWorkspaceStore((s) => s.carryDigits);
  const setCarryDigit = useWorkspaceStore((s) => s.setCarryDigit);
  const setFocusedPlace = useWorkspaceStore((s) => s.setFocusedPlace);
  const keyboardState = useWorkspaceStore((s) => s.keyboardState);
  const hasGrouped = useWorkspaceStore((s) => s.hasGrouped);
  const isStoreColumnLocked = useWorkspaceStore((s) => s.isColumnInputLocked);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const [shake, setShake] = useState(false);
  const [_lockedClicks, setLockedClicks] = useState(0);

  useEffect(() => {
    if (keyboardState === 'UNLOCKED') {
      setLockedClicks(0);
    }
  }, [keyboardState]);

  // The hesitation hierarchy is NOT timed here. This component used to run its
  // own 45s timer that opened the addition grid and switched the keyboard to
  // Socratic at the same instant — collapsing Module 10's 30s grid stage and
  // Module 12's 45s Socratic stage onto one deadline, firing both from a
  // keyboard-lock state rather than from actual learner inactivity, and racing
  // the radar hook into a double Socratic transition. useCognitiveHesitationRadar
  // is the single owner of both stages; see its header.

  const handleLockedInteraction = () => {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  };

  const aStr = String(numberA);
  const bStr = String(numberB);

  // One column per place value; wide enough for the longest operand, the answer, and at least 4 places.
  const cols = Math.max(aStr.length, bStr.length, answerLength, 4);
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

  /**
   * Evaluates if input for a specific column should be locked:
   * Delegated to central Zustand store per PRD v3.3 Module 9
   */
  const isColumnInputLocked = (place: Place): boolean => {
    return isStoreColumnLocked(place, numberA, numberB, isSubtraction);
  };

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

  const shakeStyle = shake ? { transform: 'translateX(4px)' } : {};

  /** A hidden operand digit: an input in the operand's own square (skeleton exercises). */
  const operandInput = (which: 'a' | 'b', place: Place, key: string, extra?: React.CSSProperties) => (
    <div key={key} className="flex items-center justify-center" style={extra}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={1}
        value={operandDigits[which][place] ?? ''}
        aria-label={`ספרת ה${PLACE_LABEL_HE[place]} החסרה ב${which === 'a' ? 'מספר הראשון' : 'מספר השני'}`}
        className="rounded-lg border-2 border-dashed text-center font-mono font-black bg-ws-accentSoft/40 text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent"
        style={{ width: CELL - 12, height: CELL - 12, fontSize: CELL * 0.48, borderColor: PLACE_TINT[place] }}
        onFocus={() => setFocusedPlace(place)}
        onBlur={() => setFocusedPlace(null)}
        onChange={(e) => setOperandDigit(which, place, e.target.value)}
      />
    </div>
  );

  /** A result digit the exercise reveals: fixed, not typed (skeleton exercises). */
  const revealedCell = (d: string, place: Place, key: string) => (
    <div
      key={key}
      className="flex items-center justify-center rounded-lg border-2 font-mono font-black text-ws-ink/80 bg-ws-surface2/40"
      style={{ width: CELL - 12, height: CELL - 12, fontSize: CELL * 0.48, borderColor: PLACE_TINT[place], margin: 'auto' }}
      aria-label={`ספרת ה${PLACE_LABEL_HE[place]} בתשובה, נתונה: ${d}`}
    >
      {d}
    </div>
  );

  return (
    <div className="self-center w-full max-w-md flex flex-col items-center gap-4 bg-ws-surface rounded-3xl border border-ws-surface2 shadow-[0_10px_28px_-14px_hsl(var(--ws-shadow-warm)/0.3)] p-6 relative">
      {/* Notebook paper: background squares EXACTLY the size of a grid column */}
      <div
        dir="ltr"
        role="group"
        aria-label={`תרגיל במאונך: ${numberA} ${isSubtraction ? 'פחות' : 'ועוד'} ${numberB}`}
        className="grid rounded-2xl shadow-sm"
        style={{
          gridTemplateColumns: `${CELL}px repeat(${cols}, ${CELL}px)`,
          gridTemplateRows: `${CELL}px ${CELL}px ${CELL}px ${CELL}px`,
          padding: `${CELL * 0.75}px ${CELL}px`,
          backgroundColor: 'var(--ws-surface)',
          backgroundImage:
            'linear-gradient(rgba(96,130,190,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(96,130,190,0.15) 1px, transparent 1px)',
          backgroundSize: `${CELL}px ${CELL}px`,
          backgroundPosition: `0 ${CELL * 0.75}px`,
        }}
      >
        {/* Row 0 — Carry/Borrow inputs (Memory circles ALWAYS active for working memory relief) */}
        <div aria-hidden="true" />
        {colPlaces.map((place, j) => {
          return (
            <div key={`carry${j}`} className="flex items-end justify-center pb-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={carryDigits[place] ?? ''}
                readOnly={false}
                aria-label={`חלונית המרה ל${PLACE_LABEL_HE[place]}`}
                className="rounded-full border-2 border-ws-surface2 text-center font-mono font-bold bg-ws-surface text-ws-ink transition-shadow focus:outline-none focus:ring-2 focus:ring-ws-accent shadow-sm"
                style={{ width: CELL * 0.6, height: CELL * 0.6, fontSize: CELL * 0.35 }}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '').slice(-2);
                  setCarryDigit(place, v);
                }}
              />
            </div>
          );
        })}

        {/* Row 1 — first operand */}
        <div aria-hidden="true" />
        {digitsA.map((d, j) =>
          d !== null && hiddenA.includes(colPlaces[j]) ? operandInput('a', colPlaces[j], `a${j}`) : digitCell(d, `a${j}`, colPlaces[j])
        )}

        {/* Row 2 — second operand + operator; thick result line under both */}
        {(() => {
          const firstNonEmptyA = digitsA.findIndex((d) => d !== null);
          const firstNonEmptyB = digitsB.findIndex((d) => d !== null);
          const firstNonEmptyBoth = Math.min(
            firstNonEmptyA === -1 ? Infinity : firstNonEmptyA,
            firstNonEmptyB === -1 ? Infinity : firstNonEmptyB
          );
          const operatorIndex = firstNonEmptyBoth === Infinity ? -1 : firstNonEmptyBoth - 1;
          const operatorChar = isSubtraction ? '−' : '﬩';
          
          return (
            <>
              {/* Gutter column */}
              {operatorIndex < 0 ? (
                <div
                  key="operator-gutter"
                  className="relative"
                  style={{ borderBottom: '4px solid hsl(var(--ws-ink))' }}
                >
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-end font-mono font-black leading-none"
                    style={{ 
                      fontSize: CELL * 0.6, 
                      color: 'hsl(var(--ws-accent))',
                      transform: 'translateY(-32px)',
                      paddingRight: '8px',
                      height: CELL,
                      zIndex: 10
                    }}
                  >
                    {operatorChar}
                  </div>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  style={{ borderBottom: '4px solid hsl(var(--ws-ink))' }}
                />
              )}

              {/* Digits and middle operator */}
              {digitsB.map((d, j) => {
                if (j === operatorIndex) {
                  return (
                    <div 
                      key={`operator-container-${j}`}
                      className="relative"
                      style={{ borderBottom: '4px solid hsl(var(--ws-ink))' }}
                    >
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 flex items-center justify-end font-mono font-black leading-none"
                        style={{ 
                          fontSize: CELL * 0.6, 
                          color: 'hsl(var(--ws-accent))',
                          transform: 'translateY(-32px)',
                          paddingRight: '8px',
                          height: CELL,
                          zIndex: 10
                        }}
                      >
                        {operatorChar}
                      </div>
                    </div>
                  );
                }
                if (d !== null && hiddenB.includes(colPlaces[j])) {
                  return operandInput('b', colPlaces[j], `b${j}`, { borderBottom: '4px solid hsl(var(--ws-ink))' });
                }
                return digitCell(d, `b${j}`, undefined, { borderBottom: '4px solid hsl(var(--ws-ink))' });
              })}
            </>
          );
        })()}

        {/* Row 3 — answer inputs inside the same squares (units under units) */}
        <div aria-hidden="true" />
        {colPlaces.map((place, j) => {
          if (j < firstAnswerCol) return <div key={`e${j}`} aria-hidden="true" />;
          const ansIdx = j - firstAnswerCol;
          const revealed = revealedResult[place];
          if (revealed !== undefined) {
            return <div key={`ans${j}`} className="flex items-center justify-center">{revealedCell(revealed, place, `rev${j}`)}</div>;
          }
          const isLocked = isColumnInputLocked(place);
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
                readOnly={isLocked}
                aria-label={`ספרת ה${PLACE_LABEL_HE[place]} בתשובה`}
                aria-disabled={isLocked}
                className={`rounded-lg border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                  isLocked ? 'cursor-not-allowed opacity-75' : ''
                }`}
                style={{ width: CELL - 12, height: CELL - 12, fontSize: CELL * 0.48, borderColor: PLACE_TINT[place], ...shakeStyle }}
                onFocus={() => {
                  if (isLocked) {
                    setShake(true);
                    setTimeout(() => setShake(false), 500);
                  }
                  setFocusedPlace(place);
                }}
                onBlur={() => setFocusedPlace(null)}
                onKeyDown={(e) => {
                  if (isLocked) {
                    e.preventDefault();
                    setShake(true);
                    setTimeout(() => setShake(false), 500);
                  }
                }}
                onChange={(e) => {
                  if (isLocked) {
                    setShake(true);
                    setTimeout(() => setShake(false), 500);
                    return;
                  }
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
            <div
              key={`l${j}`}
              className="text-center font-bold"
              style={{ width: CELL, fontSize: CELL * 0.22, color: PLACE_TINT[place] }}
            >
              {PLACE_LABEL_HE[place]}
            </div>
          )
        )}
      </div>
    </div>
  );
}
