import { useRef } from 'react';
import { useWorkspaceStore, requiredCountsOf } from '@/application/useWorkspaceStore';
import { PLACE_ORDER, PLACE_NAMES_HE, countsEqual, describeCountsHe, type Place } from '@/core/placeValue';
import type { SessionTask } from '@/data/sessionTasks';
import { session1Checklist, session1DoneNoteHe } from '@/core/session1Checklist';
import { Session1ChecklistCard } from './Session1ChecklistCard';

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
 * number in the result row. Proves conservation of quantity: the same number,
 * a different arrangement of blocks.
 */
export function RepresentationTask({ task }: { task: SessionTask }) {
  const counts = useWorkspaceStore((s) => s.counts);
  const answerDigits = useWorkspaceStore((s) => s.answerDigits);
  const setAnswerDigit = useWorkspaceStore((s) => s.setAnswerDigit);
  const setFocusedPlace = useWorkspaceStore((s) => s.setFocusedPlace);
  const isRepresentationInputLocked = useWorkspaceStore((s) => s.isRepresentationInputLocked);
  const hasUngrouped = useWorkspaceStore((s) => s.hasUngrouped);
  // Meeting 1's target task (מסמך 03 §3.1 step 6) is a guided step: its
  // instruction as a checklist, the rule "התקדם" follows.
  const checklist = session1Checklist(task.id, { counts, answerDigits, hasUngrouped, blocksAddedCount: 0, undoCount: 0, hasClearedBoard: false });
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const value = task.numberA ?? 0;
  const required = requiredCountsOf(task);
  const boardMatches = countsEqual(counts, required);
  const locked = isRepresentationInputLocked();

  // Result row: one square per digit of the number, high place on the left.
  const places: Place[] = PLACE_ORDER.slice(0, String(value).length).reverse();

  return (
    <div className="flex flex-col items-center gap-5 short:gap-2.5 tiny:gap-2 mt-4 short:mt-0 flex-1 min-h-0">
      <div className="shrink-0 bg-ws-accentSoft rounded-3xl px-10 py-6 short:px-8 short:py-3 tiny:py-2 border border-ws-accent/30 text-center">
        <span className="font-display font-black text-6xl short:text-5xl tiny:text-4xl text-ws-accent tabular-nums">{value.toLocaleString('he-IL')}</span>
      </div>

      {/* Result row (שורת התוצאה) — right under the number, before anything
          else, so it is in view without scrolling (owner, 27.9.2026). */}
      <div dir="ltr" className="shrink-0 grid gap-2" style={{ gridTemplateColumns: `repeat(${places.length}, ${CELL})` }} role="group" aria-label="שורת התוצאה" data-testid="result-row">
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
              className={`rounded-lg short:rounded-xl border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                locked ? 'cursor-not-allowed opacity-75' : ''
              }`}
              style={{ width: `calc(${CELL} - 12px)`, height: `calc(${CELL} - 12px)`, fontSize: `calc(${CELL} * 0.48)`, borderColor: PLACE_TINT[place] }}
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
            <span className="font-bold" style={{ fontSize: `calc(${CELL} * 0.22)`, color: PLACE_TINT[place] }}>
              {PLACE_NAMES_HE[place]}
            </span>
          </div>
        ))}
      </div>

      {/* Meeting 1 (hideRequiredCounts): no box at all. The board to build is
          what the learner finds, the place-value board already shows every
          column, and the step's checklist says what is done. Elsewhere the box
          is extra content, so it comes after the result row. */}
      {!task.hideRequiredCounts && (
        <div
          className="shrink-0 rounded-2xl px-6 py-4 short:py-2.5 border text-center max-w-md"
          style={{ backgroundColor: 'hsl(var(--ws-blue-soft) / 0.45)', borderColor: 'hsl(var(--ws-blue) / 0.45)' }}
          aria-live="polite"
        >
          <p className="text-sm font-bold text-ws-soft mb-1">בנו בלוח בדיוק:</p>
          <p className="text-xl short:text-lg font-black text-ws-ink">{describeCountsHe(required)}</p>
          <p className={`mt-2 short:mt-1 text-sm font-bold ${boardMatches ? 'text-ws-success' : 'text-ws-soft'}`}>
            {boardMatches ? '✓ הלוח תואם — כתבו את המספר בשורת התוצאה' : `בלוח כרגע: ${describeCountsHe(counts)}`}
          </p>
        </div>
      )}

      {/* Meeting 1's target task: the checklist after the result row. It is
          the one part of the column that scrolls when the screen is short. */}
      {checklist && (
        <div className="w-full max-w-xl flex-1 min-h-[6rem] overflow-y-auto" data-testid="checklist-area">
          <Session1ChecklistCard items={checklist} doneNote={session1DoneNoteHe(task.id)} />
        </div>
      )}
    </div>
  );
}
