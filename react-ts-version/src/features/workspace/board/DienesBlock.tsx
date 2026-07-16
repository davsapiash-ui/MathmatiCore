import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import type { Place, DragSource } from '@/core/placeValue';

/**
 * בלוק דיינס (בדיד) - Isometric 3D SVG Implementation
 * Responsive sizes driven by CSS variables in index.css.
 * SVG Viewboxes ensure aspect ratio is maintained perfectly without forcing scrollbars.
 */

export interface DienesBlockProps {
  id: string;
  place: Place;
  source: DragSource;
  sourcePlace?: Place;
  isOverlay?: boolean;
  onRemove?: () => void;
  noEnter?: boolean;
}

// ----------------------------------------------------------------------
// SVG Components for each Isometric Block
// ----------------------------------------------------------------------

const UnitSVG = () => {
  return (
    <svg viewBox="-5 -5 210 210" className="w-full h-full drop-shadow-md overflow-visible">
      <polygon points="100,0 200,50 100,100 0,50" fill="#FEF08A" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="100,100 200,50 200,150 100,200" fill="#FDE047" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,50 100,100 100,200 0,150" fill="#EAB308" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
    </svg>
  );
};

const TenSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`t-${i}`} x1={100 + i * 100} y1={i * 50} x2={i * 100} y2={50 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`l-${i}`} x1={i * 100} y1={50 + i * 50} x2={i * 100} y2={150 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 1110 660" className="w-full h-full drop-shadow-md overflow-visible">
      <polygon points="100,0 1100,500 1000,550 0,50" fill="#86EFAC" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="1100,500 1000,550 1000,650 1100,600" fill="#4ADE80" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,50 1000,550 1000,650 0,150" fill="#22C55E" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

const HundredSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`rt-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={1100 - i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`lt-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={600 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 2010 1110" className="w-full h-full drop-shadow-md overflow-visible">
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="#93C5FD" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="1000,1000 2000,500 2000,600 1000,1100" fill="#60A5FA" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,1100 0,600" fill="#3B82F6" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

const ThousandSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`rtv-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={2000 - i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`rth-${i}`} x1={1000} y1={1000 + i * 100} x2={2000} y2={500 + i * 100} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`ltv-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={1500 + i * 50} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`lth-${i}`} x1={0} y1={500 + i * 100} x2={1000} y2={1000 + i * 100} stroke="#000000" strokeWidth="1" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 2010 2010" className="w-full h-full drop-shadow-xl overflow-visible">
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="#FDBA74" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="1000,1000 2000,500 2000,1500 1000,2000" fill="#F97316" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,2000 0,1500" fill="#EA580C" stroke="#000000" strokeWidth="1.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

const BLOCK_VISUALS: Record<Place, { style?: React.CSSProperties; labelHe: string; Component: React.FC }> = {
  units: {
    style: { width: 'var(--blk-unit)', height: 'var(--blk-unit)', maxWidth: '100%' },
    labelHe: 'יחידה',
    Component: UnitSVG,
  },
  tens: {
    style: { width: 'calc(var(--blk-unit) * 4.5)', maxWidth: '100%' }, // Shrink the visual width of Tens slightly
    labelHe: 'עשרת — ניתן לפרוט ליחידות או להמיר למאה',
    Component: TenSVG,
  },
  hundreds: {
    style: { width: 'var(--blk-hundred)', maxWidth: '100%' }, // Height is determined by SVG ratio
    labelHe: 'מאה — ניתן לפרוט לעשרות או להמיר לאלף',
    Component: HundredSVG,
  },
  thousands: {
    style: { width: 'var(--blk-thousand)', maxWidth: '100%' }, // Width and height are equal in isometric
    labelHe: 'אלף — ניתן לפרוט למאות',
    Component: ThousandSVG,
  },
};

export function DienesBlock({ id, place, source, sourcePlace, isOverlay, onRemove, noEnter }: DienesBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { source, place: sourcePlace ?? place, renderPlace: place },
    disabled: isOverlay,
  });

  const visual = BLOCK_VISUALS[place];
  const SvgElement = visual.Component;

  const inner = (
    <motion.div
      initial={noEnter || isOverlay ? false : { scale: 0.1, y: -12 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
      className={`relative select-none shrink-0 inline-flex items-end justify-center`}
      style={visual.style}
    >
      <SvgElement />
    </motion.div>
  );

  if (isOverlay) return inner;

  const hitPadding = place === 'units' ? 'p-2 -m-1' : '';

  return (
    <div
      ref={setNodeRef}
      id={id}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={visual.labelHe}
      className={`touch-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ws-accent rounded-[3px] transition-transform hover:scale-105 hover:-translate-y-1 ${hitPadding} ${isDragging ? 'opacity-30' : ''}`}
      onClick={() => {
        if (onRemove) {
          onRemove();
        }
      }}
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
