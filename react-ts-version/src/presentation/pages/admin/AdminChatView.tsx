import React, { useState, useMemo, useEffect } from "react";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore } from "@/application/useChatStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { Send, UserCircle2, Users } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";

export function AdminChatView() {
  const { teachers } = useAdminStore();
  const { messages, sendMessage, markAsRead } = useChatStore();
  const { user } = useAuthStore();
  
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");

  const selectedTeacher = useMemo(() => 
    teachers.find(t => t.id === selectedTeacherId), 
  [teachers, selectedTeacherId]);

  const conversationMessages = useMemo(() => {
    if (!selectedTeacherId) return [];
    return messages.filter(m => 
      (m.senderId === "admin" && m.receiverId === selectedTeacherId) ||
      (m.senderId === selectedTeacherId && m.receiverId === "admin")
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, selectedTeacherId]);

  const handleSend = () => {
    if (!inputText.trim() || !selectedTeacherId) return;
    sendMessage("admin", user?.displayName || "מנהל מערכת", selectedTeacherId, inputText.trim());
    setInputText("");
  };

  const handleTeacherSelect = (teacherId: string) => {
    setSelectedTeacherId(teacherId);
    setInputText("");
    markAsRead("admin", teacherId);
  };

  useEffect(() => {
    if (selectedTeacherId) {
      markAsRead("admin", selectedTeacherId);
    }
  }, [selectedTeacherId, messages, markAsRead]);

  return (
    <div className="flex h-[calc(100vh-4rem)] md:h-screen bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden backdrop-blur-xl" dir="rtl">
      {/* Teachers List Sidebar */}
      <div className={`${selectedTeacher ? 'hidden md:flex' : 'flex'} w-full md:w-80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 flex-col transition-all`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100">צ'אט עם מורים</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {teachers.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">לא הוקמו מורים במערכת.</div>
          ) : (
            teachers.map(teacher => {
              const unreadCount = messages.filter(m => m.senderId === teacher.id && m.receiverId === "admin" && !m.read).length;
              return (
                <button
                  key={teacher.id}
                  onClick={() => handleTeacherSelect(teacher.id)}
                  className={`w-full text-right p-3 rounded-xl flex items-center justify-between transition-all ${selectedTeacherId === teacher.id ? 'bg-blue-100/80 dark:bg-blue-900/50 shadow-sm' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                  <div className="flex items-center gap-3">
                    <UserCircle2 className="w-8 h-8 text-slate-400" />
                    <div>
                      <div className={`font-semibold ${selectedTeacherId === teacher.id ? 'text-blue-800 dark:text-blue-200' : 'text-slate-700 dark:text-slate-300'}`}>
                        {teacher.name}
                      </div>
                      <div className="text-xs text-slate-500">ת"ז: {teacher.taz}</div>
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className={`${!selectedTeacher ? 'hidden md:flex' : 'flex'} flex-1 flex-col bg-slate-50/30 dark:bg-slate-900/30 relative`}>
        {selectedTeacher ? (
          <>
            {/* Header */}
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm z-10">
              <button 
                onClick={() => setSelectedTeacherId(null)}
                className="md:hidden mr-2 text-slate-500 hover:text-slate-700"
              >
                &rarr; חזור
              </button>
              <UserCircle2 className="w-10 h-10 text-slate-400" />
              <div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{selectedTeacher.name}</h3>
                <p className="text-xs text-slate-500">מורה פעיל במערכת</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
              {conversationMessages.length === 0 ? (
                <div className="m-auto text-slate-400 text-sm">אין הודעות. שלח הודעה כדי להתחיל שיחה.</div>
              ) : (
                conversationMessages.map(msg => {
                  const isAdmin = msg.senderId === "admin";
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isAdmin ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className={`px-4 py-2 rounded-2xl shadow-sm ${isAdmin ? 'bg-blue-600 text-white rounded-tl-sm' : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}`}>
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

            {/* Input */}
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <UdlButton semanticColor="neutral" className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-mic"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                </UdlButton>
                <UdlButton semanticColor="neutral" className="hidden md:flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </UdlButton>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="הקלד הודעה..."
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-slate-100 shadow-inner"
                />
                <UdlButton 
                  onClick={handleSend} 
                  disabled={!inputText.trim()}
                  className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50 shadow-md"
                >
                  <Send className="w-5 h-5 -ml-1" />
                </UdlButton>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-slate-400 gap-4">
            <Users className="w-16 h-16 opacity-20" />
            <p>בחר מורה מהרשימה כדי להתחיל שיחה</p>
          </div>
        )}
      </div>
    </div>
  );
}
