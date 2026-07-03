import { useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion, useAnimationControls } from 'framer-motion';
import { MAX_VISIBLE_BLOCKS, PLACE_NAMES_HE, type Place, PLACE_ORDER } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';

/** Per-place functional colors (vanilla workspace.css 346–375). */
const COLUMN_COLORS: Record<Place, { header: string; border: string; tint: string; headerBg: string }> = {
  units: { header: 'var(--block-unit-dark)', border: 'var(--block-unit)', tint: 'rgba(245,158,11,0.08)', headerBg: 'rgba(245,158,11,0.14)' },
  tens: { header: 'var(--block-ten-dark)', border: 'var(--block-ten)', tint: 'rgba(16,185,129,0.08)', headerBg: 'rgba(16,185,129,0.14)' },
  hundreds: { header: 'var(--block-hundred-dark)', border: 'var(--block-hundred)', tint: 'rgba(59,130,246,0.08)', headerBg: 'rgba(59,130,246,0.14)' },
  thousands: { header: 'var(--block-thousand-dark)', border: 'var(--block-thousand)', tint: 'rgba(239,68,68,0.08)', headerBg: 'rgba(239,68,68,0.14)' },
};

export function PlaceColumn({ place }: { place: Place }) {
  const count = useWorkspaceStore((s) => s.counts[place]);
  const errorPlace = useWorkspaceStore((s) => s.errorPlace);
  const errorNonce = useWorkspaceStore((s) => s.errorNonce);
  const focusedPlace = useWorkspaceStore((s) => s.focusedPlace);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const removeBlockClick = useWorkspaceStore((s) => s.removeBlockClick);
  const packagedCount = useWorkspaceStore((s) => s.packagedBlocks[place]);
  const packageBlocks = useWorkspaceStore((s) => s.packageBlocks);
  
  const placeIdx = PLACE_ORDER.indexOf(place);
  const higherPlace = placeIdx > 0 ? PLACE_ORDER[placeIdx - 1] : null;

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${place}`,
    data: { kind: 'column', place },
  });

  const colors = COLUMN_COLORS[place];
  const renderCount = Math.min(count, MAX_VISIBLE_BLOCKS);
  const isError = errorPlace === place;
  const isDimmed = isASD && focusedPlace !== null && focusedPlace !== place;

  // Constraint-error shake (vanilla .constraint-error, 400ms). errorNonce retriggers repeats.
  const shakeControls = useAnimationControls();
  useEffect(() => {
    if (isError) {
      shakeControls.start({ x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.4 } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorNonce]);

  return (
    <motion.div
      animate={shakeControls}
      className={`flex-1 min-w-0 flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 ${
        isDimmed ? 'opacity-30 grayscale pointer-events-none' : ''
      }`}
      style={{
        borderColor: isOver ? colors.border : 'hsl(var(--ws-surface-2))',
        backgroundColor: isOver || isError ? colors.tint : 'hsl(var(--ws-surface))',
        boxShadow: isOver ? `0 0 0 3px ${colors.border}` : '0 4px 14px -6px rgba(120,80,20,0.12)',
      }}
      aria-label={`טור ${PLACE_NAMES_HE[place]}`}
    >
      <div
        className="relative flex items-center justify-center py-2.5 font-display font-extrabold text-lg border-b-[3px]"
        style={{ color: colors.header, backgroundColor: colors.headerBg, borderColor: colors.header }}
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

      <div
        ref={setNodeRef}
        role="group"
        aria-label={`אזור גרירה — ${PLACE_NAMES_HE[place]}`}
        className="flex-1 flex flex-row flex-wrap content-start justify-center items-start gap-1 p-2 min-h-[150px] overflow-y-auto"
      >
        {count >= 10 && higherPlace && (
          <div className="w-full flex justify-center mb-3">
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => packageBlocks(place)}
              className="px-4 py-2 bg-ws-accent text-white font-bold rounded-xl shadow-md hover:brightness-110 active:scale-95 transition-all text-sm w-full border-b-4 border-ws-accent/50"
            >
              ארוז 10 ל{PLACE_NAMES_HE[higherPlace]}
            </motion.button>
          </div>
        )}

        {higherPlace && Array.from({ length: packagedCount }).map((_, i) => (
          <div key={`pkg-${place}-${i}`} className="relative transition-all mb-2 ring-2 ring-ws-blue rounded-lg bg-ws-blue/10 p-0.5">
            <DienesBlock
              id={`pkg-${place}-${i}`}
              place={higherPlace}
              source="packaged"
              sourcePlace={place}
            />
          </div>
        ))}

        {Array.from({ length: renderCount }).map((_, i) => {
          let overlapStyle: React.CSSProperties = { zIndex: i };
          if (i > 0) {
            if (place === 'hundreds') {
              overlapStyle.marginRight = '-30px';
              overlapStyle.marginTop = '-5px';
            } else if (place === 'thousands') {
              overlapStyle.marginRight = '-40px';
              overlapStyle.marginTop = '-10px';
            } else if (place === 'tens') {
              overlapStyle.marginRight = '-15px';
              overlapStyle.marginTop = '0px';
            }
          }

          return (
            <div key={`${place}-${i}`} style={overlapStyle} className="relative transition-all">
              <DienesBlock
                id={`col-${place}-${i}`}
                place={place}
                source="column"
                onRemove={() => removeBlockClick(place)}
                noEnter={i < renderCount - 1}
              />
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
