import { useDraggable } from '@dnd-kit/core';
import { UdlTooltip } from '@/presentation/design-system/UdlTooltip';
import { motion } from 'framer-motion';
import { BlockOne, BlockTen, BlockHundred, BlockThousand } from './IsometricBlocks';

interface MathBlockProps {
  id: string;
  type: 'one' | 'ten' | 'hundred' | 'thousand';
  x?: number;
  y?: number;
  isSpreading?: boolean;
  targetX?: number;
  targetY?: number;
  isOverlay?: boolean;
  onDoubleClick?: (id: string, type: 'one' | 'ten' | 'hundred' | 'thousand') => void;
}

export function MathBlock({ id, type, x = 0, y = 0, isSpreading, targetX, targetY, isOverlay, onDoubleClick }: MathBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: id,
    data: { type },
  });

  // Position is absolute (0,0) and we use Framer Motion 'x' and 'y' properties to place it,
  // plus dnd-kit transform if dragging.
  const style = {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    ...(transform && !isOverlay ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      zIndex: 999,
    } : {}),
  };

  let tooltipText = "יחידה";
  let ariaLabel = "בדיד יחידה";
  let BlockComponent = BlockOne;

  if (type === 'ten') {
    BlockComponent = BlockTen;
    tooltipText = "עשרת (לחיצה כפולה לפריטה ליחידות)";
    ariaLabel = "בדיד עשרת";
  } else if (type === 'hundred') {
    BlockComponent = BlockHundred;
    tooltipText = "מאה (לחיצה כפולה לפריטה לעשרות)";
    ariaLabel = "בדיד מאה";
  } else if (type === 'thousand') {
    BlockComponent = BlockThousand;
    tooltipText = "אלף (לחיצה כפולה לפריטה למאות)";
    ariaLabel = "בדיד אלף";
  }

  const motionState = isOverlay || isDragging ? 'dragging' : 'idle';
  
  const currentX = isSpreading && targetX !== undefined ? targetX : x;
  const currentY = isSpreading && targetY !== undefined ? targetY : y;

  const variants = {
    initial: { scale: 0, opacity: 0, x: x, y: y },
    idle: { scale: 1, opacity: 1, x: currentX, y: currentY, filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' },
    hover: { scale: 1.05, opacity: 1, x: currentX, y: currentY, filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.15))' },
    dragging: { scale: 1.1, opacity: 1, filter: 'drop-shadow(0px 15px 25px rgba(0,0,0,0.3))' },
    exit: { scale: 0, opacity: 0, filter: 'blur(5px)', transition: { duration: 0.2 } }
  };

  return (
    <UdlTooltip content={tooltipText}>
      <div 
        ref={isOverlay ? undefined : setNodeRef} 
        style={style} 
        {...(isOverlay ? {} : listeners)} 
        {...(isOverlay ? {} : attributes)} 
        className={isOverlay ? "" : "cursor-grab active:cursor-grabbing outline-none touch-none"}
        onDoubleClick={() => onDoubleClick && onDoubleClick(id, type)}
      >
        <motion.div
          layout={false} // Disable layout since we manually handle x/y
          variants={variants}
          initial={isOverlay ? "dragging" : "initial"}
          animate={motionState}
          exit="exit"
          whileHover={motionState === 'idle' ? 'hover' : undefined}
          transition={isSpreading ? { type: 'spring', stiffness: 200, damping: 20 } : { type: 'spring', stiffness: 400, damping: 25 }}
          className={`flex items-center justify-center origin-center ${isDragging && !isOverlay ? 'opacity-30' : 'opacity-100'}`}
          aria-label={ariaLabel}
        >
          <BlockComponent />
        </motion.div>
      </div>
    </UdlTooltip>
  );
}
