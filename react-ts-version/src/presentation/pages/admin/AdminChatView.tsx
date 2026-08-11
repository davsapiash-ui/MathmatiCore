import { useState, useMemo, useEffect, useRef } from "react";
import { useAdminStore } from "@/application/useAdminStore";
import { useChatStore } from "@/application/useChatStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { UdlSpeechButton } from "@/presentation/design-system/UdlSpeechButton";
import { stt } from "@/infrastructure/services/STTService";
import { Send, UserCircle2, Users, ImageIcon, Mic } from "lucide-react";
import { useAuthStore } from "@/application/useAuthStore";
import { toast } from "sonner";

export function AdminChatView() {
  const { teachers } = useAdminStore();
  const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();
  const { user } = useAuthStore();
  
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sendingImage, setSendingImage] = useState(false);
  const adminFileInputRef = useRef<HTMLInputElement>(null);

  const handleToggleVoiceInput = () => {
    if (isListening) {
      stt.stop();
      setIsListening(false);
      return;
    }

    if (!stt.isSupported()) {
      toast.error("זיהוי קולי אינו נתמך בדפדפן זה.");
      return;
    }

    setIsListening(true);
    toast.info("מקשיב... דבר עכשיו בעברית");
    stt.start({
      lang: "he-IL",
      onResult: (transcript) => {
        setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
      },
      onError: (err) => {
        toast.error(`שגיאת קלט קולי: ${err}`);
        setIsListening(false);
      },
      onEnd: () => {
        setIsListening(false);
      }
    });
  };

  const handleAdminImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTeacherId) return;
    setSendingImage(true);
    try {
      await sendImageMessage("admin", (user?.displayName as string) || "מנהל מערכת", selectedTeacherId, file);
    } catch (err) {
      console.error("Failed to send image:", err);
    } finally {
      setSendingImage(false);
      if (adminFileInputRef.current) adminFileInputRef.current.value = "";
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "UNANSWERED" | "ANSWERED">("ALL");

  const selectedTeacher = useMemo(() => 
    teachers.find(t => t.id === selectedTeacherId), 
  [teachers, selectedTeacherId]);

  // Compute teacher chat metadata (unread count, last message, unanswered status)
  const teacherChatMeta = useMemo(() => {
    return teachers.map(t => {
      const teacherMsgs = messages.filter(m => 
        (m.senderId === "admin" && (m.receiverId === t.id || m.receiverId === t.taz)) ||
        ((m.senderId === t.id || m.senderId === t.taz) && m.receiverId === "admin")
      ).sort((a, b) => a.timestamp - b.timestamp);

      const unreadCount = messages.filter(m => (m.senderId === t.id || m.senderId === t.taz) && m.receiverId === "admin" && !m.read).length;
      const lastMsg = teacherMsgs[teacherMsgs.length - 1];
      const isUnanswered = lastMsg && lastMsg.senderId === t.id && !lastMsg.read;

      return {
        teacher: t,
        unreadCount,
        lastMsg,
        isUnanswered,
      };
    });
  }, [teachers, messages]);

  const filteredTeachers = useMemo(() => {
    return teacherChatMeta.filter(({ teacher, isUnanswered, unreadCount }) => {
      const matchesSearch = !searchQuery.trim() || 
        teacher.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        teacher.taz.includes(searchQuery);

      if (!matchesSearch) return false;

      if (filterTab === "UNANSWERED") return isUnanswered || unreadCount > 0;
      if (filterTab === "ANSWERED") return !isUnanswered && unreadCount === 0;
      return true;
    });
  }, [teacherChatMeta, searchQuery, filterTab]);

  const unansweredTotal = useMemo(() => {
    return teacherChatMeta.filter(m => m.isUnanswered || m.unreadCount > 0).length;
  }, [teacherChatMeta]);

  const conversationMessages = useMemo(() => {
    if (!selectedTeacherId) return [];
    return messages.filter(m => 
      (m.senderId === "admin" && m.receiverId === selectedTeacherId) ||
      (m.senderId === selectedTeacherId && m.receiverId === "admin")
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, selectedTeacherId]);

  const handleSend = () => {
    if (!inputText.trim() || !selectedTeacherId) return;
    sendMessage("admin", (user?.displayName as string) || "מנהל מערכת", selectedTeacherId, inputText.trim());
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
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden backdrop-blur-xl" dir="rtl">
      {/* Teachers List Sidebar */}
      <div className={`${selectedTeacher ? 'hidden md:flex' : 'flex'} w-full md:w-88 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 flex-col transition-all shadow-lg z-10`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-black text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>ערוצי תקשורת הנהלה-מורים</span>
            </h2>
            {unansweredTotal > 0 && (
              <span className="bg-rose-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md animate-pulse">
                {unansweredTotal} שלא נענו
              </span>
            )}
          </div>

          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='חפש מורה לפי שם או ת"ז...'
            className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 shadow-sm"
          />

          {/* Filter Chips */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => setFilterTab("ALL")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "ALL" ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              הכל ({teachers.length})
            </button>
            <button
              onClick={() => setFilterTab("UNANSWERED")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "UNANSWERED" ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              שלא נענו ({unansweredTotal})
            </button>
            <button
              onClick={() => setFilterTab("ANSWERED")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "ANSWERED" ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              נענו
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredTeachers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-sm">לא נמצאו מורים תואמים.</div>
          ) : (
            filteredTeachers.map(({ teacher, unreadCount, lastMsg, isUnanswered }) => {
              const isSelected = selectedTeacherId === teacher.id;

              return (
                <button
                  key={teacher.id}
                  onClick={() => handleTeacherSelect(teacher.id)}
                  className={`w-full text-right p-3.5 rounded-2xl flex items-start justify-between transition-all border ${isSelected ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 shadow-md' : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-indigo-300'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <UserCircle2 className={`w-10 h-10 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                      {isUnanswered && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-rose-500 ring-2 ring-white animate-ping" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`font-black text-sm ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-slate-800 dark:text-slate-100'}`}>
                          {teacher.name}
                        </span>
                        {isUnanswered && (
                          <span className="text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 px-1.5 py-0.5 rounded-md">
                            ממתין למנהל
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">דוא"ל SSO: {teacher.taz || "davidsep@edu-haifa.org.il"}</div>
                      {lastMsg && (
                        <div className="text-xs text-slate-400 truncate max-w-[150px] mt-1">
                          {lastMsg.text || (lastMsg.imageUrl ? '📷 תמונה' : 'הודעה')}
                        </div>
                      )}
                    </div>
                  </div>

                  {unreadCount > 0 && (
                    <span className="bg-rose-600 text-white text-xs font-black w-6 h-6 flex items-center justify-center rounded-full shadow-md animate-bounce">
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
                        {msg.text && (
                          <div className="flex items-center gap-2">
                            <span>{msg.text}</span>
                            <UdlSpeechButton text={msg.text} className="w-7 h-7 p-0 shrink-0 text-slate-500" />
                          </div>
                        )}
                        {msg.imageUrl && (
                          <img
                            src={msg.imageUrl}
                            alt="תמונה"
                            className="max-w-[220px] max-h-[220px] rounded-xl mt-1 object-cover cursor-pointer block"
                            onClick={() => window.open(msg.imageUrl, '_blank')}
                          />
                        )}
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
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 shrink-0 z-20">
              <input
                ref={adminFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAdminImageSelect}
              />
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={handleToggleVoiceInput}
                  className={`flex rounded-full w-12 h-12 p-0 items-center justify-center transition-all shadow-sm ${
                    isListening ? 'bg-rose-600 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-600 dark:text-slate-300'
                  }`}
                  title={isListening ? "עצור זיהוי קולי" : "הזן הודעה בדיבור (עברית)"}
                >
                  <Mic className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => adminFileInputRef.current?.click()}
                  disabled={sendingImage || !selectedTeacherId}
                  title="שלח תמונה"
                  className="flex rounded-full w-12 h-12 p-0 items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all shadow-sm disabled:opacity-40"
                >
                  {sendingImage ? (
                    <span className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <ImageIcon className="w-5 h-5" />
                  )}
                </button>
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
                  aria-label="שלח"
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
