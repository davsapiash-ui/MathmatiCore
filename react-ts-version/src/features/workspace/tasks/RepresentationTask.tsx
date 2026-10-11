import { useRef, useState } from 'react';
import { useWorkspaceStore, answerTextFromDigits } from '@/application/useWorkspaceStore';
import { PLACE_ORDER, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import type { SessionTask } from '@/data/sessionTasks';
import { NEUTRAL_BOX_BORDER } from '../placeColors';
import { PLACE_CUE_LINE_HE, resultRowCues } from '@/core/placeCues';
import { useEnhancedSupport } from './useEnhancedSupport';
import { PlaceCueLine } from './VerticalAdditionTask';

/** One square of the result row: the sheet's notebook square (--ws-cell, index.css). */
const CELL = 'var(--ws-cell)';
const PLACE_TINT: Record<Place, string> = {
  units: 'var(--block-unit-dark)',
  tens: 'var(--block-ten-dark)',
  hundreds: 'var(--block-hundred-dark)',
  thousands: 'var(--block-thousand-dark)',
};

/**
 * מסמך 03 §3.3 — "ייצוג" task: build exactly the prescribed blocks on the board
 * (standard or non-standard), check the place-value chart, then write the
 * answer in the result row. Proves conservation of quantity: the same number,
 * a different arrangement of blocks.
 *
 * No big number over the result row, in any station. It was the very number
 * the row is checked against (station 1, owner 29.9.2026: 26, 347), or the
 * answer itself (stations 3 and 7, owner 30.9.2026: 3,400, 510, 2,730), so the
 * child could copy it instead of building, converting and reading the blocks.
 */
export function RepresentationTask({ task }: { task: SessionTask }) {
  return task.representationKind ? <RepresentationAnswerBox /> : <RepresentationResultRow task={task} />;
}

/**
 * Station 3 and station 7's grouping exercises (owner, 30.9.2026): ONE free
 * answer box. No place names and no place colours — the answer is a number the
 * child works out, and in a decomposition it is a number of blocks (45 tens),
 * not a digit per column. Enhanced cognitive support: the box stays locked
 * until the exercise's conversion is done with the blocks (Module 9 §א,
 * REPRESENTATION_LOCKS); a keystroke into it is rejected, logged and shakes it.
 */
export function RepresentationAnswerBox() {
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setRepresentationAnswer = useWorkspaceStore((s) => s.setRepresentationAnswer);
  const recordBlockedAnswerKeystroke = useWorkspaceStore((s) => s.recordBlockedAnswerKeystroke);
  // A selector, so a conversion (or its undo) and the board re-render the lock at once.
  const locked = useWorkspaceStore((s) => s.isRepresentationAnswerLocked());
  const [shaking, setShaking] = useState(false);
  const shake = () => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  };

  return (
    // Its own height only: the feedback slot sits right under it (TaskCard, PRD Module 7 §א).
    <div className="shrink-0 flex flex-col items-center gap-2 mt-2">
      <div className="shrink-0" role="group" aria-label="שורת התוצאה" data-testid="result-row">
        <input
          type="text"
          inputMode="numeric"
          dir="ltr"
          maxLength={PLACE_ORDER.length}
          autoComplete="off"
          value={answerTextFromDigits(answerDigits)}
          readOnly={locked}
          aria-disabled={locked}
          aria-label="התשובה"
          data-testid="representation-answer"
          className={`rounded-2xl border-2 text-center font-display font-black tabular-nums bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
            locked ? 'cursor-not-allowed opacity-75' : ''
          }`}
          style={{
            width: `calc(${CELL} * 2.4)`,
            height: CELL,
            fontSize: `calc(${CELL} * 0.55)`,
            borderColor: NEUTRAL_BOX_BORDER,
            ...(shaking ? { animation: 'shake 0.5s ease-in-out' } : {}),
          }}
          onKeyDown={(e) => {
            // Tab and the arrows still move on: only a key that would write is refused.
            if (locked && (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) {
              // Rejected; the attempt itself is what the research needs (KEYBOARD_LOCK_BLOCKED).
              if (/^[0-9]$/.test(e.key)) recordBlockedAnswerKeystroke();
              e.preventDefault();
              shake();
            }
          }}
          onChange={(e) => {
            if (locked) {
              shake();
              return;
            }
            setRepresentationAnswer(e.target.value);
          }}
        />
      </div>
    </div>
  );
}

/**
 * Station 1 and station 7's other representation exercises (s7_r_t6, s7_g_t5,
 * s7_g_t6, s7_d_t6, s7_f_t6): a box per digit, high place on the left.
 */
function RepresentationResultRow({ task }: { task: SessionTask }) {
  // The number the result row holds: the number built, or its own answer when
  // the exercise asks for something else about it (368 → the value of the 6, 60).
  const value = typeof task.correctAnswer === 'number' ? task.correctAnswer : task.numberA ?? 0;
  // Result row: one square per digit of the number, high place on the left.
  return <ResultRowBoxes places={PLACE_ORDER.slice(0, String(value).length).reverse()} />;
}

/**
 * The boxes of a representation's result row, high place on the left. Also on
 * the teacher's demonstration of station 1 (Module 15 §ג), in the 1,000 range:
 * hundreds, tens, units.
 *
 * Colours and names follow the result row's rule (core/placeCues.ts, PRD
 * Module 9 §א; owner, 11.10.2026), as in the vertical exercises: station 1
 * keeps both; in stations 3–7 (station 7's digit-per-box exercises) the
 * regular profile starts neutral and without names until a digit in the wrong
 * place, and the enhanced profile has the colours from the start and the
 * names as the scaffold — with the scaffold sentence under the row. A name not
 * shown is not spoken either.
 */
export function ResultRowBoxes({ places }: { places: Place[] }) {
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);
  const enhancedSupport = useEnhancedSupport();
  const placeCuesShown = useWorkspaceStore((s) => s.placeCuesShown);
  const cues = resultRowCues(sessionNumber, enhancedSupport, placeCuesShown);
  const scaffoldStation = sessionNumber >= 3 && sessionNumber <= 7;
  const cueLine = scaffoldStation && placeCuesShown ? PLACE_CUE_LINE_HE[enhancedSupport ? 'enhanced' : 'regular'] : null;
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const setFocusedPlace = useWorkspaceStore((s) => s.setFocusedPlace);
  const isRepresentationColumnLocked = useWorkspaceStore((s) => s.isRepresentationColumnLocked);
  const recordBlockedKeystroke = useWorkspaceStore((s) => s.recordBlockedKeystroke);
  // Subscribed so a conversion (or its undo) re-renders the lock at once.
  useWorkspaceStore((s) => s.conversionsByColumn);
  // Module 9: a keystroke into a locked box shakes that box only.
  const [shakingPlace, setShakingPlace] = useState<Place | null>(null);
  const shake = (place: Place) => {
    setShakingPlace(place);
    setTimeout(() => setShakingPlace((p) => (p === place ? null : p)), 500);
  };
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  return (
    // Its own height only: the feedback slot sits right under it (TaskCard, PRD Module 7 §א).
    <div className="shrink-0 flex flex-col items-center gap-2 mt-2">
      {/* Result row (שורת התוצאה) — first under the instruction, so it is in
          view without scrolling (owner, 27.9.2026). */}
      <div dir="ltr" className="shrink-0 grid gap-2" style={{ gridTemplateColumns: `repeat(${places.length}, ${CELL})` }} role="group" aria-label="שורת התוצאה" data-testid="result-row">
        {places.map((place, i) => {
          // Owner's decision 28.9.2026 (שהB.4): only this exercise's conversion columns lock.
          const locked = isRepresentationColumnLocked(place);
          return (
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
              aria-label={cues.labels ? `ספרת ה${PLACE_NAMES_HE[place]} בשורת התוצאה` : `ספרה ${i + 1} מתוך ${places.length} בשורת התוצאה`}
              className={`rounded-xl border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                locked ? 'cursor-not-allowed opacity-75' : ''
              }`}
              style={{
                // About one notebook square, as on the vertical sheet (owner, 9.10.2026).
                width: `calc(${CELL} - 6px)`,
                height: `calc(${CELL} - 6px)`,
                fontSize: `calc(${CELL} * 0.6)`,
                borderColor: cues.colours ? PLACE_TINT[place] : NEUTRAL_BOX_BORDER,
                ...(shakingPlace === place ? { animation: 'shake 0.5s ease-in-out' } : {}),
              }}
              onFocus={() => setFocusedPlace(place)}
              onBlur={() => setFocusedPlace(null)}
              onKeyDown={(e) => {
                if (locked) {
                  // The lock stops writing, not moving: Tab, the arrows and the
                  // other non-writing keys pass without a shake (as in the
                  // vertical exercise).
                  if (!(e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')) return;
                  // Rejected; the attempt itself is what the research needs (KEYBOARD_LOCK_BLOCKED).
                  if (/^[0-9]$/.test(e.key)) recordBlockedKeystroke(place);
                  e.preventDefault();
                  shake(place);
                }
              }}
              onChange={(e) => {
                if (locked) {
                  shake(place);
                  return;
                }
                const v = e.target.value.replace(/[^0-9]/g, '').slice(-1);
                setAnswerDigit(place, v);
                // Writing a number goes as it is read, the highest place first
                // (owner, 1.10.2026) — like meeting 2's boxes, where "שש מאות
                // ושמונה" written as 806 is the diagnosis; a habit of typing from
                // the units here would produce it without the misconception.
                // Vertical exercises still go from the units (VerticalAdditionTask).
                // A locked box (enhanced profile, before the blocks do the
                // conversion) is skipped: moving into it would turn the next digit
                // into a KEYBOARD_LOCK_BLOCKED the child never tried.
                if (v) {
                  const next = places.findIndex((p, j) => j > i && !isRepresentationColumnLocked(p));
                  if (next !== -1) inputsRef.current[next]?.focus();
                }
              }}
            />
            {/* Hidden, not removed, in stations 3–7: the row keeps its height when the names come. */}
            <span
              className="font-bold"
              data-place-label
              aria-hidden={cues.labels ? undefined : true}
              style={{ fontSize: `max(14px, calc(${CELL} * 0.22))`, color: PLACE_TINT[place], visibility: cues.labels ? 'visible' : 'hidden' }}
            >
              {PLACE_NAMES_HE[place]}
            </span>
          </div>
          );
        })}
      </div>

      {/* No box listing the blocks to build and the blocks now on the board
          (owner, 28.9.2026): it is in no document. The instruction names what
          to build, and the number house shows every column. */}
      {/* The scaffold sentence, under the row (PRD Module 9 §א), with its read-aloud button. */}
      {cueLine && <PlaceCueLine text={cueLine} />}

    </div>
  );
}
