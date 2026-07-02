import { useState, useEffect, useMemo } from "react";
import { UdlButton } from "@/presentation/design-system/UdlButton";
import { AccessibleCard } from "@/presentation/design-system/AccessibleCard";
import { DataGrid } from "@/presentation/design-system/DataGrid";
import { useAuthStore } from "@/application/useAuthStore";
import { useChatStore } from "@/application/useChatStore";
import { ref, onValue } from "firebase/database";
import { database } from "@/infrastructure/firebase";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Send, UserCircle2, MessageCircle, ShieldAlert } from "lucide-react";

const qMatrixData = [
  { name: 'חיבור בסיסי', success: 85, struggle: 15 },
  { name: 'חיסור בסיסי', success: 70, struggle: 30 },
  { name: 'המרת עשרות', success: 45, struggle: 55 },
  { name: 'גמישות מחשבתית', success: 60, struggle: 40 },
  { name: 'אומדן', success: 80, struggle: 20 },
];

export function TeacherDashboard() {
  const { user } = useAuthStore();
  const { messages, sendMessage, markAsRead } = useChatStore();
  
  const [activeTab, setActiveTab] = useState<"clustering" | "alerts" | "replays" | "chat_admin" | "chat_students">("clustering");
  const [alerts, setAlerts] = useState<any[]>([]);

  const [inputText, setInputText] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const handleTabChange = (tab: "clustering" | "alerts" | "replays" | "chat_admin" | "chat_students") => {
    setActiveTab(tab);
    setInputText("");
  };

  // For Admin Chat
  const adminMessages = useMemo(() => {
    if (!user) return [];
    return messages.filter(m => 
      (m.senderId === user.uid && m.receiverId === "admin") ||
      (m.senderId === "admin" && m.receiverId === user.uid)
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, user]);

  // For Student Chat (Mock list of students for now)
  const mockStudents = [
    { id: "student1", name: "נועה כהן" },
    { id: "student2", name: "עידו לוי" },
    { id: "student3", name: "רוני שחר" }
  ];

  const studentMessages = useMemo(() => {
    if (!user || !selectedStudentId) return [];
    return messages.filter(m => 
      (m.senderId === user.uid && m.receiverId === selectedStudentId) ||
      (m.senderId === selectedStudentId && m.receiverId === user.uid)
    ).sort((a, b) => a.timestamp - b.timestamp);
  }, [messages, user, selectedStudentId]);

  useEffect(() => {
    const alertsRef = ref(database, 'radar_alerts');
    const unsub = onValue(alertsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const parsed = Object.keys(data).map(key => ({
          ...data[key],
          firebaseKey: key
        })).reverse();
        setAlerts(parsed);
      } else {
        setAlerts([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (activeTab === "chat_admin" && user) {
      markAsRead(user.uid, "admin");
    }
    if (activeTab === "chat_students" && user && selectedStudentId) {
      markAsRead(user.uid, selectedStudentId);
    }
  }, [activeTab, selectedStudentId, messages, user, markAsRead]);

  const handleSendAdmin = () => {
    if (!inputText.trim() || !user) return;
    sendMessage(user.uid, user.displayName || "מורה", "admin", inputText.trim());
    setInputText("");
  };

  const handleSendStudent = () => {
    if (!inputText.trim() || !user || !selectedStudentId) return;
    sendMessage(user.uid, user.displayName || "מורה", selectedStudentId, inputText.trim());
    setInputText("");
  };

  const unreadAdminCount = messages.filter(m => m.senderId === "admin" && m.receiverId === user?.uid && !m.read).length;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden backdrop-blur-xl" dir="rtl">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-sm z-10 transition-all overflow-y-auto max-h-screen">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm">
          <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100">מתמטיקאור</h2>
          <p className="text-sm text-slate-500">לוח בקרה למורה</p>
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <UserCircle2 className="w-6 h-6 text-slate-400" />
            שלום, {user?.displayName || "מורה"}
          </div>
        </div>
        
        <nav className="flex-1 p-4 flex flex-col gap-2">
          <div className="text-xs font-bold text-slate-400 mb-2 mt-2 px-2 uppercase tracking-wider">פדגוגיה ומעקב</div>
          <button 
            onClick={() => handleTabChange("clustering")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "clustering" ? "bg-blue-50/80 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-bold shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            מיפוי כיתתי (Q-Matrix)
          </button>
          <button 
            onClick={() => handleTabChange("alerts")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "alerts" ? "bg-red-50/80 text-red-700 dark:bg-red-900/50 dark:text-red-300 font-bold shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            <span>רדאר סמוי</span>
            {alerts.filter(a => a.unread).length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                {alerts.filter(a => a.unread).length}
              </span>
            )}
          </button>
          <button 
            onClick={() => handleTabChange("replays")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "replays" ? "bg-purple-50/80 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 font-bold shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            הקלטות וידאו (Replays)
          </button>

          <div className="text-xs font-bold text-slate-400 mb-2 mt-6 px-2 uppercase tracking-wider">תקשורת וצ'אט</div>
          <button 
            onClick={() => handleTabChange("chat_students")}
            className={`w-full text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_students" ? "bg-emerald-50/80 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 font-bold shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            צ'אט עם תלמידים
          </button>
          <button 
            onClick={() => handleTabChange("chat_admin")}
            className={`w-full flex justify-between items-center text-right px-4 py-3 rounded-xl transition-all ${activeTab === "chat_admin" ? "bg-amber-50/80 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 font-bold shadow-sm" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
          >
            <span>תמיכה (הנהלה)</span>
            {unreadAdminCount > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                {unreadAdminCount}
              </span>
            )}
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col bg-slate-50/30 dark:bg-slate-900/30 relative">
        {activeTab === "clustering" && (
          <div className="p-4 md:p-8">
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">קיבוץ תלמידים לפי פערי למידה</h1>
              <p className="text-slate-500 mt-2">המערכת מקבצת תלמידים באופן אוטומטי על בסיס מודל ה-Q-Matrix.</p>
            </header>
            
            <AccessibleCard className="p-6 bg-white dark:bg-slate-950 mb-8 shadow-sm">
              <h2 className="text-xl font-bold mb-6">התפלגות שליטה במיומנויות (כיתה שלמה)</h2>
              <div className="h-72 w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={qMatrixData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                    <Legend />
                    <Bar dataKey="success" name="שליטה במיומנות (%)" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="struggle" name="מאבק / פער (%)" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </AccessibleCard>

            <div className="grid gap-6 md:grid-cols-2">
              <AccessibleCard className="p-6 bg-white dark:bg-slate-950 border-t-4 border-t-red-500 shadow-sm">
                <h3 className="text-xl font-bold mb-4">זקוקים לחיזוק בעובדות יסוד (כיתה א')</h3>
                <p className="text-slate-600 mb-4 text-sm">תלמידים שטעו במשימה 4 ולא צלחו את משימת האבחון לאחור (השלמת 10).</p>
                <DataGrid 
                  columns={[{ key: "name", header: "שם תלמיד" }, { key: "errors", header: "טעות נפוצה" }]}
                  data={[
                    { id: "1", name: "נועה כהן", errors: "טעות פרוצדורלית" },
                    { id: "2", name: "עידו לוי", errors: "שליפה אוטומטית לקויה" }
                  ]}
                />
                <UdlButton size="sm" semanticColor="primary" className="mt-4 w-full">הקצה תרגול מותאם</UdlButton>
              </AccessibleCard>
              
              <AccessibleCard className="p-6 bg-white dark:bg-slate-950 border-t-4 border-t-purple-500 shadow-sm">
                <h3 className="text-xl font-bold mb-4">פיתוח גמישות מחשבתית</h3>
                <p className="text-slate-600 mb-4 text-sm">תלמידים שהצליחו לפרק רק בצורה הקנונית (משימה 3) ונפלו ב"מלכודת הגמישות" (משימה 5).</p>
                <DataGrid 
                  columns={[{ key: "name", header: "שם תלמיד" }, { key: "reps", header: "ייצוגים שהופקו" }]}
                  data={[
                    { id: "3", name: "רוני שחר", reps: "1 מתוך 4" }
                  ]}
                />
                <UdlButton size="sm" semanticColor="primary" className="mt-4 w-full">הקצה סדנת חקר</UdlButton>
              </AccessibleCard>
            </div>
          </div>
        )}

        {activeTab === "alerts" && (
          <div className="p-8">
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">התראות זמן אמת (רדאר)</h1>
              <p className="text-slate-500 mt-2">זיהוי מאבקים קוגניטיביים ושיוט פסיבי ללא הפרעה לתלמיד.</p>
            </header>
            <div className="grid gap-4">
              {alerts.length === 0 ? (
                <div className="text-center py-12 text-slate-500 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-300">אין התראות חדשות. הכיתה עובדת מצוין!</div>
              ) : (
                alerts.map((alert) => (
                  <div key={alert.firebaseKey} className={`p-4 rounded-lg border flex justify-between items-center shadow-sm ${alert.type === "HESITATION" ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                    <div>
                      <div className="font-bold text-slate-800">
                        {alert.studentId || "תלמיד"} - 
                        {alert.type === "HESITATION" ? " עצירה ממושכת (מאבק קוגניטיבי)" : " מחיקות רבות (שיוט פסיבי)"}
                      </div>
                      <div className="text-sm text-slate-600 mt-1">משימה: {alert.taskId} | זמן: {new Date(alert.timestamp).toLocaleTimeString()}</div>
                    </div>
                    <div className="flex gap-2">
                      <UdlButton size="sm" variant="outline">שלח רמז אישי</UdlButton>
                      <UdlButton size="sm" variant="outline">סמן כנקרא</UdlButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "replays" && (
          <div className="p-8">
            <header className="mb-8">
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">שחזור סשנים מוקלטים</h1>
            </header>
            <AccessibleCard className="p-12 text-center bg-white dark:bg-slate-950 border border-dashed border-slate-300">
              <h3 className="text-2xl text-slate-400 mb-4">רכיב צפייה בהקלטות</h3>
              <p className="text-slate-500">כאן יוטמע רכיב rrweb-player שינגן את הקלטות התלמידים מ-Firebase.</p>
            </AccessibleCard>
          </div>
        )}

        {/* ADMIN CHAT */}
        {activeTab === "chat_admin" && (
          <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-900/50 relative h-full">
            <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm z-10">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">הנהלה ותמיכה טכנית</h3>
                <p className="text-xs text-slate-500">זמין כעת</p>
              </div>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
              {adminMessages.length === 0 ? (
                <div className="m-auto text-slate-400 text-sm">אין הודעות. שלח הודעה למנהל המערכת.</div>
              ) : (
                adminMessages.map(msg => {
                  const isMe = msg.senderId === user?.uid;
                  return (
                    <div key={msg.id} className={`flex flex-col max-w-[85%] md:max-w-[70%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                      <div className={`px-4 py-2 rounded-2xl shadow-sm ${isMe ? 'bg-blue-600 text-white rounded-tl-sm' : 'bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-tr-sm'}`}>
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
                  onKeyDown={(e) => e.key === 'Enter' && handleSendAdmin()}
                  placeholder="הקלד הודעה למנהל..."
                  className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 dark:text-slate-100 shadow-inner"
                />
                <UdlButton onClick={handleSendAdmin} disabled={!inputText.trim()} className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white transition-all disabled:opacity-50 shadow-md">
                  <Send className="w-5 h-5 -ml-1" />
                </UdlButton>
              </div>
            </div>
          </div>
        )}

        {/* STUDENTS CHAT */}
        {activeTab === "chat_students" && (
          <div className="flex-1 flex flex-col md:flex-row bg-slate-50/50 dark:bg-slate-900/50 h-full">
            {/* Student List */}
            <div className={`${selectedStudentId ? 'hidden md:flex' : 'flex'} w-full md:w-64 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b md:border-b-0 md:border-l border-slate-200 dark:border-slate-800 flex-col h-full`}>
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-800 dark:text-slate-100">רשימת תלמידים</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {mockStudents.map(student => {
                  const unreadCount = messages.filter(m => m.senderId === student.id && m.receiverId === user?.uid && !m.read).length;
                  return (
                    <button
                      key={student.id}
                      onClick={() => { setSelectedStudentId(student.id); setInputText(""); }}
                      className={`w-full text-right p-3 rounded-lg flex items-center justify-between transition-colors ${selectedStudentId === student.id ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                    >
                      <div className="flex items-center gap-2">
                        <UserCircle2 className="w-6 h-6 text-slate-400" />
                        <span className={`font-semibold ${selectedStudentId === student.id ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-300'}`}>
                          {student.name}
                        </span>
                      </div>
                      {unreadCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Student Chat Area */}
            <div className={`${!selectedStudentId ? 'hidden md:flex' : 'flex'} flex-1 flex-col relative h-full bg-slate-50/30 dark:bg-slate-900/30`}>
              {selectedStudentId ? (
                <>
                  <div className="p-4 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm z-10">
                    <button 
                      onClick={() => setSelectedStudentId(null)}
                      className="md:hidden mr-2 text-slate-500 hover:text-slate-700"
                    >
                      &rarr; חזור
                    </button>
                    <UserCircle2 className="w-10 h-10 text-slate-400" />
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{mockStudents.find(s => s.id === selectedStudentId)?.name}</h3>
                  </div>
                  
                  <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-4">
                    {studentMessages.length === 0 ? (
                      <div className="m-auto text-slate-400 text-sm">אין הודעות עם תלמיד זה.</div>
                    ) : (
                      studentMessages.map(msg => {
                        const isMe = msg.senderId === user?.uid;
                        return (
                          <div key={msg.id} className={`flex flex-col max-w-[70%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
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
                        onKeyDown={(e) => e.key === 'Enter' && handleSendStudent()}
                        placeholder="הקלד הודעה לתלמיד..."
                        className="flex-1 bg-slate-100 dark:bg-slate-900 border-none rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-slate-800 dark:text-slate-100 shadow-inner"
                      />
                      <UdlButton onClick={handleSendStudent} disabled={!inputText.trim()} className="rounded-full w-12 h-12 p-0 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50 shadow-md">
                        <Send className="w-5 h-5 -ml-1" />
                      </UdlButton>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center flex-col text-slate-400 gap-4">
                  <MessageCircle className="w-16 h-16 opacity-20" />
                  <p>בחר תלמיד מהרשימה כדי להתחיל שיחה</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
