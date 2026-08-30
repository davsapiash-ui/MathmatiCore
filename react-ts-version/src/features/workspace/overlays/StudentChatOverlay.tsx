import { useEffect, useState, useRef } from 'react';
import { useChatStore, normalizeStudentId, isTeacherOrAdminId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { Check, CheckCheck, Send, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { validateChatInputForPII, anonymizeChatMessageBody } from '@/core/security/PiiFilter';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const { messages, sendMessage, markAsRead, initSync } = useChatStore();
  const user = useAuthStore(s => s.user);
  const activeSession = useActiveClassSession();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const students = useStore(s => s.students);
  const classes = useAdminStore(s => s.classes);
  
  const normUid = normalizeStudentId(user?.uid || '');
  const studentData = normUid ? (students[normUid] || students[user?.uid || '']) : null;
  const studentClass = classes.find(c => c.id === studentData?.classId);
  const targetTeacherId = studentClass?.teacherId || activeSession?.teacherId || '1002220159';

  // Ensure chat is synced with Firebase on mount and on user authentication change
  useEffect(() => {
    if (user?.uid) {
      initSync();
    }
  }, [initSync, user?.uid]);

  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    document.addEventListener('toggle-chat', handleToggle);
    return () => document.removeEventListener('toggle-chat', handleToggle);
  }, []);

  useEffect(() => {
    if (isOpen && user?.uid) {
      markAsRead(normUid, targetTeacherId);
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

  // In the student's room, display all synchronized messages between student and staff
  const myMessages = messages.filter(m => 
    !m.receiverId || 
    normalizeStudentId(m.receiverId) === normUid || 
    normalizeStudentId(m.senderId) === normUid ||
    isTeacherOrAdminId(m.senderId) ||
    isTeacherOrAdminId(m.receiverId)
  );

  const handleSend = () => {
    const textToSend = text.trim();
    if (!textToSend || !user?.uid) return;

    try {
      const validation = validateChatInputForPII(textToSend);
      if (!validation.valid) {
        toast.warning(validation.errorHe || 'הודעה מכילה פרטים מזהים (PII). יש להשתמש במספרי תרגילים בלבד.');
        return;
      }

      const cleanText = anonymizeChatMessageBody(textToSend);
      const studentNum = normUid.replace(/\D+/g, '') || '1';
      sendMessage(
        normUid, 
        (user.displayName as string) || `תלמיד ${studentNum}`, 
        targetTeacherId as string, 
        cleanText
      );
      setText('');
    } catch (err) {
      console.error('[StudentChat] PII check error:', err);
      toast.error('שגיאה בבדיקת אבטחה.');
    }
  };

  const handleCallTeacher = () => {
    if (!user?.uid) return;
    const studentNum = normUid.replace(/\D+/g, '') || '1';

    // PRD v7.1 Module 18: a help call must reach the Silent Radar (BLUE state),
    // not just the chat thread — write helpRequested + a radar_alerts entry.
    const now = Date.now();
    update(ref(database, `users/students/${normUid}`), {
      helpRequested: true,
      handRaised: true,
      isStruggling: true,
      lastHelpTimestamp: now,
      lastAction: 'תלמיד קרא למורה מהצ׳אט! 🔔',
      last_alert: 'תלמיד קרא למורה מהצ׳אט!',
    }).catch(console.error);
    update(ref(database, `radar_alerts/${normUid}_help_${now}`), {
      studentId: normUid,
      rawStudentId: normUid,
      timestamp: now,
      type: 'HELP_CALL',
      message: `תלמיד ${studentNum} קרא למורה מהצ׳אט`,
      severity: 'warning',
      persistent: true,
    }).catch(console.error);

    sendMessage(
      normUid,
      `תלמיד ${studentNum}`,
      targetTeacherId as string,
      'המורה, אני צריך עזרה בכיתה! 🙋‍♂️'
    );
    toast.success('הקריאה נשלחה למורה בהצלחה! 🔔');
  };

  const handleQuickPrompt = (promptText: string) => {
    setText(promptText);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 sm:w-96 h-[480px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-ws-surface2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200" dir="rtl">
      {/* Header */}
      <div className="p-4 bg-ws-surface2 border-b border-ws-surface2 flex justify-between items-center shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-ws-ink">צ'אט עם המורה</span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-ws-soft hover:text-ws-ink text-sm font-bold p-1 px-2 rounded-lg hover:bg-ws-surface transition-colors cursor-pointer"
          aria-label="סגור חלון צ'אט"
        >
          ✕
        </button>
      </div>

      {/* Call Teacher Action Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 p-2.5 px-4 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-medium text-amber-900 dark:text-amber-200">
          זקוק לעזרה מיידית?
        </span>
        <button
          onClick={handleCallTeacher}
          className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <span>קרא למורה 🔔</span>
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <div className="text-center text-ws-soft text-sm my-auto flex flex-col items-center gap-2">
            <HelpCircle className="w-8 h-8 opacity-40 text-ws-accent" />
            <p>אין הודעות קודמות.</p>
            <p className="text-xs">כתבו הודעה למורה או לחצו על קריאה למורה.</p>
          </div>
        ) : (
          myMessages.map(m => {
            const isMe = normalizeStudentId(m.senderId) === normUid;
            return (
              <div key={m.id} className={`flex flex-col max-w-[82%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
                <div className={`p-3 rounded-2xl ${isMe ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm shadow-sm'}`}>
                  {m.text && <span className="leading-relaxed text-sm">{m.text}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-ws-soft mt-1">
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

      {/* Quick Prompts */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border-t border-ws-surface2 flex gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        <button
          onClick={() => handleQuickPrompt('אני צריך עזרה בתרגיל הזה')}
          className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full px-2.5 py-1 whitespace-nowrap hover:border-ws-accent transition-colors cursor-pointer"
        >
          אני צריך עזרה בתרגיל
        </button>
        <button
          onClick={() => handleQuickPrompt('לא הבנתי את ההוראה')}
          className="text-[11px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full px-2.5 py-1 whitespace-nowrap hover:border-ws-accent transition-colors cursor-pointer"
        >
          לא הבנתי את ההוראה
        </button>
      </div>

      {/* Input Box */}
      <div className="p-3.5 border-t border-ws-surface2 shrink-0 bg-ws-surface">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="כתוב הודעה למורה..."
            className="flex-1 border border-ws-surface2 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-ws-accent bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
          <button
            onClick={() => handleSend()}
            disabled={!text.trim()}
            className="bg-ws-accent disabled:opacity-40 text-white rounded-full w-10 h-10 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all font-bold cursor-pointer shrink-0 shadow-sm"
          >
            <Send className="w-4 h-4 -mr-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
