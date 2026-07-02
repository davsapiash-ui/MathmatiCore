import { useState, useEffect, useMemo } from "react";
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
import { useChatStore } from "@/application/useChatStore";
import { MessageCircle, Send, X } from "lucide-react";

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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [inputText, setInputText] = useState("");

  const { messages, sendMessage, markAsRead } = useChatStore();

  // Assuming teacherId is known or mapped. We'll use a generic "teacher" ID for now.
  const teacherId = "teacher123"; 

  const conversationMessages = useMemo(() => {
    if (!studentId) return [];
    return messages.filter(m => 
      (m.senderId === studentId && m.receiverId === teacherId) ||
      (m.senderId === teacherId && m.receiverId === studentId)
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, studentId, teacherId]);

  const unreadCount = useMemo(() => {
    if (!studentId) return 0;
    return messages.filter(m => m.senderId === teacherId && m.receiverId === studentId && !m.read).length;
  }, [messages, studentId, teacherId]);

  useEffect(() => {
    if (isChatOpen && studentId) {
      markAsRead(studentId, teacherId);
    }
  }, [isChatOpen, studentId, messages, markAsRead, teacherId]);

  const handleSendMessage = () => {
    if (!inputText.trim() || !studentId) return;
    sendMessage(studentId, studentName, teacherId, inputText.trim());
    setInputText("");
  };

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
      return; 
    }

    telemetryTracker.logEvent("BLOCK_MOVED", { 
      blockId: active.id, 
      from: sourceCol, 
      to: targetCol 
    });

    setBlocks((prev) => {
      const next = { ...prev };
      
      const blockToMove = next[sourceCol].find(b => b.id === active.id)!;
      next[sourceCol] = next[sourceCol].filter(b => b.id !== active.id);

      if (sourceCol === "tens" && targetCol === "units") {
        for (let i = 0; i < 10; i++) {
          next.units.push({ id: `${Date.now()}_u_${i}`, type: "units" });
        }
        telemetryTracker.logEvent("BLOCKS_UNGROUPED", { from: "tens", to: "units" });
      } else {
         next[targetCol].push({ ...blockToMove, type: targetCol });
      }

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
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden relative" dir="rtl">
      {/* Header */}
      <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center shadow-sm z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">שלום {studentName}</h1>
          <p className="text-slate-500 dark:text-slate-400">משימה נוכחית: {activeTask.titleHe}</p>
        </div>
        <div className="flex gap-4 items-center">
          {isOffline && (
            <div className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-semibold animate-pulse">
              אין חיבור לאינטרנט - ממתין לחידוש...
            </div>
          )}
          <UdlButton 
            onClick={() => setIsChatOpen(true)} 
            semanticColor="neutral" 
            className="rounded-full px-6 flex items-center gap-2 relative shadow-sm"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="font-bold">צ'אט עם המורה</span>
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full animate-bounce">
                {unreadCount}
              </span>
            )}
          </UdlButton>
        </div>
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

      {/* Chat Sidebar Overlay */}
      {isChatOpen && (
        <div className="absolute top-0 right-0 h-full w-96 bg-white dark:bg-slate-950 shadow-2xl flex flex-col z-50 border-l border-slate-200 dark:border-slate-800 transition-transform transform translate-x-0">
          <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6" />
              <h2 className="font-bold text-lg">צ'אט עם המורה</h2>
            </div>
            <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-emerald-700 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-slate-50 dark:bg-slate-900">
            {conversationMessages.length === 0 ? (
              <div className="m-auto text-slate-400 text-sm text-center">
                <p>שלום {studentName}!</p>
                <p>כאן תוכל להתכתב עם המורה שלך.</p>
              </div>
            ) : (
              conversationMessages.map(msg => {
                const isMe = msg.senderId === studentId;
                return (
                  <div key={msg.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                    <div className={`px-4 py-2 rounded-2xl ${isMe ? 'bg-emerald-600 text-white rounded-tl-sm' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2 items-center">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="כתוב הודעה למורה..."
              className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-slate-800 dark:text-slate-100"
            />
            <UdlButton 
              onClick={handleSendMessage} 
              disabled={!inputText.trim()} 
              className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4 -ml-1" />
            </UdlButton>
          </div>
        </div>
      )}
    </div>
  );
}
