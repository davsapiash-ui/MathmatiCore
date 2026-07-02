import { useDroppable } from '@dnd-kit/core';

/** פח מחיקה — only blocks dragged FROM a column delete (palette drags are copies). */
export function TrashZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash', data: { kind: 'trash' } });

  return (
    <div
      ref={setNodeRef}
      role="button"
      aria-label="גרור לכאן כדי למחוק"
      className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl border-2 border-dashed transition-all duration-200 select-none ${
        isOver ? 'scale-115 rotate-12 border-ws-danger bg-red-50' : 'border-ws-surface2 bg-ws-surface'
      }`}
    >
      🗑️
    </div>
  );
}
