import { useDroppable } from '@dnd-kit/core';
import { MathBlock } from './MathBlock';
import type { MathItem } from '@/domain/types/MathItem';

interface MathBoardProps {
  items: MathItem[];
  onDoubleClickItem?: (id: string, type: 'one' | 'ten' | 'hundred' | 'thousand') => void;
}

export function MathBoard({ items, onDoubleClickItem }: MathBoardProps) {
  const { setNodeRef } = useDroppable({
    id: 'math-board-canvas',
    data: { type: 'canvas' }
  });

  return (
    <div 
      ref={setNodeRef}
      className="w-full h-[600px] bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 relative overflow-hidden" 
      dir="ltr"
    >
      {/* Visual background lines (optional, to give a notebook feel) */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'linear-gradient(0deg, transparent 24px, #000 25px)', backgroundSize: '100% 25px' }}></div>
      
      {items.map((item) => (
        <MathBlock 
          key={item.id} 
          id={item.id} 
          type={item.type} 
          x={item.x} 
          y={item.y} 
          isSpreading={item.isSpreading}
          targetX={item.targetX}
          targetY={item.targetY}
          onDoubleClick={onDoubleClickItem}
        />
      ))}
    </div>
  );
}
