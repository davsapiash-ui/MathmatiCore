import { useEffect, useState, useRef } from 'react';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { BellRing, Check, CheckCheck } from 'lucide-react';
import { ref, runTransaction, set as firebaseSet } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const { messages, sendMessage, markAsRead, initSync } = useChatStore();
  const user = useAuthStore(s => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const students = useStore(s => s.students);
  const classes = useAdminStore(s => s.classes);
  
  const normUid = normalizeStudentId(user?.uid || '');
  const studentData = normUid ? (students[normUid] || students[user?.uid || '']) : null;
  const studentClass = classes.find(c => c.id === studentData?.classId);
  const targetTeacherId = studentClass?.teacherId || '039604483';

  // Ensure chat is synced with Firebase on mount
  useEffect(() => {
    initSync();
  }, [initSync]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    document.addEventListener('toggle-chat', handleToggle);
    return () => document.removeEventListener('toggle-chat', handleToggle);
  }, []);

  useEffect(() => {
    if (isOpen && user?.uid) {
      markAsRead(normUid, targetTeacherId);
      // Also mark as read in general room
      markAsRead(normUid, 'teacher');
      markAsRead(normUid, 'admin');
    }
  }, [isOpen, user?.uid, messages, markAsRead, normUid, targetTeacherId]);

  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!user) return null;

  const myMessages = messages.filter(m => 
    normalizeStudentId(m.receiverId) === normUid || normalizeStudentId(m.senderId) === normUid
  );

  const handleSend = () => {
    if (!text.trim() || !user.uid) return;
    sendMessage(normUid, String(user.displayName || user.email?.split('@')[0] || 'תלמיד'), targetTeacherId as string, text);
    setText('');
  };

  const handleCallTeacher = async () => {
    if (!user?.uid) return;
    const studentId = normUid;
    
    AuditLogger.log(
      "CALL_FOR_HELP", 
      studentId, 
      "Student explicitly called for teacher help via the silent button."
    );

    // Persistent Help Call Counter & Historical Trace
    try {
      const studentHelpRef = ref(database, `classes/${studentClass?.id || 'demo'}/students/${studentId}/help_calls_count`);
      await runTransaction(studentHelpRef, (current) => (current || 0) + 1);

      const alertRef = ref(database, `classes/${studentClass?.id || 'demo'}/radar_alerts/${studentId}`);
      await firebaseSet(alertRef, {
        studentId,
        type: 'HELP_CALL',
        timestamp: Date.now(),
        acknowledged: false
      });
    } catch (e) {
      console.error("Failed to persist help call alert to DB:", e);
    }

    useStore.setState(state => ({
      students: {
        ...state.students,
        [studentId]: {
          ...(state.students[studentId] || {}),
          radarStatus: 'RED',
          helpRequested: true,
          lastActive: Date.now()
        } as any
      }
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 sm:w-96 h-[460px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-ws-surface2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200" dir="rtl">
      <div className="p-4 bg-ws-surface2 border-b border-ws-surface2 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-ws-ink">צ'אט עם המורה</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-ws-soft hover:text-ws-ink text-sm font-bold p-1 px-2 rounded-lg hover:bg-ws-surface transition-colors cursor-pointer"
          aria-label="סגור חלון צ'אט"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <p className="text-center text-ws-soft text-sm mt-10">אין הודעות. כתבו למורה כדי להתחיל.</p>
        ) : (
          myMessages.map(m => {
            const isMe = normalizeStudentId(m.senderId) === normUid;
            return (
              <div key={m.id} className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                <div className={`p-3 rounded-2xl ${isMe ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm'}`}>
                  {m.text && <span className="leading-relaxed">{m.text}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-ws-soft mt-1">
                  <span>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && (
                    m.read ? (
                      <span title="נקרא על ידי המורה"><CheckCheck className="w-3.5 h-3.5 text-emerald-500" /></span>
                    ) : (
                      <span title="נשלח בהצלחה"><Check className="w-3.5 h-3.5 text-slate-400" /></span>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Norman Affordance Call-For-Help Banner */}
      <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          <span>🙋‍♂️</span>
          <span>זקוק לעזרה בכיתה?</span>
        </div>
        <button
          onClick={handleCallTeacher}
          className="px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          aria-label="קרא למורה אלייך"
          title="שליחת קריאה למורה לרדאר"
        >
          <BellRing className="w-3.5 h-3.5" />
          <span>קרא למורה</span>
        </button>
      </div>

        <div className="p-4 border-t border-ws-surface2 shrink-0 bg-ws-surface">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="כתוב הודעה למורה..."
              className="flex-1 border border-ws-surface2 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-ws-accent"
            />
            <button
              onClick={handleSend}
              className="bg-ws-accent text-white rounded-full w-10 h-10 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all font-bold cursor-pointer"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
  );
}
