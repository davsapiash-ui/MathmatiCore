import { useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
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
}

// ----------------------------------------------------------------------
// SVG Components for each Isometric Block
// ----------------------------------------------------------------------

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
      <polygon points="100,0 200,50 100,100 0,50" fill="url(#unitTop)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="100,100 200,50 200,150 100,200" fill="url(#unitRight)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,50 100,100 100,200 0,150" fill="url(#unitLeft)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
    </svg>
  );
};

export const TenSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`t-${i}`} x1={100 + i * 100} y1={i * 50} x2={i * 100} y2={50 + i * 50} stroke="#0f172a" strokeWidth="2.5" opacity="0.9" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`l-${i}`} x1={i * 100} y1={50 + i * 50} x2={i * 100} y2={180 + i * 50} stroke="#0f172a" strokeWidth="2.5" opacity="0.9" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
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
      <polygon points="100,0 1100,500 1000,550 0,50" fill="url(#tenTop)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="1100,500 1000,550 1000,680 1100,630" fill="url(#tenRight)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,50 1000,550 1000,680 0,180" fill="url(#tenLeft)" stroke="#0f172a" strokeWidth="2.8" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

export const HundredSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`tt1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`tt2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`rt-${i}`} x1={1000 + i * 100} y1={1000 - i * 50} x2={1000 + i * 100} y2={1100 - i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`lt-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={600 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
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
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="url(#hundredTop)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="2000,500 1000,1000 1000,1100 2000,600" fill="url(#hundredRight)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,1100 0,600" fill="url(#hundredLeft)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

export const ThousandSVG = () => {
  const renderLines = () => {
    const lines = [];
    for (let i = 1; i <= 9; i++) {
      lines.push(<line key={`t1-${i}`} x1={1000 - i * 100} y1={i * 50} x2={2000 - i * 100} y2={500 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`t2-${i}`} x1={1000 + i * 100} y1={i * 50} x2={i * 100} y2={500 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`r1-${i}`} x1={1000 + i * 100} y1={1000 + i * 50} x2={1000 + i * 100} y2={2000 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`r2-${i}`} x1={1000} y1={1000 + i * 100} x2={2000} y2={500 + i * 100} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`l1-${i}`} x1={i * 100} y1={500 + i * 50} x2={i * 100} y2={1500 + i * 50} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
      lines.push(<line key={`l2-${i}`} x1={0} y1={500 + i * 100} x2={1000} y2={1000 + i * 100} stroke="#0f172a" strokeWidth="2.2" opacity="0.85" vectorEffect="nonScalingStroke" strokeLinecap="round" />);
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
      <polygon points="1000,0 2000,500 1000,1000 0,500" fill="url(#thousandTop)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="1000,1000 2000,500 2000,1500 1000,2000" fill="url(#thousandRight)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      <polygon points="0,500 1000,1000 1000,2000 0,1500" fill="url(#thousandLeft)" stroke="#0f172a" strokeWidth="2.5" vectorEffect="nonScalingStroke" strokeLinejoin="round" />
      {renderLines()}
    </svg>
  );
};

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

const BLOCK_VISUALS: Record<Place, { style?: React.CSSProperties; labelHe: string; Component: React.FC }> = {
  units: {
    style: { width: '20px', height: '20px', maxWidth: '100%' },
    labelHe: 'יחידה — לחצו להסרה או גררו לטור אחר או לפח',
    Component: UnitSVG,
  },
  tens: {
    style: { width: '68px', height: '42px', maxWidth: '100%' },
    labelHe: 'עשרת — לחצו לפריטה ל-10 יחידות או גררו לטור היחידות או לפח',
    Component: TenSVG,
  },
  hundreds: {
    style: { width: '82px', height: '48px', maxWidth: '100%' },
    labelHe: 'מאה — לחצו לפריטה ל-10 עשרות או גררו לטור העשרות או לפח',
    Component: HundredSVG,
  },
  thousands: {
    style: { width: '82px', height: '82px', maxWidth: '100%' },
    labelHe: 'אלף — לחצו לפריטה ל-10 מאות או גררו לטור המאות או לפח',
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
  noEnter 
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
      style={visual.style}
    >
      <SvgElement />
    </div>
  );

  if (isOverlay) return inner;

  const hitPadding = place === 'units' ? 'p-3 -m-1.5' : 'p-1 -m-0.5';

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
      style={{ touchAction: 'none' }}
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
