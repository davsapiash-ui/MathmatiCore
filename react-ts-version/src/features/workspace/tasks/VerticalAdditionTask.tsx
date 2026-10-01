import { useRef, useEffect, useState } from 'react';
import { PLACE_ORDER, type Place } from '@/core/placeValue';
import { MISSING_DIGIT_BOX, speakMissingDigits } from '@/core/missingDigitSpeech';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { NEUTRAL_BOX_BORDER, PLACE_COLORS } from '../placeColors';
import { useEnhancedSupport } from './useEnhancedSupport';
import { resultRowCues, PLACE_CUE_LINE_HE } from '@/core/placeCues';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

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
/** The board columns' colour code (placeColors.ts): box borders and place labels. */
const BOARD_PLACE_TINT: Record<Place, string> = {
  units: PLACE_COLORS.units.header,
  tens: PLACE_COLORS.tens.header,
  hundreds: PLACE_COLORS.hundreds.header,
  thousands: PLACE_COLORS.thousands.header,
};
const NEUTRAL_TINT: Record<Place, string> = {
  units: NEUTRAL_BOX_BORDER,
  tens: NEUTRAL_BOX_BORDER,
  hundreds: NEUTRAL_BOX_BORDER,
  thousands: NEUTRAL_BOX_BORDER,
};

/**
 * An operand as the exercise's screen-reader label says it. In a skeleton
 * exercise the hidden digit is what the child has to find, and the label must
 * not say it (PRD Module 13: the answer is never revealed): each hidden place
 * is written as a box, and the operand is said the way the read-aloud says a
 * number with boxes (core/missingDigitSpeech.ts) — "3, ספרה חסרה, 6". An
 * operand with no hidden digit is said as the number, as before.
 */
function spokenOperand(digits: string, hidden: Place[]): string {
  const written = digits
    .split('')
    .map((d, i) => (hidden.includes(PLACE_ORDER[digits.length - 1 - i]) ? MISSING_DIGIT_BOX : d))
    .join('');
  return speakMissingDigits(written);
}

/** One notebook square: grid columns AND paper background share it. A CSS
 * length (--ws-cell, index.css) — 64px on a tall screen, smaller on a short or
 * narrow laptop screen so the result row stays in view (owner, 27.9.2026). */
