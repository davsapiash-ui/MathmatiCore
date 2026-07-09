import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { DragSource, Place, DropInput } from '@/core/placeValue';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { PlaceValueBoard } from '@/features/workspace/board/PlaceValueBoard';
import { DienesBlock } from '@/features/workspace/board/DienesBlock';
import { WorkspaceTopbar } from '@/features/workspace/WorkspaceTopbar';
import { useAuthStore } from '@/application/useAuthStore';
import { Navigate } from 'react-router-dom';
import { NumberLineTask } from '@/features/workspace/tasks/NumberLineTask';

/**
 * ארגז חול למקרן (מצב מורה)
 * מסך נקי המאפשר הדגמה של גרירה, פריטה ומחיקה על הלוח החכם ללא תיעוד נתונים.
 */
export function ProjectorSandboxPage() {
  const user = useAuthStore((s) => s.user);
  const applyDrop = useWorkspaceStore((s) => s.applyDrop);
  const initSession = useWorkspaceStore((s) => s.initSession);
  
  const [activeDrag, setActiveDrag] = useState<{ place: Place; source: DragSource; renderPlace?: Place } | null>(null);
  const [selectedRange, setSelectedRange] = useState<'1000' | '10000'>('1000');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 8 } })
  );

  useEffect(() => {
    const targetSession = selectedRange === '1000' ? 1 : 3;
    // אתחול סשן נקי ללוח
    initSession(targetSession, false);
  }, [selectedRange, initSession]);

  if (user?.role !== 'teacher' && user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const handleDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as { place: Place; source: DragSource } | undefined;
    if (data) {
      const renderPlace = (data.place === 'units' && (data.source as string) === 'supply_tens') ? 'tens' : data.place;
      setActiveDrag({ ...data, renderPlace });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    const data = active.data.current as { place: Place; source: DragSource } | undefined;
    
    const targetPlace = over?.data.current?.place as Place | undefined;
    
    if (data) {
      const dropInput: DropInput = {
        source: data.source,
        sourcePlace: data.place,
        target: targetPlace ? { kind: 'column', place: targetPlace } : { kind: 'trash' },
      };
      applyDrop(dropInput);
    }
  };

  return (
    <div dir="rtl" className="h-screen w-screen bg-ws-bg text-ws-ink font-sans flex flex-col overflow-hidden selection:bg-ws-accent/20">
      <WorkspaceTopbar />

      <main className="flex-1 flex overflow-hidden p-6 gap-6">
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* הלוח תופס את כל המסך כדי לאפשר הדגמה גדולה */}
          <section className="flex-1 relative flex flex-col items-center justify-center">
             <div className="w-full max-w-5xl h-full flex flex-col gap-8">
                {/* Selector UI */}
                <div className="bg-white rounded-3xl p-4 shadow-sm border border-ws-blue-soft/20 flex-shrink-0 flex items-center justify-between">
                  <span className="font-bold text-lg text-ws-ink">טווח הדגמה במעבדה:</span>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedRange('1000')}
                      className={`px-4 py-2 rounded-xl font-bold transition-all ${selectedRange === '1000' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      תחום ה-1,000 (מפגשים 1 ו-2)
                    </button>
                    <button
                      onClick={() => setSelectedRange('10000')}
                      className={`px-4 py-2 rounded-xl font-bold transition-all ${selectedRange === '10000' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      תחום ה-10,000 (מפגשים 3-8)
                    </button>
                  </div>
                </div>

                <PlaceValueBoard />
                
                {/* נוסיף ציר מספרים להדגמה קלה */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-ws-blue-soft/20 flex-shrink-0">
                  <h2 className="text-xl font-bold text-center mb-6 text-ws-blue">ישר המספרים (להדגמה)</h2>
                  <NumberLineTask range={selectedRange === '1000' ? [0, 1000] : [0, 10000]} showMarkerValue={true} />
                </div>
             </div>
          </section>

          <DragOverlay dropAnimation={null}>
            {activeDrag ? (
              <div style={{ opacity: 0.9, transform: 'scale(1.05)' }}>
                <DienesBlock
                  id="drag-overlay"
                  source={activeDrag.source}
                  place={activeDrag.renderPlace || activeDrag.place}
                  isOverlay
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
  );
}
