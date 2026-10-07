import { useDraggable } from '@dnd-kit/core';
import type { Place, DragSource } from '@/core/placeValue';

/**
 * בלוק דיינס (בדיד) - Isometric 3D SVG Implementation
 * Responsive sizes driven by CSS variables in index.css.
 * SVG Viewboxes ensure aspect ratio is maintained perfectly without forcing scrollbars.
 */

export interface DienesBlockProps {
  id?: string;
  place: Place;
  source?: DragSource;
  sourcePlace?: Place;
  isOverlay?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  onSplit?: () => void;
  noEnter?: boolean;
  /** In a column: the block's rendered size and the padding around it
   *  (core/blockLayout.ts). The whole cell is the click-and-drag area. */
  cell?: { w: number; h: number; pad: number };
}

// ----------------------------------------------------------------------
// SVG Components for each Isometric Block
// ----------------------------------------------------------------------

/**
 * The lines that show what a block is made of (owner, 7.10.2026): a ten is
 * ten units, a hundred ten tens, a thousand ten hundreds. They used to be set
 * with the vector-effect value "nonScalingStroke", which SVG does not have, so the
 * browser ignored it and every line shrank with the drawing: a 2.2-unit line
 * in a 2010-unit view box drawn 82px wide is 0.09px — on a school laptop the
 * hundred and the thousand looked almost smooth. Now the lines and the edges
 * keep a fixed width on the screen whatever the block's size, in a dark shade
 * of the block's own colour (not black), soft enough not to turn the face into
 * a mesh. Sizes, colours, gradients and shadows are unchanged.
 */
const UNIT_LINE = { strokeWidth: 0.75, strokeOpacity: 0.42, vectorEffect: 'non-scaling-stroke', strokeLinecap: 'round' } as const;
const EDGE = { strokeWidth: 0.8, strokeOpacity: 0.6, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' } as const;
/** The dark shade of each block's colour, for its edges and unit lines. */
const SHADE = { units: '#713f12', tens: '#14532d', hundreds: '#1e3a8a', thousands: '#7c2d12' } as const;

export const UnitSVG = () => {
  return (
    <svg viewBox="-5 -5 210 210" className="w-full h-full filter drop-shadow-[0_4px_8px_rgba(234,179,8,0.4)] overflow-visible pointer-events-none select-none">
      <defs>
        <linearGradient id="unitTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF9C3" />
          <stop offset="100%" stopColor="#FEF08A" />
        </linearGradient>
        <linearGradient id="unitRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>
        <linearGradient id="unitLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>
      </defs>
      <polygon points="100,0 200,50 100,100 0,50" fill="url(#unitTop)" stroke={SHADE.units} {...EDGE} />
      <polygon points="100,100 200,50 200,150 100,200" fill="url(#unitRight)" stroke={SHADE.units} {...EDGE} />
      <polygon points="0,50 100,100 100,200 0,150" fill="url(#unitLeft)" stroke={SHADE.units} {...EDGE} />
    </svg>
  );
};

export const TenSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`t-${i}`} x1={100 + i * 100} y1={i * 50} x2={i * 100} y2={50 + i * 50} stroke={SHADE.tens} {...UNIT_LINE} />);
      lines.push(<line key={`l-${i}`} x1={i * 100} y1={50 + i * 50} x2={i * 100} y2={180 + i * 50} stroke={SHADE.tens} {...UNIT_LINE} />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 1110 700" className="w-full h-full filter drop-shadow-[0_8px_16px_rgba(34,197,94,0.4)] overflow-visible pointer-events-none select-none">
      <defs>
        <linearGradient id="tenTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DCFCE7" />
          <stop offset="100%" stopColor="#86EFAC" />
        </linearGradient>
        <linearGradient id="tenRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#22C55E" />
        </linearGradient>
        <linearGradient id="tenLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
      </defs>
      <polygon points="100,0 1100,500 1000,550 0,50" fill="url(#tenTop)" stroke={SHADE.tens} {...EDGE} />
      <polygon points="1100,500 1000,550 1000,680 1100,630" fill="url(#tenRight)" stroke={SHADE.tens} {...EDGE} />
      <polygon points="0,50 1000,550 1000,680 0,180" fill="url(#tenLeft)" stroke={SHADE.tens} {...EDGE} />
      <g className="dienes-seams">{renderLines()}</g>
    </svg>
  );
};

export const HundredSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke={SHADE.hundreds} {...UNIT_LINE} />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke={SHADE.hundreds} {...UNIT_LINE} />);
      lines.push(<line key={`rt-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={1100 - i * 50} stroke={SHADE.hundreds} {...UNIT_LINE} />);
      lines.push(<line key={`lt-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={600 + i * 50} stroke={SHADE.hundreds} {...UNIT_LINE} />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 2010 1110" className="w-full h-full filter drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)] overflow-visible pointer-events-none select-none">
      <defs>
        <linearGradient id="hundredTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#DBEAFE" />
          <stop offset="100%" stopColor="#93C5FD" />
        </linearGradient>
        <linearGradient id="hundredRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="hundredLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="url(#hundredTop)" stroke={SHADE.hundreds} {...EDGE} />
      <polygon points="2000,500 1000,1000 1000,1100 2000,600" fill="url(#hundredRight)" stroke={SHADE.hundreds} {...EDGE} />
      <polygon points="0,500 1000,1000 1000,1100 0,600" fill="url(#hundredLeft)" stroke={SHADE.hundreds} {...EDGE} />
      <g className="dienes-seams">{renderLines()}</g>
    </svg>
  );
};

