import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion, useAnimationControls } from 'framer-motion';
import { MAX_VISIBLE_BLOCKS, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { fitBlockGrid, type Size } from '@/core/blockLayout';
import { DIMMED_COLUMN_FILTER } from '@/core/columnFocus';
import { useWorkspaceStore, getActiveTasks } from '@/application/useWorkspaceStore';
import { boardDimmedColumns } from '@/application/boardDimming';
import { useBoardFocusStore } from '@/application/useBoardFocusStore';
import { columnDigitsShown } from '@/core/columnDigits';
import { builtAnyWay } from '@/data/representationLocks';
import { DienesBlock } from './DienesBlock';
import { COLUMN_CELLS } from './columnCells';
import { useVisibleRegroup, arrivingBlockCount } from './RegroupAnimationLayer';
import { PLACE_COLORS } from '../placeColors';

/** Per-place functional colors — one code, shared with the answer boxes (placeColors.ts). */
const COLUMN_COLORS = PLACE_COLORS;

/** Below this width of the blocks' space (a column under ~110px), the
 *  grouping button drops its ✨ and its side padding, so its words fit. */
const NARROW_COLUMN_SPACE_PX = 92;

/**
 * The grouping button's caption (PRD 7.4 Module 7 §א): "קבצו 10 לעשרת" on the
 * units, "קבצו 10 למאה" on the tens, "קבצו 10 לאלף" on the hundreds. One name:
 * the caption, the tooltip and the accessible name are these words exactly.
 */
const GROUP_BUTTON_LABEL_HE: Record<Exclude<Place, 'thousands'>, string> = {
  units: 'קבצו 10 לעשרת',
  tens: 'קבצו 10 למאה',
  hundreds: 'קבצו 10 לאלף',
};

/** Content-box size of an element, kept current. */
function useContentSize(ref: React.RefObject<HTMLElement | null>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // First measure before paint, so blocks never flash at the wrong size.
    if (el.clientWidth > 0 && el.clientHeight > 0) setSize({ w: el.clientWidth, h: el.clientHeight });
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      setSize((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export function PlaceColumn({
  place,
  activeDragPlace,
  canGroup = place !== 'thousands',
}: {
  place: Place;
  activeDragPlace?: Place | null;
  /** The column to its left is on the board, so ten blocks here can be grouped into it. */
  canGroup?: boolean;
}) {
  const count = useWorkspaceStore((s) => s.counts?.[place] ?? 0);
  const errorPlace = useWorkspaceStore((s) => s.errorPlace);
  const errorNonce = useWorkspaceStore((s) => s.errorNonce);
  const groupColumnClick = useWorkspaceStore((s) => s.groupColumnClick);
  const splitBlockClick = useWorkspaceStore((s) => s.splitBlockClick);
  const removeBlockClick = useWorkspaceStore((s) => s.removeBlockClick);
  const focusedMemoryCircle = useBoardFocusStore((s) => s.focusedMemoryCircle);
  // The digit beside the column's name only where watching it is the step
  // (core/columnDigits.ts, owner 29.9.2026); elsewhere it would hand over the answer.
  // Ten or more here is the exercise's own goal — a representation whose board
  // holds it (347 as 3, 3 and 17), a "two ways" task, a subtraction after a
  // borrow (the same rule as the coaching cards, SocraticEngine): the button
  // stays, but does not pulse, so it does not invite undoing the step just made.
  const crowdingIsTheGoal = useWorkspaceStore((s) => {
    const t = getActiveTasks(s)[s.standardTaskIdx];
    if (!t) return false;
    const req = (t.requiredCounts ?? {}) as Partial<Record<Place, number>>;
    // "Build the number X" built another way (owner, 4.10.2026): the board is right as it stands.
    return builtAnyWay(t, s.counts) || t.isSubtraction === true || t.type === 'flexible_decomp' || (req[place] ?? 0) >= 10;
  });
  // PRD Module 7 (l.290): on the teacher's projector board the digits stay
  // shown in every station, because the teacher is demonstrating.
  const digitShown = useWorkspaceStore((s) =>
    s.projectorBoard || columnDigitsShown(s.sessionNumber, getActiveTasks(s)[s.standardTaskIdx]?.id, s.counts)
  );
  // PRD Module 7 §א: columns outside the current calculation focus are dimmed
  // to brightness 0.6 (core/columnFocus.ts: gap יט, calibrated 2.10.2026 —
  // never a column the child has to act in). One boolean per column, so
  // typing a digit re-renders only a column whose dimming changes. Read only:
  // nothing here writes to the store.
  const isDimmed = useWorkspaceStore((s) => boardDimmedColumns(s, focusedMemoryCircle).has(place));

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${place}`,
    data: { kind: 'column', place },
  });

  // Show preview of 10 units when dragging a tens rod over the units column.
  // activeDragPlace comes from local component state (set once per drag start/end),
  // not from dnd-kit's useDndContext — that context re-renders every column on
  // every pointer-move frame during a drag, which was the source of drag lag.
  const isPreviewingDecomp = isOver && place === 'units' && activeDragPlace === 'tens';


  const colors = COLUMN_COLORS[place];
  const renderCount = Math.min(count, MAX_VISIBLE_BLOCKS);
  // מסמך 03 §3.3–3.5: during the grouping / decomposition animation the
  // blocks that just arrived here stay invisible (still in the layout, so
  // nothing shifts) until the ghost lands on them — under a second.
  const regroup = useVisibleRegroup();
  const arriving = Math.min(renderCount, arrivingBlockCount(regroup, place));
  const firstArrivingIdx = renderCount - arriving;
  // The count badge lands with the blocks: while they are still in flight it
  // shows what is visibly in the column, so the symbol never runs ahead of the
  // bricks (VRA: the concrete and the symbolic change together).
  const shownCount = count - (regroup && regroup.to === place ? arrivingBlockCount(regroup, place) : 0);
  const isError = errorPlace === place;
  const groupLabel = place === 'thousands' ? '' : GROUP_BUTTON_LABEL_HE[place];

  // Every block the digit counts is on the screen (core/blockLayout.ts).
  const blocksRef = useRef<HTMLDivElement | null>(null);
  const space = useContentSize(blocksRef);
  // Unmeasured (no layout engine, e.g. in unit tests): drawn size.
  // The blocks' space is the column's inner width less its padding (p-2).
  const narrow = space !== null && space.w < NARROW_COLUMN_SPACE_PX;
  const fit = fitBlockGrid(renderCount, COLUMN_CELLS[place], space ?? { w: Infinity, h: Infinity });

  // Constraint-error shake (vanilla .constraint-error, 400ms). errorNonce retriggers repeats.
  const shakeControls = useAnimationControls();
  useEffect(() => {
    if (isError) {
      shakeControls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4 } });
    }
  }, [errorNonce, isError, shakeControls]);

  return (
    <motion.div
      id={`column-${place}`}
      ref={setNodeRef}
      animate={shakeControls}
      className={`flex-1 min-w-0 flex flex-col rounded-2xl border-2 border-solid transition-colors duration-150 select-none ${isOver ? 'ring-4 ring-offset-1 z-10' : 'shadow-sm'}`}
      style={{
        borderColor: isOver ? colors.border : `${colors.border}55`,
        backgroundColor: isOver ? colors.headerBg : isError ? colors.tint : 'hsl(var(--ws-surface))',
        boxShadow: isOver 
          ? `0 12px 28px -6px ${colors.tint}, 0 0 0 3px ${colors.border}` 
          : '0 4px 14px -6px rgba(0,0,0,0.06)',
        filter: isDimmed ? DIMMED_COLUMN_FILTER : undefined,
      }}
      data-dimmed={isDimmed ? 'true' : undefined}
      aria-label={`טור ${PLACE_NAMES_HE[place]}`}
    >
      <div
        className="relative flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-1 py-2.5 font-display font-extrabold text-lg border-b-[3px] rounded-t-[14px] shrink-0 transition-colors"
        style={{ color: colors.header, backgroundColor: isOver ? colors.tint : colors.headerBg, borderColor: colors.header }}
      >
        <span>{PLACE_NAMES_HE[place]}</span>
        {/* The header wraps: in the narrowest column (1024×768 with the coaching
            card open) the digit goes under the name, never over it — pinned to
            the corner it covered "יחידות" and "מאות" there. */}
        {/* מסמך 03 §3.1: לוח בית המספרים "מציג את הספרה אפס בכל הטורים", והאפס
            שבטור ריק מודגש "בצבע העמודה" (305: אפס בטור העשרות). הספרה 0 הוסתרה
            עד 24.9.2026, ושלב 305 של מפגש 1 הצביע על ספרה שאינה על המסך.
            הספרה יושבת ליד שם הטור ולא בפינה: בפינה, ברוחב 1024 עם ארבעה
            טורים, היא כיסתה את תחילת השם ("0אלפים"). */}
        {digitShown && (
          <span
            aria-hidden="true"
            data-testid={`column-digit-${place}`}
            className="shrink-0 min-w-[22px] h-[22px] px-1 rounded-full text-xs font-black text-white inline-flex items-center justify-center transition-all opacity-100 scale-100"
            style={{ backgroundColor: colors.header }}
          >
            {shownCount}
          </span>
        )}
        {/* אזור ההכרזה קרא עד כה את תוכן התגית בלבד — מספר ערום. לומד
            שנעזר בהקראה שמע "3", "4", "3" בלי לדעת על איזה טור מדובר.
            כאן נאמר מה השתנה ובאיזה טור. Where the digit is hidden, the
            announcement is too: said aloud, it would hand over the answer. */}
        {digitShown && (
          <span aria-live="polite" className="sr-only">
            {`${PLACE_NAMES_HE[place]}: ${count}`}
          </span>
        )}
      </div>

      {/* Explicit Group Button */}
      {count >= 10 && place !== 'thousands' && canGroup && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`${narrow ? 'p-1' : 'p-1.5'} flex justify-center border-b border-ws-surface2/60 bg-ws-bg/40 shrink-0 pointer-events-auto`}
        >
          <button
            onClick={() => groupColumnClick(place)}
            data-pulse={crowdingIsTheGoal ? undefined : 'true'}
            // The main action of a column that holds ten or more: a 44px-high
            // target, like every child button (DESIGN_SYSTEM_RULES.md; audit
            // UX-005, meeting 1 task 8: it was 24px). The blocks below make
            // room by shrinking together (core/blockLayout.ts), never by clipping.
            // In a narrow column (four columns beside the addition grid or the
            // coaching card on a 1024px screen: 67px) the words wrap inside the
            // button and the ✨ gives way, so the text never leaves the button.
            data-narrow={narrow ? 'true' : undefined}
            className={`w-full min-w-0 min-h-11 py-1 ${narrow ? 'px-0.5' : 'px-2'} rounded-xl text-sm leading-tight font-black text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer ${
              crowdingIsTheGoal ? '' : 'animate-pulse hover:animate-none'
            }`}
            style={{ backgroundColor: colors.header }}
            // One name per component (PRD 7.4 Module 7 §א): the label, the
            // tooltip and the accessible name are the same words.
            title={groupLabel}
            aria-label={groupLabel}
          >
            {!narrow && <span aria-hidden="true">✨</span>}
            <span className="min-w-0 text-center">{groupLabel}</span>
          </button>
        </motion.div>
      )}

      {/* Drop zone — the whole column accepts a drop (מסמך 04, Affordance). */}
      <div
        id={`column-${place}-dropzone`}
        role="group"
        aria-label={`אזור גרירה — ${PLACE_NAMES_HE[place]}`}
        style={{ touchAction: 'none' }}
        className="relative flex-1 min-h-0 p-2 overflow-hidden touch-none flex flex-col"
      >
        {/* The blocks stand on the bottom of the column, in rows. Their size is
            computed so that all of them fit; nothing here scrolls or clips. */}
        <div ref={blocksRef} className="relative flex-1 min-h-0 flex flex-col justify-end items-center">
          <div
            data-testid={`column-${place}-blocks`}
            data-scale={fit.scale}
            className="flex flex-row flex-wrap content-end justify-center"
            style={{ width: `${fit.perRow * fit.cell.w}px`, maxWidth: '100%' }}
          >
            {Array.from({ length: renderCount }).map((_, i) => (
              <div
                key={`${place}-${i}`}
                className="shrink-0 flex items-center justify-center select-none"
                data-arriving={i >= firstArrivingIdx ? 'true' : undefined}
                style={{
                  width: `${fit.cell.w}px`,
                  height: `${fit.cell.h}px`,
                  ...(i >= firstArrivingIdx ? { visibility: 'hidden' as const } : {}),
                }}
              >
                <DienesBlock
                    id={`column-${place}-${i}`}
                    place={place}
                    source="column"
                    noEnter={i < renderCount - 1}
                    cell={{ w: fit.block.w, h: fit.block.h, pad: fit.pad }}
                    onClick={() => {
                      // מודול 8 §א: לחיצה על לבנה = פריטה לעשר לבנות בערך הנמוך
                      // הסמוך. ליחידה אין ערך נמוך יותר, ולכן הלחיצה אינה עושה
                      // דבר — עד כה היא מחקה את הלבנה, נתיב מחיקה שלישי שאינו
                      // באפיון (יש בדיוק שניים: גרירה לפח ולחיצה על הפח), וילד
                      // שנגע בלבנה בטעות איבד אותה בלי להבין למה.
                      if (place !== 'units') splitBlockClick(place);
                    }}
                  />
              </div>
            ))}
          </div>
        </div>

        {/* Drawn over the column, not in its flow, so the blocks never move. */}
        {isPreviewingDecomp && (
          <div className="absolute top-2 inset-x-2 z-10 flex flex-wrap justify-center gap-1 p-1 bg-ws-accentSoft/80 border border-dashed border-ws-accent rounded-xl animate-pulse pointer-events-none">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={`prev-${idx}`} className="w-4 h-4 rounded-md bg-amber-400/70" />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
