import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface DraggableBlockProps {
  id: string;
  value: number;
  label: string;
  colorClass: string;
}

function DraggableBlock({ id, value, label, colorClass }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
    data: { value, type: 'source-block' }
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`relative group flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-white/40 shadow-sm hover:shadow-md transition-all touch-none bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm ${colorClass}`}
    >
      {/* Visual representation of block */}
      <div className="w-10 h-10 mb-2 rounded-md shadow-inner bg-current opacity-80 group-hover:opacity-100 transition-opacity" />
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </span>
    </button>
  );
}

export function VirtualBlocksDock() {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg z-40">
      {/* Glassmorphic Dock Container */}
      <div className="glass-card rounded-3xl p-4 flex items-center justify-around gap-4 mx-auto">
        
        <DraggableBlock 
          id="source-unit" 
          value={1} 
          label="יחידה" 
          colorClass="text-amber-500 hover:border-amber-400" 
        />
        
        <DraggableBlock 
          id="source-ten" 
          value={10} 
          label="עשרת" 
          colorClass="text-emerald-500 hover:border-emerald-400" 
        />
        
        <DraggableBlock 
          id="source-hundred" 
          value={100} 
          label="מאה" 
          colorClass="text-blue-500 hover:border-blue-400" 
        />
        
        <DraggableBlock 
          id="source-thousand" 
          value={1000} 
          label="אלף" 
          colorClass="text-rose-500 hover:border-rose-400" 
        />
        
      </div>
    </div>
  );
}
