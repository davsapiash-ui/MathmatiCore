import { useEffect, useState, useRef } from 'react';
import { useChatStore, normalizeStudentId } from '@/application/useChatStore';
import { useAuthStore } from '@/application/useAuthStore';
import { useStore } from '@/application/useStore';
import { useAdminStore } from '@/application/useAdminStore';
import { useWorkspaceStore } from '@/application/useWorkspaceStore';
import { AuditLogger } from '@/infrastructure/services/AuditLogger';
import { ImageIcon, BellRing } from 'lucide-react';
import { ref, update } from 'firebase/database';
import { database } from '@/infrastructure/firebase';

export function StudentChatOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [sendingImage, setSendingImage] = useState(false);
  const { messages, sendMessage, sendImageMessage, markAsRead } = useChatStore();
  const user = useAuthStore(s => s.user);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const students = useStore(s => s.students);
  const classes = useAdminStore(s => s.classes);
  
  const normUid = normalizeStudentId(user?.uid || '');
  const studentData = normUid ? (students[normUid] || students[user?.uid || '']) : null;
  const studentClass = classes.find(c => c.id === studentData?.classId);
  const targetTeacherId = studentClass?.teacherId || '039604483';

  useEffect(() => {
    const handler = () => setIsOpen(open => !open);
    document.addEventListener('toggle-chat', handler);
    return () => document.removeEventListener('toggle-chat', handler);
  }, []);

  useEffect(() => {
    if (isOpen && normUid) {
      const lastReceivedMsg = [...messages].reverse().find(m => normalizeStudentId(m.receiverId) === normUid && normalizeStudentId(m.senderId) !== normUid);
      const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
      markAsRead(normUid, activeTeacher); 
    }
  }, [isOpen, messages, normUid, markAsRead, targetTeacherId]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages]);

  if (!isOpen || !user) return null;

  const myMessages = messages.filter(m => 
    normalizeStudentId(m.receiverId) === normUid || normalizeStudentId(m.senderId) === normUid
  );

  const handleSend = () => {
    if (!text.trim() || !user.uid) return;
    const lastReceivedMsg = [...messages].reverse().find(m => normalizeStudentId(m.receiverId) === normUid && normalizeStudentId(m.senderId) !== normUid);
    const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
    sendMessage(normUid, String(user.displayName || user.email?.split('@')[0] || 'תלמיד'), activeTeacher as string, text);
    setText('');
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSendingImage(true);
    try {
      const lastReceivedMsg = [...messages].reverse().find(m => normalizeStudentId(m.receiverId) === normUid && normalizeStudentId(m.senderId) !== normUid);
      const activeTeacher = lastReceivedMsg ? lastReceivedMsg.senderId : targetTeacherId;
      await sendImageMessage(normUid, String(user.displayName || 'תלמיד'), activeTeacher as string, file);
    } finally {
      setSendingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCallTeacher = async () => {
    if (!user?.uid) return;
    const studentId = normUid;
    
    AuditLogger.log(
      "CALL_FOR_HELP", 
      studentId, 
      "Student explicitly called for teacher help via the silent button."
    );

    // Sync to Realtime DB so Teacher Dashboard lights up immediately in orange
    const updates: Record<string, any> = {};
    updates[`users/students/${studentId}/helpRequested`] = true;
    updates[`users/students/${studentId}/handRaised`] = true;
    updates[`users/students/${studentId}/isStruggling`] = true;
    updates[`users/students/${studentId}/lastAction`] = 'תלמיד ביקש עזרה מהמורה!';
    updates[`users/students/${studentId}/last_alert`] = 'תלמיד ביקש עזרה מהמורה!';
    updates[`radar_alerts/${studentId}_help`] = {
      studentId: studentId,
      studentName: user.displayName || studentId,
      timestamp: Date.now(),
      type: 'CALL_FOR_HELP',
      message: 'תלמיד ביקש עזרה מהמורה!',
      severity: 'alert'
    };

    await update(ref(database), updates).catch(console.error);

    useWorkspaceStore.getState().showFeedback({
      correct: true,
      title: 'נשלחה קריאה למורה 🔔',
      sub: 'המורה קיבל/ה את הבקשה שלך לעזרה ויגיע/תגיע אלייך בקרוב.',
    }, 4000);
  };

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-ws-surface shadow-2xl flex flex-col z-50 border-l border-ws-surface2">
      <div className="p-4 bg-ws-accent text-white flex justify-between items-center shrink-0">
        <h2 className="font-bold text-lg">צ'אט עם המורה</h2>
        <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 flex flex-col gap-3">
        {myMessages.length === 0 ? (
          <p className="text-center text-ws-soft text-sm mt-10">אין הודעות. כתבו למורה כדי להתחיל.</p>
        ) : (
          myMessages.map(m => (
            <div key={m.id} className={`flex flex-col max-w-[80%] ${m.senderId === user.uid ? 'self-end items-end' : 'self-start items-start'}`}>
              <div className={`p-3 rounded-2xl ${m.senderId === user.uid ? 'bg-ws-accent text-white rounded-tr-sm' : 'bg-ws-surface2 text-ws-ink rounded-tl-sm'}`}>
                {m.text && <span>{m.text}</span>}
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt="תמונה"
                  className="max-w-[200px] max-h-[200px] rounded-xl mt-1 object-cover cursor-pointer"
                  onClick={() => window.open(m.imageUrl, '_blank')}
                />
              )}
              </div>
              <span className="text-xs text-ws-soft mt-1">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Norman Affordance Call-For-Help Banner */}
      <div className="px-4 py-2.5 bg-amber-50 dark:bg-amber-950/40 border-t border-b border-amber-200 dark:border-amber-900/50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-200">
          <span>🙋‍♂️</span>
          <span>זקוק לעזרה מיידית בכיתה?</span>
        </div>
        <div className="relative group">
          <button
            onClick={handleCallTeacher}
            className="px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
            aria-label="קרא למורה אלייך"
          >
            <BellRing className="w-3.5 h-3.5 animate-bounce" />
            <span>קרא למורה!</span>
          </button>
          
          {/* Norman Principle: Explanatory Hover Tooltip */}
          <div className="absolute bottom-9 left-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 z-50 w-56 p-2.5 bg-slate-900/95 text-white text-[11px] rounded-xl shadow-xl backdrop-blur-md border border-white/10 text-right leading-relaxed">
            <div className="font-bold text-amber-300 mb-0.5">🔔 קרא למורה בלייב</div>
            <span>מפעיל התראת רדאר כתומה בדשבורד המורה בצירוף מזהה הכיתה והכיסא שלך.</span>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-ws-surface2 shrink-0 bg-ws-surface">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageSelect}
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingImage}
            title="שלח תמונה"
            className="p-2 rounded-full hover:bg-ws-surface2 transition-colors text-ws-soft hover:text-ws-accent disabled:opacity-40"
          >
            {sendingImage ? (
              <span className="w-5 h-5 border-2 border-ws-accent border-t-transparent rounded-full animate-spin block" />
            ) : (
              <ImageIcon className="w-5 h-5" />
            )}
          </button>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="כתוב הודעה..."
            className="flex-1 border border-ws-surface2 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-ws-accent"
          />
          <button
            onClick={handleSend}
            className="bg-ws-accent text-white rounded-full w-10 h-10 flex items-center justify-center hover:brightness-110 active:scale-95 transition-all font-bold"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
