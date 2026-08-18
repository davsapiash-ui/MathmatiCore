import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface DraggableBlockProps {
  id: string;
  value: number;
  label: string;
  color: string;
  place: 'units' | 'tens' | 'hundreds' | 'thousands';
}

function DraggableBlock({ id, value, label, color, place }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { value, place, type: 'source-block' }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`relative group flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all touch-none select-none cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-50 scale-105 shadow-2xl z-50' : 'bg-white/80 dark:bg-slate-800/80 hover:scale-105 shadow-md hover:shadow-lg'
      }`}
      style={{
        ...style,
        borderColor: color,
      }}
      aria-label={`גרור ${label} (${value})`}
    >
      <div 
        className="w-10 h-10 mb-2 rounded-lg shadow-inner flex items-center justify-center font-black text-xs text-white transition-transform group-hover:scale-110"
        style={{ backgroundColor: color }}
      >
        {value}
      </div>
      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
        {label}
      </span>
    </button>
  );
}

/**
 * VirtualBlocksDock
 * [Architecture Note - Marked Design Decision]:
 * Implemented via clean, accessible React DOM + @dnd-kit touch/pointer drag events rather than an
 * active HTML5 Canvas2D renderer loop. This ensures native accessibility, zero idle CPU consumption,
 * and deterministic drop resolution into the PlaceValueBoard drop zones.
 */
export function VirtualBlocksDock() {
  return (
    <div 
      className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[92%] max-w-lg z-30"
      dir="rtl"
    >
      <div className="relative rounded-3xl p-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-2 border-slate-200/80 dark:border-slate-800/80 shadow-xl flex items-center justify-around gap-2">
        <div className="relative z-10 flex items-center justify-around w-full gap-2">
          <DraggableBlock 
            id="source-unit" 
            value={1} 
            label="יחידה" 
            place="units"
            color="var(--block-unit, #f59e0b)" 
          />
          <DraggableBlock 
            id="source-ten" 
            value={10} 
            label="עשרת" 
            place="tens"
            color="var(--block-ten, #10b981)" 
          />
          <DraggableBlock 
            id="source-hundred" 
            value={100} 
            label="מאה" 
            place="hundreds"
            color="var(--block-hundred, #3b82f6)" 
          />
          <DraggableBlock 
            id="source-thousand" 
            value={1000} 
            label="אלף" 
            place="thousands"
            color="var(--block-thousand, #ef4444)" 
          />
        </div>
      </div>
    </div>
  );
}

export default VirtualBlocksDock;
