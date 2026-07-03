import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import type { Place } from '@/core/placeValue';
import type { DragSource } from '@/core/placeValue';

/**
 * בלוק דיינס (בדיד) — proportions are pedagogy, from the vanilla source of truth
 * (workspace.css 477–529): unit 16×16, ten 140×14, hundred 90×90, thousand 100×100.
 * The internal hatch lines show the "חלוקה" (10 sub-parts / 10×10 grid).
 */

export interface DienesBlockProps {
  id: string;
  place: Place;
  source: DragSource;
  /** Static render (drag overlay / palette icon) — no dnd wiring. */
  isOverlay?: boolean;
  /** Click/Enter/Space deletes (column blocks only). */
  onRemove?: () => void;
  /** Skip the entrance animation (initial render of many blocks). */
  noEnter?: boolean;
}

const BLOCK_VISUALS: Record<Place, { className: string; style?: React.CSSProperties; labelHe: string }> = {
  units: {
    className: 'rounded-[2px] shrink-0',
    style: {
      width: 'var(--blk-unit)', height: 'var(--blk-unit)',
      backgroundColor: 'var(--block-unit)', boxShadow: '0 3px 0 var(--block-unit-dark), 0 3px 6px rgba(0,0,0,0.2)',
    },
    labelHe: 'יחידה',
  },
  tens: {
    className: 'rounded-[2px] shrink-0',
    style: {
      width: 'var(--blk-ten-w)', height: 'var(--blk-ten-h)',
      backgroundColor: 'var(--block-ten)',
      boxShadow: '0 3px 0 var(--block-ten-dark), 0 3px 6px rgba(0,0,0,0.2)',
      backgroundSize: '10% 100%',
      backgroundImage: 'linear-gradient(90deg, transparent 90%, rgba(0,0,0,0.22) 90%)',
    },
    labelHe: 'עשרת — ניתן לפרוט ליחידות או להמיר למאה',
  },
  hundreds: {
    className: 'rounded-[2px] shrink-0',
    style: {
      width: 'var(--blk-hundred)', height: 'var(--blk-hundred)',
      backgroundColor: 'var(--block-hundred)',
      boxShadow: '0 3px 0 var(--block-hundred-dark), 0 3px 6px rgba(0,0,0,0.2)',
      backgroundSize: '10% 10%',
      backgroundImage:
        'linear-gradient(0deg, transparent 90%, rgba(0,0,0,0.22) 90%), linear-gradient(90deg, transparent 90%, rgba(0,0,0,0.22) 90%)',
    },
    labelHe: 'מאה — ניתן לפרוט לעשרות או להמיר לאלף',
  },
  thousands: {
    className: 'rounded-[2px] shrink-0 ml-2',
    style: {
      width: 'var(--blk-thousand)', height: 'var(--blk-thousand)',
      backgroundColor: 'var(--block-thousand)',
      boxShadow:
        '-2px 2px 0 rgba(220,38,38,0.9), -4px 4px 0 rgba(220,38,38,0.7), -6px 6px 0 rgba(220,38,38,0.5), -8px 8px 10px rgba(0,0,0,0.3)',
      backgroundSize: '10% 10%',
      backgroundImage:
        'linear-gradient(0deg, transparent 90%, rgba(0,0,0,0.22) 90%), linear-gradient(90deg, transparent 90%, rgba(0,0,0,0.22) 90%)',
    },
    labelHe: 'אלף — ניתן לפרוט למאות',
  },
};

export function DienesBlock({ id, place, source, isOverlay, onRemove, noEnter }: DienesBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { source, place },
    disabled: isOverlay,
  });

  const visual = BLOCK_VISUALS[place];

  const inner = (
    <motion.div
      initial={noEnter || isOverlay ? false : { scale: 0.1, y: -12 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`${visual.className} relative select-none`}
      style={visual.style}
    >
      {/* Glossy bevel (kept from the improved React blocks) */}
      <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_2px_3px_rgba(255,255,255,0.65),inset_0_-3px_5px_rgba(0,0,0,0.15)] pointer-events-none" />
      <div className="absolute top-[1px] left-[1px] right-[1px] h-[35%] bg-gradient-to-b from-white/50 to-transparent rounded-[inherit] pointer-events-none" />
    </motion.div>
  );

  if (isOverlay) return inner;

  // Units are visually 16px (pedagogical 1:10:100 proportion — must not change), but a
  // 16px touch/drag target is too small for young fingers. Pad the HIT AREA only.
  const hitPadding = place === 'units' ? 'p-2 -m-1' : '';

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={visual.labelHe}
      className={`cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ws-accent rounded-[3px] transition-transform hover:scale-105 hover:-translate-y-0.5 ${hitPadding} ${isDragging ? 'opacity-30' : ''}`}
      onClick={onRemove}
      onKeyDown={(e) => {
        if (onRemove && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onRemove();
        }
      }}
    >
      {inner}
    </div>
  );
}
