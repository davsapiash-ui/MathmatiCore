import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';

interface ColumnProps {
  id: string;
  title: string;
  isActive: boolean;
  isAsdMode: boolean;
  blocksCount: number;
  colorClass: string;
}

function EquationColumn({ id, title, isActive, isAsdMode, blocksCount, colorClass }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  // Calculate ASD dimming
  const isDimmed = isAsdMode && !isActive;
  
  return (
    <div 
      ref={setNodeRef}
      className={`flex flex-col items-center flex-1 transition-all duration-500 ease-in-out
        ${isDimmed ? 'inactive-column-dim' : ''}
        ${isOver ? 'scale-105 filter drop-shadow-md' : ''}
      `}
    >
      <div className="w-full text-center py-2 text-xl font-bold text-slate-500 border-b-2 border-slate-200 dark:border-slate-700 mb-4">
        {title}
      </div>
      
      {/* Target drop area for blocks */}
      <div className={`w-full min-h-[300px] rounded-2xl border-2 border-dashed p-4 flex flex-col-reverse items-center justify-start gap-2
        ${isOver ? `border-${colorClass}-400 bg-${colorClass}-50/50 dark:bg-${colorClass}-900/20` : 'border-slate-300 dark:border-slate-600'}
        transition-colors
      `}>
        {/* Render blocks here. For now we just show a count */}
        {Array.from({ length: blocksCount }).map((_, i) => (
          <div key={i} className={`w-12 h-12 rounded-lg bg-${colorClass}-500 shadow-sm animate-fade-slide-up`} />
        ))}
        {blocksCount === 0 && (
          <span className="text-slate-400 dark:text-slate-500 text-sm opacity-50 m-auto">
            גרור לכאן
          </span>
        )}
      </div>
    </div>
  );
}

export function EquationBoard() {
  // In a real implementation, activeColumn would be managed by a global store
  const [activeColumn, setActiveColumn] = useState<string>('units');
  // In a real implementation, ASD mode is toggleable per user profile
  const [isAsdMode, setIsAsdMode] = useState<boolean>(true);

  return (
    <div className="w-full max-w-4xl mx-auto mt-12 mb-32 relative z-10">
      
      {/* ASD Mode toggle for testing purposes during development */}
      <div className="absolute -top-12 left-0 flex items-center gap-2">
        <button 
          onClick={() => setIsAsdMode(!isAsdMode)}
          className={`text-xs px-3 py-1 rounded-full border ${isAsdMode ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}
        >
          ASD Mode: {isAsdMode ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="glass-card rounded-3xl p-8 shadow-2xl">
        <div className="flex flex-row-reverse justify-between gap-4">
          
          <EquationColumn 
            id="units" 
            title="יחידות" 
            isActive={activeColumn === 'units'} 
            isAsdMode={isAsdMode}
            blocksCount={4}
            colorClass="amber"
          />
          
          <EquationColumn 
            id="tens" 
            title="עשרות" 
            isActive={activeColumn === 'tens'} 
            isAsdMode={isAsdMode}
            blocksCount={2}
            colorClass="emerald"
          />
          
          <EquationColumn 
            id="hundreds" 
            title="מאות" 
            isActive={activeColumn === 'hundreds'} 
            isAsdMode={isAsdMode}
            blocksCount={0}
            colorClass="blue"
          />
          
          <EquationColumn 
            id="thousands" 
            title="אלפים" 
            isActive={activeColumn === 'thousands'} 
            isAsdMode={isAsdMode}
            blocksCount={0}
            colorClass="rose"
          />
          
        </div>
        
        {/* Math Operation symbol */}
        <div className="absolute top-1/2 -right-8 text-6xl font-bold text-slate-300 dark:text-slate-700 select-none">
          +
        </div>
        
        <div className="w-full h-1 bg-slate-800 dark:bg-slate-400 mt-8 mb-4 rounded-full" />
      </div>
    </div>
  );
}
