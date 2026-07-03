import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

/** פח מחיקה — only blocks dragged FROM a column delete (palette drags are copies). */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  return (
    <div
      ref={setNodeRef}
      role="button"
      aria-label="גרור לכאן כדי למחוק"
      className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 select-none ${
        isOver 
          ? 'scale-110 rotate-6 bg-red-100 text-red-600 border-2 border-dashed border-red-400 shadow-[0_8px_20px_-6px_rgba(220,38,38,0.5)]' 
          : 'bg-ws-bg/70 text-ws-soft border border-ws-surface2 hover:border-red-300 hover:text-red-500 hover:bg-red-50/50'
      }`}
    >
      <Trash2 size={26} strokeWidth={isOver ? 2.5 : 2} />
    </div>
  );
}
