import { useEffect, useState, useRef } from 'react';
import { useChatStore, normalizeStudentId, isTeacherOrAdminId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useActiveClassSession } from '@/application/useActiveClassSession';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { BellRing, Check, CheckCheck, Send, Sparkles, HelpCircle } from 'lucide-react';
import { ref, runTransaction, push, update, set as firebaseSet } from 'firebase/database';
import { database } from '@/infrastructure/firebase';
import { toast } from 'sonner';
import { validateChatInputForPII, anonymizeChatMessageBody } from '@/core/security/PiiFilter';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [callCooldown, setCallCooldown] = useState(false);
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

  const handleSend = (customText?: string) => {
    const textToSend = (customText || text).trim();
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
      if (!customText) setText('');
    } catch (err) {
      console.error('[StudentChat] PII check error:', err);
      toast.error('שגיאה בבדיקת אבטחה.');
    }
  };

  const handleCallTeacher = async () => {
    if (!user?.uid || callCooldown) return;
    const studentId = normUid;
    const studentNum = studentId.replace(/\D+/g, '') || '1';
    
    setCallCooldown(true);
    setTimeout(() => setCallCooldown(false), 15000);

    AuditLogger.log(
      "CALL_FOR_HELP", 
      studentId, 
      "Student explicitly called for teacher help via the silent button."
    );

    // 1. Root radar_alerts write for Teacher Dashboard & Heatmap live feed
    try {
      const alertsRef = ref(database, 'radar_alerts');
      await push(alertsRef, {
        studentId,
        rawStudentId: studentId,
        type: 'CALL_FOR_HELP',
        message: `קריאה לעזרה: תלמיד ${studentNum} ביקש עזרה בכיתה 🙋‍♂️`,
        timestamp: Date.now(),
        acknowledged: false,
        teacherId: targetTeacherId
      });
    } catch (e) {
      console.warn("Failed to push radar alert:", e);
    }

    // 2. Class-specific tracking & student RTDB status
    try {
      const studentHelpRef = ref(database, `classes/${studentClass?.id || 'demo'}/students/${studentId}/help_calls_count`);
      runTransaction(studentHelpRef, (current) => (current || 0) + 1).catch(() => {});

      await update(ref(database, `users/students/${studentId}`), {
        helpRequested: true,
        radarStatus: 'RED',
        lastActive: Date.now()
      });
    } catch (e) {
      console.warn("Failed to update student help status in RTDB:", e);
    }

    // 3. Send automated chat notice
    sendMessage(
      studentId, 
      `תלמיד ${studentNum}`, 
      targetTeacherId as string, 
      '🙋‍♂️ קראתי למורה לקבלת עזרה בתרגיל.'
    );

    // 4. Update local state
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

    toast.success('הקריאה נשלחה למורה בהצלחה! 🙋‍♂️ המורה בדרך אלייך.');
  };

  const quickPrompts = [
    '💡 אשמח לרמז',
    '🙋‍♂️ אני צריך עזרה',
    '❓ לא הבנתי את השלב הזה',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 sm:w-96 h-[500px] bg-ws-surface rounded-3xl shadow-2xl border-2 border-ws-surface2 flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200" dir="rtl">
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

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <div className="text-center text-ws-soft text-sm my-auto flex flex-col items-center gap-2">
            <HelpCircle className="w-8 h-8 opacity-40 text-ws-accent" />
            <p>אין הודעות קודמות.</p>
            <p className="text-xs">כתבו למורה או לחצו על רמז מהיר כדי להתחיל.</p>
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

      {/* Quick Prompts Chips */}
      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border-t border-ws-surface2 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleSend(prompt)}
            className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Call-For-Teacher Banner */}
      <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          <span>🙋‍♂️</span>
          <span>זקוק לעזרה בכיתה?</span>
        </div>
        <button
          onClick={handleCallTeacher}
          disabled={callCooldown}
          className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
            callCooldown
              ? 'bg-emerald-600 shadow-emerald-600/30'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-amber-500/30 hover:scale-105 active:scale-95'
          }`}
          aria-label="קרא למורה אלייך"
          title="שליחת קריאה למורה לרדאר הכיתתי"
        >
          {callCooldown ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>הקריאה נשלחה! ✓</span>
            </>
          ) : (
            <>
              <BellRing className="w-3.5 h-3.5" />
              <span>קרא למורה</span>
            </>
          )}
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
