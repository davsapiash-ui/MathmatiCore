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
  isOverlay?: boolean;
  onRemove?: () => void;
  noEnter?: boolean;
}

// ----------------------------------------------------------------------
// SVG Components for each Isometric Block
// ----------------------------------------------------------------------

const UnitSVG = () => {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md">
      <polygon points="100,0 200,50 100,100 0,50" fill="#FEF08A" stroke="#CA8A04" strokeWidth="6" strokeLinejoin="round" />
      <polygon points="100,100 200,50 200,150 100,200" fill="#FDE047" stroke="#CA8A04" strokeWidth="6" strokeLinejoin="round" />
      <polygon points="0,50 100,100 100,200 0,150" fill="#EAB308" stroke="#CA8A04" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
};

const TenSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`rt-${i}`} x1={100} y1={100 + i * 100} x2={200} y2={50 + i * 100} stroke="#15803D" strokeWidth="8" strokeLinecap="round" />);
      lines.push(<line key={`lt-${i}`} x1={0} y1={50 + i * 100} x2={100} y2={100 + i * 100} stroke="#15803D" strokeWidth="8" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="0 0 200 1100" className="w-full h-full drop-shadow-md">
      <polygon points="100,0 200,50 100,100 0,50" fill="#86EFAC" stroke="#15803D" strokeWidth="8" strokeLinejoin="round" />
      <polygon points="100,100 200,50 200,1050 100,1100" fill="#4ADE80" stroke="#15803D" strokeWidth="8" strokeLinejoin="round" />
      <polygon points="0,50 100,100 100,1100 0,1050" fill="#22C55E" stroke="#15803D" strokeWidth="8" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

const HundredSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#1E40AF" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#1E40AF" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`rt-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={1100 - i * 50} stroke="#1E40AF" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`lt-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={600 + i * 50} stroke="#1E40AF" strokeWidth="12" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="0 0 2000 1100" className="w-full h-full drop-shadow-md">
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="#93C5FD" stroke="#1E40AF" strokeWidth="16" strokeLinejoin="round" />
      <polygon points="1000,1000 2000,500 2000,600 1000,1100" fill="#60A5FA" stroke="#1E40AF" strokeWidth="16" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,1100 0,600" fill="#3B82F6" stroke="#1E40AF" strokeWidth="16" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

const ThousandSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`rtv-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={2000 - i * 50} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`rth-${i}`} x1={1000} y1={1000 + i * 100} x2={2000} y2={500 + i * 100} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`ltv-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={1500 + i * 50} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
      lines.push(<line key={`lth-${i}`} x1={0} y1={500 + i * 100} x2={1000} y2={1000 + i * 100} stroke="#9A3412" strokeWidth="12" strokeLinecap="round" />);
    }
    return lines;
  };

  return (
    <svg viewBox="0 0 2000 2000" className="w-full h-full drop-shadow-xl">
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="#FDBA74" stroke="#9A3412" strokeWidth="16" strokeLinejoin="round" />
      <polygon points="1000,1000 2000,500 2000,1500 1000,2000" fill="#F97316" stroke="#9A3412" strokeWidth="16" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,2000 0,1500" fill="#EA580C" stroke="#9A3412" strokeWidth="16" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

const BLOCK_VISUALS: Record<Place, { style?: React.CSSProperties; labelHe: string; Component: React.FC }> = {
  units: {
    style: { width: 'var(--blk-unit)', height: 'var(--blk-unit)' },
    labelHe: 'יחידה',
    Component: UnitSVG,
  },
  tens: {
    style: { height: 'var(--blk-ten-w)' }, // In isometric, width is smaller, driven by height and aspect ratio
    labelHe: 'עשרת — ניתן לפרוט ליחידות או להמיר למאה',
    Component: TenSVG,
  },
  hundreds: {
    style: { width: 'var(--blk-hundred)' }, // Height is determined by SVG ratio
    labelHe: 'מאה — ניתן לפרוט לעשרות או להמיר לאלף',
    Component: HundredSVG,
  },
  thousands: {
    style: { width: 'var(--blk-thousand)' }, // Width and height are equal in isometric
    labelHe: 'אלף — ניתן לפרוט למאות',
    Component: ThousandSVG,
  },
};

export function DienesBlock({ id, place, source, isOverlay, onRemove, noEnter }: DienesBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { source, place },
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
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      aria-label={visual.labelHe}
      className={`cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ws-accent rounded-[3px] transition-transform hover:scale-105 hover:-translate-y-1 ${hitPadding} ${isDragging ? 'opacity-30' : ''}`}
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
