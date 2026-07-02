import { useState, useEffect } from "react";
import { DndContext, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import { DroppableColumn } from "@/presentation/components/student/DroppableColumn";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { useAuthStore } from "@/application/useAuthStore";
import { useSessionHeartbeat } from "@/hooks/useSessionHeartbeat";
import { telemetryTracker } from "@/infrastructure/TelemetryTracker";
import { TASKS } from "@/core/QMatrix";
import type { QMatrixTask } from "@/core/QMatrix";

type BlockType = "units" | "tens" | "hundreds" | "thousands";

interface Block {
  id: string;
  type: BlockType;
}

export function StudentWorkspace() {
  const { user } = useAuthStore();
  const studentName = user?.displayName || "תלמיד";
  const studentId = user?.uid || "unknown";
  
  const { isOffline } = useSessionHeartbeat();
  
  const [blocks, setBlocks] = useState<{ [key in BlockType]: Block[] }>({
    thousands: [],
    hundreds: [],
    tens: [],
    units: [],
  });

  const [activeTask] = useState<QMatrixTask>(TASKS[0]);

  // Start radar tracking
  useEffect(() => {
    if (studentId) {
      telemetryTracker.startSession(studentId);
      telemetryTracker.setTask(activeTask.id);
    }
    return () => telemetryTracker.endSession();
  }, [studentId, activeTask.id]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    telemetryTracker.recordStudentAction();
    telemetryTracker.logEvent("BLOCK_DRAG_START", { blockId: event.active.id });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    telemetryTracker.recordStudentAction();
    const { active, over } = event;

    if (!over) {
      // Handle block deletion by dropping outside
      telemetryTracker.logEvent("BLOCK_DELETED", { blockId: active.id });
      telemetryTracker.recordDeleteAction();
      setBlocks((prev) => {
        const next = { ...prev };
        for (const key in next) {
          next[key as BlockType] = next[key as BlockType].filter(b => b.id !== active.id);
        }
        return next;
      });
      return;
    }

    const sourceCol = (active.data.current?.type || "units") as BlockType;
    const targetCol = over.id as BlockType;

    if (sourceCol === targetCol) {
      telemetryTracker.logEvent("BLOCK_MOVED_SAME_COL", { blockId: active.id });
      return; // Same column, no structural change
    }

    telemetryTracker.logEvent("BLOCK_MOVED", { 
      blockId: active.id, 
      from: sourceCol, 
      to: targetCol 
    });

    // Check for grouping/ungrouping
    setBlocks((prev) => {
      const next = { ...prev };
      
      // Remove from source
      const blockToMove = next[sourceCol].find(b => b.id === active.id)!;
      next[sourceCol] = next[sourceCol].filter(b => b.id !== active.id);

      // Regrouping logic (simplified for DND move without explicit group/ungroup button)
      // Standard behavior: if dropped in a different column, transform type and count
      // E.g. moving a ten to units -> creates 10 units.
      if (sourceCol === "tens" && targetCol === "units") {
        for (let i = 0; i < 10; i++) {
          next.units.push({ id: `${Date.now()}_u_${i}`, type: "units" });
        }
        telemetryTracker.logEvent("BLOCKS_UNGROUPED", { from: "tens", to: "units" });
      } 
      // Moving 10 units to a ten is normally done by grouping, but if dragged directly:
      else {
         // Default just add it to target as its original type for visual feedback, 
         // but strict LMS might restrict cross-column drop without transformation.
         // Let's enforce strict columns for now: blocks map to their column
         next[targetCol].push({ ...blockToMove, type: targetCol });
      }

      // Check auto-compose (10 units -> 1 ten)
      if (next.units.length >= 10) {
        next.units = next.units.slice(0, next.units.length - 10);
        next.tens.push({ id: `auto_${Date.now()}`, type: "tens" });
        telemetryTracker.logEvent("AUTO_GROUPED", { from: "units", to: "tens" });
      }
      if (next.tens.length >= 10) {
        next.tens = next.tens.slice(0, next.tens.length - 10);
        next.hundreds.push({ id: `auto_${Date.now()}`, type: "hundreds" });
        telemetryTracker.logEvent("AUTO_GROUPED", { from: "tens", to: "hundreds" });
      }

      return next;
    });
  };

  const handleAddBlock = (type: BlockType) => {
    telemetryTracker.recordStudentAction();
    telemetryTracker.logEvent("BLOCK_ADDED_CLICK", { type });
    setBlocks(prev => ({
      ...prev,
      [type]: [...prev[type], { id: `click_${Date.now()}`, type }]
    }));
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center shadow-sm z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">שלום {studentName}</h1>
          <p className="text-slate-500 dark:text-slate-400">משימה נוכחית: {activeTask.titleHe}</p>
        </div>
        {isOffline && (
          <div className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-semibold animate-pulse">
            אין חיבור לאינטרנט - ממתין לחידוש...
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex gap-4 p-6 overflow-hidden">
        {/* Tools Panel */}
        <div className="w-64 flex flex-col gap-4">
          <AccessibleCard className="p-4 flex flex-col gap-4 shadow-md bg-white dark:bg-slate-950">
            <h2 className="font-semibold text-lg border-b pb-2">קופסת קוביות</h2>
            <div className="flex gap-2">
              <UdlButton semanticColor="primary" className="flex-1 text-2xl" onClick={() => handleAddBlock("units")}>
                + 1
              </UdlButton>
              <UdlButton semanticColor="success" className="flex-1 text-2xl" onClick={() => handleAddBlock("tens")}>
                + 10
              </UdlButton>
              <UdlButton semanticColor="danger" className="flex-1 text-2xl" onClick={() => handleAddBlock("hundreds")}>
                + 100
              </UdlButton>
            </div>
            <div className="flex gap-2 mt-4">
              <UdlButton semanticColor="neutral" className="flex-1" onClick={() => telemetryTracker.recordDeleteAction()}>
                ⟲ ביטול פעולה
              </UdlButton>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              לחץ כדי להוסיף קוביות, או גרור אותן בין הטורים. גרירה אל מחוץ לטורים תמחק אותן.
            </p>
          </AccessibleCard>

          <AccessibleCard className="p-4 shadow-md bg-white dark:bg-slate-950 flex-1">
            <h2 className="font-semibold text-lg border-b pb-2 mb-4">הוראות</h2>
            <p className="text-slate-700 dark:text-slate-300 text-lg leading-relaxed">
              {activeTask.instructionHe}
            </p>
            {activeTask.number && (
              <div className="text-6xl font-black text-center mt-8 text-blue-600 dark:text-blue-400">
                {activeTask.number}
              </div>
            )}
          </AccessibleCard>

          <UdlButton semanticColor="primary" className="text-xl px-12 py-6 rounded-2xl shadow-lg border-b-4 border-blue-800">
            בדוק תשובה
          </UdlButton>
        </div>

        {/* DND Columns */}
        <div className="flex-1 rounded-xl bg-white dark:bg-slate-950 shadow-inner border border-slate-200 dark:border-slate-800 p-6">
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-3 gap-6 h-full">
              <DroppableColumn id="hundreds" title="מאות (100)" blocks={blocks.hundreds} />
              <DroppableColumn id="tens" title="עשרות (10)" blocks={blocks.tens} />
              <DroppableColumn id="units" title="יחידות (1)" blocks={blocks.units} />
            </div>
          </DndContext>
        </div>
      </main>
    </div>
  );
}
