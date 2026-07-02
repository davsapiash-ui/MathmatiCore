import { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { MathBoard } from '@/presentation/components/workspace/MathBoard';
import { MathBlock } from '@/presentation/components/workspace/MathBlock';
import { BlockOne, BlockTen, BlockHundred, BlockThousand } from '@/presentation/components/workspace/IsometricBlocks';
import { useSilentRadar } from '@/application/useSilentRadar';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';
import { allTasks } from '@/data/mockTasks';
import type { MathItem } from '@/domain/types/MathItem';

export function StudentWorkspace() {
  const [currentTaskIdx, setCurrentTaskIdx] = useState(0);
  const currentTask = allTasks[currentTaskIdx];

  const [items, setItems] = useState<MathItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'one' | 'ten' | 'hundred' | 'thousand' | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Initialize Silent Radar
  const { registerInteraction, registerUndo } = useSilentRadar({ taskId: currentTask.id });

  // Load initial blocks when task changes
  useEffect(() => {
    if (currentTask.initialBlocks) {
      const initItems: MathItem[] = [];
      const addInit = (count: number, type: 'one'|'ten'|'hundred'|'thousand', startX: number) => {
        for(let i=0; i<count; i++) {
          initItems.push({
            id: `${type}-init-${i}`,
            type,
            value: type === 'one' ? 1 : type === 'ten' ? 10 : type === 'hundred' ? 100 : 1000,
            x: startX + (i % 5) * 40,
            y: 200 + Math.floor(i / 5) * 40
          });
        }
      };
      addInit(currentTask.initialBlocks.ones, 'one', 600);
      addInit(currentTask.initialBlocks.tens, 'ten', 400);
      addInit(currentTask.initialBlocks.hundreds, 'hundred', 200);
      addInit(currentTask.initialBlocks.thousands, 'thousand', 50);
      setItems(initItems);
    } else {
      setItems([]);
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
    const { active, delta } = event;
    setActiveId(null);
    setActiveType(null);
    registerInteraction();

    setItems(prev => prev.map(item => {
      if (item.id === active.id) {
        return {
          ...item,
          x: item.x + delta.x,
          y: item.y + delta.y
        };
      }
      return item;
    }));
  };

  const handleUndo = () => {
    registerUndo();
  };

  const addBlock = (type: 'one' | 'ten' | 'hundred' | 'thousand') => {
    setHasInteracted(true);
    registerInteraction();
    const val = type === 'one' ? 1 : type === 'ten' ? 10 : type === 'hundred' ? 100 : 1000;
    setItems(prev => [...prev, { 
      id: `${type}-manual-${Date.now()}`, 
      type, 
      value: val, 
      x: 300 + Math.random() * 50, 
      y: 400 + Math.random() * 50 
    }]);
  };

  const executeBreak = (id: string, type: 'one' | 'ten' | 'hundred' | 'thousand') => {
    if (type === 'one') return; // Cannot break ones
    
    setItems(prev => {
      const targetItem = prev.find(i => i.id === id);
      if (!targetItem) return prev;

      const lowerType = type === 'ten' ? 'one' : type === 'hundred' ? 'ten' : 'hundred';
      const lowerValue = targetItem.value / 10;
      
      const newItems: MathItem[] = [];
      const newIds: string[] = [];

      for (let i = 0; i < 10; i++) {
        const newId = `broken-${Date.now()}-${i}`;
        newIds.push(newId);
        
        // Grid snapping logic: 5x2 grid
        const row = Math.floor(i / 5);
        const col = i % 5;
        const offsetX = (col - 2) * 40;
        const offsetY = (row - 0.5) * 40;

        newItems.push({
          id: newId,
          type: lowerType,
          value: lowerValue,
          x: targetItem.x, // start at same position
          y: targetItem.y,
          isSpreading: true,
          targetX: targetItem.x + offsetX,
          targetY: targetItem.y + offsetY
        });
      }

      return [...prev.filter(i => i.id !== id), ...newItems];
    });

    // Remove isSpreading flag after animation completes
    setTimeout(() => {
      setItems(current => current.map(item => {
        if (item.isSpreading) {
          return { ...item, isSpreading: false, x: item.targetX ?? item.x, y: item.targetY ?? item.y };
        }
        return item;
      }));
    }, 600);
  };

  const actionMerge = () => {
    // Basic compose logic: find the smallest denomination that has at least 10 items
    setItems(prev => {
      const ones = prev.filter(i => i.type === 'one');
      const tens = prev.filter(i => i.type === 'ten');
      const hundreds = prev.filter(i => i.type === 'hundred');

      let targetType: 'one'|'ten'|'hundred' = 'one';
      let itemsToMerge: MathItem[] = [];
      let newType: 'ten'|'hundred'|'thousand' = 'ten';
      let newVal = 10;

      if (ones.length >= 10) {
        targetType = 'one'; newType = 'ten'; newVal = 10;
        itemsToMerge = ones.slice(0, 10);
      } else if (tens.length >= 10) {
        targetType = 'ten'; newType = 'hundred'; newVal = 100;
        itemsToMerge = tens.slice(0, 10);
      } else if (hundreds.length >= 10) {
        targetType = 'hundred'; newType = 'thousand'; newVal = 1000;
        itemsToMerge = hundreds.slice(0, 10);
      } else {
        return prev; // Nothing to merge
      }

      const idsToRemove = new Set(itemsToMerge.map(i => i.id));
      const centerX = itemsToMerge.reduce((sum, i) => sum + i.x, 0) / 10;
      const centerY = itemsToMerge.reduce((sum, i) => sum + i.y, 0) / 10;

      const mergedItem: MathItem = {
        id: `${newType}-merged-${Date.now()}`,
        type: newType,
        value: newVal,
        x: centerX,
        y: centerY
      };

      return [...prev.filter(i => !idsToRemove.has(i.id)), mergedItem];
    });
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
    <div className="flex w-full h-full bg-slate-50 dark:bg-slate-950 font-sans relative overflow-hidden" dir="rtl">
      
      {/* RIGHT PANEL: Instructions & Exercises (50%) */}
      <aside className="w-1/2 md:w-[40%] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl z-30 flex flex-col h-full relative">
        <div className="p-8 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-6">
            <span className="bg-indigo-100 text-indigo-700 text-sm font-bold px-3 py-1 rounded-full">משימה {currentTaskIdx + 1} / {allTasks.length}</span>
            <h1 className="text-3xl font-black text-slate-800 dark:text-slate-100">{currentTask.titleHe}</h1>
          </div>
          
          <div className="flex items-start gap-4 mb-10 bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl">
            <p className="text-slate-700 dark:text-slate-300 text-lg leading-relaxed flex-1">
              {currentTask.instructionHe}
            </p>
            <UdlSpeechButton text={currentTask.instructionHe} />
          </div>

          {/* Math Exercise Display */}
          {currentTask.numberA !== undefined && currentTask.numberB !== undefined && (
            <div className="flex-1 flex flex-col items-center justify-center mb-10">
               <div className="flex flex-col items-end text-7xl font-black text-slate-800 dark:text-slate-100 tracking-widest font-mono">
                 <div className="mr-12">{currentTask.numberA}</div>
                 <div className="flex items-center gap-6 mt-4">
                   <span className="text-5xl text-slate-500">{currentTask.isSubtraction ? '-' : '+'}</span>
                   <span>{currentTask.numberB}</span>
                 </div>
                 <div className="w-full h-2 bg-slate-800 dark:bg-slate-100 mt-6 mb-6 rounded-full"></div>
                 {/* Placeholder for answer */}
                 <div className="h-20 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600"></div>
               </div>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-4">
            <UdlButton variant="outline" onClick={handleUndo} className="bg-white hover:bg-slate-50 w-full py-4 text-lg">
              בטל פעולה אחרונה
            </UdlButton>
            <div className="flex gap-4">
               <UdlButton variant="secondary" onClick={prevTask} disabled={currentTaskIdx === 0} className="flex-1 py-4 text-lg">
                 הקודם
               </UdlButton>
               <UdlButton semanticColor="primary" onClick={nextTask} disabled={!hasInteracted && currentTaskIdx < allTasks.length - 1} className="flex-[2] py-4 text-lg">
                 סיימתי, המשך למשימה הבאה
               </UdlButton>
            </div>
          </div>
        </div>
      </aside>

      {/* LEFT PANEL: Workspace & Warehouse (50%) */}
      <main className="flex-1 h-full relative flex flex-col bg-slate-100 dark:bg-slate-950/80 overflow-hidden" dir="ltr">
        
        {/* Top Floating Warehouse */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-3xl shadow-[0_10px_40px_rgba(0,0,0,0.1)] border border-slate-200/50 dark:border-slate-700/50 z-20 flex gap-6 items-center">
          <span className="text-sm font-bold text-slate-400 mr-2 select-none uppercase tracking-wider">מחסן קוביות</span>
          <button onClick={() => addBlock('thousand')} className="flex flex-col items-center gap-1 hover:scale-110 active:scale-95 transition-transform">
             <div className="h-10 flex items-end justify-center"><BlockThousand scale={0.25} /></div>
             <span className="text-xs font-black text-slate-500">1000</span>
          </button>
          <button onClick={() => addBlock('hundred')} className="flex flex-col items-center gap-1 hover:scale-110 active:scale-95 transition-transform">
             <div className="h-10 flex items-end justify-center"><BlockHundred scale={0.4} /></div>
             <span className="text-xs font-black text-slate-500">100</span>
          </button>
          <button onClick={() => addBlock('ten')} className="flex flex-col items-center gap-1 hover:scale-110 active:scale-95 transition-transform">
             <div className="h-10 flex items-end justify-center"><BlockTen scale={0.5} /></div>
             <span className="text-xs font-black text-slate-500">10</span>
          </button>
          <button onClick={() => addBlock('one')} className="flex flex-col items-center gap-1 hover:scale-110 active:scale-95 transition-transform">
             <div className="h-10 flex items-end justify-center"><BlockOne scale={0.8} /></div>
             <span className="text-xs font-black text-slate-500">1</span>
          </button>
          <div className="w-px h-10 bg-slate-200 dark:bg-slate-700 mx-2"></div>
          <UdlButton variant="secondary" onClick={actionMerge} className="h-10 px-4 whitespace-nowrap bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border-none">
             קבץ 10
          </UdlButton>
        </div>

        {/* Ambient Lights */}
        <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* The Open Canvas MathBoard */}
        <div className="flex-1 w-full h-full flex items-center justify-center p-8 mt-16">
          <DndContext 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <MathBoard items={items} onDoubleClickItem={executeBreak} />

            <DragOverlay>
              {activeId && activeType ? (
                <MathBlock id={activeId} type={activeType} isOverlay={true} />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

      </main>
      
    </div>
  );
}
