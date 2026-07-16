import React, { useState, useCallback } from 'react';
import { DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { EquationBoard } from './EquationBoard';
import { VirtualBlocksDock } from './VirtualBlocksDock';
import { SupportPaletteModal } from './SupportPaletteModal';
import { SessionReflection } from './SessionReflection';
import { useCognitiveHesitationRadar } from '@/application/useCognitiveHesitationRadar';

export function ActivityWorkspace() {
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showReflection, setShowReflection] = useState(false);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  // The radar tracks inactivity. If 30s pass without interaction, show the modal.
  useCognitiveHesitationRadar({
    isActive: !showSupportModal && !showReflection && !sessionCompleted,
    onHesitationDetected: () => {
      setShowSupportModal(true);
    }
  });

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    // In a full implementation, this is where we check event.over
    // and move the block from the dock into the EquationBoard column.
    console.log('Dragged', event.active.id, 'to', event.over?.id);
  }, []);

  const handleSupportOptionSelected = (option: string) => {
    console.log('Selected support option:', option);
    setShowSupportModal(false);
    // Here we would apply the pedagogical intervention
  };

  const handleReflectionComplete = (rating: number) => {
    console.log('Student feeling rating:', rating);
    setShowReflection(false);
    setSessionCompleted(true);
  };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans no-scrollbar">
      {/* Decorative background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-400/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Workspace Header */}
      <header className="w-full h-16 flex items-center justify-between px-8 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-white/20 z-20 relative shadow-sm">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-200">
          מתמטיקאור <span className="font-normal text-slate-500">| תרגול חיבור</span>
        </h1>
        <button 
          onClick={() => setShowReflection(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-500 rounded-full hover:bg-indigo-600 transition-colors shadow-md"
        >
          סיים תרגיל (טסט)
        </button>
      </header>

      {/* Main Play Area */}
      <main className="w-full h-[calc(100vh-4rem)] flex flex-col pt-8 relative">
        <DndContext onDragEnd={handleDragEnd}>
          
          {/* Equation Board (Center) */}
          <EquationBoard />

          {/* Draggable Blocks Dock (Bottom) */}
          <VirtualBlocksDock />

        </DndContext>
      </main>

      {/* Pedagogical Interventions */}
      <SupportPaletteModal 
        isOpen={showSupportModal} 
        onClose={() => setShowSupportModal(false)}
        onSelectOption={handleSupportOptionSelected}
      />

      {showReflection && (
        <SessionReflection onComplete={handleReflectionComplete} />
      )}
    </div>
  );
}
