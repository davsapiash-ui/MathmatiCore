import { useDroppable } from '@dnd-kit/core';
import { Trash2 } from 'lucide-react';

/** פח מחיקה — only blocks dragged FROM a column delete (palette drags are copies). */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  return (
    <div className="relative group">
      <div
        ref={setNodeRef}
        role="button"
        aria-label="גרור לכאן כדי למחוק"
        className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 select-none cursor-pointer ${
          isOver 
            ? 'scale-110 rotate-6 bg-red-100 text-red-600 border-2 border-dashed border-red-400 shadow-[0_8px_20px_-6px_rgba(220,38,38,0.5)]' 
            : 'bg-ws-bg/70 text-ws-soft border border-ws-surface2 hover:border-red-300 hover:text-red-500 hover:bg-red-50/50'
        }`}
      >
        <Trash2 size={26} strokeWidth={isOver ? 2.5 : 2} />
      </div>

      {/* Norman Principle: Explanatory Hover Tooltip */}
      <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-32 p-1.5 bg-slate-900/95 text-white text-[10px] text-center font-bold rounded-xl shadow-lg backdrop-blur-md border border-white/10 whitespace-nowrap">
        <span>🗑️ גרור לכאן כדי למחוק</span>
      </div>
    </div>
  );
}