export const ThousandSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`t1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke={SHADE.thousands} {...UNIT_LINE} />);
      lines.push(<line key={`t2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke={SHADE.thousands} {...UNIT_LINE} />);
      // The right face runs from (1000,1000)–(1000,2000) up to (2000,500)–(2000,1500):
      // its vertical lines rise as they go right (they fell below the cube).
      lines.push(<line key={`r1-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={2000 - i * 50} stroke={SHADE.thousands} {...UNIT_LINE} />);
      lines.push(<line key={`r2-${i}`} x1={1000} y1={1000 + i * 100} x2={2000} y2={500 + i * 100} stroke={SHADE.thousands} {...UNIT_LINE} />);
      lines.push(<line key={`l1-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={1500 + i * 50} stroke={SHADE.thousands} {...UNIT_LINE} />);
      lines.push(<line key={`l2-${i}`} x1={0} y1={500 + i * 100} x2={1000} y2={1000 + i * 100} stroke={SHADE.thousands} {...UNIT_LINE} />);
    }
    return lines;
  };

  return (
    <svg viewBox="-5 -5 2010 2010" className="w-full h-full filter drop-shadow-[0_12px_24px_rgba(234,88,12,0.35)] overflow-visible pointer-events-none select-none">
      <defs>
        <linearGradient id="thousandTop" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFEDD5" />
          <stop offset="100%" stopColor="#FDBA74" />
        </linearGradient>
        <linearGradient id="thousandRight" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
        <linearGradient id="thousandLeft" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="url(#thousandTop)" stroke={SHADE.thousands} {...EDGE} />
      <polygon points="1000,1000 2000,500 2000,1500 1000,2000" fill="url(#thousandRight)" stroke={SHADE.thousands} {...EDGE} />
      <polygon points="0,500 1000,1000 1000,2000 0,1500" fill="url(#thousandLeft)" stroke={SHADE.thousands} {...EDGE} />
      <g className="dienes-seams">{renderLines()}</g>
    </svg>
  );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

/** Rendered block sizes in px — shared with the grouping animation's ghosts. */
export const BLOCK_SIZES: Record<Place, { w: number; h: number }> = {
  units: { w: 20, h: 20 },
  tens: { w: 68, h: 42 },
  hundreds: { w: 82, h: 48 },
  thousands: { w: 82, h: 82 },
};

export const BLOCK_SVGS: Record<Place, React.FC> = {
  units: UnitSVG,
  tens: TenSVG,
  hundreds: HundredSVG,
  thousands: ThousandSVG,
};

const BLOCK_VISUALS: Record<Place, { style?: React.CSSProperties; labelHe: string; Component: React.FC }> = {
  units: {
    style: { width: '20px', height: '20px', maxWidth: '100%' },
    labelHe: 'לבנת יחידה — גררו אותה לפח האשפה כדי למחוק אותה',
    Component: UnitSVG,
  },
  tens: {
    style: { width: '68px', height: '42px', maxWidth: '100%' },
    labelHe: 'לבנת עשרת — לחצו עליה כדי לפרוט אותה לעשר יחידות, או גררו אותה לטור היחידות או לפח האשפה',
    Component: TenSVG,
  },
  hundreds: {
    style: { width: '82px', height: '48px', maxWidth: '100%' },
    labelHe: 'לבנת מאה — לחצו עליה כדי לפרוט אותה לעשר לבני עשרת, או גררו אותה לטור העשרות או לפח האשפה',
    Component: HundredSVG,
  },
  thousands: {
    style: { width: '82px', height: '82px', maxWidth: '100%' },
    labelHe: 'לבנת אלף — לחצו עליה כדי לפרוט אותה לעשר לבני מאה, או גררו אותה לטור המאות או לפח האשפה',
    Component: ThousandSVG,
  },
};

export function DienesBlock({ 
  id = 'dienes-block', 
  place, 
  source = 'column', 
  sourcePlace, 
  isOverlay, 
  interactive: _interactive,
  onClick,
  onRemove, 
  onSplit,
  cell,
}: DienesBlockProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: { source, place: sourcePlace ?? place, renderPlace: place },
    disabled: isOverlay,
  });

  const visual = BLOCK_VISUALS[place];
  const SvgElement = visual.Component;

  const inner = (
    <div
      className="relative select-none shrink-0 inline-flex items-center justify-center pointer-events-none"
      style={cell ? { width: `${cell.w}px`, height: `${cell.h}px` } : visual.style}
    >
      <SvgElement />
    </div>
  );

  if (isOverlay) return inner;

  const hitPadding = cell ? '' : place === 'units' ? 'p-3 -m-1.5' : 'p-1 -m-0.5';

  const handleAction = (_e?: React.MouseEvent | React.KeyboardEvent) => {
    if (onClick) onClick();
    else if (onSplit) onSplit();
    else if (onRemove) onRemove();
  };

  return (
    <div
      ref={setNodeRef}
      id={id}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      aria-label={visual.labelHe}
      // In a column the cell is exactly block + padding: flex, so no line box
      // adds height under the block and the computed layout is the real one.
      style={cell ? { touchAction: 'none', padding: `${cell.pad}px`, boxSizing: 'content-box', display: 'flex', width: `${cell.w}px`, height: `${cell.h}px`, lineHeight: 0 } : { touchAction: 'none' }}
      data-block-w={cell?.w}
      data-block-h={cell?.h}
      className={`touch-none cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-ws-accent rounded-[3px] hover:brightness-110 ${hitPadding} ${isDragging ? 'opacity-30' : ''}`}
      onClick={handleAction}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleAction(e);
        }
      }}
    >
      {inner}
    </div>
  );
}
