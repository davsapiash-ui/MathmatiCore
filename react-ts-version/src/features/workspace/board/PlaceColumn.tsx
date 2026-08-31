import { useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion, useAnimationControls, AnimatePresence } from 'framer-motion';
import { MAX_VISIBLE_BLOCKS, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';

/** Per-place functional colors (vanilla workspace.css 346–375). */
const COLUMN_COLORS: Record<Place, { header: string; border: string; tint: string; headerBg: string }> = {
  units: { header: 'var(--block-unit-dark)', border: 'var(--block-unit)', tint: 'rgba(245,158,11,0.08)', headerBg: 'rgba(245,158,11,0.14)' },
  tens: { header: 'var(--block-ten-dark)', border: 'var(--block-ten)', tint: 'rgba(16,185,129,0.08)', headerBg: 'rgba(16,185,129,0.14)' },
  hundreds: { header: 'var(--block-hundred-dark)', border: 'var(--block-hundred)', tint: 'rgba(59,130,246,0.08)', headerBg: 'rgba(59,130,246,0.14)' },
  thousands: { header: 'var(--block-thousand-dark)', border: 'var(--block-thousand)', tint: 'rgba(239,68,68,0.08)', headerBg: 'rgba(239,68,68,0.14)' },
};

export function PlaceColumn({ place, activeDragPlace }: { place: Place; activeDragPlace?: Place | null }) {
  const count = useWorkspaceStore((s) => s.counts?.[place] ?? 0);
  const errorPlace = useWorkspaceStore((s) => s.errorPlace);
  const errorNonce = useWorkspaceStore((s) => s.errorNonce);
  const focusedPlace = useWorkspaceStore((s) => s.focusedPlace);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const groupColumnClick = useWorkspaceStore((s) => s.groupColumnClick);
  const splitBlockClick = useWorkspaceStore((s) => s.splitBlockClick);
  const removeBlockClick = useWorkspaceStore((s) => s.removeBlockClick);
  const sessionNumber = useWorkspaceStore((s) => s.sessionNumber);

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${place}`,
    data: { kind: 'column', place },
  });

  // Show preview of 10 units when dragging a tens rod over the units column.
  // activeDragPlace comes from local component state (set once per drag start/end),
  // not from dnd-kit's useDndContext — that context re-renders every column on
  // every pointer-move frame during a drag, which was the source of drag lag.
  const isPreviewingDecomp = isOver && place === 'units' && activeDragPlace === 'tens';

  const scaffoldFadeLevel = useWorkspaceStore((s) => s.scaffoldFadeLevel);

  const colors = COLUMN_COLORS[place];
  const renderCount = Math.min(count, MAX_VISIBLE_BLOCKS);
  const isError = errorPlace === place;
  const activeColumnIndex = useWorkspaceStore((s) => s.activeColumnIndex);
  const places: Place[] = ['units', 'tens', 'hundreds', 'thousands'];
  const activePlaceByCol = typeof activeColumnIndex === 'number' && activeColumnIndex >= 0 && activeColumnIndex < places.length ? places[activeColumnIndex] : null;
  const effectiveFocus = focusedPlace || (sessionNumber >= 3 ? activePlaceByCol : null);

  // Column dimming per Master PRD Module 7: opacity 0.7, brightness 0.6 for inactive columns
  const isDimmed = effectiveFocus !== null && effectiveFocus !== place;

  // Constraint-error shake (vanilla .constraint-error, 400ms). errorNonce retriggers repeats.
  const shakeControls = useAnimationControls();
  useEffect(() => {
    if (isError) {
      shakeControls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4 } });
    }
  }, [errorNonce, isError, shakeControls]);

  const isHighlighted = scaffoldFadeLevel === 0;

  return (
    <motion.div
      ref={setNodeRef}
      animate={shakeControls}
      className={`flex-1 min-w-0 flex flex-col rounded-2xl border-2 border-solid transition-colors duration-150 select-none ${
        isDimmed ? 'opacity-60' : ''
      } ${isOver ? 'ring-4 ring-offset-1 z-10' : 'shadow-sm'}`}
      style={{
        borderColor: isOver ? colors.border : `${colors.border}55`,
        backgroundColor: isOver ? colors.headerBg : isError ? colors.tint : 'hsl(var(--ws-surface))',
        boxShadow: isOver 
          ? `0 12px 28px -6px ${colors.tint}, 0 0 0 3px ${colors.border}` 
          : '0 4px 14px -6px rgba(0,0,0,0.06)',
        filter: isDimmed ? 'brightness(0.6)' : undefined,
        opacity: isDimmed ? 0.6 : 1,
      }}
      aria-label={`טור ${PLACE_NAMES_HE[place]}`}
    >
      <div
        className="relative flex items-center justify-center py-2.5 font-display font-extrabold text-lg border-b-[3px] rounded-t-[14px] shrink-0 transition-colors"
        style={{ color: colors.header, backgroundColor: isOver ? colors.tint : colors.headerBg, borderColor: colors.header }}
      >
        <span>{PLACE_NAMES_HE[place]}</span>
        <span
          aria-live="polite"
          className={`absolute left-3 min-w-[22px] h-[22px] px-1 rounded-full text-xs font-black text-white inline-flex items-center justify-center transition-all ${
            count > 0 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
          }`}
          style={{ backgroundColor: colors.header }}
        >
          {count > 0 ? count : ''}
        </span>
      </div>

      {/* Explicit Group Button */}
      {count >= 10 && place !== 'thousands' && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-1.5 flex justify-center border-b border-ws-surface2/60 bg-ws-bg/40 shrink-0 pointer-events-auto"
        >
          <button
            onClick={() => groupColumnClick(place)}
            className="w-full py-1 px-2 rounded-xl text-xs font-black text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer animate-pulse hover:animate-none"
            style={{ backgroundColor: colors.header }}
            title={`קבץ 10 לבנים ל${place === 'units' ? 'עשרת' : place === 'tens' ? 'מאה' : 'אלף'}`}
          >
            <span>✨</span>
            <span>קבץ 10 ל{place === 'units' ? 'עשרת' : place === 'tens' ? 'מאה' : 'אלף'}</span>
          </button>
        </motion.div>
      )}

      {/* Drop zone container — blocks ground at the bottom base of the column */}
      <div
        id={`column-${place}-dropzone`}
        role="group"
        aria-label={`אזור גרירה — ${PLACE_NAMES_HE[place]}`}
        style={{ touchAction: 'none' }}
        className="relative flex-1 min-h-0 p-3 pb-4 overflow-y-auto overflow-x-hidden no-scrollbar touch-none flex flex-col justify-end"
      >
        {/* Grounded block stack anchored at the bottom — horizontal flex wrap */}
        <div
          className="w-full mt-auto flex flex-row flex-wrap content-end justify-center items-end gap-1.5 min-w-0"
        >
          {Array.from({ length: renderCount }).map((_, i) => (
            <div 
              key={`${place}-${i}`}
              className="shrink-0 flex items-center justify-center select-none"
            >
              <DienesBlock 
                id={`column-${place}-${i}`}
                place={place} 
                source="column"
                noEnter={i < renderCount - 1}
                onClick={() => {
                  if (place === 'units') {
                    removeBlockClick('units');
                  } else {
                    splitBlockClick(place);
                  }
                }}
              />
            </div>
          ))}
        </div>

        {isPreviewingDecomp && (
          <div className="flex flex-wrap gap-1 p-1 bg-ws-accentSoft/30 border border-dashed border-ws-accent rounded-xl animate-pulse mt-2">
            {Array.from({ length: 10 }).map((_, idx) => (
              <div key={`prev-${idx}`} className="w-5 h-5 rounded-md bg-amber-400/60" />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