const CELL = "var(--ws-cell)";
const cell = (k: number) => `calc(${CELL} * ${k})`;
const cellMinus = (px: number) => `calc(${CELL} - ${px}px)`;

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
  // The memory circle lights its column (core/columnFocus.ts) through a view
  // store only; it never sets focusedPlace, which the telemetry reads.
  const setFocusedMemoryCircle = useBoardFocusStore((s) => s.setFocusedMemoryCircle);
  const keyboardState = useWorkspaceStore((s) => s.keyboardState);
  const isStoreColumnLocked = useWorkspaceStore((s) => s.isColumnInputLocked);
  const recordBlockedKeystroke = useWorkspaceStore((s) => s.recordBlockedKeystroke);
  // Meeting 2 (owner, 27.9.2026): without the enhanced cognitive support profile
  // the result row is one neutral colour and has no place labels. Every other
  // meeting, and a learner with the profile, keep the board's colours.
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const enhancedSupport = useEnhancedSupport();
  // Stations 3–7 (owner, 30.9.2026): the cues are a scaffold after a digit in the
  // wrong place — core/placeCues.ts. Spoken place names follow the labels shown:
  // the enhanced profile has the colours from the start, but not the names.
  const placeCuesShown = useWorkspaceStore((s) => s.placeCuesShown);
  const cues = resultRowCues(sessionNumber, enhancedSupport, placeCuesShown);
  const spokenPlaces = cues.labels;
  const PLACE_TINT = cues.colours ? BOARD_PLACE_TINT : NEUTRAL_TINT;
  const scaffoldStation = sessionNumber >= 3 && sessionNumber <= 7;
  const cueLine = scaffoldStation && placeCuesShown ? PLACE_CUE_LINE_HE[enhancedSupport ? 'enhanced' : 'regular'] : null;
  // Station 1 (owner, 29.9.2026): the text names "עיגול הזיכרון", and the circles
  // carry no words — they are marked until the child writes in one, as the
  // undo button and the trash are (index.css .ws-hint-ring).
  const circlesHint = sessionNumber === 1 && !Object.values(carryDigits).some((v) => Boolean(v));
  // Paper over the memory circles: half a square in meeting 2 (its card is the
  // whole screen and must fit a short window), three quarters elsewhere.
  const PAPER_TOP = sessionNumber === 2 ? cell(0.5) : cell(0.75);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Module 9: a keystroke into a locked box shakes that box only — as in
  // RepresentationTask. One flag for the whole row shook every result box,
  // open ones included.
  const [shakingPlace, setShakingPlace] = useState<Place | null>(null);
  const shake = (place: Place) => {
    setShakingPlace(place);
    setTimeout(() => setShakingPlace((p) => (p === place ? null : p)), 500);
  };
  const [_lockedClicks, setLockedClicks] = useState(0);

  // A circle that unmounts while focused (next exercise) fires no blur.
  // (TaskCard remounts the sheet for every exercise.)
  useEffect(() => () => setFocusedMemoryCircle(null), [setFocusedMemoryCircle]);

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
  /** The leftmost column that holds a digit (the memory circles start there). */
  const firstUsedCol = Math.min(firstAnswerCol, cols - aStr.length, cols - bStr.length);

  /**
   * Evaluates if input for a specific column should be locked:
   * Delegated to central Zustand store per PRD v3.3 Module 9
   */
  const isColumnInputLocked = (place: Place): boolean => {
    return isStoreColumnLocked(place, numberA, numberB, isSubtraction);
  };

  const digitCell = (d: string | null, key: string, place?: Place, extra?: React.CSSProperties) => {
    const isStriked = Boolean(isSubtraction && place && carryDigits[place]);

    // מסמך העיצוב §1.1: אסור להעביר מידע בצבע בלבד. "הספרה הזאת נפרטה"
    // הועבר עד כה אך ורק בקו אדום מצויר, בתוך תא שכולו aria-hidden — כך
    // שלומד שאינו מבחין באדום, או שנעזר בהקראה, לא קיבל את המידע כלל.
    // הקו נשאר, ולצידו סימון טקסטואלי מפורש להקראה ושינוי צורת הספרה
    // עצמה (דהויה וקו חוצה) שאינו תלוי בגוון.
    return (
      <div
        key={key}
        aria-hidden={isStriked && d ? undefined : 'true'}
        role={isStriked && d ? 'text' : undefined}
        aria-label={
          isStriked && d
            ? `הספרה ${d}${place && spokenPlaces ? ` בטור ה${PLACE_LABEL_HE[place]}` : ''} — נפרטה`
            : undefined
        }
        className={`relative flex items-center justify-center font-mono font-black text-ws-ink leading-none ${
          isStriked && d ? 'opacity-60' : ''
        }`}
        style={{ fontSize: cell(0.6), ...extra }}
      >
        {d}
        {isStriked && d && (
          <div className="absolute w-[80%] h-1 bg-red-500 rotate-[-20deg] rounded-full opacity-80 pointer-events-none" />
        )}
      </div>
    );
  };

  /** A hidden operand digit: an input in the operand's own square (skeleton exercises). */
  const operandInput = (which: 'a' | 'b', place: Place, key: string, extra?: React.CSSProperties) => {
    const str = which === 'a' ? aStr : bStr;
    const number = which === 'a' ? 'מספר הראשון' : 'מספר השני';
    const position = colPlaces.indexOf(place) - (cols - str.length) + 1;
    return (
    <div key={key} className="flex items-center justify-center" style={extra}>
      <input
        type="text"
        inputMode="numeric"
        maxLength={1}
        value={operandDigits[which][place] ?? ''}
        aria-label={spokenPlaces ? `ספרת ה${PLACE_LABEL_HE[place]} החסרה ב${number}` : `הספרה החסרה ב${number}: ספרה ${position} מתוך ${str.length}`}
        className="rounded-xl border-2 border-dashed text-center font-mono font-black bg-ws-accentSoft/40 text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent"
        style={{ width: cellMinus(12), height: cellMinus(12), fontSize: cell(0.48), borderColor: PLACE_TINT[place] }}
        onFocus={() => setFocusedPlace(place)}
        onBlur={() => setFocusedPlace(null)}
        onChange={(e) => setOperandDigit(which, place, e.target.value)}
      />
    </div>
    );
  };

  /** A result digit the exercise reveals: fixed, not typed (skeleton exercises). */
  const revealedCell = (d: string, place: Place, key: string) => (
    <div
      key={key}
      className="flex items-center justify-center rounded-xl border-2 font-mono font-black text-ws-ink/80 bg-ws-surface2/40"
      style={{ width: cellMinus(12), height: cellMinus(12), fontSize: cell(0.48), borderColor: PLACE_TINT[place], margin: 'auto' }}
      aria-label={
        spokenPlaces
          ? `ספרת ה${PLACE_LABEL_HE[place]} בתשובה, נתונה: ${d}`
          : `ספרה ${colPlaces.indexOf(place) - firstAnswerCol + 1} מתוך ${answerLength} בשורת התוצאה, נתונה: ${d}`
      }
    >
      {d}
    </div>
  );

  return (
    <div className="shrink-0 self-center w-full max-w-md flex flex-col items-center gap-fl-4-16 bg-ws-surface rounded-3xl border border-ws-surface2 shadow-[0_10px_28px_-14px_hsl(var(--ws-shadow-warm)/0.3)] p-fl-8-24 relative">
      {/* The scaffold line (owner, 30.9.2026): it stays until the end of the
          exercise, with a read-aloud button — played only on the child's click. */}
      {cueLine && (
        <div data-testid="place-cue-line" className="w-full flex items-center gap-2 rounded-xl bg-ws-surface2/60 px-3 py-1" dir="rtl">
          <p className="flex-1 text-sm font-bold text-ws-ink leading-snug">{cueLine}</p>
          <UdlSpeechButton text={cueLine} className="shrink-0" />
        </div>
      )}
      {/* Notebook paper: background squares EXACTLY the size of a grid column */}
      <div
        dir="ltr"
        role="group"
        aria-label={`תרגיל במאונך: ${spokenOperand(aStr, hiddenA)} ${isSubtraction ? 'פחות' : 'ועוד'} ${spokenOperand(bStr, hiddenB)}`}
        className="grid rounded-2xl shadow-sm"
        style={{
          gridTemplateColumns: `${CELL} repeat(${cols}, ${CELL})`,
          gridTemplateRows: `${CELL} ${CELL} ${CELL} ${CELL}`,
          // Less paper under the answer row than over the memory circles:
          // the place names sit right below it, and a short window needs the room.
          // Meeting 2 also has less over the memory circles (PAPER_TOP).
          padding: `${PAPER_TOP} ${CELL} ${cell(0.4)}`,
          backgroundColor: 'var(--ws-surface)',
          backgroundImage:
            'linear-gradient(rgba(96,130,190,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(96,130,190,0.15) 1px, transparent 1px)',
          backgroundSize: `${CELL} ${CELL}`,
          backgroundPosition: `0 ${PAPER_TOP}`,
        }}
      >
        {/* Row 0 — Carry/Borrow inputs (Memory circles ALWAYS active for working memory relief) */}
        <div aria-hidden="true" />
        {colPlaces.map((place, j) => {
          // A circle only over a column the exercise uses — a digit of either
          // number or of the answer. The sheet is at least four squares wide,
          // and 61 − 24 had four circles over two columns (owner, 29.9.2026).
          const columnUsed = digitsA[j] !== null || digitsB[j] !== null || j >= firstAnswerCol;
          if (!columnUsed) return <div key={`carry${j}`} aria-hidden="true" />;
          return (
            <div key={`carry${j}`} className="flex items-end justify-center pb-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={carryDigits[place] ?? ''}
                readOnly={false}
                // Meeting 2 without the place cues: no column name read aloud
                // either — the sighted child sees none (owner, 27.9 and 29.9.2026).
                aria-label={spokenPlaces ? `חלונית המרה ל${PLACE_LABEL_HE[place]}` : `עיגול זיכרון ${j - firstUsedCol + 1} מתוך ${cols - firstUsedCol}`}
                data-hint={circlesHint ? 'true' : undefined}
                className={`rounded-full border-2 border-ws-surface2 text-center font-mono font-bold bg-ws-surface text-ws-ink transition-shadow focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                  circlesHint ? 'ws-hint-ring' : 'shadow-sm'
                }`}
                style={{ width: cell(0.6), height: cell(0.6), fontSize: cell(0.35) }}
                onFocus={() => setFocusedMemoryCircle(place)}
                onBlur={() => setFocusedMemoryCircle(null)}
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
                      fontSize: cell(0.6), 
                      color: 'hsl(var(--ws-accent))',
                      transform: `translateY(${cell(-0.5)})`,
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
                          fontSize: cell(0.6), 
                          color: 'hsl(var(--ws-accent))',
                          transform: `translateY(${cell(-0.5)})`,
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
                aria-label={spokenPlaces ? `ספרת ה${PLACE_LABEL_HE[place]} בתשובה` : `ספרה ${ansIdx + 1} מתוך ${answerLength} בשורת התוצאה`}
                aria-disabled={isLocked}
                className={`rounded-xl border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                  isLocked ? 'cursor-not-allowed opacity-75' : ''
                }`}
                style={{
                  width: cellMinus(12),
                  height: cellMinus(12),
                  fontSize: cell(0.48),
                  borderColor: PLACE_TINT[place],
                  ...(shakingPlace === place ? { animation: 'shake 0.5s ease-in-out' } : {}),
                }}
                // Focus is not an attempt: arriving in a locked box — by a
                // click, Tab, or the move after a digit — shakes nothing. The
                // move after a digit shook the row before the child had tried
                // anything there (Module 9: the shake answers a keystroke).
                onFocus={() => setFocusedPlace(place)}
                onBlur={() => setFocusedPlace(null)}
                onKeyDown={(e) => {
                  // Tab and the arrows still move on: only a key that would write is refused.
                  if (isLocked && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
                    // Module 9 lock: the key does nothing; the attempt itself is what the research needs.
                    if (/^[0-9]$/.test(e.key)) recordBlockedKeystroke(place);
                    e.preventDefault();
                    shake(place);
                  }
                }}
                onChange={(e) => {
                  if (isLocked) {
                    shake(place);
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

      {/* Place labels under the paper, aligned to the answer columns (none
          without the cues: meeting 2 without the profile). In stations 3–7 the
          row keeps its height while hidden, so the scaffold does not move the page. */}
      {(cues.labels || scaffoldStation) && (
      <div
        dir="ltr"
        className="grid"
        aria-hidden={cues.labels ? undefined : true}
        style={{ gridTemplateColumns: `${CELL} repeat(${cols}, ${CELL})`, visibility: cues.labels ? 'visible' : 'hidden' }}
      >
        <div aria-hidden="true" />
        {colPlaces.map((place, j) =>
          j < firstAnswerCol ? (
            <div key={`l${j}`} aria-hidden="true" />
          ) : (
            <div
              key={`l${j}`}
              className="text-center font-bold"
              style={{ width: CELL, fontSize: `max(12px, ${cell(0.22)})`, color: PLACE_TINT[place] }}
            >
              {PLACE_LABEL_HE[place]}
            </div>
          )
        )}
      </div>
      )}
    </div>
  );
}
