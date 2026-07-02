import { useDraggable } from '@dnd-kit/core';
import { UdlTooltip } from '@/presentation/design-system/UdlTooltip';
import { motion } from 'framer-motion';

interface MathBlockProps {
  id: string;
  type: 'one' | 'ten' | 'hundred' | 'thousand';
  isOverlay?: boolean;
}

export function MathBlock({ id, type, isOverlay }: MathBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { type },
  });

  const style = transform && !isOverlay ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  let tooltipText = "יחידה";
  let blockClass = "";

  if (type === 'one') {
    tooltipText = "יחידה";
    blockClass = "w-4 h-4 bg-amber-400 rounded-[2px] shadow-[0_3px_0_#b45309,0_3px_6px_rgba(0,0,0,0.2)] mb-1 shrink-0";
  } else if (type === 'ten') {
    tooltipText = "עשרת (ניתן לפרוט ליחידות או לחבר למאה)";
    blockClass = "w-[120px] h-3 bg-emerald-500 rounded-[2px] shadow-[0_3px_0_#047857,0_3px_6px_rgba(0,0,0,0.2)] mb-1 shrink-0";
  } else if (type === 'hundred') {
    tooltipText = "מאה (ניתן לפרוט לעשרות או לחבר לאלף)";
    blockClass = "w-[80px] h-[80px] bg-blue-500 rounded-[2px] shadow-[0_3px_0_#1d4ed8,0_3px_6px_rgba(0,0,0,0.2)] mb-1 shrink-0";
  } else if (type === 'thousand') {
    tooltipText = "אלף (ניתן לפרוט למאות)";
    blockClass = "w-[90px] h-[90px] bg-red-500 rounded-[2px] shadow-[-2px_2px_0_rgba(220,38,38,0.9),-4px_4px_0_rgba(220,38,38,0.7),-6px_6px_0_rgba(220,38,38,0.5),-8px_8px_10px_rgba(0,0,0,0.3)] mb-2 ml-2 shrink-0";
  }

  // Grid background style for divisions ("חלוקה")
  let gridStyle = {};
  if (type === 'ten') {
    gridStyle = { backgroundSize: '10% 100%', backgroundImage: 'linear-gradient(90deg, transparent 90%, rgba(0,0,0,0.2) 90%)' };
  } else if (type === 'hundred' || type === 'thousand') {
    gridStyle = { backgroundSize: '10% 10%', backgroundImage: 'linear-gradient(0deg, transparent 90%, rgba(0,0,0,0.2) 90%), linear-gradient(90deg, transparent 90%, rgba(0,0,0,0.2) 90%)' };
  }

  return (
    <UdlTooltip content={tooltipText}>
      <div 
        ref={isOverlay ? undefined : setNodeRef} 
        style={style} 
        {...(isOverlay ? {} : listeners)} 
        {...(isOverlay ? {} : attributes)} 
        className={isOverlay ? "" : "cursor-grab active:cursor-grabbing outline-none"}
      >
        <motion.div
          animate={isOverlay || isDragging ? 'dragging' : 'idle'}
          className={`${blockClass} relative flex items-center justify-center select-none`}
          style={gridStyle}
        >
          {/* Bevel effect */}
          <div className="absolute inset-0 rounded-[inherit] shadow-[inset_0_2px_4px_rgba(255,255,255,0.8),inset_0_-4px_6px_rgba(0,0,0,0.15)] pointer-events-none z-[5]" />
          <div className="absolute top-[1px] left-[1px] right-[1px] h-[40%] bg-gradient-to-b from-white/60 to-transparent rounded-[inherit] pointer-events-none z-[10]" />
        </motion.div>
      </div>
    </UdlTooltip>
  );
}
