import { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { MathBoard } from '@/presentation/components/workspace/MathBoard';
import { MathBlock } from '@/presentation/components/workspace/MathBlock';
import { useSilentRadar } from '@/application/useSilentRadar';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { allTasks } from '@/data/mockTasks';

export function StudentWorkspace() {
  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const currentTask = allTasks[currentTaskIdx];

  const [ones, setOnes] = useState<{id: string}[]>([]);
  const [tens, setTens] = useState<{id: string}[]>([]);
  const [hundreds, setHundreds] = useState<{id: string}[]>([]);
  const [thousands, setThousands] = useState<{id: string}[]>([]);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'one' | 'ten' | 'hundred' | 'thousand' | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Initialize Silent Radar
  const { registerInteraction, registerUndo } = useSilentRadar({ taskId: currentTask.id });

  // Load initial blocks when task changes
  useEffect(() => {
    if (currentTask.initialBlocks) {
      setOnes(Array.from({ length: currentTask.initialBlocks.ones }).map((_, i) => ({ id: `one-init-${i}` })));
      setTens(Array.from({ length: currentTask.initialBlocks.tens }).map((_, i) => ({ id: `ten-init-${i}` })));
      setHundreds(Array.from({ length: currentTask.initialBlocks.hundreds }).map((_, i) => ({ id: `hundred-init-${i}` })));
      setThousands(Array.from({ length: currentTask.initialBlocks.thousands }).map((_, i) => ({ id: `thousand-init-${i}` })));
    } else {
      setOnes([]);
      setTens([]);
      setHundreds([]);
      setThousands([]);
    }
    setHasInteracted(false);
  }, [currentTask]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setActiveType(event.active.data.current?.type as 'one' | 'ten' | 'hundred' | 'thousand');
    setHasInteracted(true);
    registerInteraction();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);
    registerInteraction();

    if (!over) return;

    const blockType = active.data.current?.type;
    const targetColumn = over.data.current?.type;

    // Composition (10 Ones -> 1 Ten)
    if (blockType === 'one' && targetColumn === 'tens-column') {
      if (ones.length >= 10) {
        setOnes(prev => prev.slice(0, prev.length - 10));
        setTens(prev => [...prev, { id: `ten-${Date.now()}` }]);
      }
    }

    // Decomposition (1 Ten -> 10 Ones)
    if (blockType === 'ten' && targetColumn === 'ones-column') {
      setTens(prev => prev.filter(t => t.id !== active.id));
      const newOnes = Array.from({ length: 10 }).map((_, i) => ({ id: `one-${Date.now()}-${i}` }));
      setOnes(prev => [...prev, ...newOnes]);
    }

    // Composition (10 Tens -> 1 Hundred)
    if (blockType === 'ten' && targetColumn === 'hundreds-column') {
      if (tens.length >= 10) {
        setTens(prev => prev.slice(0, prev.length - 10));
        setHundreds(prev => [...prev, { id: `hundred-${Date.now()}` }]);
      }
    }

    // Decomposition (1 Hundred -> 10 Tens)
    if (blockType === 'hundred' && targetColumn === 'tens-column') {
      setHundreds(prev => prev.filter(h => h.id !== active.id));
      const newTens = Array.from({ length: 10 }).map((_, i) => ({ id: `ten-${Date.now()}-${i}` }));
      setTens(prev => [...prev, ...newTens]);
    }

    // Composition (10 Hundreds -> 1 Thousand)
    if (blockType === 'hundred' && targetColumn === 'thousands-column') {
      if (hundreds.length >= 10) {
        setHundreds(prev => prev.slice(0, prev.length - 10));
        setThousands(prev => [...prev, { id: `thousand-${Date.now()}` }]);
      }
    }

    // Decomposition (1 Thousand -> 10 Hundreds)
    if (blockType === 'thousand' && targetColumn === 'hundreds-column') {
      setThousands(prev => prev.filter(t => t.id !== active.id));
      const newHundreds = Array.from({ length: 10 }).map((_, i) => ({ id: `hundred-${Date.now()}-${i}` }));
      setHundreds(prev => [...prev, ...newHundreds]);
    }
  };

  const handleUndo = () => {
    registerUndo();
  };

  const addBlock = (type: 'one' | 'ten' | 'hundred' | 'thousand') => {
    setHasInteracted(true);
    registerInteraction();
    switch (type) {
      case 'one': setOnes(prev => [...prev, { id: `one-manual-${Date.now()}` }]); break;
      case 'ten': setTens(prev => [...prev, { id: `ten-manual-${Date.now()}` }]); break;
      case 'hundred': setHundreds(prev => [...prev, { id: `hundred-manual-${Date.now()}` }]); break;
      case 'thousand': setThousands(prev => [...prev, { id: `thousand-manual-${Date.now()}` }]); break;
    }
  };

  const nextTask = () => {
    if (currentTaskIdx < allTasks.length - 1) {
      setCurrentTaskIdx(prev => prev + 1);
    }
  };

  const prevTask = () => {
    if (currentTaskIdx > 0) {
      setCurrentTaskIdx(prev => prev - 1);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 font-sans relative overflow-hidden">
      
      {/* ZONE 1: Instructions & Exercises (Top Bar) */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-30 flex items-center justify-between px-6 py-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100">{currentTask.titleHe}</h1>
            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-1 rounded-full">משימה {currentTaskIdx + 1} מתוך {allTasks.length}</span>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-slate-600 dark:text-slate-300 text-base max-w-3xl">
              {currentTask.instructionHe}
            </p>
            <UdlSpeechButton text={currentTask.instructionHe} />
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <UdlButton variant="outline" onClick={handleUndo} className="bg-white hover:bg-slate-50">
            בטל פעולה
          </UdlButton>
          <div className="flex gap-1 ml-4 border-l pl-4 border-slate-200">
             <UdlButton variant="secondary" onClick={prevTask} disabled={currentTaskIdx === 0}>
               הקודם
             </UdlButton>
             <UdlButton semanticColor="primary" onClick={nextTask} disabled={!hasInteracted && currentTaskIdx < allTasks.length - 1}>
               סיימתי, המשך
             </UdlButton>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        
        {/* ZONE 2: Warehouse (Right Sidebar) */}
        <aside className="w-24 md:w-32 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-[4px_0_15px_rgba(0,0,0,0.05)] flex flex-col z-20 select-none">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col items-center">
            <h2 className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-300 text-center">מחסן</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 items-center">
            <button onClick={() => addBlock('thousand')} className="w-full aspect-square bg-orange-50 hover:bg-orange-100 dark:bg-orange-900/20 dark:hover:bg-orange-900/40 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 border border-orange-100 dark:border-orange-800/50">
               <div className="text-3xl">🧊</div>
               <span className="text-xs font-black text-orange-600 dark:text-orange-400">1000</span>
            </button>

            <button onClick={() => addBlock('hundred')} className="w-full aspect-square bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 border border-blue-100 dark:border-blue-800/50">
               <div className="text-3xl">🔲</div>
               <span className="text-xs font-black text-blue-600 dark:text-blue-400">100</span>
            </button>

            <button onClick={() => addBlock('ten')} className="w-full aspect-square bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 border border-green-100 dark:border-green-800/50">
               <div className="text-3xl">📏</div>
               <span className="text-xs font-black text-green-600 dark:text-green-400">10</span>
            </button>

            <button onClick={() => addBlock('one')} className="w-full aspect-square bg-[#F5F5DC]/50 hover:bg-[#F5F5DC] dark:bg-yellow-900/20 dark:hover:bg-yellow-900/40 rounded-xl flex flex-col items-center justify-center gap-2 transition-transform hover:scale-105 active:scale-95 border border-yellow-200 dark:border-yellow-800/50">
               <div className="text-3xl">▫️</div>
               <span className="text-xs font-black text-yellow-700 dark:text-yellow-500">1</span>
            </button>
          </div>
        </aside>

        {/* ZONE 3: MathBoard (Center) */}
        <main className="flex-1 relative flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
          {/* Ambient Lights */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {currentTask.numberA !== undefined && currentTask.numberB !== undefined && (
            <div className="absolute top-8 left-8 z-10 bg-white dark:bg-slate-900 px-8 py-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800">
               <div className="flex flex-col items-end text-5xl font-black text-slate-800 dark:text-slate-100 tracking-widest font-mono">
                 <div className="mr-8">{currentTask.numberA}</div>
                 <div className="flex items-center gap-4">
                   <span className="text-4xl text-slate-500">{currentTask.isSubtraction ? '-' : '+'}</span>
                   <span>{currentTask.numberB}</span>
                 </div>
                 <div className="w-full h-1 bg-slate-800 dark:bg-slate-100 mt-2 mb-2"></div>
                 {/* Empty space for the student to write the answer, or show it if solved */}
                 <div className="h-12 w-full text-center text-indigo-600"></div>
               </div>
            </div>
          )}

          <DndContext 
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <MathBoard ones={ones} tens={tens} hundreds={hundreds} thousands={thousands} />

            <DragOverlay>
              {activeId && activeType ? (
                <MathBlock id={activeId} type={activeType} isOverlay={true} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </main>
        
      </div>
    </div>
  );
}
