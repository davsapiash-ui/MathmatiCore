import { useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion, useAnimationControls } from 'framer-motion';
import { MAX_VISIBLE_BLOCKS, PLACE_NAMES_HE, type Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { DienesBlock } from './DienesBlock';

/** Per-place functional colors (vanilla workspace.css 346–375). */
const COLUMN_COLORS: Record<Place, { header: string; border: string; tint: string }> = {
  units: { header: 'var(--block-unit-dark)', border: 'var(--block-unit)', tint: 'rgba(245,158,11,0.08)' },
  tens: { header: 'var(--block-ten-dark)', border: 'var(--block-ten)', tint: 'rgba(16,185,129,0.08)' },
  hundreds: { header: 'var(--block-hundred-dark)', border: 'var(--block-hundred)', tint: 'rgba(59,130,246,0.08)' },
  thousands: { header: 'var(--block-thousand-dark)', border: 'var(--block-thousand)', tint: 'rgba(239,68,68,0.08)' },
};

export function PlaceColumn({ place }: { place: Place }) {
  const count = useWorkspaceStore((s) => s.counts[place]);
  const errorPlace = useWorkspaceStore((s) => s.errorPlace);
  const errorNonce = useWorkspaceStore((s) => s.errorNonce);
  const focusedPlace = useWorkspaceStore((s) => s.focusedPlace);
  const isASD = useWorkspaceStore((s) => s.isASD);
  const removeBlockClick = useWorkspaceStore((s) => s.removeBlockClick);

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
      className={`flex-1 min-w-0 flex flex-col rounded-2xl border transition-all duration-300 ${
        isDimmed ? 'opacity-30 grayscale pointer-events-none' : ''
      }`}
      style={{
        borderColor: isOver ? colors.border : 'hsl(var(--ws-surface-2))',
        backgroundColor: isOver || isError ? colors.tint : 'hsl(var(--ws-surface))',
        boxShadow: isOver ? `0 0 0 2px ${colors.border}` : '0 1px 3px rgba(0,0,0,0.05)',
      }}
      aria-label={`טור ${PLACE_NAMES_HE[place]}`}
    >
      <div
        className="flex items-center justify-center gap-2 py-2 font-display font-extrabold text-lg border-b"
        style={{ color: colors.header, borderColor: 'hsl(var(--ws-surface-2))' }}
      >
        {PLACE_NAMES_HE[place]}
        <span
          aria-live="polite"
          className={`min-w-[22px] h-[22px] px-1 rounded-full text-xs font-black text-white inline-flex items-center justify-center transition-all ${
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
        {Array.from({ length: renderCount }).map((_, i) => (
          <DienesBlock
            key={`${place}-${i}`}
            id={`col-${place}-${i}`}
            place={place}
            source="column"
            onRemove={() => removeBlockClick(place)}
            noEnter={i < renderCount - 1}
          />
        ))}
      </div>
    </motion.div>
  );
}
