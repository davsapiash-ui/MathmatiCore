import { useDroppable } from '@dnd-kit/core';

/** פח מחיקה — only blocks dragged FROM a column delete (palette drags are copies). */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  return (
    <div
      ref={setNodeRef}
      role="button"
      aria-label="גרור לכאן כדי למחוק"
      className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl border-2 border-dashed transition-all duration-200 select-none ${
        isOver ? 'scale-110 rotate-12 border-ws-danger bg-red-50 shadow-[0_6px_16px_-6px_rgba(220,60,60,0.5)]' : 'border-ws-surface2 bg-ws-bg/70 hover:border-ws-danger/40'
      }`}
    >
      🗑️
    </div>
  );
}
