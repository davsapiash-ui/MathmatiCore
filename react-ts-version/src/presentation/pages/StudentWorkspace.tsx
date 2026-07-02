import { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { MathBoard } from '@/presentation/components/workspace/MathBoard';
import { BlockOne, BlockTen, BlockHundred, BlockThousand } from '@/presentation/components/workspace/IsometricBlocks';
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
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
      <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 font-sans relative overflow-hidden" dir="rtl">
        
        {/* ── Premium Top Bar ── */}
        <nav className="w-full h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm z-30 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg">מ</div>
            <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">מתמטיקאור</span>
          </div>

          <div className="flex gap-2">
             {allTasks.map((t, i) => (
               <div key={t.id} className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentTaskIdx ? 'bg-indigo-600 scale-125' : i < currentTaskIdx ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
             ))}
          </div>

          <div className="flex gap-4 items-center">
            <UdlButton variant="outline" onClick={handleUndo} className="h-9 px-3 text-sm rounded-full">
               <span className="flex items-center gap-2">בטל פעולה</span>
            </UdlButton>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <UdlButton variant="secondary" onClick={prevTask} disabled={currentTaskIdx === 0} className="h-9 px-3 text-sm rounded-full">
              הקודם
            </UdlButton>
            <UdlButton semanticColor="primary" onClick={nextTask} disabled={!hasInteracted && currentTaskIdx < allTasks.length - 1} className="h-9 px-4 text-sm rounded-full">
              הבא
            </UdlButton>
          </div>
        </nav>

        {/* ── Main Workspace ── */}
        <main className="flex flex-1 overflow-hidden p-6 gap-6 max-w-[1600px] mx-auto w-full">
          
          {/* Right Side: Task Instruction Card (Exercise Area 50%) */}
          <div className="flex-[1] bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[32px] p-8 shadow-[0_24px_48px_rgba(0,0,0,0.08)] border border-white/50 flex flex-col relative overflow-y-auto">
             <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mb-2">מפגש 1</p>
             <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100 mb-4">{currentTask.titleHe}</h1>
             <p className="text-xl text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-8">
               {currentTask.instructionHe}
             </p>

             <div className="mt-auto mb-auto flex justify-center">
               <div className="bg-slate-100/80 dark:bg-slate-800/80 p-8 rounded-3xl shadow-inner font-mono text-6xl font-black text-slate-800 dark:text-slate-100 tracking-[0.5rem] text-right min-w-[200px]" dir="ltr">
                  <div className="text-right">{currentTask.numberA}</div>
                  <div className="flex items-center gap-4">
                  <div className="border-b-4 border-slate-800 dark:border-slate-100 pb-2 mb-2 flex justify-between w-full">
                    <span className="text-indigo-500 mr-4">+</span>
                    <span className="text-right">{currentTask.numberB}</span>
                  </div>
                 </div>
               </div>
             </div>
             
             <div className="absolute bottom-6 left-6">
               <UdlSpeechButton text={currentTask.instructionHe} />
             </div>
          </div>

          {/* Left Side: Place Value Structure (MathBoard) & Palette */}
          <div className="flex-[1] flex flex-col gap-4">
             {/* Place Value Structure */}
             <div className="flex-1 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl rounded-[32px] shadow-[0_10px_40px_rgba(0,0,0,0.04)] border border-white/50 flex flex-col overflow-hidden p-6 relative">
               <p className="text-center text-sm font-bold text-slate-500 mb-4 tracking-wide">טבלת ערך המקום</p>
               <div className="flex-1 w-full h-full">
                 <MathBoard ones={ones} tens={tens} hundreds={hundreds} thousands={thousands} />
               </div>
             </div>

             {/* Block Palette (Warehouse) */}
             <div className="h-28 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-[24px] shadow-lg border border-slate-200 dark:border-slate-700 flex justify-center items-center gap-8 px-8 shrink-0 relative z-20">
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-sm font-bold uppercase tracking-wider">מחסן<br/>אביזרים</span>
                </div>
                <div className="w-px h-12 bg-slate-200 dark:bg-slate-700"></div>

                <button onClick={() => addBlock('thousand')} className="flex flex-col items-center gap-2 hover:scale-110 active:scale-95 transition-transform">
                   <div className="h-10 flex items-end justify-center"><BlockThousand scale={0.25} /></div>
                   <span className="text-xs font-black text-slate-500">אלף (1000)</span>
                </button>
                <button onClick={() => addBlock('hundred')} className="flex flex-col items-center gap-2 hover:scale-110 active:scale-95 transition-transform">
                   <div className="h-10 flex items-end justify-center"><BlockHundred scale={0.4} /></div>
                   <span className="text-xs font-black text-slate-500">מאה (100)</span>
                </button>
                <button onClick={() => addBlock('ten')} className="flex flex-col items-center gap-2 hover:scale-110 active:scale-95 transition-transform">
                   <div className="h-10 flex items-end justify-center"><BlockTen scale={0.5} /></div>
                   <span className="text-xs font-black text-slate-500">עשרת (10)</span>
                </button>
                <button onClick={() => addBlock('one')} className="flex flex-col items-center gap-2 hover:scale-110 active:scale-95 transition-transform">
                   <div className="h-10 flex items-end justify-center"><BlockOne scale={1} /></div>
                   <span className="text-xs font-black text-slate-500">יחידה (1)</span>
                </button>
             </div>
          </div>
        </main>
      </div>

      <DragOverlay dropAnimation={{ duration: 300, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeId ? (
          <div className="scale-110 rotate-3 opacity-90 drop-shadow-2xl">
             {activeType === 'one' && <BlockOne scale={1.2} />}
             {activeType === 'ten' && <BlockTen scale={0.8} />}
             {activeType === 'hundred' && <BlockHundred scale={0.65} />}
             {activeType === 'thousand' && <BlockThousand scale={0.4} />}
          </div>
        ) : null}
      </DragOverlay>

    </DndContext>
  );
}
