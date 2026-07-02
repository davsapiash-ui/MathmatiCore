import { useDraggable } from '@dnd-kit/core';
import { UdlTooltip } from '@/presentation/design-system/UdlTooltip';
import { motion } from 'framer-motion';
import { BlockOne, BlockTen, BlockHundred, BlockThousand } from './IsometricBlocks';

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
  let ariaLabel = "בדיד יחידה";
  let BlockComponent = BlockOne;

  if (type === 'ten') {
    BlockComponent = BlockTen;
    tooltipText = "עשרת (ניתן לפרוט ליחידות או לחבר למאה)";
    ariaLabel = "בדיד עשרת";
  } else if (type === 'hundred') {
    BlockComponent = BlockHundred;
    tooltipText = "מאה (ניתן לפרוט לעשרות או לחבר לאלף)";
    ariaLabel = "בדיד מאה";
  } else if (type === 'thousand') {
    BlockComponent = BlockThousand;
    tooltipText = "אלף (ניתן לפרוט למאות)";
    ariaLabel = "בדיד אלף";
  }

  // Kinematics & UI Physics (Micro-interactions)
  const motionState = isOverlay || isDragging ? 'dragging' : 'idle';
  
  const variants = {
    initial: { scale: 0, opacity: 0, zIndex: 1 },
    idle: { scale: 1, opacity: 1, zIndex: 1, filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' },
    hover: { scale: 1.05, opacity: 1, zIndex: 10, filter: 'drop-shadow(0px 8px 12px rgba(0,0,0,0.15))' },
    dragging: { scale: 1.1, opacity: 1, zIndex: 999, filter: 'drop-shadow(0px 15px 25px rgba(0,0,0,0.3))' },
    exit: { scale: 0, opacity: 0, zIndex: 0, filter: 'blur(5px)', transition: { duration: 0.2 } }
  };

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
          layout={!isOverlay}
          variants={variants}
          initial={isOverlay ? "dragging" : "initial"}
          animate={motionState}
          exit="exit"
          whileHover={motionState === 'idle' ? 'hover' : undefined}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`flex items-center justify-center origin-center ${isDragging && !isOverlay ? 'opacity-30' : 'opacity-100'}`}
          aria-label={ariaLabel}
        >
          <BlockComponent />
        </motion.div>
      </div>
    </UdlTooltip>
  );
}
