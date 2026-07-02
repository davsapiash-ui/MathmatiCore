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
import { useSettingsStore } from "@/application/useSettingsStore";
import { Logo } from "@/presentation/components/ui/Logo";
import { LogoutButton } from "@/presentation/components/ui/LogoutButton";
import { useStudentSessionStore } from "@/application/useStudentSessionStore";
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
  const isAdmin = user?.role === "admin";
  
  const { isOffline } = useSessionHeartbeat();
  const { isASDMode } = useSettingsStore();
  const { logUndo } = useStudentSessionStore();
  
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
    if (isAdmin) {
      telemetryTracker.setImpersonating(true);
    } else if (studentId) {
      telemetryTracker.startSession(studentId);
      telemetryTracker.setTask(activeTask.id);
    }
    return () => {
      if (!isAdmin) telemetryTracker.endSession();
    };
  }, [studentId, activeTask.id, isAdmin]);

  const handleUndoAction = () => {
    telemetryTracker.recordDeleteAction();
    logUndo();
  };

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
      } else if (sourceCol === "hundreds" && targetCol === "tens") {
        for (let i = 0; i < 10; i++) {
          next.tens.push({ id: `${Date.now()}_t_${i}`, type: "tens" });
        }
        telemetryTracker.logEvent("BLOCKS_UNGROUPED", { from: "hundreds", to: "tens" });
      } else {
         // Invalid pedagogical move (e.g. 1 unit dragged to tens). 
         // Reject it by putting it back in the source column.
         next[sourceCol].push(blockToMove);
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

  useEffect(() => {
    // Auto-save logic on browser close or refresh
    const handleBeforeUnload = () => {
      telemetryTracker.recordStudentAction();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [telemetryTracker]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden relative" dir="rtl">
      {/* Header */}
      <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 p-4 flex justify-between items-center shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-6">
          <Logo className="ml-4" textClassName="bg-gradient-to-l from-blue-600 to-indigo-600 bg-clip-text text-transparent drop-shadow-sm hover:opacity-80" />
          <div className="border-r-2 border-slate-200 dark:border-slate-700 pr-6">
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">שלום {studentName}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">המשימה שלנו: {activeTask.titleHe}</p>
          </div>
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
          <LogoutButton />
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 md:p-6 overflow-hidden">
        {/* Tools Panel */}
        <div className="w-full md:w-64 flex flex-col gap-4 overflow-y-auto md:overflow-visible">
          <AccessibleCard className="p-4 flex flex-col gap-4 shadow-md bg-white dark:bg-slate-950">
            <h2 className="font-semibold text-lg border-b pb-2">קופסת הקוביות שלי 🧊</h2>
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
              <UdlButton semanticColor="neutral" className="flex-1" onClick={handleUndoAction}>
                ⟲ ביטול פעולה
              </UdlButton>
            </div>
            <p className="text-sm text-slate-500 mt-2">
              אפשר ללחוץ כדי להוסיף קוביות, או לגרור אותן בין הטורים! אם רוצים למחוק קוביה, פשוט גוררים אותה החוצה.
            </p>
          </AccessibleCard>

          <AccessibleCard className="p-4 shadow-md bg-white dark:bg-slate-950 flex-1">
            <h2 className="font-semibold text-lg border-b pb-2 mb-4">מה עושים עכשיו? 🎯</h2>
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
            אני מוכן לבדיקה! ✨
          </UdlButton>
        </div>

        {/* DND Columns */}
        <div className={`flex-1 rounded-xl bg-white dark:bg-slate-950 shadow-inner border border-slate-200 dark:border-slate-800 p-6 transition-opacity ${isASDMode ? 'opacity-90 grayscale-[0.2]' : ''}`}>
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
                <p>איזה כיף שבאת, {studentName}!</p>
                <p>כאן אפשר לכתוב הודעות למורה.</p>
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

          <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
            <div className="flex gap-2 items-center">
              <UdlButton semanticColor="neutral" className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
              </UdlButton>
              <UdlButton semanticColor="neutral" className="rounded-full w-10 h-10 p-0 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              </UdlButton>
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
        </div>
      )}
    </div>
  );
}
