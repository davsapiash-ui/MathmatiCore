import { useDraggable } from '@dnd-kit/core';
import type { Place } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { Package } from 'lucide-react';

interface PackagedBlockProps {
  id: string;
  place: Place;
}

export function PackagedBlock({ id, place }: PackagedBlockProps) {
  const unpackBlock = useWorkspaceStore((s) => s.unpackBlock);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { kind: 'packaged', place },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 50 : 10,
    opacity: isDragging ? 0.8 : 1,
  } : { zIndex: 10 };

  const handleDoubleClick = () => {
    unpackBlock(place);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={handleDoubleClick}
      className={`relative w-12 h-12 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing transition-transform ${isDragging ? 'scale-105 shadow-xl border-indigo-400' : 'hover:-translate-y-1 hover:shadow-lg'}`}
      title="לחיצה כפולה לפריטה (Ungroup)"
    >
      <Package className="w-6 h-6 text-indigo-500 relative z-10" />
      <div className="absolute -bottom-2 -right-2 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
        10
      </div>
    </div>
  );
}
