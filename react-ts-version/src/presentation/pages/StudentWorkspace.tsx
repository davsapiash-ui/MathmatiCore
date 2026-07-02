import { useState } from 'react';
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { MathBoard } from '@/presentation/components/workspace/MathBoard';
import { MathBlock } from '@/presentation/components/workspace/MathBlock';
import { useSilentRadar } from '@/application/useSilentRadar';
import { UdlButton } from '@/presentation/design-system/UdlButton';
import { UdlSpeechButton } from '@/presentation/design-system/UdlSpeechButton';

export function StudentWorkspace() {
  const [ones, setOnes] = useState(Array.from({ length: 4 }).map((_, i) => ({ id: `one-${i}` })));
  const [tens, setTens] = useState(Array.from({ length: 2 }).map((_, i) => ({ id: `ten-${i}` })));
  const [hundreds, setHundreds] = useState(Array.from({ length: 1 }).map((_, i) => ({ id: `hundred-${i}` })));
  const [thousands, setThousands] = useState(Array.from({ length: 1 }).map((_, i) => ({ id: `thousand-${i}` })));
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'one' | 'ten' | 'hundred' | 'thousand' | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Initialize Silent Radar
  const { registerInteraction, registerUndo } = useSilentRadar({ taskId: 'regrouping-demo-1' });

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
    // In a real app we'd pop state from a history stack. For now, just register the undo click.
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-950 font-sans relative">
      
      {/* Workspace Actions */}
      <div className="absolute top-4 left-8 flex gap-4 z-20">
        <UdlButton variant="outline" onClick={handleUndo} className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
          בטל פעולה האחרונה
        </UdlButton>
        <UdlButton 
          semanticColor="primary" 
          disabled={!hasInteracted}
          className="shadow-lg shadow-indigo-500/20 font-bold"
        >
          סיימתי, בדוק אותי
        </UdlButton>
      </div>

      {/* Main Workspace Area */}
      <main className="flex-1 relative flex flex-col items-center justify-center p-8">
        
        {/* Ambient Lights */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="mb-12 text-center z-10 flex flex-col items-center">
          <div className="text-4xl font-black text-slate-800 dark:text-slate-100 mb-4 tracking-tight" aria-label="תרגיל: אלף מאה עשרים וארבע ועוד שמונה עשרה">
            <BlockMath math="1124 + 18 = ?" />
          </div>
          <div className="flex items-center gap-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md px-6 py-3 rounded-full border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-700 dark:text-slate-300 text-lg font-medium">
              היעזר בבדידים כדי לפתור את התרגיל. גרור עשרת ליחידות כדי לפרוט, או 10 יחידות לעשרות כדי לקבץ.
            </p>
            <UdlSpeechButton text="היעזר בבדידים כדי לפתור את התרגיל. גרור עשרת ליחידות כדי לפרוט, או 10 יחידות לעשרות כדי לקבץ." />
          </div>
        </div>

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
  );
}
