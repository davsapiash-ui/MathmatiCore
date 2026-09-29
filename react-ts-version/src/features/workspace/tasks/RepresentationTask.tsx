import { useRef, useState } from 'react';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { PLACE_ORDER, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
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
  const hasUngrouped = useWorkspaceStore((s) => s.hasUngrouped);
  // Station 1 (owner, 29.9.2026): the big number over the result row is the
  // very number the row is checked against — 26, 347 — so the child could copy
  // it instead of grouping, decomposing and reading the blocks. Not shown there.
  const showNumberCard = useWorkspaceStore((s) => s.sessionNumber !== 1);
  // Meeting 1's target task (מסמך 03 §3.1 step 6) is a guided step: its
  // instruction as a checklist, the rule the proceed button follows.
  const checklist = session1Checklist(task.id, { counts, answerDigits, hasUngrouped, blocksAddedCount: 0, undoCount: 0, hasClearedBoard: false });
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // The number the result row holds: the number built, or its own answer when
  // the exercise asks for something else about it (368 → the value of the 6, 60).
  const value = typeof task.correctAnswer === 'number' ? task.correctAnswer : task.numberA ?? 0;

  // Result row: one square per digit of the number, high place on the left.
  const places: Place[] = PLACE_ORDER.slice(0, String(value).length).reverse();

  return (
    <div className="flex flex-col items-center gap-fl-6-20 mt-fl-0-16 flex-1 min-h-0">
      {showNumberCard && (
        <div data-testid="representation-number" className="shrink-0 bg-ws-accentSoft rounded-3xl px-fl-28-40 py-fl-4-24 border border-ws-accent/30 text-center">
          <span className="font-display font-black text-fl-32-60 leading-none text-ws-accent tabular-nums">{value.toLocaleString('he-IL')}</span>
        </div>
      )}

      {/* Result row (שורת התוצאה) — right under the number, before anything
          else, so it is in view without scrolling (owner, 27.9.2026). */}
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
              aria-label={`ספרת ה${PLACE_NAMES_HE[place]} בשורת התוצאה`}
              className={`rounded-xl border-2 text-center font-mono font-black bg-ws-surface text-ws-ink transition-all focus:outline-none focus:ring-2 focus:ring-ws-accent ${
                locked ? 'cursor-not-allowed opacity-75' : ''
              }`}
              style={{
                width: `calc(${CELL} - 12px)`,
                height: `calc(${CELL} - 12px)`,
                fontSize: `calc(${CELL} * 0.48)`,
                borderColor: PLACE_TINT[place],
                ...(shakingPlace === place ? { animation: 'shake 0.5s ease-in-out' } : {}),
              }}
              onFocus={() => setFocusedPlace(place)}
              onBlur={() => setFocusedPlace(null)}
              onKeyDown={(e) => {
                if (locked) {
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
                if (v && i > 0) inputsRef.current[i - 1]?.focus();
              }}
            />
            <span className="font-bold" style={{ fontSize: `calc(${CELL} * 0.22)`, color: PLACE_TINT[place] }}>
              {PLACE_NAMES_HE[place]}
            </span>
          </div>
          );
        })}
      </div>

      {/* No box listing the blocks to build and the blocks now on the board
          (owner, 28.9.2026): it is in no document. The instruction names what
          to build, and the number house shows every column. */}

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
