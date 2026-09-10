import { useState, useMemo, useEffect } from "react";
import { useAdminStore } from "@/application/useAdminStore";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { UdlSpeechButton } from "@/presentation/design-system/UdlSpeechButton";
import { Send, UserCircle2, Users, ShieldCheck } from "lucide-react";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/infrastructure/firebase";
import { containsPII } from "@/core/security/PiiFilter";
import { toast } from "sonner";

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_body: string;
  timestamp: number;
  school_id?: string;
  class_name?: string;
  read?: boolean;
}

/**
 * מודול 22: צ'אט הנהלה-מורים (Teacher-Admin Secure Chat)
 * אנונימיות מוחלטת (Zero PII): ללא שמות מורים, ללא מזהי SSO/ת"ז, ללא אימיילים, וללא תמונות/ביומטריה.
 * שכבת אבטחה דו-שלבית:
 * 1. סינון PII צד-לקוח (containsPII).
 * 2. סינון PII צד-שרת (Cloud Function: sendTeacherAdminMessage).
 */
export function AdminChatView() {
  const { teachers, schools } = useAdminStore();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "UNANSWERED" | "ANSWERED">("ALL");

  // Real-time listener for Firestore /messages collection
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<ChatMessage, "id">),
      }));
      setMessages(msgs);
    }, (err) => {
      console.error("Firestore messages listener error:", err);
    });

    return () => unsub();
  }, []);

  // Module 22's anonymisation protects STUDENTS (server-side name → "תלמיד N").
  // Teachers are staff the admin registered by name, so the list shows the
  // name and school instead of the e-mail-derived record key it used to print
  // ("מורה מוסמך (dana_school_org_il)"), which was both unreadable and the
  // one thing that actually resembled personal data on this screen.
  const anonymousTeachers = useMemo(() => {
    return teachers.map((t, idx) => {
      const id = t.id || `teacher_${String(idx + 1).padStart(2, "0")}`;
      const schoolName = schools.find((s) => s.id === t.schoolId)?.name;
      return {
        id,
        label: t.ssoEmail || `מורה ${idx + 1}`,
        subtitle: schoolName || "",
        schoolId: t.schoolId || "school_pilot_01",
      };
    });
  }, [teachers, schools]);

  // Opening a conversation reads it: mark that teacher's incoming messages as
  // read (the only field firestore.rules lets us change on a message). Without
  // this the "ממתין למענה" badges and the bell never cleared from here — only
  // from the support hub's "handled" button.
  useEffect(() => {
    if (!selectedTeacherId) return;
    const unread = messages.filter((m) => m.sender_id === selectedTeacherId && m.receiver_id === "admin" && !m.read);
    if (unread.length === 0) return;
    Promise.all(unread.map((m) => updateDoc(doc(db, "messages", m.id), { read: true }))).catch((err) => {
      console.warn("[AdminChatView] mark-as-read notice:", err);
    });
  }, [selectedTeacherId, messages]);

  const selectedTeacher = useMemo(() => 
    anonymousTeachers.find(t => t.id === selectedTeacherId), 
  [anonymousTeachers, selectedTeacherId]);

  // Compute unread counts and unanswered status anonymously
  const teacherChatMeta = useMemo(() => {
    return anonymousTeachers.map(t => {
      const teacherMsgs = messages.filter(m => 
        (m.sender_id === "admin" && m.receiver_id === t.id) ||
        (m.sender_id === t.id && m.receiver_id === "admin")
      ).sort((a, b) => a.timestamp - b.timestamp);

      const unreadCount = messages.filter(m => m.sender_id === t.id && m.receiver_id === "admin" && !m.read).length;
      const lastMsg = teacherMsgs[teacherMsgs.length - 1];
      const isUnanswered = lastMsg && lastMsg.sender_id === t.id && !lastMsg.read;

      return {
        teacher: t,
        unreadCount,
        lastMsg,
        isUnanswered,
      };
    });
  }, [anonymousTeachers, messages]);

  const filteredTeachers = useMemo(() => {
    return teacherChatMeta.filter(({ teacher, isUnanswered, unreadCount }) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q ||
        teacher.label.toLowerCase().includes(q) ||
        teacher.subtitle.toLowerCase().includes(q) ||
        teacher.id.toLowerCase().includes(q);

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
      (m.sender_id === "admin" && m.receiver_id === selectedTeacherId) ||
      (m.sender_id === selectedTeacherId && m.receiver_id === "admin")
    );
  }, [messages, selectedTeacherId]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedTeacherId || isSending) return;

    // Layer 1: Client-side PII check
    if (containsPII(inputText)) {
      toast.error("ההודעה מכילה פרטים מזהים (PII). נא לנסח מחדש ללא שמות, תעודות זהות או מספרי טלפון.");
      return;
    }

    try {
      setIsSending(true);
      
      // Layer 2: Send strictly through Cloud Function sendTeacherAdminMessage
      const sendFn = httpsCallable(functions, "sendTeacherAdminMessage");
      await sendFn({
        receiver_id: selectedTeacherId,
        message_body: inputText.trim(),
        school_id: selectedTeacher?.schoolId || "school_pilot_01",
        class_name: "המבקרים",
      });

      setInputText("");
      toast.success("ההודעה נשלחה בהצלחה לאחר אימות פרטיות (Zero PII).");
    } catch (err: any) {
      console.error("Failed to send teacher-admin message:", err);
      toast.error("שגיאה בשליחת ההודעה לשרת.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden backdrop-blur-xl" dir="rtl">
      {/* Teachers List Sidebar */}
      <div className={`${selectedTeacher ? 'hidden md:flex' : 'flex'} w-full md:w-88 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-l border-slate-200 dark:border-slate-800 flex-col transition-all shadow-lg z-10`}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-black text-lg text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>ערוץ פניות מורים והנהלה</span>
            </h2>
            {unansweredTotal > 0 && (
              <span className="bg-rose-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md animate-pulse">
                {unansweredTotal} ממתינות למענה
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-950/50 p-2 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>מנגנון הגנת פרטיות פעיל: שמות התלמידים מוחלפים במספרים 1–12</span>
          </div>

          {/* Search Input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש לפי שם מורה או מוסד..."
            className="w-full px-3.5 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200 shadow-sm"
          />

          {/* Filter Chips */}
          <div className="flex gap-1.5 pt-1">
            <button
              onClick={() => setFilterTab("ALL")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "ALL" ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              הכל ({anonymousTeachers.length})
            </button>
            <button
              onClick={() => setFilterTab("UNANSWERED")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "UNANSWERED" ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              ממתינות למענה ({unansweredTotal})
            </button>
            <button
              onClick={() => setFilterTab("ANSWERED")}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filterTab === "ANSWERED" ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}`}
            >
              טופלו
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
                  onClick={() => {
                    setSelectedTeacherId(teacher.id);
                    setInputText("");
                  }}
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
                          {teacher.label}
                        </span>
                        {isUnanswered && (
                          <span className="text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 px-1.5 py-0.5 rounded-md">
                            ממתינה למענה
                          </span>
                        )}
                      </div>
                      {teacher.subtitle && <div className="text-xs text-slate-500 mt-0.5">{teacher.subtitle}</div>}
                      {lastMsg && (
                        <div className="text-xs text-slate-400 truncate max-w-[150px] mt-1">
                          {lastMsg.message_body}
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
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{selectedTeacher.label}</h3>
                {selectedTeacher.subtitle && <p className="text-xs text-slate-500">{selectedTeacher.subtitle}</p>}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
              {conversationMessages.length === 0 ? (
                <div className="m-auto text-slate-400 text-sm">אין הודעות בערוץ זה. ניתן לשלוח הודעה כדי לפתוח בשיחה.</div>
              ) : (
                conversationMessages.map(msg => {
                  const isAdmin = msg.sender_id === "admin";
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isAdmin ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className={`px-4 py-2 rounded-2xl shadow-sm ${isAdmin ? 'bg-blue-600 text-white rounded-tl-sm' : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}`}>
                        {msg.message_body && (
                          <div className="flex items-center gap-2">
                            <span>{msg.message_body}</span>
                            <UdlSpeechButton text={msg.message_body} className="w-7 h-7 p-0 shrink-0 text-slate-500" />
                          </div>
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
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="הקלדת הודעה (ללא פרטים מזהים)..."
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-slate-100 shadow-inner"
                />
                <UdlButton 
                  onClick={handleSend} 
                  disabled={!inputText.trim() || isSending}
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
            <p>יש לבחור מורה מהרשימה לצפייה בשיחה או למענה</p>
          </div>
        )}
      </div>
    </div>
  );
}
